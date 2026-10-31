// Access-control test. Runs against the LOCAL dev server and LOCAL database only.
// Start the server first with `npm run dev` in another terminal, then run `npm run test:access`.
// NEVER add --remote to any command in this file.

import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8787'
const DB_NAME = 'ph-ink'
const WRANGLER = 'node_modules/wrangler/bin/wrangler.js'
const SQL_FILE = '.wrangler/access-test.sql'
const ALICE = 'alice@access-test.invalid'
const BOB = 'bob@access-test.invalid'
let carolId = null

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
DELETE FROM clicks WHERE link_id IN (SELECT id FROM links WHERE owner_id IN (SELECT id FROM users WHERE email LIKE '%@access-test.invalid'));
DELETE FROM daily_stats WHERE link_id IN (SELECT id FROM links WHERE owner_id IN (SELECT id FROM users WHERE email LIKE '%@access-test.invalid'));
DELETE FROM daily_visitors WHERE link_id IN (SELECT id FROM links WHERE owner_id IN (SELECT id FROM users WHERE email LIKE '%@access-test.invalid'));
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

async function apiText(path, token) {
  const response = await fetch(BASE + path, {
    headers: token ? { Cookie: `ph_session=${token}` } : {},
    redirect: 'manual',
  })
  return { status: response.status, text: await response.text(), headers: response.headers }
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

    // --- Analytics ---
    runSql(`
INSERT INTO clicks (link_id, clicked_at, country, device, browser, referrer_host, source, is_bot, visitor_hash)
VALUES (${linkB.id}, ${now}, 'NG', 'mobile', 'Chrome', 'secret-referrer.example', 'link', 0, 'access-test-visitor');
INSERT INTO daily_stats (link_id, day, is_bot, source, country, device, browser, referrer_host, clicks)
VALUES (${linkB.id}, date('now', '-120 days'), 0, 'link', 'GB', 'desktop', 'Firefox', '', 5);
INSERT INTO daily_visitors (link_id, day, is_bot, visitors)
VALUES (${linkB.id}, date('now', '-120 days'), 0, 3);
`)

    check('no cookie: analytics is refused (401)', (await api('GET', '/api/analytics')).status === 401)
    check('no cookie: CSV export is refused (401)', (await apiText('/api/analytics/export.csv')).status === 401)
    check(
      'an invalid period is refused (400)',
      (await api('GET', '/api/analytics?days=8', { token: aliceToken })).status === 400,
    )

    const aliceStats = await api('GET', '/api/analytics?days=30', { token: aliceToken })
    check(
      "Alice's analytics show none of Bob's clicks",
      aliceStats.json?.totals?.clicks === 0,
      JSON.stringify(aliceStats.json?.totals),
    )
    check(
      "Alice's analytics contain none of Bob's data",
      !JSON.stringify(aliceStats.json).includes('secret-referrer'),
    )
    check(
      "Alice cannot ask for Bob's link analytics (404)",
      (await api('GET', `/api/analytics?link=${linkB.id}`, { token: aliceToken })).status === 404,
    )

    const bobStats = await api('GET', `/api/analytics?days=30&link=${linkB.id}`, { token: bobToken })
    check('Bob sees his own click', bobStats.json?.totals?.clicks === 1, JSON.stringify(bobStats.json?.totals))
    check(
      'Bob sees the referrer of his click',
      bobStats.json?.referrers?.[0]?.name === 'secret-referrer.example',
    )

    const bob365 = await api('GET', '/api/analytics?days=365', { token: bobToken })
    check(
      '365 days adds the older daily summary (1 + 5 clicks)',
      bob365.json?.totals?.clicks === 6,
      JSON.stringify(bob365.json?.totals),
    )
    check(
      '365 days adds the older visitors (1 + 3)',
      bob365.json?.totals?.visitors === 4,
      JSON.stringify(bob365.json?.totals),
    )
    check('365 days returns 365 daily entries', bob365.json?.daily?.length === 365)
    const bob90 = await api('GET', '/api/analytics?days=90', { token: bobToken })
    check(
      '90 days leaves out the older summary',
      bob90.json?.totals?.clicks === 1,
      JSON.stringify(bob90.json?.totals),
    )

    const aliceCsv = await apiText('/api/analytics/export.csv?days=30', aliceToken)
    check(
      "Alice's CSV export holds none of Bob's data",
      aliceCsv.status === 200 &&
        !aliceCsv.text.includes(linkB.slug) &&
        !aliceCsv.text.includes('secret-referrer'),
    )
    const bobCsv = await apiText('/api/analytics/export.csv?days=30', bobToken)
    check(
      "Bob's CSV export has the header and his link",
      bobCsv.status === 200 && bobCsv.text.startsWith('time_utc,') && bobCsv.text.includes(linkB.slug),
    )
    check(
      "Alice cannot export Bob's link (404)",
      (await apiText(`/api/analytics/export.csv?link=${linkB.id}`, aliceToken)).status === 404,
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

    // --- Account export and deletion ---
    const CAROL = 'carol@access-test.invalid'
    const DAN = 'dan@access-test.invalid'
    const carolToken = randomBytes(32).toString('hex')
    const danToken = randomBytes(32).toString('hex')
    const t0 = Math.floor(Date.now() / 1000)

    runSql(`
INSERT INTO users (email, created_at) VALUES ('${CAROL}', ${t0}), ('${DAN}', ${t0});
INSERT INTO sessions (session_hash, user_id, created_at, expires_at) VALUES
  ('${sha256(carolToken)}', (SELECT id FROM users WHERE email = '${CAROL}'), ${t0}, ${t0 + 3600}),
  ('${sha256(danToken)}', (SELECT id FROM users WHERE email = '${DAN}'), ${t0}, ${t0 + 3600});
`)
    carolId = queryJson(`SELECT id FROM users WHERE email = '${CAROL}'`)[0].id

    const carolMade = await api('POST', '/api/links', {
      token: carolToken,
      body: { destination: 'https://carol.example.com/', title: 'Carol private name' },
    })
    const danMade = await api('POST', '/api/links', {
      token: danToken,
      body: { destination: 'https://dan.example.com/', title: 'Dan link' },
    })
    if (carolMade.status !== 201 || danMade.status !== 201) {
      throw new Error('Could not create the account test links.')
    }
    const carolLink = carolMade.json
    const danLink = danMade.json

    runSql(`
INSERT INTO clicks (link_id, clicked_at, country, device, browser, referrer_host, source, is_bot, visitor_hash) VALUES
  (${carolLink.id}, ${t0}, 'NG', 'mobile', 'Chrome', 'carol-referrer.example', 'link', 0, 'carol-secret-hash'),
  (${danLink.id}, ${t0}, 'GB', 'desktop', 'Firefox', 'dan-referrer.example', 'link', 0, 'dan-secret-hash');
INSERT INTO daily_stats (link_id, day, is_bot, source, country, device, browser, referrer_host, clicks)
  VALUES (${carolLink.id}, date('now', '-120 days'), 0, 'link', 'NG', 'mobile', 'Chrome', '', 2);
INSERT INTO daily_visitors (link_id, day, is_bot, visitors)
  VALUES (${carolLink.id}, date('now', '-120 days'), 0, 1);
`)

    check('no cookie: data export is refused (401)', (await apiText('/api/account/export')).status === 401)
    check(
      'no cookie: account deletion is refused (401)',
      (await api('POST', '/api/account/delete', { body: { confirmEmail: CAROL } })).status === 401,
    )

    const exported = await apiText('/api/account/export', carolToken)
    check(
      "Carol's data export downloads as a file (200)",
      exported.status === 200 &&
        (exported.headers.get('content-disposition') ?? '').includes('attachment'),
      `status ${exported.status}`,
    )
    check(
      "the export contains Carol's email, link and clicks",
      exported.text.includes(CAROL) &&
        exported.text.includes(carolLink.slug) &&
        exported.text.includes('carol-referrer.example'),
    )
    check(
      "the export contains nothing of Dan's and no visitor fingerprints",
      !exported.text.includes(DAN) &&
        !exported.text.includes(danLink.slug) &&
        !exported.text.includes('dan-referrer.example') &&
        !exported.text.includes('carol-secret-hash') &&
        !exported.text.includes('dan-secret-hash'),
    )

    check(
      'deleting with no confirmation is refused (400)',
      (await api('POST', '/api/account/delete', { token: carolToken })).status === 400,
    )
    check(
      'deleting with the wrong email is refused (400)',
      (
        await api('POST', '/api/account/delete', {
          token: carolToken,
          body: { confirmEmail: 'nobody@access-test.invalid' },
        })
      ).status === 400,
    )
    check(
      "Dan cannot delete anything by typing Carol's email (400)",
      (
        await api('POST', '/api/account/delete', {
          token: danToken,
          body: { confirmEmail: CAROL },
        })
      ).status === 400,
    )
    check(
      'Carol is still signed in after the refused attempts (200)',
      (await api('GET', '/api/links', { token: carolToken })).status === 200,
    )

    check(
      'deleting with the right email works (200)',
      (
        await api('POST', '/api/account/delete', {
          token: carolToken,
          body: { confirmEmail: CAROL },
        })
      ).status === 200,
    )
    check(
      "Carol's session stops working (401)",
      (await api('GET', '/api/links', { token: carolToken })).status === 401,
    )
    check(
      "Carol's short link now shows as removed (410)",
      (await apiText('/' + carolLink.slug)).status === 410,
    )
    check(
      "Dan's link still redirects (302)",
      (await apiText('/' + danLink.slug)).status === 302,
    )

    const carolRow = queryJson(`SELECT status, email FROM users WHERE id = ${carolId}`)[0]
    check(
      "Carol's email is removed from her account row",
      carolRow?.status === 'deleted' && carolRow?.email === `deleted-${carolId}@deleted.invalid`,
      JSON.stringify(carolRow),
    )
    check(
      'her original email address is free to sign up again',
      queryJson(`SELECT COUNT(*) AS n FROM users WHERE email = '${CAROL}'`)[0].n === 0,
    )
    const leftovers = queryJson(
      `SELECT (SELECT COUNT(*) FROM clicks WHERE link_id = ${carolLink.id}) AS a, ` +
        `(SELECT COUNT(*) FROM daily_stats WHERE link_id = ${carolLink.id}) AS b, ` +
        `(SELECT COUNT(*) FROM daily_visitors WHERE link_id = ${carolLink.id}) AS c`,
    )[0]
    check(
      "all of Carol's click data and summaries are erased",
      leftovers.a === 0 && leftovers.b === 0 && leftovers.c === 0,
      JSON.stringify(leftovers),
    )
    const carolLinkRow = queryJson(
      `SELECT status, title, destination FROM links WHERE id = ${carolLink.id}`,
    )[0]
    check(
      "Carol's link is a tombstone: deleted, no name, no destination",
      carolLinkRow?.status === 'deleted' &&
        carolLinkRow?.title === null &&
        carolLinkRow?.destination === '',
      JSON.stringify(carolLinkRow),
    )
    check(
      "Dan's click data was not touched",
      queryJson(`SELECT COUNT(*) AS n FROM clicks WHERE link_id = ${danLink.id}`)[0].n >= 1,
    )
    check(
      "Carol's slug stays reserved after her account is gone (409)",
      (
        await api('POST', '/api/links', {
          token: danToken,
          body: { destination: 'https://dan.example.com/', slug: carolLink.slug },
        })
      ).status === 409,
    )
  } finally {
    runSql(CLEANUP_SQL)
    if (carolId !== null) {
      runSql(`DELETE FROM links WHERE owner_id = ${carolId};
DELETE FROM sessions WHERE user_id = ${carolId};
DELETE FROM users WHERE id = ${carolId};`)
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})