// Blocklist test. Runs against the LOCAL dev server and LOCAL database only.
// Start the server with `npm run dev` in another terminal, then run `npm run test:blocklist`.
// Needs admin@admin-test.invalid in ADMIN_EMAILS in .dev.vars (the admin test needs it too).
// NEVER add --remote to any command in this file.
// It clears the LOCAL rate_limits table, which only holds temporary counters.

import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8787'
const DB_NAME = 'ph-ink'
const WRANGLER = 'node_modules/wrangler/bin/wrangler.js'
const SQL_FILE = '.wrangler/blocklist-test.sql'
const SUFFIX = 'bl-test.invalid'
const ADMIN = 'admin@admin-test.invalid'
const OLIVE = `olive@${SUFFIX}`
const PETE = `pete@${SUFFIX}`
const EVIL = 'bl-test-evil.example'
const EVIL2 = 'bl-test-evil2.example'

function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

// Runs one command against the LOCAL database. Retries only on passing glitches.
function d1Local(args) {
  for (let attempt = 1; ; attempt++) {
    try {
      return execFileSync(
        process.execPath,
        [WRANGLER, 'd1', 'execute', DB_NAME, '--local', ...args],
        { stdio: 'pipe' },
      ).toString()
    } catch (error) {
      const detail = `${String(error.stdout ?? '')}${String(error.stderr ?? '')}`.trim()
      if (attempt < 3 && /internal error|locked|busy/i.test(detail)) {
        pause(1500)
        continue
      }
      throw new Error(`Local database command failed:\n${detail}`)
    }
  }
}

function runSql(sql) {
  mkdirSync('.wrangler', { recursive: true })
  writeFileSync(SQL_FILE, sql)
  try {
    d1Local(['--file', SQL_FILE])
  } finally {
    try {
      unlinkSync(SQL_FILE)
    } catch {}
  }
}

function queryJson(sql) {
  const out = d1Local(['--json', '--command', sql])
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
  throw new Error(`Could not read the database answer for: ${sql}\n${out}`)
}

const TEST_USERS = `(SELECT id FROM users WHERE email LIKE '%@${SUFFIX}' OR email = '${ADMIN}')`
const TEST_LINKS = `(SELECT id FROM links WHERE owner_id IN ${TEST_USERS})`

const CLEANUP_SQL = `
DELETE FROM reports WHERE link_id IN ${TEST_LINKS};
DELETE FROM admin_audit WHERE admin_id IN ${TEST_USERS};
DELETE FROM blocked_domains WHERE domain IN ('${EVIL}', '${EVIL2}');
DELETE FROM rate_limits;
DELETE FROM clicks WHERE link_id IN ${TEST_LINKS};
DELETE FROM links WHERE owner_id IN ${TEST_USERS};
DELETE FROM sessions WHERE user_id IN ${TEST_USERS};
DELETE FROM login_tokens WHERE email LIKE '%@${SUFFIX}';
DELETE FROM users WHERE email LIKE '%@${SUFFIX}' OR email = '${ADMIN}';
`

const sha256 = (text) => createHash('sha256').update(text).digest('hex')


const DUMMY_TURNSTILE_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'

function withTurnstile(path, body) {
  return path === '/api/auth/request' || path === '/api/report'
    ? { turnstileToken: DUMMY_TURNSTILE_TOKEN, ...body }
    : body
}
const RUN_IP = `192.0.2.${10 + Math.floor(Math.random() * 200)}`
const BASE_OCTET = 10 + Math.floor(Math.random() * 100)
let ipCounter = 0
const freshIp = () => `203.0.113.${BASE_OCTET + ipCounter++}`

