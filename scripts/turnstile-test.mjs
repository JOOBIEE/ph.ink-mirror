// Turnstile test. Runs against the LOCAL dev server and LOCAL database only.
// Start the server with `npm run dev` in another terminal, then run `npm run test:turnstile`.
// Needs these two lines in .dev.vars (Cloudflare's published dummy keys, for local testing only):
//   TURNSTILE_SITE_KEY=1x00000000000000000000AA
//   TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
// NEEDS INTERNET: the dev server really calls Cloudflare's verification service.
// NEVER add --remote to any command in this file.

import { execFileSync } from 'node:child_process'
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8787'
const DB_NAME = 'ph-ink'
const WRANGLER = 'node_modules/wrangler/bin/wrangler.js'
const SQL_FILE = '.wrangler/turnstile-test.sql'
const SUFFIX = 'ts-test.invalid'
const OWNER = `owner@${SUFFIX}`
const LOGIN_EMAIL = `login@${SUFFIX}`
const SLUG = 'ts-test-link'
const DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'
const TEST_SITE_KEY = '1x00000000000000000000AA'

function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

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
DELETE FROM reports WHERE link_id IN (SELECT id FROM links WHERE slug = '${SLUG}');
DELETE FROM links WHERE slug = '${SLUG}';
DELETE FROM login_tokens WHERE email LIKE '%@${SUFFIX}';
DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@${SUFFIX}');
DELETE FROM users WHERE email LIKE '%@${SUFFIX}';
DELETE FROM rate_limits;
`

const BASE_OCTET = 10 + Math.floor(Math.random() * 100)
let ipCounter = 0
const freshIp = () => `203.0.113.${BASE_OCTET + ipCounter++}`

async function post(path, body) {
  const response = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-dev-ip': freshIp() },
    body: JSON.stringify(body),
  })
  let json = null
  try {
    json = await response.json()
  } catch {}
  return { status: response.status, json }
}

function loginBudgetUsed() {
  const now = Math.floor(Date.now() / 1000)
  const windowStart = now - (now % 86400)
  return queryJson(
    `SELECT COALESCE(SUM(count), 0) AS n FROM rate_limits WHERE key = 'login-global' AND window_start = ${windowStart}`,
  )[0].n
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

  const config = await (await fetch(BASE + '/api/config')).json()
  if (config.turnstileSiteKey !== TEST_SITE_KEY) {
    throw new Error(
      'The dev server is not using the dummy Turnstile keys. Add TURNSTILE_SITE_KEY and ' +
        'TURNSTILE_SECRET_KEY (see the top of this file) to .dev.vars, then restart "npm run dev".',
    )
  }

  const now = Math.floor(Date.now() / 1000)
  runSql(`${CLEANUP_SQL}
INSERT INTO users (email, created_at) VALUES ('${OWNER}', ${now});
INSERT INTO links (slug, destination, owner_id, created_at, updated_at)
VALUES ('${SLUG}', 'https://example.com/', (SELECT id FROM users WHERE email = '${OWNER}'), ${now}, ${now});
`)

  const count = (sql) => queryJson(sql)[0].n

  try {
    check('the public config gives the dummy site key and no secrets', !JSON.stringify(config).includes('secret'))

    // --- Sign-in: refused without a proper token, and the email budget is untouched ---
    const budgetBefore = loginBudgetUsed()
    const missing = await post('/api/auth/request', { email: LOGIN_EMAIL })
    check('a sign-in request with no token is refused (400)', missing.status === 400, `got ${missing.status}`)
    check(
      'the refusal asks for the check',
      typeof missing.json?.error === 'string' && missing.json.error.includes('check'),
      JSON.stringify(missing.json),
    )
    const notText = await post('/api/auth/request', { email: LOGIN_EMAIL, turnstileToken: 123 })
    check('a token that is not text is refused (400)', notText.status === 400, `got ${notText.status}`)
    const empty = await post('/api/auth/request', { email: LOGIN_EMAIL, turnstileToken: '' })
    check('an empty token is refused (400)', empty.status === 400, `got ${empty.status}`)
    const huge = await post('/api/auth/request', { email: LOGIN_EMAIL, turnstileToken: 'x'.repeat(3000) })
    check('a token that is far too long is refused (400)', huge.status === 400, `got ${huge.status}`)

    check(
      'no sign-in token was created by the refused requests',
      count(`SELECT COUNT(*) AS n FROM login_tokens WHERE email = '${LOGIN_EMAIL}'`) === 0,
    )
    check(
      'the daily sign-in email budget was not touched by the refused requests',
      loginBudgetUsed() === budgetBefore,
      `${budgetBefore} -> ${loginBudgetUsed()}`,
    )

    // --- Sign-in: accepted with the dummy token (this calls Cloudflare for real) ---
    const accepted = await post('/api/auth/request', { email: LOGIN_EMAIL, turnstileToken: DUMMY_TOKEN })
    check(
      'a sign-in request with the dummy token is accepted (200)',
      accepted.status === 200,
      `got ${accepted.status} ${JSON.stringify(accepted.json)}`,
    )
    check(
      'it created exactly one sign-in token',
      count(`SELECT COUNT(*) AS n FROM login_tokens WHERE email = '${LOGIN_EMAIL}'`) === 1,
    )
    check(
      'it used exactly one unit of the daily email budget',
      loginBudgetUsed() === budgetBefore + 1,
      `${budgetBefore} -> ${loginBudgetUsed()}`,
    )

    // --- Reports ---
    const noToken = await post('/api/report', { link: SLUG, reason: 'spam' })
    check('a report with no token is refused (400)', noToken.status === 400, `got ${noToken.status}`)
    check(
      'nothing was stored for the refused report',
      count(`SELECT COUNT(*) AS n FROM reports WHERE link_id = (SELECT id FROM links WHERE slug = '${SLUG}')`) === 0,
    )
    const reported = await post('/api/report', { link: SLUG, reason: 'spam', turnstileToken: DUMMY_TOKEN })
    check(
      'a report with the dummy token is accepted (200)',
      reported.status === 200,
      `got ${reported.status} ${JSON.stringify(reported.json)}`,
    )
    check(
      'it stored exactly one report',
      count(`SELECT COUNT(*) AS n FROM reports WHERE link_id = (SELECT id FROM links WHERE slug = '${SLUG}')`) === 1,
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