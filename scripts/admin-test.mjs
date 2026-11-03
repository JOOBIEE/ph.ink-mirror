// Admin and reports test. Runs against the LOCAL dev server and LOCAL database only.
// Start the server with `npm run dev` in another terminal, then run `npm run test:admin`.
// Needs ADMIN_EMAILS in .dev.vars to include the two test addresses (see the message).
// NEVER add --remote to any command in this file.
// It clears the LOCAL rate_limits table and the LOCAL kill switch.

import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8787'
const DB_NAME = 'ph-ink'
const WRANGLER = 'node_modules/wrangler/bin/wrangler.js'
const SQL_FILE = '.wrangler/admin-test.sql'
const DOMAIN = 'admin-test.invalid'
const ADMIN = `admin@${DOMAIN}`
const OLD = `oldadmin@${DOMAIN}`
const MAL = `mallory@${DOMAIN}`
const NINA = `nina@${DOMAIN}`
const PHISH = 'admin-test-phish.example'

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

const TEST_USERS = `(SELECT id FROM users WHERE email LIKE '%@${DOMAIN}')`
const TEST_LINKS = `(SELECT id FROM links WHERE owner_id IN ${TEST_USERS})`

const CLEANUP_SQL = `
DELETE FROM reports WHERE link_id IN ${TEST_LINKS};
DELETE FROM admin_audit WHERE admin_id IN ${TEST_USERS};
DELETE FROM blocked_domains WHERE domain = '${PHISH}';
DELETE FROM settings WHERE key = 'links_paused';
DELETE FROM rate_limits;
DELETE FROM clicks WHERE link_id IN ${TEST_LINKS};
DELETE FROM links WHERE owner_id IN ${TEST_USERS};
DELETE FROM sessions WHERE user_id IN ${TEST_USERS};
DELETE FROM login_tokens WHERE email LIKE '%@${DOMAIN}';
DELETE FROM users WHERE email LIKE '%@${DOMAIN}';
`

