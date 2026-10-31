import type { SessionUser } from './session'

const MAX_CLICKS = 50000
const MAX_SUMMARY_ROWS = 50000

function iso(seconds: number): string {
  return new Date(seconds * 1000).toISOString()
}

function capped<T>(rows: T[], max: number): { rows: T[]; truncated: boolean } {
  return { rows: rows.slice(0, max), truncated: rows.length > max }
}

export async function buildExport(
  db: D1Database,
  user: SessionUser,
): Promise<Record<string, unknown>> {
  const [accountRow, linkRows, clickRows, statRows, visitorRows] = await Promise.all([
    db
      .prepare('SELECT id, email, created_at FROM users WHERE id = ?')
      .bind(user.id)
      .first<{ id: number; email: string; created_at: number }>(),
    db
      .prepare(
        `SELECT slug, destination, title, status, expires_at, created_at, updated_at
         FROM links WHERE owner_id = ? ORDER BY id`,
      )
      .bind(user.id)
      .all<{
        slug: string
        destination: string
        title: string | null
        status: string
        expires_at: number | null
        created_at: number
        updated_at: number
      }>(),
    db
      .prepare(
        `SELECT c.clicked_at, l.slug, c.source, c.is_bot, c.country, c.device, c.browser, c.referrer_host
         FROM clicks c JOIN links l ON l.id = c.link_id
         WHERE l.owner_id = ?
         ORDER BY c.clicked_at DESC, c.id DESC
         LIMIT ?`,
      )
      .bind(user.id, MAX_CLICKS + 1)
      .all<{
        clicked_at: number
        slug: string
        source: string
        is_bot: number
        country: string | null
        device: string | null
        browser: string | null
        referrer_host: string | null
      }>(),
    db
      .prepare(
        `SELECT l.slug, s.day, s.is_bot, s.source, s.country, s.device, s.browser, s.referrer_host, s.clicks
         FROM daily_stats s JOIN links l ON l.id = s.link_id
         WHERE l.owner_id = ?
         ORDER BY s.day DESC
         LIMIT ?`,
      )
      .bind(user.id, MAX_SUMMARY_ROWS + 1)
      .all<{
        slug: string
        day: string
        is_bot: number
        source: string
        country: string
        device: string
        browser: string
        referrer_host: string
        clicks: number
      }>(),
    db
      .prepare(
        `SELECT l.slug, v.day, v.is_bot, v.visitors
         FROM daily_visitors v JOIN links l ON l.id = v.link_id
         WHERE l.owner_id = ?
         ORDER BY v.day DESC
         LIMIT ?`,
      )
      .bind(user.id, MAX_SUMMARY_ROWS + 1)
      .all<{ slug: string; day: string; is_bot: number; visitors: number }>(),
  ])

  if (!accountRow) {
    throw new Error('Account not found.')
  }

  const clicks = capped(clickRows.results, MAX_CLICKS)
  const stats = capped(statRows.results, MAX_SUMMARY_ROWS)
  const visitors = capped(visitorRows.results, MAX_SUMMARY_ROWS)

  return {
    exportedAt: new Date().toISOString(),
    about:
      'Your ph.ink data. All times are UTC. Individual clicks are kept for 90 days, and older ' +
      'days appear as daily summaries. Visitor fingerprints are not included.',
    account: {
      id: accountRow.id,
      email: accountRow.email,
      createdAt: iso(accountRow.created_at),
    },
    links: linkRows.results.map((link) => ({
      slug: link.slug,
      destination: link.destination,
      title: link.title,
      status: link.status,
      expiresAt: link.expires_at === null ? null : iso(link.expires_at),
      createdAt: iso(link.created_at),
      updatedAt: iso(link.updated_at),
    })),
    clicks: clicks.rows.map((row) => ({
      time: iso(row.clicked_at),
      link: row.slug,
      source: row.source,
      isBot: row.is_bot === 1,
      country: row.country,
      device: row.device,
      browser: row.browser,
      referrerHost: row.referrer_host,
    })),
    dailyStats: stats.rows.map((row) => ({
      link: row.slug,
      day: row.day,
      isBot: row.is_bot === 1,
      source: row.source,
      country: row.country || null,
      device: row.device || null,
      browser: row.browser || null,
      referrerHost: row.referrer_host || null,
      clicks: row.clicks,
    })),
    dailyVisitors: visitors.rows.map((row) => ({
      link: row.slug,
      day: row.day,
      isBot: row.is_bot === 1,
      visitors: row.visitors,
    })),
    truncated: {
      clicks: clicks.truncated,
      dailyStats: stats.truncated,
      dailyVisitors: visitors.truncated,
    },
  }
}

export async function deleteAccount(db: D1Database, user: SessionUser): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const ownLinks = 'SELECT id FROM links WHERE owner_id = ?'

  await db.batch([
    db.prepare(`DELETE FROM clicks WHERE link_id IN (${ownLinks})`).bind(user.id),
    db.prepare(`DELETE FROM daily_stats WHERE link_id IN (${ownLinks})`).bind(user.id),
    db.prepare(`DELETE FROM daily_visitors WHERE link_id IN (${ownLinks})`).bind(user.id),
    db
      .prepare(
        `UPDATE links SET
           status = CASE WHEN status = 'blocked' THEN 'blocked' ELSE 'deleted' END,
           destination = CASE WHEN status = 'blocked' THEN destination ELSE '' END,
           title = NULL,
           password_hash = NULL,
           updated_at = ?
         WHERE owner_id = ?`,
      )
      .bind(now, user.id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM login_tokens WHERE email = ?').bind(user.email),
    db
      .prepare("UPDATE users SET email = ?, status = 'deleted' WHERE id = ?")
      .bind(`deleted-${user.id}@deleted.invalid`, user.id),
  ])
}