async function api(method, path, { token, body, headers } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      ...(token ? { Cookie: `ph_session=${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      'x-dev-ip': RUN_IP,
      ...headers,
    },
        body: body ? JSON.stringify(withTurnstile(path, body)) : undefined,
    redirect: 'manual',
  })
  let json = null
  try {
    json = await response.json()
  } catch {}
  return { status: response.status, json }
}

async function visit(path) {
  const response = await fetch(BASE + path, {
    headers: { 'x-dev-ip': freshIp() },
    redirect: 'manual',
  })
  await response.text()
  return response.status
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

async function main() {
  try {
    await fetch(BASE + '/')
  } catch {
    console.error('Cannot reach the dev server. Start it with "npm run dev" in another terminal.')
    process.exit(1)
  }

  const now = Math.floor(Date.now() / 1000)
  const adminToken = randomBytes(32).toString('hex')
  const oliveToken = randomBytes(32).toString('hex')
  const peteToken = randomBytes(32).toString('hex')

  runSql(`${CLEANUP_SQL}
INSERT INTO users (email, created_at) VALUES ('${ADMIN}', ${now}), ('${OLIVE}', ${now}), ('${PETE}', ${now});
INSERT INTO sessions (session_hash, user_id, created_at, expires_at) VALUES
  ('${sha256(adminToken)}', (SELECT id FROM users WHERE email = '${ADMIN}'), ${now}, ${now + 3600}),
  ('${sha256(oliveToken)}', (SELECT id FROM users WHERE email = '${OLIVE}'), ${now}, ${now + 3600}),
  ('${sha256(peteToken)}', (SELECT id FROM users WHERE email = '${PETE}'), ${now}, ${now + 3600});
`)

  const one = (sql) => queryJson(sql)[0]
  const adm = (method, path, body, headers) => api(method, path, { token: adminToken, body, headers })
  const mk = (token, destination) => api('POST', '/api/links', { token, body: { destination } })
  const linkRow = (id) =>
    one(`SELECT status, block_reason AS reason, destination FROM links WHERE id = ${id}`)

  try {
    const probe = await adm('GET', '/api/admin/overview')
    if (probe.status === 404) {
      throw new Error(
        `${ADMIN} is not in ADMIN_EMAILS. Add it to ADMIN_EMAILS in .dev.vars, then restart "npm run dev".`,
      )
    }

    // --- A. Who can use the blocklist routes ---
    check('no cookie: the blocklist routes look like they do not exist (404)', (await api('GET', '/api/admin/blocked-domains')).status === 404)
    check(
      'a normal user cannot read the blocklist (404)',
      (await api('GET', '/api/admin/blocked-domains', { token: oliveToken })).status === 404,
    )
    check(
      'a normal user cannot add to the blocklist (404)',
      (await api('POST', '/api/admin/blocked-domains', { token: oliveToken, body: { domain: EVIL } })).status === 404,
    )
    check(
      'a normal user cannot remove from the blocklist (404)',
      (await api('DELETE', `/api/admin/blocked-domains/${EVIL}`, { token: oliveToken })).status === 404,
    )
    check(
      'an admin request from another site is refused (403)',
      (await adm('POST', '/api/admin/blocked-domains', { domain: EVIL }, { Origin: 'https://evil.example' })).status === 403,
    )

    // --- B. Input checks ---
    const badDomains = [
      ['a single word', 'com'],
      ['a path', `${EVIL}/login`],
      ['an address', '203.0.113.45'],
      ['spaces', 'evil example.com'],
      ['nothing', ''],
    ]
    for (const [name, domain] of badDomains) {
      const result = await adm('POST', '/api/admin/blocked-domains', { domain })
      check(`a blocklist entry with ${name} is refused (400)`, result.status === 400, `got ${result.status}`)
    }
    check('a missing domain is refused (400)', (await adm('POST', '/api/admin/blocked-domains', {})).status === 400)
    check(
      'a reason that is not text is refused (400)',
      (await adm('POST', '/api/admin/blocked-domains', { domain: EVIL, reason: 5 })).status === 400,
    )
    check(
      'nothing was added by the refused requests',
      one(`SELECT COUNT(*) AS n FROM blocked_domains WHERE domain = '${EVIL}'`).n === 0,
    )

    // --- C. Blocking a domain also reaches links that already exist ---
    const a = (await mk(oliveToken, `https://sub.${EVIL}/a`)).json
    const b = (await mk(oliveToken, `https://www.${EVIL}/b?x=1`)).json
    const c = (await mk(oliveToken, `https://not${EVIL}/c`)).json
    const d = (await mk(oliveToken, 'https://other.example/d')).json
    const e = (await mk(oliveToken, `https://${EVIL}/e`)).json
    const g = (await mk(oliveToken, `https://${EVIL}/g`)).json
    const f = (await mk(peteToken, `https://${EVIL}/pete`)).json
    if (![a, b, c, d, e, g, f].every((link) => link?.id)) {
      throw new Error('Could not create the test links, so the rest cannot run.')
    }
    check(
      'a link can be paused before the test',
      (await api('PATCH', `/api/links/${g.id}`, { token: oliveToken, body: { status: 'disabled' } })).status === 200,
    )
    const report = await api('POST', '/api/report', {
      body: { link: b.slug, reason: 'phishing', details: 'test report' },
      headers: { 'x-dev-ip': freshIp() },
    })
    check('a report is filed against one of the links (200)', report.status === 200, `got ${report.status}`)
    check(
      'an admin blocks one link by hand first',
      (await adm('POST', `/api/admin/links/${e.id}/block`, { reason: 'manual' })).status === 200,
    )

    check('before the block, a link on the domain redirects (302)', (await visit('/' + a.slug)) === 302)
    check('before the block, a look-alike domain redirects (302)', (await visit('/' + c.slug)) === 302)

    const add = await adm('POST', '/api/admin/blocked-domains', { domain: EVIL.toUpperCase(), reason: 'sweep test' })
    check(
      'the admin can block a domain, typed in capitals (200)',
      add.status === 200 && add.json?.domain === EVIL && add.json?.changed === true,
      JSON.stringify(add.json),
    )
    check(
      'it reports four existing links blocked (two active, one paused, one from another user)',
      add.json?.linksBlocked === 4,
      JSON.stringify(add.json),
    )

    const afterA = linkRow(a.id)
    const afterB = linkRow(b.id)
    const afterG = linkRow(g.id)
    const afterF = linkRow(f.id)
    check(
      'links on the domain and its subdomains are now blocked because of the domain',
      [afterA, afterB, afterG, afterF].every((row) => row.status === 'blocked' && row.reason === 'domain_blocked'),
      JSON.stringify([afterA, afterB, afterG, afterF]),
    )
    check(
      'a link an admin had already blocked keeps its own reason',
      linkRow(e.id).status === 'blocked' && linkRow(e.id).reason === 'admin',
      JSON.stringify(linkRow(e.id)),
    )
    check(
      'a look-alike domain and an unrelated domain are untouched',
      linkRow(c.id).status === 'active' && linkRow(d.id).status === 'active',
    )
    check(
      'the open report on a swept link is marked handled',
      one(`SELECT status FROM reports WHERE link_id = ${b.id}`).status === 'actioned',
    )

    const visits = await Promise.all([a, b, e, f, g].map((link) => visit('/' + link.slug)))
    check('visitors to the blocked links get 403', visits.every((status) => status === 403), visits.join(','))
    check('the look-alike domain still redirects (302)', (await visit('/' + c.slug)) === 302)
    check('the unrelated domain still redirects (302)', (await visit('/' + d.slug)) === 302)

    check(
      'nobody can shorten a link to the blocked domain (400)',
      (await mk(oliveToken, `https://${EVIL}/new`)).status === 400,
    )
    check(
      'nobody can shorten a link to a deep subdomain of it (400)',
      (await mk(oliveToken, `https://deep.sub.${EVIL}/new`)).status === 400,
    )
    const edit = await api('PATCH', `/api/links/${d.id}`, {
      token: oliveToken,
      body: { destination: `https://${EVIL}/moved` },
    })
    check('nobody can edit a link to point at it (400)', edit.status === 400, `got ${edit.status}`)
    check(
      'the link is unchanged after the refused edit',
      linkRow(d.id).destination === 'https://other.example/d',
      JSON.stringify(linkRow(d.id)),
    )

    const again = await adm('POST', '/api/admin/blocked-domains', { domain: EVIL })
    check(
      'adding the same domain again changes nothing',
      again.status === 200 && again.json?.changed === false && again.json?.linksBlocked === 0,
      JSON.stringify(again.json),
    )
    const list = await adm('GET', '/api/admin/blocked-domains?limit=100')
    const entry = (list.json?.domains ?? []).find((row) => row.domain === EVIL)
    check(
      'the list shows the domain with the first reason given',
      list.status === 200 && entry?.reason === 'sweep test',
      JSON.stringify(entry),
    )

    // --- D. A domain added with no sweep is still enforced at click time ---
    const h = (await mk(oliveToken, `https://${EVIL2}/h`)).json
    check('a link on a not-yet-blocked domain redirects (302)', (await visit('/' + h.slug)) === 302)
    runSql(`INSERT INTO blocked_domains (domain, reason, created_at) VALUES ('${EVIL2}', 'direct', ${now});`)
    check(
      'once the domain is blocklisted, visitors get 403 even though no sweep ran',
      (await visit('/' + h.slug)) === 403,
    )
    check('that link still shows as active in the database', linkRow(h.id).status === 'active')

    // --- E. Restoring, and taking a domain off the list ---
    check(
      'a swept link cannot be restored while its domain is blocklisted (409)',
      (await adm('POST', `/api/admin/links/${a.id}/restore`)).status === 409,
    )
    check('the admin can remove the domain (200)', (await adm('DELETE', `/api/admin/blocked-domains/${EVIL}`)).status === 200)
    check('removing it twice gives 404', (await adm('DELETE', `/api/admin/blocked-domains/${EVIL}`)).status === 404)
    check(
      'removing something that is not a domain gives 404',
      (await adm('DELETE', '/api/admin/blocked-domains/not-a-domain')).status === 404,
    )
    check(
      'removing the domain does not restore links by itself',
      linkRow(a.id).status === 'blocked' && (await visit('/' + a.slug)) === 403,
    )
    check('the admin can now restore the swept link (200)', (await adm('POST', `/api/admin/links/${a.id}/restore`)).status === 200)
    const restored = linkRow(a.id)
    check(
      'the restored link is active again and redirects',
      restored.status === 'active' && restored.reason === null && (await visit('/' + a.slug)) === 302,
      JSON.stringify(restored),
    )
    check('a link blocked by hand can also be restored now (200)', (await adm('POST', `/api/admin/links/${e.id}/restore`)).status === 200)
    check(
      'new links to the domain work again (201)',
      (await mk(oliveToken, `https://${EVIL}/again`)).status === 201,
    )
    check('the directly added domain can be removed through the admin area (200)', (await adm('DELETE', `/api/admin/blocked-domains/${EVIL2}`)).status === 200)
    check('and its link redirects again (302)', (await visit('/' + h.slug)) === 302)

    // --- F. Audit log ---
    const audit = await adm('GET', '/api/admin/audit?targetType=system&limit=100')
    const entries = audit.json?.entries ?? []
    check(
      'the audit log records the domain block and how many links it reached',
      entries.some(
        (item) =>
          item.action === 'block_domain' &&
          item.adminEmail === ADMIN &&
          item.detail?.includes(EVIL) &&
          item.detail?.includes('4 existing links'),
      ),
      JSON.stringify(entries.map((item) => [item.action, item.detail])),
    )
    check(
      'the audit log records the removal',
      entries.some((item) => item.action === 'unblock_domain' && item.detail === EVIL),
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