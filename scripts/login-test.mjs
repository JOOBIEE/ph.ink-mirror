// Sign-in flow test. Runs against the LOCAL dev server and LOCAL database only.
// Start the server with `npm run dev` in another terminal, then run `npm run test:login`.
// Needs admin@admin-test.invalid in ADMIN_EMAILS in .dev.vars (the admin test needs it too).
// NEVER add --remote to any command in this file.
// It clears the LOCAL rate_limits table, which only holds temporary counters.

import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8787'
const DB_NAME = 'ph-ink'
const WRANGLER = 'node_modules/wrangler/bin/wrangler.js'
const SQL_FILE = '.wrangler/login-test.sql'
const ADMIN = 'admin@admin-test.invalid'
const PLAIN = 'plain@login-test.invalid'
const BANNED = 'banned@login-test.invalid'
const REQUESTER = 'requester@login-test.invalid'
const EMAILS = [ADMIN, PLAIN, BANNED, REQUESTER].map((email) => `'${email}'`).join(', ')

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
const CLEANUP_SQL = `
DELETE FROM rate_limits;
DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email IN (${EMAILS}));
DELETE FROM login_tokens WHERE email IN (${EMAILS});
DELETE FROM users WHERE email IN (${EMAILS});
`

const sha256 = (text) => createHash('sha256').update(text).digest('hex')


const DUMMY_TURNSTILE_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'

function withTurnstile(path, body) {
  return path === '/api/auth/request' || path === '/api/report'
    ? { turnstileToken: DUMMY_TURNSTILE_TOKEN, ...body }
    : body
}
function newToken(email, secondsValid = 900) {
  const token = randomBytes(32).toString('hex')
  const expires = Math.floor(Date.now() / 1000) + secondsValid
  runSql(
    `INSERT INTO login_tokens (token_hash, email, expires_at) VALUES ('${sha256(token)}', '${email}', ${expires});`,
  )
  return token
}

async function verify(token, next) {
  const form = new URLSearchParams({ token })
  if (next !== undefined) form.set('next', next)
  const response = await fetch(BASE + '/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    redirect: 'manual',
  })
  await response.text()
  const cookie =
    response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .find((value) => value.startsWith('ph_session=')) ?? null
  return { status: response.status, location: response.headers.get('location'), cookie }
}

function target(location) {
  if (!location) return null
  const url = new URL(location, BASE)
  return url.origin === BASE ? url.pathname + url.search : `OFF-SITE:${url.origin}`
}

async function get(path, cookie) {
  const response = await fetch(BASE + path, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: 'manual',
  })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: response.status, json, text }
}

