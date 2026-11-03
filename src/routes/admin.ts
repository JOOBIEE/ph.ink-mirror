import { Hono } from 'hono'
import { requireAdmin, type AdminEnv } from '../middleware/admin'
import {
  ACCOUNT_STATUSES,
  AUDIT_TARGETS,
  cleanNote,
  isAdminEmail,
  LINK_STATUSES,
  parseFilter,
  parsePaging,
  parseSearch,
  REPORT_STATUSES,
} from '../lib/admin'
import {
  banAccount,
  blockLink,
  dismissReport,
  getAdminAccount,
  getAdminLink,
  getOverview,
  getReportState,
  listAdminAccounts,
  listAdminLinks,
  listAdminReports,
  listAudit,
  logAccountView,
  restoreLink,
  setLinksPaused,
  unbanAccount,
} from '../lib/admin-store'
import {
  fetchStatRows,
  fetchVisitorRows,
  parseDays,
  rangeBounds,
  summarize,
} from '../lib/analytics'
import { parseId } from '../lib/ids'
import { readJsonObject } from '../lib/json-body'
import { getLink } from '../lib/link-store'

const NOT_FOUND = { error: 'Not found.' }
const BAD_RANGE = { error: 'Period must be 7, 30, 90 or 365 days.' }
const BAD_NOTE = { error: 'The reason must be text.' }

const nowSeconds = () => Math.floor(Date.now() / 1000)

const admin = new Hono<AdminEnv>()
admin.use('*', requireAdmin)

admin.get('/overview', async (c) => {
  const overview = await getOverview(c.env.DB, nowSeconds())
  return c.json({ ...overview, adminEmail: c.get('admin').email })
})

// ---------- Links ----------

admin.get('/links', async (c) => {
  const status = parseFilter(LINK_STATUSES, c.req.query('status'))
  if (!status.ok) return c.json({ error: 'Unknown status.' }, 400)

  const { limit, offset } = parsePaging(c.req.query('limit'), c.req.query('offset'))
  const links = await listAdminLinks(
    c.env.DB,
    { status: status.value, search: parseSearch(c.req.query('q')), ownerId: null, limit, offset },
    nowSeconds(),
  )
  return c.json({ links })
})

admin.get('/links/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(NOT_FOUND, 404)

  const link = await getAdminLink(c.env.DB, id, nowSeconds())
  if (!link) return c.json(NOT_FOUND, 404)

  const reports = await listAdminReports(c.env.DB, {
    status: null,
    linkId: id,
    ownerId: null,
    limit: 100,
    offset: 0,
  })
  return c.json({ link, reports })
})

admin.post('/links/:id/block', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(NOT_FOUND, 404)

  const input = (await readJsonObject(c)) ?? {}
  const note = cleanNote(input.reason)
  if (!note.ok) return c.json(BAD_NOTE, 400)

  const result = await blockLink(
    c.env.DB,
    c.get('admin').id,
    id,
    note.text,
    input.blockDomain === true,
    nowSeconds(),
  )
  return result.ok ? c.json({ ok: true, changed: result.changed }) : c.json({ error: result.error }, result.status)
})

admin.post('/links/:id/restore', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(NOT_FOUND, 404)

  const result = await restoreLink(c.env.DB, c.get('admin').id, id, nowSeconds())
  return result.ok ? c.json({ ok: true }) : c.json({ error: result.error }, result.status)
})

// ---------- Reports ----------

admin.get('/reports', async (c) => {
  const status = parseFilter(REPORT_STATUSES, c.req.query('status') ?? 'open')
  if (!status.ok) return c.json({ error: 'Unknown status.' }, 400)

  const { limit, offset } = parsePaging(c.req.query('limit'), c.req.query('offset'))
  const reports = await listAdminReports(c.env.DB, {
    status: status.value,
    linkId: null,
    ownerId: null,
    limit,
    offset,
  })
  return c.json({ reports })
})

admin.post('/reports/:id/dismiss', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(NOT_FOUND, 404)

  const result = await dismissReport(c.env.DB, c.get('admin').id, id, nowSeconds())
  return result.ok ? c.json({ ok: true }) : c.json({ error: result.error }, result.status)
})

admin.post('/reports/:id/block', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(NOT_FOUND, 404)

  const input = (await readJsonObject(c)) ?? {}
  const note = cleanNote(input.reason)
  if (!note.ok) return c.json(BAD_NOTE, 400)

  const report = await getReportState(c.env.DB, id)
  if (!report) return c.json(NOT_FOUND, 404)
  if (report.status !== 'open') {
    return c.json({ error: 'That report was already handled.' }, 409)
  }

  const result = await blockLink(
    c.env.DB,
    c.get('admin').id,
    report.linkId,
    note.text,
    input.blockDomain === true,
    nowSeconds(),
  )
  return result.ok ? c.json({ ok: true }) : c.json({ error: result.error }, result.status)
})

