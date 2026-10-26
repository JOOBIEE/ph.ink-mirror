import { Hono } from 'hono'
import type { Bindings } from '../types'
import { recordClick } from '../lib/clicks'

type LinkRow = {
  id: number
  destination: string
  status: string
  expires_at: number | null
}

const redirect = new Hono<{ Bindings: Bindings }>()

function messagePage(status: number, title: string, message: string): Response {
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${title}</title></head><body><h1>${title}</h1><p>${message}</p></body></html>`
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  })
}

redirect.get('/:slug', async (c) => {
  const slug = c.req.param('slug')

  const link = await c.env.DB
    .prepare('SELECT id, destination, status, expires_at FROM links WHERE slug = ?')
    .bind(slug)
    .first<LinkRow>()

  if (!link) {
    return messagePage(404, 'Link not found', 'This short link does not exist.')
  }
  if (link.status === 'deleted') {
    return messagePage(410, 'Link removed', 'The owner removed this link.')
  }
  if (link.status === 'blocked') {
    return messagePage(403, 'Link blocked', 'This link was blocked for breaking our rules.')
  }
  if (link.status !== 'active') {
    return messagePage(404, 'Link unavailable', 'This link is turned off.')
  }

  const now = Math.floor(Date.now() / 1000)
  if (link.expires_at !== null && link.expires_at <= now) {
    return messagePage(410, 'Link expired', 'This link has expired.')
  }

  if (c.req.method !== 'HEAD') {
    const rawCountry = c.req.raw.cf?.country
    c.executionCtx.waitUntil(
      recordClick(c.env.DB, {
        linkId: link.id,
        ip: c.req.header('cf-connecting-ip') ?? 'unknown',
        userAgent: c.req.header('user-agent') ?? '',
        referer: c.req.header('referer') ?? null,
        country: typeof rawCountry === 'string' ? rawCountry : null,
        source: c.req.query('s') === 'q' ? 'qr' : 'link',
      }).catch((error) => console.error('click logging failed', error)),
    )
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: link.destination,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  })
})

export default redirect