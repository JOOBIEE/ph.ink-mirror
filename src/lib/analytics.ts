import { cutoffSeconds, RAW_RETENTION_DAYS } from '../jobs/rollup'
import { utcDay } from './visitor-hash'

export const ALLOWED_RANGES = [7, 30, 90, 365]
export const DEFAULT_RANGE = 30

const SECONDS_PER_DAY = 86400
const MAX_EXPORT_ROWS = 50000
const TOP_N = 10

export type StatRow = {
  day: string
  is_bot: number
  source: string
  country: string | null
  device: string | null
  browser: string | null
  referrer_host: string | null
  n: number
}

export type VisitorRow = { day: string; is_bot: number; v: number }

export type ExportRow = {
  clicked_at: number
  slug: string
  source: string
  is_bot: number
  country: string | null
  device: string | null
  browser: string | null
  referrer_host: string | null
}

export type Breakdown = { name: string; clicks: number }

export type Summary = {
  totals: {
    clicks: number
    humanClicks: number
    botClicks: number
    qrScans: number
    visitors: number
  }
  daily: { day: string; clicks: number }[]
  countries: Breakdown[]
  devices: Breakdown[]
  browsers: Breakdown[]
  referrers: Breakdown[]
}

export type RangeBounds = {
  fromDay: string
  toDay: string
  startSeconds: number
  endSeconds: number
  rawFromSeconds: number
  rawStartDay: string
}

export function parseDays(value: string | undefined): number | null {
  if (value === undefined || value === '') return DEFAULT_RANGE
  if (!/^[0-9]+$/.test(value)) return null
  const days = Number(value)
  return ALLOWED_RANGES.includes(days) ? days : null
}

export function dayRange(fromDay: string, toDay: string): string[] {
  const days: string[] = []
  let current = Date.parse(fromDay + 'T00:00:00Z')
  const last = Date.parse(toDay + 'T00:00:00Z')
  while (current <= last) {
    days.push(new Date(current).toISOString().slice(0, 10))
    current += SECONDS_PER_DAY * 1000
  }
  return days
}

export function rangeBounds(nowSeconds: number, days: number): RangeBounds {
  const todayStart = cutoffSeconds(nowSeconds, 0)
  const startSeconds = todayStart - (days - 1) * SECONDS_PER_DAY
  const rawStartSeconds = cutoffSeconds(nowSeconds, RAW_RETENTION_DAYS)
  return {
    fromDay: utcDay(startSeconds),
    toDay: utcDay(todayStart),
    startSeconds,
    endSeconds: todayStart + SECONDS_PER_DAY,
    rawFromSeconds: Math.max(startSeconds, rawStartSeconds),
    rawStartDay: utcDay(rawStartSeconds),
  }
}

function label(value: string | null, fallback: string): string {
  return value === null || value === '' ? fallback : value
}

function bump(map: Map<string, number>, key: string, amount: number): void {
  map.set(key, (map.get(key) ?? 0) + amount)
}

