// Access-control test. Runs against the LOCAL dev server and LOCAL database only.
// Start the server first with `npm run dev` in another terminal, then run `npm run test:access`.

import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8787'
const DB_NAME = 'ph-ink'
const SQL_FILE = '.wrangler/access-test.sql'
const ALICE = 'alice@access-test.invalid'
const BOB = 'bob@access-test.invalid'

function runSql(sql) {
  mkdirSync('.wrangler', { recursive: true })
  writeFileSync(SQL_FILE, sql)
  try {
        execFileSync(
      process.execPath,
      [
        'node_modules/wrangler/bin/wrangler.js',
        'd1', 'execute', DB_NAME, '--local', '--file', SQL_FILE,
      ],
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

const CLEANUP_SQL = `
DELETE FROM clicks WHERE link_id IN (SELECT id FROM links WHERE owner_id IN (SELECT id FROM users WHERE email LIKE '%@access-test.invalid'));
DELETE FROM links WHERE owner_id IN (SELECT id FROM users WHERE email LIKE '%@access-test.invalid');
DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@access-test.invalid');
DELETE FROM users WHERE email LIKE '%@access-test.invalid';
`

const sha256 = (text) => createHash('sha256').update(text).digest('hex')

async function api(method, path, { token, body, headers } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      ...(token ? { Cookie: `ph_session=${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  let json = null
  try {
    json = await response.json()
  } catch {}
  return { status: response.status, json }
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

  const aliceToken = randomBytes(32).toString('hex')
  const bobToken = randomBytes(32).toString('hex')
  const now = Math.floor(Date.now() / 1000)

  runSql(`${CLEANUP_SQL}
INSERT INTO users (email, created_at) VALUES ('${ALICE}', ${now}), ('${BOB}', ${now});
INSERT INTO sessions (session_hash, user_id, created_at, expires_at) VALUES
  ('${sha256(aliceToken)}', (SELECT id FROM users WHERE email = '${ALICE}'), ${now}, ${now + 3600}),
  ('${sha256(bobToken)}', (SELECT id FROM users WHERE email = '${BOB}'), ${now}, ${now + 3600});
`)

  try {
    // --- Not signed in ---
    check('no cookie: list is refused (401)', (await api('GET', '/api/links')).status === 401)
    check(
      'no cookie: create is refused (401)',
      (await api('POST', '/api/links', { body: { destination: 'https://example.com' } })).status === 401,
    )
    check(
      'forged cookie is refused (401)',
      (await api('GET', '/api/links', { token: randomBytes(32).toString('hex') })).status === 401,
    )

    // --- Each user creates a link ---
    const a = await api('POST', '/api/links', {
      token: aliceToken,
      body: { destination: 'https://alice.example.com/', title: 'Alice link' },
    })
    check('Alice can create a link (201)', a.status === 201, `got ${a.status}`)
    const b = await api('POST', '/api/links', {
      token: bobToken,
      body: { destination: 'https://bob.example.com/', title: 'Bob link' },
    })
    check('Bob can create a link (201)', b.status === 201, `got ${b.status}`)
    if (a.status !== 201 || b.status !== 201) {
      throw new Error('Could not create the test links, so the rest cannot run.')
    }
    const linkA = a.json
    const linkB = b.json

    // --- Listing is scoped ---
    const aliceList = await api('GET', '/api/links', { token: aliceToken })
    const aliceIds = (aliceList.json?.links ?? []).map((l) => l.id)
    check(
      "Alice's list has her link and not Bob's",
      aliceIds.includes(linkA.id) && !aliceIds.includes(linkB.id),
    )
    const bobList = await api('GET', '/api/links', { token: bobToken })
    const bobIds = (bobList.json?.links ?? []).map((l) => l.id)
    check(
      "Bob's list has his link and not Alice's",
      bobIds.includes(linkB.id) && !bobIds.includes(linkA.id),
    )

    // --- Reading someone else's link ---
    check(
      "Alice cannot read Bob's link (404)",
      (await api('GET', `/api/links/${linkB.id}`, { token: aliceToken })).status === 404,
    )
    check(
      "Bob cannot read Alice's link (404)",
      (await api('GET', `/api/links/${linkA.id}`, { token: bobToken })).status === 404,
    )

    // --- Editing and deleting someone else's link ---
    check(
      "Alice cannot edit Bob's link (404)",
      (
        await api('PATCH', `/api/links/${linkB.id}`, {
          token: aliceToken,
          body: { destination: 'https://evil.example/' },
        })
      ).status === 404,
    )
    const bobAfterEdit = await api('GET', `/api/links/${linkB.id}`, { token: bobToken })
    check(
      "Bob's link is unchanged after Alice's attempt",
      bobAfterEdit.json?.destination === 'https://bob.example.com/',
      JSON.stringify(bobAfterEdit.json),
    )
    check(
      "Alice cannot delete Bob's link (404)",
      (await api('DELETE', `/api/links/${linkB.id}`, { token: aliceToken })).status === 404,
    )
    check(
      "Bob's link still exists (200)",
      (await api('GET', `/api/links/${linkB.id}`, { token: bobToken })).status === 200,
    )

    // --- Editing your own link ---
    const edited = await api('PATCH', `/api/links/${linkA.id}`, {
      token: aliceToken,
      body: { destination: 'https://alice.example.org/new' },
    })
    check(
      'Alice can edit her own link (200)',
      edited.status === 200 && edited.json?.destination === 'https://alice.example.org/new',
      JSON.stringify(edited.json),
    )
    check(
      'the slug cannot be changed (400)',
      (
        await api('PATCH', `/api/links/${linkA.id}`, {
          token: aliceToken,
          body: { slug: 'brand-new' },
        })
      ).status === 400,
    )
    check(
      'an unsafe destination is refused on edit (400)',
      (
        await api('PATCH', `/api/links/${linkA.id}`, {
          token: aliceToken,
          body: { destination: 'javascript:alert(1)' },
        })
      ).status === 400,
    )

    // --- Odd ids ---
    const oddIds = ['abc', '0', '1;DROP']
    const oddResults = []
    for (const odd of oddIds) {
      oddResults.push((await api('GET', `/api/links/${odd}`, { token: aliceToken })).status)
    }
    check('odd link ids all give 404', oddResults.every((s) => s === 404), oddResults.join(','))

    // --- Cross-site request ---
    check(
      'a request from another site is refused (403)',
      (
        await api('POST', '/api/links', {
          token: aliceToken,
          body: { destination: 'https://example.com' },
          headers: { Origin: 'https://evil.example' },
        })
      ).status === 403,
    )

    // --- Banned accounts ---
    runSql(`UPDATE users SET status = 'banned' WHERE email = '${BOB}';`)
    check(
      'a banned user is refused immediately (401)',
      (await api('GET', '/api/links', { token: bobToken })).status === 401,
    )
    runSql(`UPDATE users SET status = 'active' WHERE email = '${BOB}';`)
    check(
      'the same user works again once restored (200)',
      (await api('GET', '/api/links', { token: bobToken })).status === 200,
    )

    // --- Deleted slugs stay reserved ---
    check(
      'Alice can delete her own link (200)',
      (await api('DELETE', `/api/links/${linkA.id}`, { token: aliceToken })).status === 200,
    )
    check(
      'a deleted link can no longer be read (404)',
      (await api('GET', `/api/links/${linkA.id}`, { token: aliceToken })).status === 404,
    )
    const reuse = await api('POST', '/api/links', {
      token: bobToken,
      body: { destination: 'https://bob.example.com/', slug: linkA.slug },
    })
    check('a deleted slug cannot be claimed again (409)', reuse.status === 409, `got ${reuse.status}`)

    // --- Logout ---
    check(
      'logout works (200)',
      (await api('POST', '/api/auth/logout', { token: aliceToken })).status === 200,
    )
    check(
      'the session no longer works after logout (401)',
      (await api('GET', '/api/links', { token: aliceToken })).status === 401,
    )
  } finally {
    runSql(CLEANUP_SQL)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

main()