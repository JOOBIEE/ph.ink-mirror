import { blockableHost, likePattern } from './admin'
import { LOGIN_EMAILS_PER_DAY } from './limits'
import { peek } from './ratelimit'
import { getSetting, LINKS_PAUSED_KEY } from './settings'

export type AuditTarget = 'link' | 'user' | 'report' | 'system'

export type ActionResult =
  | { ok: true; changed: boolean }
  | { ok: false; status: 400 | 404 | 409; error: string }

const DAY = 86400

function audit(
  db: D1Database,
  adminId: number,
  action: string,
  targetType: AuditTarget,
  targetId: number | null,
  detail: string | null,
  now: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO admin_audit (admin_id, action, target_type, target_id, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(adminId, action, targetType, targetId, detail === null ? null : detail.slice(0, 500), now)
}

// ---------- Overview ----------

export type Overview = {
  users: number
  bannedUsers: number
  newUsers24h: number
  links: number
  blockedLinks: number
  newLinks24h: number
  openReports: number
  clicks24h: number
  linksPaused: boolean
  signInEmailsToday: number
  signInEmailsLimit: number
}

export async function getOverview(db: D1Database, now: number): Promise<Overview> {
  const since = now - DAY
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE status = 'active') AS users,
         (SELECT COUNT(*) FROM users WHERE status = 'banned') AS bannedUsers,
         (SELECT COUNT(*) FROM users WHERE created_at >= ?) AS newUsers24h,
         (SELECT COUNT(*) FROM links WHERE status IN ('active', 'disabled')) AS links,
         (SELECT COUNT(*) FROM links WHERE status = 'blocked') AS blockedLinks,
         (SELECT COUNT(*) FROM links WHERE created_at >= ?) AS newLinks24h,
         (SELECT COUNT(*) FROM reports WHERE status = 'open') AS openReports,
         (SELECT COUNT(*) FROM clicks WHERE clicked_at >= ? AND is_bot = 0) AS clicks24h`,
    )
    .bind(since, since, since)
    .first<{
      users: number
      bannedUsers: number
      newUsers24h: number
      links: number
      blockedLinks: number
      newLinks24h: number
      openReports: number
      clicks24h: number
    }>()
  if (!row) throw new Error('Could not read the overview.')

  const paused = (await getSetting(db, LINKS_PAUSED_KEY)) === '1'
  const budget = await peek(
    db,
    { key: 'login-global', windowSeconds: DAY, max: LOGIN_EMAILS_PER_DAY },
    now,
  )

  return {
    ...row,
    linksPaused: paused,
    signInEmailsToday: budget.count,
    signInEmailsLimit: LOGIN_EMAILS_PER_DAY,
  }
}

// ---------- Links ----------

export type AdminLink = {
  id: number
  slug: string
  destination: string
  title: string | null
  status: string
  blockReason: string | null
  createdAt: number
  ownerId: number
  ownerEmail: string
  ownerStatus: string
  openReports: number
  clicks30d: number
}

const LINK_COLUMNS = `
  l.id AS id, l.slug AS slug, l.destination AS destination, l.title AS title,
  l.status AS status, l.block_reason AS blockReason, l.created_at AS createdAt,
  l.owner_id AS ownerId, u.email AS ownerEmail, u.status AS ownerStatus,
  (SELECT COUNT(*) FROM reports r WHERE r.link_id = l.id AND r.status = 'open') AS openReports,
  (SELECT COUNT(*) FROM clicks c
     WHERE c.link_id = l.id AND c.is_bot = 0 AND c.clicked_at >= ?) AS clicks30d`

export async function listAdminLinks(
  db: D1Database,
  options: {
    status: string | null
    search: string | null
    ownerId: number | null
    limit: number
    offset: number
  },
  now: number,
): Promise<AdminLink[]> {
  const pattern = options.search === null ? null : likePattern(options.search)
  const result = await db
    .prepare(
      `SELECT ${LINK_COLUMNS}
       FROM links l JOIN users u ON u.id = l.owner_id
       WHERE (? IS NULL OR l.status = ?)
         AND (? IS NULL OR l.owner_id = ?)
         AND (? IS NULL
              OR l.slug LIKE ? ESCAPE '\\'
              OR l.destination LIKE ? ESCAPE '\\'
              OR COALESCE(l.title, '') LIKE ? ESCAPE '\\'
              OR u.email LIKE ? ESCAPE '\\')
       ORDER BY l.id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(
      now - 30 * DAY,
      options.status, options.status,
      options.ownerId, options.ownerId,
      pattern, pattern, pattern, pattern, pattern,
      options.limit, options.offset,
    )
    .all<AdminLink>()
  return result.results
}

