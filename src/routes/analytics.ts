import { Hono, type Context } from 'hono'
import { requireUser, type AuthEnv } from '../middleware/auth'
import { getLink } from '../lib/link-store'
import { parseId } from '../lib/ids'
import {
  fetchExportRows,
  fetchStatRows,
  fetchVisitorRows,
  parseDays,
  rangeBounds,
  summarize,
  toCsv,
} from '../lib/analytics'

const analytics = new Hono<AuthEnv>()
analytics.use('*', requireUser)

const BAD_RANGE = { error: 'Period must be 7, 30, 90 or 365 days.' }
const NOT_FOUND = { error: 'Link not found.' }

async function readLinkFilter(c: Context<AuthEnv>): Promise<number | null | Response> {
  const raw = c.req.query('link')
  if (raw === undefined || raw === '') return null

  const id = parseId(raw)
  const link = id === null ? null : await getLink(c.env.DB, c.get('user').id, id)
  if (id === null || !link) {
    return c.json(NOT_FOUND, 404)
  }
  return id
}

analytics.get('/', async (c) => {
  const days = parseDays(c.req.query('days'))
  if (days === null) return c.json(BAD_RANGE, 400)

  const owner = c.get('user')
  const linkId = await readLinkFilter(c)
  if (linkId instanceof Response) return linkId

  const includeBots = c.req.query('bots') === '1'
  const bounds = rangeBounds(Math.floor(Date.now() / 1000), days)

  const [statRows, visitorRows] = await Promise.all([
    fetchStatRows(c.env.DB, owner.id, linkId, bounds),
    fetchVisitorRows(c.env.DB, owner.id, linkId, bounds),
  ])

  const summary = summarize(statRows, visitorRows, {
    fromDay: bounds.fromDay,
    toDay: bounds.toDay,
    includeBots,
  })

  return c.json({
    range: { days, from: bounds.fromDay, to: bounds.toDay },
    includeBots,
    ...summary,
  })
})

analytics.get('/export.csv', async (c) => {
  const days = parseDays(c.req.query('days'))
  if (days === null) return c.json(BAD_RANGE, 400)

  const owner = c.get('user')
  const linkId = await readLinkFilter(c)
  if (linkId instanceof Response) return linkId

  const bounds = rangeBounds(Math.floor(Date.now() / 1000), days)
  const rows = await fetchExportRows(c.env.DB, owner.id, linkId, bounds)

  return new Response(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ph-ink-clicks.csv"',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

export default analytics