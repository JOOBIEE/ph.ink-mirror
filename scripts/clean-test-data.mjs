// Removes leftovers from the test scripts. LOCAL database only. NEVER add --remote.
// Run it after a test run dies half way, or before a fresh round: npm run test:clean

import { execFileSync } from 'node:child_process'
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'

const DB_NAME = 'ph-ink'
const WRANGLER = 'node_modules/wrangler/bin/wrangler.js'
const SQL_FILE = '.wrangler/clean-test-data.sql'

const SUFFIXES = [
  'admin-test.invalid',
  'bl-test.invalid',
  'login-test.invalid',
  'abuse-test.invalid',
  'access-test.invalid',
]
const USER_FILTER = SUFFIXES.map((suffix) => `email LIKE '%@${suffix}'`).join(' OR ')
const USERS = `(SELECT id FROM users WHERE ${USER_FILTER})`
const LINKS = `(SELECT id FROM links WHERE owner_id IN ${USERS})`

// Order matters: rows that point at links or users go first.
const SQL = `
DELETE FROM reports WHERE link_id IN ${LINKS} OR handled_by IN ${USERS};
DELETE FROM admin_audit WHERE admin_id IN ${USERS};
DELETE FROM qr_styles WHERE link_id IN ${LINKS};
DELETE FROM clicks WHERE link_id IN ${LINKS};
DELETE FROM daily_stats WHERE link_id IN ${LINKS};
DELETE FROM daily_visitors WHERE link_id IN ${LINKS};
DELETE FROM links WHERE owner_id IN ${USERS};
DELETE FROM sessions WHERE user_id IN ${USERS};
DELETE FROM login_tokens WHERE ${USER_FILTER};
DELETE FROM users WHERE ${USER_FILTER};
DELETE FROM blocked_domains WHERE domain IN ('bl-test-evil.example', 'bl-test-evil2.example', 'admin-test-phish.example', 'phishy-test.example');
DELETE FROM settings WHERE key = 'links_paused';
DELETE FROM rate_limits;
`

function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

mkdirSync('.wrangler', { recursive: true })
writeFileSync(SQL_FILE, SQL)

let done = false
for (let attempt = 1; attempt <= 3 && !done; attempt++) {
  try {
    execFileSync(
      process.execPath,
      [WRANGLER, 'd1', 'execute', DB_NAME, '--local', '--file', SQL_FILE],
      { stdio: 'pipe' },
    )
    done = true
  } catch (error) {
    const detail = `${String(error.stdout ?? '')}${String(error.stderr ?? '')}`
    if (attempt === 3 || !/internal error|locked|busy/i.test(detail)) {
      console.error('Could not clean the test data:')
      console.error(detail)
      try {
        unlinkSync(SQL_FILE)
      } catch {}
      process.exit(1)
    }
    pause(1500)
  }
}

try {
  unlinkSync(SQL_FILE)
} catch {}
console.log('Test data cleaned from the local database.')