export async function getAdminLink(
  db: D1Database,
  id: number,
  now: number,
): Promise<AdminLink | null> {
  return await db
    .prepare(
      `SELECT ${LINK_COLUMNS}
       FROM links l JOIN users u ON u.id = l.owner_id
       WHERE l.id = ?`,
    )
    .bind(now - 30 * DAY, id)
    .first<AdminLink>()
}

// ---------- Reports ----------

export type AdminReport = {
  id: number
  reason: string
  details: string | null
  status: string
  createdAt: number
  handledAt: number | null
  linkId: number
  slug: string
  destination: string
  linkStatus: string
  ownerId: number
  ownerEmail: string
  openForLink: number
}

export async function listAdminReports(
  db: D1Database,
  options: {
    status: string | null
    linkId: number | null
    ownerId: number | null
    limit: number
    offset: number
  },
): Promise<AdminReport[]> {
  const result = await db
    .prepare(
      `SELECT r.id AS id, r.reason AS reason, r.details AS details, r.status AS status,
              r.created_at AS createdAt, r.handled_at AS handledAt,
              l.id AS linkId, l.slug AS slug, l.destination AS destination,
              l.status AS linkStatus, l.owner_id AS ownerId, u.email AS ownerEmail,
              (SELECT COUNT(*) FROM reports r2
                 WHERE r2.link_id = r.link_id AND r2.status = 'open') AS openForLink
       FROM reports r
       JOIN links l ON l.id = r.link_id
       JOIN users u ON u.id = l.owner_id
       WHERE (? IS NULL OR r.status = ?)
         AND (? IS NULL OR r.link_id = ?)
         AND (? IS NULL OR l.owner_id = ?)
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(
      options.status, options.status,
      options.linkId, options.linkId,
      options.ownerId, options.ownerId,
      options.limit, options.offset,
    )
    .all<AdminReport>()
  return result.results
}

export async function getReportState(
  db: D1Database,
  reportId: number,
): Promise<{ linkId: number; status: string } | null> {
  return await db
    .prepare('SELECT link_id AS linkId, status FROM reports WHERE id = ?')
    .bind(reportId)
    .first<{ linkId: number; status: string }>()
}

// ---------- Accounts ----------

export type AdminAccount = {
  id: number
  email: string
  status: string
  createdAt: number
  linkCount: number
  blockedLinks: number
  openReports: number
}

const ACCOUNT_COLUMNS = `
  u.id AS id, u.email AS email, u.status AS status, u.created_at AS createdAt,
  (SELECT COUNT(*) FROM links l WHERE l.owner_id = u.id AND l.status != 'deleted') AS linkCount,
  (SELECT COUNT(*) FROM links l WHERE l.owner_id = u.id AND l.status = 'blocked') AS blockedLinks,
  (SELECT COUNT(*) FROM reports r JOIN links l ON l.id = r.link_id
     WHERE l.owner_id = u.id AND r.status = 'open') AS openReports`

export async function listAdminAccounts(
  db: D1Database,
  options: {
    status: string | null
    search: string | null
    reportedOnly: boolean
    limit: number
    offset: number
  },
): Promise<AdminAccount[]> {
  const pattern = options.search === null ? null : likePattern(options.search)
  const result = await db
    .prepare(
      `SELECT * FROM (
         SELECT ${ACCOUNT_COLUMNS}
         FROM users u
         WHERE (? IS NULL OR u.status = ?)
           AND (? IS NULL OR u.email LIKE ? ESCAPE '\\')
       )
       WHERE (? = 0 OR openReports > 0)
       ORDER BY openReports DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(
      options.status, options.status,
      pattern, pattern,
      options.reportedOnly ? 1 : 0,
      options.limit, options.offset,
    )
    .all<AdminAccount>()
  return result.results
}

export async function getAdminAccount(
  db: D1Database,
  id: number,
): Promise<AdminAccount | null> {
  return await db
    .prepare(`SELECT ${ACCOUNT_COLUMNS} FROM users u WHERE u.id = ?`)
    .bind(id)
    .first<AdminAccount>()
}

// ---------- Audit log ----------

export type AuditEntry = {
  id: number
  action: string
  targetType: string
  targetId: number | null
  detail: string | null
  createdAt: number
  adminEmail: string
}

export async function listAudit(
  db: D1Database,
  options: { targetType: string | null; targetId: number | null; limit: number; offset: number },
): Promise<AuditEntry[]> {
  const result = await db
    .prepare(
      `SELECT a.id AS id, a.action AS action, a.target_type AS targetType,
              a.target_id AS targetId, a.detail AS detail, a.created_at AS createdAt,
              u.email AS adminEmail
       FROM admin_audit a JOIN users u ON u.id = a.admin_id
       WHERE (? IS NULL OR a.target_type = ?) AND (? IS NULL OR a.target_id = ?)
       ORDER BY a.id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(
      options.targetType, options.targetType,
      options.targetId, options.targetId,
      options.limit, options.offset,
    )
    .all<AuditEntry>()
  return result.results
}

export async function logAccountView(
  db: D1Database,
  adminId: number,
  userId: number,
  now: number,
): Promise<void> {
  await audit(db, adminId, 'view_account', 'user', userId, null, now).run()
}

// ---------- Actions ----------

export async function blockLink(
  db: D1Database,
  adminId: number,
  linkId: number,
  note: string | null,
  alsoBlockDomain: boolean,
  now: number,
): Promise<ActionResult> {
  const link = await db
    .prepare('SELECT id, status, destination FROM links WHERE id = ?')
    .bind(linkId)
    .first<{ id: number; status: string; destination: string }>()
  if (!link) return { ok: false, status: 404, error: 'Link not found.' }
  if (link.status === 'deleted') {
    return { ok: false, status: 409, error: 'The owner deleted that link.' }
  }
  if (link.status === 'blocked') return { ok: true, changed: false }

  const host = alsoBlockDomain ? blockableHost(link.destination) : null
  const detail =
    [note, host ? `domain blocked: ${host}` : null].filter((part) => part !== null).join(' | ') ||
    null

  const statements = [
    db
      .prepare(
        `UPDATE links SET status = 'blocked', block_reason = 'admin', updated_at = ?
         WHERE id = ? AND status IN ('active', 'disabled')`,
      )
      .bind(now, linkId),
    db
      .prepare(
        `UPDATE reports SET status = 'actioned', handled_at = ?, handled_by = ?
         WHERE link_id = ? AND status = 'open'`,
      )
      .bind(now, adminId, linkId),
  ]
  if (host) {
    statements.push(
      db
        .prepare(
          'INSERT OR IGNORE INTO blocked_domains (domain, reason, created_at) VALUES (?, ?, ?)',
        )
        .bind(host, note, now),
    )
  }
  statements.push(audit(db, adminId, 'block_link', 'link', linkId, detail, now))

  await db.batch(statements)
  return { ok: true, changed: true }
}

export async function restoreLink(
  db: D1Database,
  adminId: number,
  linkId: number,
  now: number,
): Promise<ActionResult> {
  const row = await db
    .prepare(
      `SELECT l.status AS status, u.status AS ownerStatus
       FROM links l JOIN users u ON u.id = l.owner_id WHERE l.id = ?`,
    )
    .bind(linkId)
    .first<{ status: string; ownerStatus: string }>()
  if (!row) return { ok: false, status: 404, error: 'Link not found.' }
  if (row.status !== 'blocked') {
    return { ok: false, status: 409, error: 'That link is not blocked.' }
  }
  if (row.ownerStatus === 'banned') {
    return { ok: false, status: 409, error: 'Unban the account first.' }
  }

  await db.batch([
    db
      .prepare(
        `UPDATE links SET status = 'active', block_reason = NULL, updated_at = ?
         WHERE id = ? AND status = 'blocked'`,
      )
      .bind(now, linkId),
    audit(db, adminId, 'restore_link', 'link', linkId, null, now),
  ])
  return { ok: true, changed: true }
}

export async function dismissReport(
  db: D1Database,
  adminId: number,
  reportId: number,
  now: number,
): Promise<ActionResult> {
  const report = await getReportState(db, reportId)
  if (!report) return { ok: false, status: 404, error: 'Report not found.' }
  if (report.status !== 'open') {
    return { ok: false, status: 409, error: 'That report was already handled.' }
  }

  await db.batch([
    db
      .prepare(
        `UPDATE reports SET status = 'dismissed', handled_at = ?, handled_by = ?
         WHERE id = ? AND status = 'open'`,
      )
      .bind(now, adminId, reportId),
    audit(db, adminId, 'dismiss_report', 'report', reportId, null, now),
  ])
  return { ok: true, changed: true }
}

export async function banAccount(
  db: D1Database,
  adminId: number,
  userId: number,
  note: string | null,
  now: number,
): Promise<ActionResult> {
  const user = await db
    .prepare('SELECT id, email, status FROM users WHERE id = ?')
    .bind(userId)
    .first<{ id: number; email: string; status: string }>()
  if (!user) return { ok: false, status: 404, error: 'Account not found.' }
  if (user.status === 'deleted') {
    return { ok: false, status: 409, error: 'That account was deleted.' }
  }
  if (user.status === 'banned') {
    return { ok: false, status: 409, error: 'That account is already banned.' }
  }

  await db.batch([
    db.prepare("UPDATE users SET status = 'banned' WHERE id = ? AND status = 'active'").bind(userId),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM login_tokens WHERE email = ?').bind(user.email),
    db
      .prepare(
        `UPDATE reports SET status = 'actioned', handled_at = ?, handled_by = ?
         WHERE status = 'open' AND link_id IN (SELECT id FROM links WHERE owner_id = ?)`,
      )
      .bind(now, adminId, userId),
    db
      .prepare(
        `UPDATE links SET status = 'blocked', block_reason = 'account_banned', updated_at = ?
         WHERE owner_id = ? AND status IN ('active', 'disabled')`,
      )
      .bind(now, userId),
    audit(db, adminId, 'ban_account', 'user', userId, note, now),
  ])
  return { ok: true, changed: true }
}

export async function unbanAccount(
  db: D1Database,
  adminId: number,
  userId: number,
  now: number,
): Promise<ActionResult> {
  const user = await db
    .prepare('SELECT status FROM users WHERE id = ?')
    .bind(userId)
    .first<{ status: string }>()
  if (!user) return { ok: false, status: 404, error: 'Account not found.' }
  if (user.status !== 'banned') {
    return { ok: false, status: 409, error: 'That account is not banned.' }
  }

  await db.batch([
    db.prepare("UPDATE users SET status = 'active' WHERE id = ? AND status = 'banned'").bind(userId),
    db
      .prepare(
        `UPDATE links SET status = 'active', block_reason = NULL, updated_at = ?
         WHERE owner_id = ? AND status = 'blocked' AND block_reason = 'account_banned'`,
      )
      .bind(now, userId),
    audit(db, adminId, 'unban_account', 'user', userId, null, now),
  ])
  return { ok: true, changed: true }
}

export async function setLinksPaused(
  db: D1Database,
  adminId: number,
  paused: boolean,
  now: number,
): Promise<void> {
  await db.batch([
    db
      .prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .bind(LINKS_PAUSED_KEY, paused ? '1' : '0', now),
    audit(db, adminId, paused ? 'pause_links' : 'resume_links', 'system', null, null, now),
  ])
}