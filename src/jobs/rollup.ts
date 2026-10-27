import { utcDay } from '../lib/visitor-hash'

export const RAW_RETENTION_DAYS = 90
export const SALT_RETENTION_DAYS = 2
const MAX_DAYS_PER_RUN = 31
const SECONDS_PER_DAY = 86400

export function cutoffSeconds(nowSeconds: number, daysBack: number): number {
  const startOfToday = nowSeconds - (nowSeconds % SECONDS_PER_DAY)
  return startOfToday - daysBack * SECONDS_PER_DAY
}

async function rollupDay(
  db: D1Database,
  day: string,
  nowSeconds: number,
): Promise<void> {
  const start = Date.parse(day + 'T00:00:00Z') / 1000
  const end = start + SECONDS_PER_DAY

  await db.batch([
    db.prepare('DELETE FROM daily_stats WHERE day = ?').bind(day),
    db.prepare('DELETE FROM daily_visitors WHERE day = ?').bind(day),
    db
      .prepare(
        `INSERT INTO daily_stats
           (link_id, day, is_bot, source, country, device, browser, referrer_host, clicks)
         SELECT link_id, ?, is_bot, source,
                COALESCE(country, ''), COALESCE(device, ''),
                COALESCE(browser, ''), COALESCE(referrer_host, ''),
                COUNT(*)
         FROM clicks
         WHERE clicked_at >= ? AND clicked_at < ?
         GROUP BY 1, 3, 4, 5, 6, 7, 8`,
      )
      .bind(day, start, end),
    db
      .prepare(
        `INSERT INTO daily_visitors (link_id, day, is_bot, visitors)
         SELECT link_id, ?, is_bot, COUNT(DISTINCT visitor_hash)
         FROM clicks
         WHERE clicked_at >= ? AND clicked_at < ?
         GROUP BY link_id, is_bot`,
      )
      .bind(day, start, end),
    db
      .prepare('INSERT OR REPLACE INTO rollup_days (day, rolled_up_at) VALUES (?, ?)')
      .bind(day, nowSeconds),
  ])
}

export async function runRollup(
  db: D1Database,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<{ daysRolledUp: number; clicksDeleted: number; saltsDeleted: number }> {
  const todayStart = cutoffSeconds(nowSeconds, 0)

  const pending = await db
    .prepare(
      `SELECT DISTINCT date(clicked_at, 'unixepoch') AS day
       FROM clicks
       WHERE clicked_at < ?
         AND date(clicked_at, 'unixepoch') NOT IN (SELECT day FROM rollup_days)
       ORDER BY day
       LIMIT ?`,
    )
    .bind(todayStart, MAX_DAYS_PER_RUN)
    .all<{ day: string }>()

  for (const row of pending.results) {
    await rollupDay(db, row.day, nowSeconds)
  }

  const deletedClicks = await db
    .prepare(
      `DELETE FROM clicks
       WHERE clicked_at < ?
         AND date(clicked_at, 'unixepoch') IN (SELECT day FROM rollup_days)`,
    )
    .bind(cutoffSeconds(nowSeconds, RAW_RETENTION_DAYS))
    .run()

  const deletedSalts = await db
    .prepare('DELETE FROM daily_salts WHERE day < ?')
    .bind(utcDay(cutoffSeconds(nowSeconds, SALT_RETENTION_DAYS)))
    .run()

  const result = {
    daysRolledUp: pending.results.length,
    clicksDeleted: deletedClicks.meta.changes,
    saltsDeleted: deletedSalts.meta.changes,
  }
  console.log('rollup finished', JSON.stringify(result))
  return result
}