// ---------- Accounts ----------

admin.get('/accounts', async (c) => {
  const status = parseFilter(ACCOUNT_STATUSES, c.req.query('status'))
  if (!status.ok) return c.json({ error: 'Unknown status.' }, 400)

  const { limit, offset } = parsePaging(c.req.query('limit'), c.req.query('offset'))
  const accounts = await listAdminAccounts(c.env.DB, {
    status: status.value,
    search: parseSearch(c.req.query('q')),
    reportedOnly: c.req.query('reported') === '1',
    limit,
    offset,
  })
  return c.json({ accounts })
})

admin.get('/accounts/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(NOT_FOUND, 404)

  const account = await getAdminAccount(c.env.DB, id)
  if (!account) return c.json(NOT_FOUND, 404)

  const now = nowSeconds()
  await logAccountView(c.env.DB, c.get('admin').id, id, now)

  const [links, reports] = await Promise.all([
    listAdminLinks(
      c.env.DB,
      { status: null, search: null, ownerId: id, limit: 100, offset: 0 },
      now,
    ),
    listAdminReports(c.env.DB, { status: null, linkId: null, ownerId: id, limit: 100, offset: 0 }),
  ])
  return c.json({ account, links, reports })
})

admin.get('/accounts/:id/analytics', async (c) => {
  const userId = parseId(c.req.param('id'))
  if (userId === null) return c.json(NOT_FOUND, 404)

  const days = parseDays(c.req.query('days'))
  if (days === null) return c.json(BAD_RANGE, 400)

  const account = await getAdminAccount(c.env.DB, userId)
  if (!account) return c.json(NOT_FOUND, 404)

  let linkId: number | null = null
  const rawLink = c.req.query('link')
  if (rawLink !== undefined && rawLink !== '') {
    const id = parseId(rawLink)
    const link = id === null ? null : await getLink(c.env.DB, userId, id)
    if (id === null || !link) return c.json(NOT_FOUND, 404)
    linkId = id
  }

  const includeBots = c.req.query('bots') === '1'
  const bounds = rangeBounds(nowSeconds(), days)
  const [statRows, visitorRows] = await Promise.all([
    fetchStatRows(c.env.DB, userId, linkId, bounds),
    fetchVisitorRows(c.env.DB, userId, linkId, bounds),
  ])
  const summary = summarize(statRows, visitorRows, {
    fromDay: bounds.fromDay,
    toDay: bounds.toDay,
    includeBots,
  })

  return c.json({
    account: { id: account.id, email: account.email },
    range: { days, from: bounds.fromDay, to: bounds.toDay },
    includeBots,
    ...summary,
  })
})

admin.post('/accounts/:id/ban', async (c) => {
  const adminUser = c.get('admin')
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(NOT_FOUND, 404)

  const input = (await readJsonObject(c)) ?? {}
  const note = cleanNote(input.reason)
  if (!note.ok) return c.json(BAD_NOTE, 400)

  const target = await getAdminAccount(c.env.DB, id)
  if (!target) return c.json(NOT_FOUND, 404)
  if (target.id === adminUser.id) {
    return c.json({ error: 'You cannot ban your own account.' }, 400)
  }
  if (isAdminEmail(target.email, c.env.ADMIN_EMAILS)) {
    return c.json({ error: 'Admin accounts cannot be banned here.' }, 400)
  }

  const result = await banAccount(c.env.DB, adminUser.id, id, note.text, nowSeconds())
  return result.ok ? c.json({ ok: true }) : c.json({ error: result.error }, result.status)
})

admin.post('/accounts/:id/unban', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(NOT_FOUND, 404)

  const result = await unbanAccount(c.env.DB, c.get('admin').id, id, nowSeconds())
  return result.ok ? c.json({ ok: true }) : c.json({ error: result.error }, result.status)
})

// ---------- System ----------

admin.post('/kill-switch', async (c) => {
  const input = await readJsonObject(c)
  if (!input || typeof input.paused !== 'boolean') {
    return c.json({ error: 'Send {"paused": true} or {"paused": false}.' }, 400)
  }
  await setLinksPaused(c.env.DB, c.get('admin').id, input.paused, nowSeconds())
  return c.json({ ok: true, paused: input.paused })
})

admin.get('/audit', async (c) => {
  const type = parseFilter(AUDIT_TARGETS, c.req.query('targetType'))
  if (!type.ok) return c.json({ error: 'Unknown target type.' }, 400)

  let targetId: number | null = null
  const rawTarget = c.req.query('targetId')
  if (rawTarget !== undefined && rawTarget !== '') {
    targetId = parseId(rawTarget)
    if (targetId === null) return c.json({ error: 'Unknown target.' }, 400)
  }

  const { limit, offset } = parsePaging(c.req.query('limit'), c.req.query('offset'))
  const entries = await listAudit(c.env.DB, { targetType: type.value, targetId, limit, offset })
  return c.json({ entries })
})

export default admin