const sha256 = (text) => createHash('sha256').update(text).digest('hex')

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
    body: body ? JSON.stringify(body) : undefined,
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
  const oldToken = randomBytes(32).toString('hex')
  const malToken = randomBytes(32).toString('hex')
  const ninaToken = randomBytes(32).toString('hex')

  runSql(`${CLEANUP_SQL}
INSERT INTO users (email, created_at) VALUES
  ('${ADMIN}', ${now}), ('${OLD}', ${now}), ('${MAL}', ${now}), ('${NINA}', ${now});
INSERT INTO sessions (session_hash, user_id, created_at, expires_at) VALUES
  ('${sha256(adminToken)}', (SELECT id FROM users WHERE email = '${ADMIN}'), ${now}, ${now + 3600}),
  ('${sha256(oldToken)}', (SELECT id FROM users WHERE email = '${OLD}'), ${now - 13 * 3600}, ${now + 3600}),
  ('${sha256(malToken)}', (SELECT id FROM users WHERE email = '${MAL}'), ${now}, ${now + 3600}),
  ('${sha256(ninaToken)}', (SELECT id FROM users WHERE email = '${NINA}'), ${now}, ${now + 3600});
`)

  const idOf = (email) => queryJson(`SELECT id FROM users WHERE email = '${email}'`)[0].id
  const adminId = idOf(ADMIN)
  const oldId = idOf(OLD)
  const malId = idOf(MAL)
  const ninaId = idOf(NINA)

  const one = (sql) => queryJson(sql)[0]
  const count = (sql) => queryJson(sql)[0].n
  const adm = (method, path, body, headers) => api(method, path, { token: adminToken, body, headers })
  const mk = (token, destination) =>
    api('POST', '/api/links', { token, body: { destination } })
  const report = (body, ip = freshIp(), headers = {}) =>
    api('POST', '/api/report', { body, headers: { 'x-dev-ip': ip, ...headers } })
  const linkRow = (id) =>
    one(`SELECT status, block_reason AS reason FROM links WHERE id = ${id}`)
  const auditCount = (action, targetId) =>
    count(
      `SELECT COUNT(*) AS n FROM admin_audit WHERE action = '${action}' AND target_id = ${targetId} AND admin_id = ${adminId}`,
    )

  try {
    // Is the admin list set up for this test?
    const stale = await api('GET', '/api/admin/overview', { token: oldToken })
    const overview = await api('GET', '/api/admin/overview', { token: adminToken })
    if (stale.status === 404 || overview.status === 404) {
      throw new Error(
        `The test admins are not in ADMIN_EMAILS. Add ${ADMIN} and ${OLD} to ADMIN_EMAILS in .dev.vars, then restart "npm run dev".`,
      )
    }

    // --- A. Access control ---
    check('no cookie: the admin area looks like it does not exist (404)', (await api('GET', '/api/admin/overview')).status === 404)
    check(
      'a forged cookie gets 404',
      (await api('GET', '/api/admin/overview', { token: randomBytes(32).toString('hex') })).status === 404,
    )
    check(
      'a normal signed-in user gets 404 on the overview',
      (await api('GET', '/api/admin/overview', { token: malToken })).status === 404,
    )
    check(
      'a normal signed-in user gets 404 on the link list',
      (await api('GET', '/api/admin/links', { token: malToken })).status === 404,
    )
    check(
      'an admin session older than 12 hours must sign in again (401)',
      stale.status === 401 && stale.json?.code === 'reauth',
      `${stale.status} ${JSON.stringify(stale.json)}`,
    )
    check(
      'a fresh admin session sees the overview (200)',
      overview.status === 200 &&
        typeof overview.json?.users === 'number' &&
        typeof overview.json?.openReports === 'number',
      JSON.stringify(overview.json),
    )

    // --- Set up links ---
    const m1 = (await mk(malToken, `https://${PHISH}/login`)).json
    const m2 = (await mk(malToken, 'https://example.com/mal-2')).json
    const m3 = (await mk(malToken, 'https://example.com/mal-3')).json
    const n1 = (await mk(ninaToken, 'https://example.com/nina-1')).json
    if (!m1?.id || !m2?.id || !m3?.id || !n1?.id) {
      throw new Error('Could not create the test links, so the rest cannot run.')
    }
    await api('DELETE', `/api/links/${m3.id}`, { token: malToken })
    runSql(`INSERT INTO clicks (link_id, clicked_at, country, device, browser, referrer_host, source, is_bot, visitor_hash)
VALUES (${m1.id}, ${now}, 'NG', 'mobile', 'Chrome', 'mallory-referrer.example', 'link', 0, 'admin-test-visitor');`)

    // --- B. Public reports ---
    check('a report with no link is refused (400)', (await report({ reason: 'phishing' })).status === 400)
    check(
      'a report with an unknown reason is refused (400)',
      (await report({ link: m1.slug, reason: 'banana' })).status === 400,
    )
    check(
      'a report with too much detail is refused (400)',
      (await report({ link: m1.slug, reason: 'spam', details: 'x'.repeat(1001) })).status === 400,
    )
    check(
      'a report for a link that does not exist gets 404',
      (await report({ link: 'zzzzzzz', reason: 'spam' })).status === 404,
    )
    check(
      'a report for a link on another site is refused (400)',
      (await report({ link: 'https://evil.example/abc123', reason: 'spam' })).status === 400,
    )

    const ipA = freshIp()
    const r1 = await report(
      { link: m1.slug, reason: 'phishing', details: 'Looks like a fake bank login' },
      ipA,
    )
    check('a valid report is accepted (200)', r1.status === 200 && r1.json?.ok === true, JSON.stringify(r1.json))
    check(
      'the answer to a reporter never contains the details',
      !JSON.stringify(r1.json).includes('fake bank'),
    )
    const r1again = await report(
      { link: m1.slug, reason: 'phishing', details: 'Looks like a fake bank login' },
      ipA,
    )
    check(
      'the same reporter reporting the same link again changes nothing',
      r1again.status === 200 && count(`SELECT COUNT(*) AS n FROM reports WHERE link_id = ${m1.id}`) === 1,
    )
    const viaUrl = await report({ link: `${BASE}/${n1.slug}?s=q`, reason: 'spam' })
    check(
      'a report can name the link with a full address',
      viaUrl.status === 200 && count(`SELECT COUNT(*) AS n FROM reports WHERE link_id = ${n1.id}`) === 1,
      `${viaUrl.status} ${JSON.stringify(viaUrl.json)}`,
    )
    const onDeleted = await report({ link: m3.slug, reason: 'spam' })
    check(
      'reporting a deleted link is harmless and stores nothing',
      onDeleted.status === 200 && count(`SELECT COUNT(*) AS n FROM reports WHERE link_id = ${m3.id}`) === 0,
      `${onDeleted.status} ${JSON.stringify(onDeleted.json)}`,
    )
    check(
      'a report from another site is refused (403)',
      (await report({ link: m1.slug, reason: 'spam' }, freshIp(), { Origin: 'https://evil.example' })).status === 403,
    )

    check('a second reporter can report another link (200)', (await report({ link: m2.slug, reason: 'spam' }, freshIp())).status === 200)
    const ipL = freshIp()
    const five = []
    for (let i = 0; i < 5; i++) {
      five.push((await report({ link: m2.slug, reason: 'other' }, ipL)).status)
    }
    check('five reports from one network in an hour are all accepted', five.every((s) => s === 200), five.join(','))
    check(
      'the sixth report from that network is refused (429)',
      (await report({ link: m2.slug, reason: 'other' }, ipL)).status === 429,
    )

    // --- C. Admin reading ---
    const links = await adm('GET', '/api/admin/links?limit=100')
    const listed = links.json?.links ?? []
    check(
      'the admin sees every account\'s links, with the owner',
      links.status === 200 &&
        listed.some((l) => l.id === m1.id && l.ownerEmail === MAL) &&
        listed.some((l) => l.id === n1.id && l.ownerEmail === NINA),
    )
    const byOwner = await adm('GET', '/api/admin/links?q=mallory&limit=100')
    const mine = byOwner.json?.links ?? []
    check(
      'searching for an owner finds only that owner\'s links',
      mine.length >= 3 && mine.every((l) => l.ownerEmail === MAL),
      `${mine.length}`,
    )
    const wild = await adm('GET', `/api/admin/links?q=${encodeURIComponent('%%%%')}`)
    check('wildcard characters in a search match literally, not everything', (wild.json?.links ?? []).length === 0)
    check('an unknown status filter is refused (400)', (await adm('GET', '/api/admin/links?status=oops')).status === 400)

    const detail = await adm('GET', `/api/admin/links/${m1.id}`)
    check(
      'a link\'s detail includes its reports, with the reporter\'s details',
      detail.status === 200 &&
        detail.json?.link?.ownerEmail === MAL &&
        detail.json?.reports?.some((r) => r.reason === 'phishing' && r.details.includes('fake bank')),
      JSON.stringify(detail.json?.reports),
    )

    const reports = await adm('GET', '/api/admin/reports?status=open&limit=100')
    const queue = reports.json?.reports ?? []
    const m1Report = queue.find((r) => r.linkId === m1.id)
    check(
      'the review queue shows the report with its owner and details',
      reports.status === 200 &&
        m1Report?.reason === 'phishing' &&
        m1Report?.ownerEmail === MAL &&
        m1Report?.details.includes('fake bank') &&
        m1Report?.openForLink === 1,
      JSON.stringify(m1Report),
    )

    const reported = await adm('GET', '/api/admin/accounts?reported=1&limit=100')
    const reportedList = reported.json?.accounts ?? []
    check(
      'the reported-accounts list includes the reported accounts and only reported ones',
      reportedList.some((a) => a.id === malId) &&
        reportedList.some((a) => a.id === ninaId) &&
        reportedList.every((a) => a.openReports > 0),
    )

    const acct = await adm('GET', `/api/admin/accounts/${malId}`)
    check(
      'an account\'s page lists its links and the reports against them',
      acct.status === 200 &&
        acct.json?.account?.email === MAL &&
        acct.json?.links?.some((l) => l.slug === m1.slug) &&
        acct.json?.links?.some((l) => l.slug === m2.slug) &&
        acct.json?.reports?.length >= 3,
      JSON.stringify(acct.json?.account),
    )

    const acctStats = await adm('GET', `/api/admin/accounts/${malId}/analytics?days=30`)
    check(
      'the admin can see an account\'s analytics',
      acctStats.status === 200 &&
        acctStats.json?.totals?.clicks === 1 &&
        acctStats.json?.referrers?.[0]?.name === 'mallory-referrer.example',
      JSON.stringify(acctStats.json?.totals),
    )
    check(
      'a link filter from a different account is refused (404)',
      (await adm('GET', `/api/admin/accounts/${malId}/analytics?link=${n1.id}`)).status === 404,
    )
    check(
      'an invalid analytics period is refused (400)',
      (await adm('GET', `/api/admin/accounts/${malId}/analytics?days=8`)).status === 400,
    )
    check(
      'a normal user cannot reach account analytics (404)',
      (await api('GET', `/api/admin/accounts/${malId}/analytics`, { token: malToken })).status === 404,
    )

    // --- D. Kill switch ---
    const paused = await adm('POST', '/api/admin/kill-switch', { paused: true })
    check('the admin can pause link creation (200)', paused.status === 200 && paused.json?.paused === true)
    check('while paused, creating a link is refused (503)', (await mk(malToken, 'https://example.com/during-pause')).status === 503)
    check('the admin can resume link creation (200)', (await adm('POST', '/api/admin/kill-switch', { paused: false })).status === 200)
    const m4res = await mk(malToken, 'https://example.com/mal-4')
    check('after resuming, creating a link works again (201)', m4res.status === 201, `got ${m4res.status}`)
    const m4 = m4res.json

    // --- E. Blocking and restoring links ---
    const nonAdminBlock = await api('POST', `/api/admin/links/${m1.id}/block`, {
      token: malToken,
      body: { reason: 'x' },
    })
    check(
      'a normal user cannot block a link (404) and nothing changes',
      nonAdminBlock.status === 404 && linkRow(m1.id).status === 'active',
    )
    check(
      'an admin request from another site is refused (403)',
      (await adm('POST', `/api/admin/links/${m1.id}/block`, {}, { Origin: 'https://evil.example' })).status === 403,
    )
    const block = await adm('POST', `/api/admin/links/${m1.id}/block`, { reason: 'phishing kit', blockDomain: true })
    check('the admin can block a link (200)', block.status === 200, JSON.stringify(block.json))
    const blockedRow = linkRow(m1.id)
    check(
      'the link is blocked and marked as blocked by an admin',
      blockedRow.status === 'blocked' && blockedRow.reason === 'admin',
      JSON.stringify(blockedRow),
    )
    const handled = one(`SELECT status, handled_by AS handledBy FROM reports WHERE link_id = ${m1.id}`)
    check(
      'its open report is marked handled by that admin',
      handled.status === 'actioned' && handled.handledBy === adminId,
      JSON.stringify(handled),
    )
    check('visitors to a blocked link get 403', (await visit('/' + m1.slug)) === 403)
    check(
      'the destination domain was added to the blocklist',
      count(`SELECT COUNT(*) AS n FROM blocked_domains WHERE domain = '${PHISH}'`) === 1,
    )
    check(
      'nobody can now shorten a link to that domain (400)',
      (await mk(ninaToken, `https://${PHISH}/x`)).status === 400,
    )
    const again = await adm('POST', `/api/admin/links/${m1.id}/block`, { reason: 'again' })
    check(
      'blocking twice is harmless and logged once',
      again.status === 200 && auditCount('block_link', m1.id) === 1,
    )
    const blockedList = await adm('GET', '/api/admin/links?status=blocked&limit=100')
    const blockedLinks = blockedList.json?.links ?? []
    check(
      'the status filter shows only blocked links, including this one',
      blockedLinks.some((l) => l.id === m1.id) && blockedLinks.every((l) => l.status === 'blocked'),
    )
    check('the admin can restore the link (200)', (await adm('POST', `/api/admin/links/${m1.id}/restore`)).status === 200)
    const restored = linkRow(m1.id)
    check(
      'a restored link is active again and redirects',
      restored.status === 'active' && restored.reason === null && (await visit('/' + m1.slug)) === 302,
      JSON.stringify(restored),
    )
    check('restoring a link that is not blocked is refused (409)', (await adm('POST', `/api/admin/links/${m4.id}/restore`)).status === 409)
    check(
      'blocking a link its owner deleted is refused (409)',
      (await adm('POST', `/api/admin/links/${m3.id}/block`, {})).status === 409,
    )
    const oddA = await adm('POST', '/api/admin/links/abc/block', {})
    const oddB = await adm('POST', '/api/admin/links/0/restore')
    const oddC = await adm('GET', '/api/admin/links/abc')
    check(
      'odd link ids all give 404',
      oddA.status === 404 && oddB.status === 404 && oddC.status === 404,
      `${oddA.status},${oddB.status},${oddC.status}`,
    )

    // --- F. Handling reports ---
    const spamId = one(`SELECT id FROM reports WHERE link_id = ${m2.id} AND reason = 'spam'`).id
    check('the admin can dismiss a report (200)', (await adm('POST', `/api/admin/reports/${spamId}/dismiss`)).status === 200)
    check('dismissing it again is refused (409)', (await adm('POST', `/api/admin/reports/${spamId}/dismiss`)).status === 409)
    const dismissed = one(`SELECT status, handled_by AS handledBy FROM reports WHERE id = ${spamId}`)
    check(
      'a dismissed report records who handled it',
      dismissed.status === 'dismissed' && dismissed.handledBy === adminId,
      JSON.stringify(dismissed),
    )
    const otherId = one(`SELECT id FROM reports WHERE link_id = ${m2.id} AND reason = 'other'`).id
    check(
      'the admin can resolve a report by blocking its link (200)',
      (await adm('POST', `/api/admin/reports/${otherId}/block`, { reason: 'spam link' })).status === 200,
    )
    const m2row = linkRow(m2.id)
    check(
      'that link is now blocked',
      m2row.status === 'blocked' && m2row.reason === 'admin',
      JSON.stringify(m2row),
    )
    const resolved = one(`SELECT status, handled_by AS handledBy FROM reports WHERE id = ${otherId}`)
    check(
      'the report is marked handled by that admin',
      resolved.status === 'actioned' && resolved.handledBy === adminId,
      JSON.stringify(resolved),
    )
    check(
      'the admin can block a link again after restoring it (200)',
      (await adm('POST', `/api/admin/links/${m1.id}/block`, { reason: 'second block' })).status === 200,
    )

    // --- G. Banning and unbanning accounts ---
    check('an admin account cannot be banned (400)', (await adm('POST', `/api/admin/accounts/${oldId}/ban`, {})).status === 400)
    check('an admin cannot ban themselves (400)', (await adm('POST', `/api/admin/accounts/${adminId}/ban`, {})).status === 400)
    check('banning an account that does not exist gives 404', (await adm('POST', '/api/admin/accounts/999999999/ban', {})).status === 404)

    check('the admin can ban an account (200)', (await adm('POST', `/api/admin/accounts/${ninaId}/ban`, { reason: 'phishing' })).status === 200)
    check(
      'the banned user is signed out immediately (401)',
      (await api('GET', '/api/links', { token: ninaToken })).status === 401,
    )
    const n1banned = linkRow(n1.id)
    check(
      'their link is blocked because of the ban',
      n1banned.status === 'blocked' && n1banned.reason === 'account_banned',
      JSON.stringify(n1banned),
    )
    check('visitors to their link get 403', (await visit('/' + n1.slug)) === 403)
    check(
      'their open report is marked handled',
      one(`SELECT status FROM reports WHERE link_id = ${n1.id}`).status === 'actioned',
    )
    check('banning an already banned account is refused (409)', (await adm('POST', `/api/admin/accounts/${ninaId}/ban`, {})).status === 409)

    check('the admin can unban the account (200)', (await adm('POST', `/api/admin/accounts/${ninaId}/unban`)).status === 200)
    const n1back = linkRow(n1.id)
    check(
      'unbanning restores their link and their account',
      n1back.status === 'active' &&
        n1back.reason === null &&
        one(`SELECT status FROM users WHERE id = ${ninaId}`).status === 'active',
      JSON.stringify(n1back),
    )
    check(
      'their old session stays dead, so they must sign in again (401)',
      (await api('GET', '/api/links', { token: ninaToken })).status === 401,
    )

    check('the admin can ban Mallory (200)', (await adm('POST', `/api/admin/accounts/${malId}/ban`, {})).status === 200)
    const afterBan = Object.fromEntries(
      queryJson(`SELECT id, status, block_reason AS reason FROM links WHERE id IN (${m1.id}, ${m2.id}, ${m4.id})`).map((r) => [r.id, r]),
    )
    check(
      'a ban blocks active links but keeps the reason on links blocked by hand',
      afterBan[m4.id]?.status === 'blocked' &&
        afterBan[m4.id]?.reason === 'account_banned' &&
        afterBan[m1.id]?.reason === 'admin' &&
        afterBan[m2.id]?.reason === 'admin',
      JSON.stringify(afterBan),
    )
    check(
      'a link cannot be restored while its owner is banned (409)',
      (await adm('POST', `/api/admin/links/${m1.id}/restore`)).status === 409,
    )
    check('the admin can unban Mallory (200)', (await adm('POST', `/api/admin/accounts/${malId}/unban`)).status === 200)
    const afterUnban = Object.fromEntries(
      queryJson(`SELECT id, status, block_reason AS reason FROM links WHERE id IN (${m1.id}, ${m2.id}, ${m4.id})`).map((r) => [r.id, r]),
    )
    check(
      'unbanning restores only the links the ban blocked',
      afterUnban[m4.id]?.status === 'active' &&
        afterUnban[m1.id]?.status === 'blocked' &&
        afterUnban[m1.id]?.reason === 'admin' &&
        afterUnban[m2.id]?.status === 'blocked' &&
        afterUnban[m2.id]?.reason === 'admin',
      JSON.stringify(afterUnban),
    )

    // --- H. Audit log ---
    const audit = await adm('GET', '/api/admin/audit?limit=100')
    const entries = audit.json?.entries ?? []
    const actions = new Set(entries.filter((e) => e.adminEmail === ADMIN).map((e) => e.action))
    const expected = [
      'pause_links', 'resume_links', 'block_link', 'restore_link',
      'dismiss_report', 'ban_account', 'unban_account', 'view_account',
    ]
    const missing = expected.filter((action) => !actions.has(action))
    check('the audit log records every kind of admin action', missing.length === 0, `missing: ${missing.join(', ')}`)
    check(
      'an audit entry names the admin, the action and the target',
      entries.some((e) => e.action === 'block_link' && e.adminEmail === ADMIN && e.targetType === 'link' && e.targetId === m1.id),
    )
    const filtered = await adm('GET', `/api/admin/audit?targetType=link&targetId=${m1.id}`)
    const filteredEntries = filtered.json?.entries ?? []
    check(
      'the audit log can be filtered to one target',
      filteredEntries.length >= 3 &&
        filteredEntries.every((e) => e.targetType === 'link' && e.targetId === m1.id),
      `${filteredEntries.length}`,
    )
    check(
      'a normal user cannot read the audit log (404)',
      (await api('GET', '/api/admin/audit', { token: malToken })).status === 404,
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