async function postJson(path, body, ip) {
  const response = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-dev-ip': ip },
        body: JSON.stringify(withTurnstile(path, body)),
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

  runSql(`${CLEANUP_SQL}
INSERT INTO users (email, status, created_at) VALUES ('${BANNED}', 'banned', ${Math.floor(Date.now() / 1000)});
`)

  try {
    // --- A. An admin signing in with next=/admin ---
    const adminToken = newToken(ADMIN)
    const a = await verify(adminToken, '/admin')
    check(
      'signing in with next=/admin goes to the admin page (303)',
      a.status === 303 && target(a.location) === '/admin',
      `${a.status} ${a.location}`,
    )
    check('signing in sets a session cookie', a.cookie !== null && a.cookie.length > 20)

    const me = await get('/api/auth/me', a.cookie)
    check(
      'the new session belongs to the admin, and /me says so',
      me.status === 200 && me.json?.email === ADMIN && me.json?.isAdmin === true,
      JSON.stringify(me.json),
    )
    const overview = await get('/api/admin/overview', a.cookie)
    check(
      'the fresh session can open the admin area (200)',
      overview.status === 200,
      `got ${overview.status}. Is ${ADMIN} in ADMIN_EMAILS in .dev.vars?`,
    )
    const again = await verify(adminToken, '/admin')
    check(
      'the same sign-in link cannot be used twice (400)',
      again.status === 400 && again.cookie === null,
      `${again.status}`,
    )

    // --- B. Where people can be sent ---
    const cases = [
      ['no next page', undefined, '/dashboard'],
      ['an external address', 'https://evil.example', '/dashboard'],
      ['a protocol-relative address', '//evil.example', '/dashboard'],
      ['an allowed page with extra query text', '/admin?x=1', '/dashboard'],
      ['an API path', '/api/admin/overview', '/dashboard'],
      ['the settings page', '/settings', '/settings'],
    ]
    for (const [name, next, expected] of cases) {
      const result = await verify(newToken(PLAIN), next)
      check(
        `next = ${name} leads to ${expected}`,
        result.status === 303 && target(result.location) === expected,
        `${result.status} ${result.location}`,
      )
    }

    // --- C. A normal user ---
    const p = await verify(newToken(PLAIN), '/admin')
    check(
      'a normal user can follow next=/admin (the page then hides itself)',
      p.status === 303 && target(p.location) === '/admin' && p.cookie !== null,
      `${p.status} ${p.location}`,
    )
    const plainMe = await get('/api/auth/me', p.cookie)
    check(
      'a normal user is not reported as an admin',
      plainMe.status === 200 && plainMe.json?.isAdmin === false,
      JSON.stringify(plainMe.json),
    )
    const plainOverview = await get('/api/admin/overview', p.cookie)
    check(
      'the admin area stays hidden from a normal user (404)',
      plainOverview.status === 404,
      `got ${plainOverview.status}`,
    )

    // --- D. Bad sign-in links ---
    const expired = await verify(newToken(PLAIN, -60), '/dashboard')
    check('an expired sign-in link is refused (400)', expired.status === 400 && expired.cookie === null)
    const unknown = await verify(randomBytes(32).toString('hex'), '/dashboard')
    check('an unknown sign-in link is refused (400)', unknown.status === 400 && unknown.cookie === null)
    const malformed = await verify('abc', '/dashboard')
    check('a malformed sign-in link is refused (400)', malformed.status === 400 && malformed.cookie === null)

    // --- E. A banned account ---
    const banned = await verify(newToken(BANNED), '/dashboard')
    check(
      'a banned account cannot sign in (403, no cookie)',
      banned.status === 403 && banned.cookie === null,
      `${banned.status}`,
    )

    // --- F. The confirm page ---
    const zeros = '0'.repeat(64)
    const withNext = await get(`/api/auth/verify?token=${zeros}&next=%2Fadmin`)
    check(
      'the confirm page carries an allowed next page',
      withNext.status === 200 && withNext.text.includes('name="next" value="/admin"'),
      `${withNext.status}`,
    )
    const evilPage = await get(
      `/api/auth/verify?token=${zeros}&next=${encodeURIComponent('https://evil.example')}`,
    )
    check(
      'the confirm page drops an external next address',
      evilPage.status === 200 &&
        !evilPage.text.includes('name="next"') &&
        !evilPage.text.includes('evil'),
    )
    const badPage = await get('/api/auth/verify?token=abc&next=%2Fadmin')
    check('the confirm page refuses a malformed token (400)', badPage.status === 400)

    // --- G. Asking for a sign-in link with a next page (prints [dev email] lines in the server window) ---
    const ip = `198.51.100.${10 + Math.floor(Math.random() * 200)}`
    const first = await postJson('/api/auth/request', { email: REQUESTER, next: '/admin' }, ip)
    const stored = queryJson(`SELECT COUNT(*) AS n FROM login_tokens WHERE email = '${REQUESTER}'`)[0].n
    check(
      'asking for a link with a next page is accepted and stores a token',
      first === 200 && stored === 1,
      `${first} stored ${stored}`,
    )
    const second = await postJson(
      '/api/auth/request',
      { email: REQUESTER, next: 'https://evil.example' },
      ip,
    )
    check('an invalid next page is ignored, not an error (200)', second === 200, `${second}`)
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