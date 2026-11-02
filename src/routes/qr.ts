import { Hono, type Context } from 'hono'
import { requireUser, type AuthEnv } from '../middleware/auth'
import { getLink } from '../lib/link-store'
import { parseId } from '../lib/ids'
import { validateQrStyle } from '../lib/qr-style'

const NOT_FOUND = { error: 'Link not found.' }

const qr = new Hono<AuthEnv>()
qr.use('*', requireUser)

async function readJsonObject(c: Context<AuthEnv>): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await c.req.json()
    if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
      return body as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

async function ownedLinkId(c: Context<AuthEnv>): Promise<number | null> {
  const id = parseId(c.req.param('linkId') ?? '')
  if (id === null) return null
  const link = await getLink(c.env.DB, c.get('user').id, id)
  return link ? id : null
}

qr.get('/:linkId', async (c) => {
  const id = await ownedLinkId(c)
  if (id === null) return c.json(NOT_FOUND, 404)

  const row = await c.env.DB
    .prepare('SELECT style_json, updated_at FROM qr_styles WHERE link_id = ?')
    .bind(id)
    .first<{ style_json: string; updated_at: number }>()
  if (!row) return c.json({ style: null, updatedAt: null })

  let parsed: unknown = null
  try {
    parsed = JSON.parse(row.style_json)
  } catch {
    parsed = null
  }
  const check = validateQrStyle(parsed)
  if (!check.ok) return c.json({ style: null, updatedAt: null })

  return c.json({ style: check.style, updatedAt: row.updated_at })
})

qr.put('/:linkId', async (c) => {
  const id = await ownedLinkId(c)
  if (id === null) return c.json(NOT_FOUND, 404)

  const input = await readJsonObject(c)
  if (!input) return c.json({ error: 'Send a JSON body.' }, 400)

  const check = validateQrStyle(input.style)
  if (!check.ok) return c.json({ error: check.reason }, 400)

  const now = Math.floor(Date.now() / 1000)
  await c.env.DB
    .prepare(
      `INSERT INTO qr_styles (link_id, style_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(link_id) DO UPDATE SET
         style_json = excluded.style_json,
         updated_at = excluded.updated_at`,
    )
    .bind(id, JSON.stringify(check.style), now)
    .run()

  return c.json({ style: check.style, updatedAt: now })
})

qr.delete('/:linkId', async (c) => {
  const id = await ownedLinkId(c)
  if (id === null) return c.json(NOT_FOUND, 404)

  await c.env.DB.prepare('DELETE FROM qr_styles WHERE link_id = ?').bind(id).run()
  return c.json({ ok: true })
})

export default qr