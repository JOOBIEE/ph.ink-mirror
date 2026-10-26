import { isBot } from './bots'
import { parseBrowser, parseDevice, referrerHost } from './client-info'
import { getDailySalt, hashVisitor, utcDay } from './visitor-hash'

const DUPLICATE_WINDOW_SECONDS = 10

export type ClickInput = {
  linkId: number
  ip: string
  userAgent: string
  referer: string | null
  country: string | null
  source: 'link' | 'qr'
}

export async function recordClick(db: D1Database, click: ClickInput): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const salt = await getDailySalt(db, utcDay(now))
  const visitorHash = await hashVisitor(salt, click.ip, click.userAgent)

  const duplicate = await db
    .prepare(
      'SELECT 1 AS found FROM clicks WHERE link_id = ? AND visitor_hash = ? AND clicked_at >= ? LIMIT 1',
    )
    .bind(click.linkId, visitorHash, now - DUPLICATE_WINDOW_SECONDS)
    .first()
  if (duplicate) return

  await db
    .prepare(
      'INSERT INTO clicks (link_id, clicked_at, country, device, browser, referrer_host, source, is_bot, visitor_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      click.linkId,
      now,
      click.country,
      parseDevice(click.userAgent),
      parseBrowser(click.userAgent),
      referrerHost(click.referer),
      click.source,
      isBot(click.userAgent) ? 1 : 0,
      visitorHash,
    )
    .run()
}