function top(map: Map<string, number>): Breakdown[] {
  return [...map.entries()]
    .map(([name, clicks]) => ({ name, clicks }))
    .sort((a, b) => b.clicks - a.clicks || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .slice(0, TOP_N)
}

export function summarize(
  statRows: StatRow[],
  visitorRows: VisitorRow[],
  options: { fromDay: string; toDay: string; includeBots: boolean },
): Summary {
  const perDay = new Map<string, number>(
    dayRange(options.fromDay, options.toDay).map((day) => [day, 0]),
  )
  const countries = new Map<string, number>()
  const devices = new Map<string, number>()
  const browsers = new Map<string, number>()
  const referrers = new Map<string, number>()
  let humanClicks = 0
  let botClicks = 0
  let qrScans = 0
  let visitors = 0

  for (const row of statRows) {
    if (!perDay.has(row.day)) continue

    if (row.is_bot === 1) botClicks += row.n
    else humanClicks += row.n

    if (row.is_bot === 1 && !options.includeBots) continue

    if (row.source === 'qr') qrScans += row.n
    bump(perDay, row.day, row.n)
    bump(countries, label(row.country, 'Unknown'), row.n)
    bump(devices, label(row.device, 'Unknown'), row.n)
    bump(browsers, label(row.browser, 'Unknown'), row.n)
    bump(referrers, label(row.referrer_host, 'Direct / none'), row.n)
  }

  for (const row of visitorRows) {
    if (!perDay.has(row.day)) continue
    if (row.is_bot === 1 && !options.includeBots) continue
    visitors += row.v
  }

  const daily = [...perDay.entries()].map(([day, clicks]) => ({ day, clicks }))
  const clicks = daily.reduce((sum, entry) => sum + entry.clicks, 0)

  return {
    totals: { clicks, humanClicks, botClicks, qrScans, visitors },
    daily,
    countries: top(countries),
    devices: top(devices),
    browsers: top(browsers),
    referrers: top(referrers),
  }
}

const LINK_FILTER = "l.owner_id = ? AND l.status != 'deleted' AND (? IS NULL OR l.id = ?)"

export async function fetchStatRows(
  db: D1Database,
  ownerId: number,
  linkId: number | null,
  bounds: RangeBounds,
): Promise<StatRow[]> {
  const result = await db
    .prepare(
      `SELECT day, is_bot, source, country, device, browser, referrer_host, SUM(n) AS n
       FROM (
         SELECT date(c.clicked_at, 'unixepoch') AS day, c.is_bot AS is_bot, c.source AS source,
                c.country AS country, c.device AS device, c.browser AS browser,
                c.referrer_host AS referrer_host, 1 AS n
         FROM clicks c JOIN links l ON l.id = c.link_id
         WHERE ${LINK_FILTER} AND c.clicked_at >= ? AND c.clicked_at < ?
         UNION ALL
         SELECT s.day, s.is_bot, s.source, NULLIF(s.country, ''), NULLIF(s.device, ''),
                NULLIF(s.browser, ''), NULLIF(s.referrer_host, ''), s.clicks
         FROM daily_stats s JOIN links l ON l.id = s.link_id
         WHERE ${LINK_FILTER} AND s.day >= ? AND s.day < ?
       )
       GROUP BY 1, 2, 3, 4, 5, 6, 7`,
    )
    .bind(
      ownerId, linkId, linkId, bounds.rawFromSeconds, bounds.endSeconds,
      ownerId, linkId, linkId, bounds.fromDay, bounds.rawStartDay,
    )
    .all<StatRow>()
  return result.results
}

export async function fetchVisitorRows(
  db: D1Database,
  ownerId: number,
  linkId: number | null,
  bounds: RangeBounds,
): Promise<VisitorRow[]> {
  const result = await db
    .prepare(
      `SELECT day, is_bot, SUM(v) AS v
       FROM (
         SELECT date(c.clicked_at, 'unixepoch') AS day, c.link_id AS link_id,
                c.is_bot AS is_bot, COUNT(DISTINCT c.visitor_hash) AS v
         FROM clicks c JOIN links l ON l.id = c.link_id
         WHERE ${LINK_FILTER} AND c.clicked_at >= ? AND c.clicked_at < ?
         GROUP BY 1, 2, 3
         UNION ALL
         SELECT dv.day, dv.link_id, dv.is_bot, dv.visitors
         FROM daily_visitors dv JOIN links l ON l.id = dv.link_id
         WHERE ${LINK_FILTER} AND dv.day >= ? AND dv.day < ?
       )
       GROUP BY 1, 2`,
    )
    .bind(
      ownerId, linkId, linkId, bounds.rawFromSeconds, bounds.endSeconds,
      ownerId, linkId, linkId, bounds.fromDay, bounds.rawStartDay,
    )
    .all<VisitorRow>()
  return result.results
}

export async function fetchExportRows(
  db: D1Database,
  ownerId: number,
  linkId: number | null,
  bounds: RangeBounds,
): Promise<ExportRow[]> {
  const result = await db
    .prepare(
      `SELECT c.clicked_at, l.slug, c.source, c.is_bot, c.country, c.device, c.browser, c.referrer_host
       FROM clicks c JOIN links l ON l.id = c.link_id
       WHERE ${LINK_FILTER} AND c.clicked_at >= ? AND c.clicked_at < ?
       ORDER BY c.clicked_at DESC, c.id DESC
       LIMIT ${MAX_EXPORT_ROWS}`,
    )
    .bind(ownerId, linkId, linkId, bounds.rawFromSeconds, bounds.endSeconds)
    .all<ExportRow>()
  return result.results
}

export function csvCell(value: string | number | null): string {
  let text = value === null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) {
    text = "'" + text
  }
  if (/[",\r\n]/.test(text)) {
    text = '"' + text.replace(/"/g, '""') + '"'
  }
  return text
}

export function toCsv(rows: ExportRow[]): string {
  const header = 'time_utc,link,source,is_bot,country,device,browser,referrer_host'
  const lines = rows.map((row) =>
    [
      new Date(row.clicked_at * 1000).toISOString(),
      row.slug,
      row.source,
      row.is_bot,
      row.country,
      row.device,
      row.browser,
      row.referrer_host,
    ]
      .map(csvCell)
      .join(','),
  )
  return [header, ...lines].join('\r\n') + '\r\n'
}