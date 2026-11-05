// Abuse-protection test. Runs against the LOCAL dev server and LOCAL database only.
// Start the server first with `npm run dev` in another terminal, then run `npm run test:abuse`.
// NEVER add --remote to any command in this file.
// It clears the LOCAL rate_limits table, which only holds temporary counters.

import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8787'
const DB_NAME = 'ph-ink'
const WRANGLER = 'node_modules/wrangler/bin/wrangler.js'
const SQL_FILE = '.wrangler/abuse-test.sql'
const DOMAIN = 'abuse-test.invalid'
const ERIN = `erin@${DOMAIN}`
const FINN = `finn@${DOMAIN}`
const GUS = `gus@${DOMAIN}`
const BLOCKED = 'phishy-test.example'

function runSql(sql) {
  mkdirSync('.wrangler', { recursive: true })
  writeFileSync(SQL_FILE, sql)
  try {
    execFileSync(
      process.execPath,
      [WRANGLER, 'd1', 'execute', DB_NAME, '--local', '--file', SQL_FILE],
      { stdio: 'pipe' },
    )
  } catch (error) {
    console.error('Database command failed:')
    console.error(String(error.stdout ?? ''), String(error.stderr ?? ''))
    process.exit(1)
  } finally {
    try {
      unlinkSync(SQL_FILE)
    } catch {}
  }
}

function queryJson(sql) {
  let out
  try {
    out = execFileSync(
      process.execPath,
      [WRANGLER, 'd1', 'execute', DB_NAME, '--local', '--json', '--command', sql],
      { stdio: 'pipe' },
    ).toString()
  } catch (error) {
    console.error('Database query failed:', sql)
    console.error(String(error.stdout ?? ''), String(error.stderr ?? ''))
    process.exit(1)
  }

  const end = out.lastIndexOf(']')
  let start = out.indexOf('[')
  while (start !== -1 && start < end) {
    if (start === 0 || out[start - 1] === '\n') {
      try {
        const parsed = JSON.parse(out.slice(start, end + 1))
        return parsed[0]?.results ?? []
      } catch {
        // Not the JSON block. Keep looking.
      }
    }
    start = out.indexOf('[', start + 1)
  }
  console.error('Could not read the database answer for:', sql)
  console.error(out)
  process.exit(1)
}

const CLEANUP_SQL = `
DELETE FROM rate_limits;
DELETE FROM blocked_domains WHERE domain = '${BLOCKED}';
DELETE FROM settings WHERE key = 'links_paused';
DELETE FROM clicks WHERE link_id IN (SELECT id FROM links WHERE owner_id IN (SELECT id FROM users WHERE email LIKE '%@${DOMAIN}'));
DELETE FROM links WHERE owner_id IN (SELECT id FROM users WHERE email LIKE '%@${DOMAIN}');
DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@${DOMAIN}');
DELETE FROM login_tokens WHERE email LIKE '%@${DOMAIN}';
DELETE FROM users WHERE email LIKE '%@${DOMAIN}';
`

const sha256 = (text) => createHash('sha256').update(text).digest('hex')


const DUMMY_TURNSTILE_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'

function withTurnstile(path, body) {
  return path === '/api/auth/request' || path === '/api/report'
    ? { turnstileToken: DUMMY_TURNSTILE_TOKEN, ...body }
    : body
}

