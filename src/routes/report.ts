import { Hono } from 'hono'
import type { Bindings } from '../types'
import { clientIp, ipKey, UNKNOWN_IP } from '../lib/client-ip'
import { readJsonObject } from '../lib/json-body'
import { REPORTS_PER_DAY, REPORTS_PER_IP_PER_HOUR } from '../lib/limits'
import { hit } from '../lib/ratelimit'
import { parseReportedLink, validateReport } from '../lib/report'

const THANKS = { ok: true, message: 'Thank you. We will review this report.' }

const report = new Hono<{ Bindings: Bindings }>()

report.post('/', async (c) => {
  const now = Math.floor(Date.now() / 1000)

  const ip = clientIp(c.env, (name) => c.req.header(name))
  let reporter: string | null = null
  if (ip !== UNKNOWN_IP) {
    reporter = await ipKey(c.env.DB, ip, now)
    const perIp = await hit(
      c.env.DB,
      { key: `report-ip:${reporter}`, windowSeconds: 3600, max: REPORTS_PER_IP_PER_HOUR },
      now,
    )
    if (!perIp.allowed) {
      c.header('Retry-After', String(perIp.retryAfterSeconds))
      return c.json({ error: 'Too many reports from your network. Please try again later.' }, 429)
    }
  }

  const input = await readJsonObject(c)
  if (!input) {
    return c.json({ error: 'Send a JSON body.' }, 400)
  }

  const check = validateReport(input)
  if (!check.ok) {
    return c.json({ error: check.error }, 400)
  }
  const parsed = parseReportedLink(check.report.link, c.env.APP_URL)
  if (!parsed.ok) {
    return c.json({ error: parsed.error }, 400)
  }

  const link = await c.env.DB
    .prepare('SELECT id, status FROM links WHERE slug = ?')
    .bind(parsed.slug)
    .first<{ id: number; status: string }>()
  if (!link) {
    return c.json({ error: 'We could not find that link. Check the address and try again.' }, 404)
  }
  if (link.status === 'deleted' || link.status === 'blocked') {
    return c.json({
      ok: true,
      message: 'That link is no longer active, so no action is needed. Thank you.',
    })
  }

  if (reporter) {
    const already = await c.env.DB
      .prepare(
        'SELECT 1 AS found FROM reports WHERE link_id = ? AND reporter_hash = ? AND created_at >= ? LIMIT 1',
      )
      .bind(link.id, reporter, now - 86400)
      .first()
    if (already) {
      return c.json(THANKS)
    }
  }

  const budget = await hit(
    c.env.DB,
    { key: 'report-global', windowSeconds: 86400, max: REPORTS_PER_DAY },
    now,
  )
  if (!budget.allowed) {
    c.header('Retry-After', String(budget.retryAfterSeconds))
    return c.json({ error: 'Reports are temporarily unavailable. Please try again tomorrow.' }, 503)
  }

  await c.env.DB
    .prepare(
      'INSERT INTO reports (link_id, reason, details, reporter_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(link.id, check.report.reason, check.report.details, reporter, now)
    .run()

  return c.json(THANKS)
})

export default report