async function api(method, path, { token, body, headers } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      ...(token ? { Cookie: `ph_session=${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
        body: body ? JSON.stringify(withTurnstile(path, body)) : undefined,
    redirect: 'manual',
  })
  let json = null
  try {
    json = await response.json()
  } catch {}
  return { status: response.status, json, headers: response.headers }
}

async function visit(path, ip) {
  const response = await fetch(BASE + path, {
    headers: ip ? { 'x-dev-ip': ip } : {},
    redirect: 'manual',
  })
  await response.text()
  return { status: response.status, headers: response.headers }
}

let passed = 0
let failed = 0
function check(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`PASS  ${name}`)
  } else {
    failed++
    console.log(`FAIL  ${name}${detail ? '  -> ' + detail : ''}`)
  }
}

function currentWindow() {
  const t = Math.floor(Date.now() / 1000)
  return t - (t % 3600)
}

async function main() {
  try {
    await fetch(BASE + '/')
  } catch {
    console.error('Cannot reach the dev server. Start it with "npm run dev" in another terminal.')
    process.exit(1)
  }

  const now = Math.floor(Date.now() / 1000)
  const erinToken = randomBytes(32).toString('hex')
  const finnToken = randomBytes(32).toString('hex')
  const gusToken = randomBytes(32).toString('hex')

  const octet = 10 + Math.floor(Math.random() * 200)
  const IP_LOGIN = `192.0.2.${octet}`
  const IP_LOGIN_OTHER = `192.0.2.${octet + 1}`
  const IP_MISS = `198.51.100.${octet}`
  const IP_MISS_OTHER = `198.51.100.${octet + 1}`

  runSql(`${CLEANUP_SQL}
INSERT INTO users (email, created_at) VALUES
  ('${ERIN}', ${now - 30 * 86400}),
  ('${FINN}', ${now}),
  ('${GUS}', ${now});
INSERT INTO sessions (session_hash, user_id, created_at, expires_at) VALUES
  ('${sha256(erinToken)}', (SELECT id FROM users WHERE email = '${ERIN}'), ${now}, ${now + 3600}),
  ('${sha256(finnToken)}', (SELECT id FROM users WHERE email = '${FINN}'), ${now}, ${now + 3600}),
  ('${sha256(gusToken)}', (SELECT id FROM users WHERE email = '${GUS}'), ${now}, ${now + 3600});
`)

  const idOf = (email) => queryJson(`SELECT id FROM users WHERE email = '${email}'`)[0].id
  const erinId = idOf(ERIN)
  const finnId = idOf(FINN)

  try {
    // --- Hourly limit per account (Erin has an old account, so the daily cap is high) ---
    const e1 = await api('POST', '/api/links', {
      token: erinToken,
      body: { destination: 'https://example.com/erin-1' },
    })
    check('Erin can create a link (201)', e1.status === 201, `got ${e1.status}`)

    runSql(
      `INSERT OR REPLACE INTO rate_limits (key, window_start, count) VALUES ('link-user:${erinId}', ${currentWindow()}, 29);`,
    )
    const e30 = await api('POST', '/api/links', {
      token: erinToken,
      body: { destination: 'https://example.com/erin-30' },
    })
    check('the 30th link in an hour is allowed (201)', e30.status === 201, `got ${e30.status}`)

    const e31 = await api('POST', '/api/links', {
      token: erinToken,
      body: { destination: 'https://example.com/erin-31' },
    })
    check('the 31st link in an hour is refused (429)', e31.status === 429, `got ${e31.status}`)
    const wait = Number(e31.headers.get('retry-after'))
    check('the refusal says how long to wait (Retry-After)', wait > 0 && wait <= 3600, String(wait))

    // --- One user's limit does not affect another ---
    const g1 = await api('POST', '/api/links', {
      token: gusToken,
      body: { destination: 'https://example.com/gus-1' },
    })
    check("another user is not affected by Erin's limit (201)", g1.status === 201, `got ${g1.status}`)
    const gusLink = g1.json

    // --- Daily cap for a new account ---
    const rows = Array.from(
      { length: 19 },
      (_, i) =>
        `('fin-seed-${String(i).padStart(2, '0')}', 'https://example.com/', ${finnId}, ${now}, ${now})`,
    ).join(',\n')
    runSql(
      `INSERT INTO links (slug, destination, owner_id, created_at, updated_at) VALUES\n${rows};`,
    )
    const f20 = await api('POST', '/api/links', {
      token: finnToken,
      body: { destination: 'https://example.com/finn-20' },
    })
    check('a new account can create its 20th link of the day (201)', f20.status === 201, `got ${f20.status}`)
    const f21 = await api('POST', '/api/links', {
      token: finnToken,
      body: { destination: 'https://example.com/finn-21' },
    })
    check('the 21st link of the day is refused (429)', f21.status === 429, `got ${f21.status}`)
    check(
      'the refusal states the daily limit',
      typeof f21.json?.error === 'string' && f21.json.error.includes('20'),
      JSON.stringify(f21.json),
    )
    check(
      "Finn's earlier links still redirect (302)",
      (await visit('/fin-seed-00')).status === 302,
    )

    // --- Domain blocklist ---
    runSql(
      `INSERT OR REPLACE INTO blocked_domains (domain, reason, created_at) VALUES ('${BLOCKED}', 'abuse test secret reason', ${now});`,
    )
    const b1 = await api('POST', '/api/links', {
      token: gusToken,
      body: { destination: `https://${BLOCKED}/login` },
    })
    check('a blocked domain is refused (400)', b1.status === 400, `got ${b1.status}`)
    check(
      'the refusal does not reveal why',
      !JSON.stringify(b1.json).includes('secret reason'),
      JSON.stringify(b1.json),
    )
    const b2 = await api('POST', '/api/links', {
      token: gusToken,
      body: { destination: `https://www.${BLOCKED}/` },
    })
    check('a subdomain of a blocked domain is refused (400)', b2.status === 400, `got ${b2.status}`)
    const b3 = await api('POST', '/api/links', {
      token: gusToken,
      body: { destination: `https://deep.sub.${BLOCKED}/x` },
    })
    check('a deep subdomain is refused (400)', b3.status === 400, `got ${b3.status}`)
    const b4 = await api('POST', '/api/links', {
      token: gusToken,
      body: { destination: `https://not${BLOCKED}/` },
    })
    check('a look-alike domain is allowed (201)', b4.status === 201, `got ${b4.status}`)

    const edit = await api('PATCH', `/api/links/${gusLink.id}`, {
      token: gusToken,
      body: { destination: `https://${BLOCKED}/` },
    })
    check('editing a link to a blocked domain is refused (400)', edit.status === 400, `got ${edit.status}`)
    const unchanged = await api('GET', `/api/links/${gusLink.id}`, { token: gusToken })
    check(
      'the link is unchanged after the refused edit',
      unchanged.json?.destination === 'https://example.com/gus-1',
      JSON.stringify(unchanged.json),
    )

    // --- Kill switch ---
    runSql(
      `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('links_paused', '1', ${now});`,
    )
    const p1 = await api('POST', '/api/links', {
      token: gusToken,
      body: { destination: 'https://example.com/while-paused' },
    })
    check('with the kill switch on, new links are refused (503)', p1.status === 503, `got ${p1.status}`)
    const p2 = await api('PATCH', `/api/links/${gusLink.id}`, {
      token: gusToken,
      body: { destination: 'https://example.com/changed' },
    })
    check('with the kill switch on, destination edits are refused (503)', p2.status === 503, `got ${p2.status}`)
    const p3 = await api('PATCH', `/api/links/${gusLink.id}`, {
      token: gusToken,
      body: { title: 'Renamed' },
    })
    check('with the kill switch on, renaming still works (200)', p3.status === 200, `got ${p3.status}`)
    check(
      'with the kill switch on, existing links still redirect (302)',
      (await visit('/' + gusLink.slug)).status === 302,
    )
    runSql(`UPDATE settings SET value = '0' WHERE key = 'links_paused';`)
    const p4 = await api('POST', '/api/links', {
      token: gusToken,
      body: { destination: 'https://example.com/after-pause' },
    })
    check('with the kill switch off, new links work again (201)', p4.status === 201, `got ${p4.status}`)

    // --- Sign-in limit per network (this prints 12 [dev email] lines in the server window) ---
    const loginStatuses = []
    for (let i = 1; i <= 10; i++) {
      const result = await api('POST', '/api/auth/request', {
        body: { email: `rl-${i}@${DOMAIN}` },
        headers: { 'x-dev-ip': IP_LOGIN },
      })
      loginStatuses.push(result.status)
    }
    check(
      'the first 10 sign-in requests from one network are accepted (200)',
      loginStatuses.every((status) => status === 200),
      loginStatuses.join(','),
    )
    const l11 = await api('POST', '/api/auth/request', {
      body: { email: `rl-11@${DOMAIN}` },
      headers: { 'x-dev-ip': IP_LOGIN },
    })
    check('the 11th sign-in request from that network is refused (429)', l11.status === 429, `got ${l11.status}`)
    const lOther = await api('POST', '/api/auth/request', {
      body: { email: `rl-12@${DOMAIN}` },
      headers: { 'x-dev-ip': IP_LOGIN_OTHER },
    })
    check('a different network is not affected (200)', lOther.status === 200, `got ${lOther.status}`)

    // --- Unknown short links per network ---
    const missStatuses = []
    for (let i = 1; i <= 100; i++) {
      missStatuses.push((await visit(`/no-such-link-${i}`, IP_MISS)).status)
    }
    check(
      '100 unknown short links from one network all get 404',
      missStatuses.every((status) => status === 404),
      [...new Set(missStatuses)].join(','),
    )
    const m101 = await visit('/no-such-link-101', IP_MISS)
    check('the 101st is refused (429)', m101.status === 429, `got ${m101.status}`)
    check(
      'the refusal carries a Retry-After',
      Number(m101.headers.get('retry-after')) > 0,
      String(m101.headers.get('retry-after')),
    )
    const throttledHit = await visit('/' + gusLink.slug, IP_MISS)
    check(
      'a real link from the throttled network is also refused (429)',
      throttledHit.status === 429,
      `got ${throttledHit.status}`,
    )
    const otherHit = await visit('/' + gusLink.slug, IP_MISS_OTHER)
    check(
      'the same link from another network still works (302)',
      otherHit.status === 302,
      `got ${otherHit.status}`,
    )
  } finally {
    runSql(CLEANUP_SQL)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})