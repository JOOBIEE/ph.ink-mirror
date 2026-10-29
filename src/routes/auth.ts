import { Hono } from 'hono'
import type { Bindings } from '../types'
import { normalizeEmail } from '../lib/email-address'
import { sendLoginEmail } from '../lib/email'
import { endSession, getSessionUser, startSession } from '../lib/session'
import { generateToken, hashToken, LOGIN_TOKEN_TTL_SECONDS } from '../lib/tokens'

const MAX_LINKS_PER_EMAIL_PER_HOUR = 5
const TOKEN_FORMAT = /^[0-9a-f]{64}$/
const GENERIC_REPLY = {
  ok: true,
  message: 'If that address can receive email, a sign-in link is on its way.',
}

const auth = new Hono<{ Bindings: Bindings }>()

function page(status: number, title: string, bodyHtml: string): Response {
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${title}</title></head><body><h1>${title}</h1>${bodyHtml}</body></html>`
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
    },
  })
}

function invalidLinkPage(): Response {
  return page(
    400,
    'Link not valid',
    '<p>This sign-in link is invalid, expired, or already used. Please request a new one.</p>',
  )
}

auth.post('/request', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Send a JSON body.' }, 400)
  }

  const input = (
    typeof body === 'object' && body !== null ? body : {}
  ) as Record<string, unknown>

  if (typeof input.email !== 'string') {
    return c.json({ error: 'Enter your email address.' }, 400)
  }
  const check = normalizeEmail(input.email)
  if (!check.ok) {
    return c.json({ error: check.reason }, 400)
  }

  const baseUrl = c.env.APP_URL
  if (!baseUrl) {
    console.error('APP_URL is not set')
    return c.json({ error: 'The server is not configured.' }, 500)
  }

  const now = Math.floor(Date.now() / 1000)

  const recent = await c.env.DB
    .prepare('SELECT COUNT(*) AS total FROM login_tokens WHERE email = ? AND expires_at > ?')
    .bind(check.email, now - 3600 + LOGIN_TOKEN_TTL_SECONDS)
    .first<{ total: number }>()
  if ((recent?.total ?? 0) >= MAX_LINKS_PER_EMAIL_PER_HOUR) {
    return c.json(GENERIC_REPLY)
  }

  const token = generateToken()
  await c.env.DB
    .prepare('INSERT INTO login_tokens (token_hash, email, expires_at) VALUES (?, ?, ?)')
    .bind(await hashToken(token), check.email, now + LOGIN_TOKEN_TTL_SECONDS)
    .run()

  const link = `${baseUrl}/api/auth/verify?token=${token}`
  try {
    await sendLoginEmail(c.env, check.email, link)
  } catch (error) {
    console.error('sign-in email failed:', error instanceof Error ? error.message : 'unknown')
    return c.json({ error: 'We could not send the email. Please try again later.' }, 502)
  }

  return c.json(GENERIC_REPLY)
})

auth.get('/verify', (c) => {
  const token = c.req.query('token') ?? ''
  if (!TOKEN_FORMAT.test(token)) {
    return invalidLinkPage()
  }
  return page(
    200,
    'Sign in to ph.ink',
    '<p>Press the button to finish signing in.</p>' +
      '<form method="post" action="/api/auth/verify">' +
      `<input type="hidden" name="token" value="${token}">` +
      '<button type="submit">Continue to ph.ink</button></form>',
  )
})

auth.post('/verify', async (c) => {
  const form = await c.req.parseBody()
  const token = typeof form.token === 'string' ? form.token : ''
  if (!TOKEN_FORMAT.test(token)) {
    return invalidLinkPage()
  }

  const now = Math.floor(Date.now() / 1000)

  const used = await c.env.DB
    .prepare(
      `UPDATE login_tokens SET used_at = ?
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
       RETURNING email`,
    )
    .bind(now, await hashToken(token), now)
    .first<{ email: string }>()
  if (!used) {
    return invalidLinkPage()
  }

  await c.env.DB
    .prepare('INSERT INTO users (email, created_at) VALUES (?, ?) ON CONFLICT(email) DO NOTHING')
    .bind(used.email, now)
    .run()

  const user = await c.env.DB
    .prepare('SELECT id, status FROM users WHERE email = ?')
    .bind(used.email)
    .first<{ id: number; status: string }>()
  if (!user || user.status !== 'active') {
    return page(403, 'Cannot sign in', '<p>This account cannot sign in.</p>')
  }

  await startSession(c, user.id)
  return c.redirect('/', 303)
})

auth.get('/me', async (c) => {
  c.header('Cache-Control', 'no-store')
  const user = await getSessionUser(c)
  if (!user) {
    return c.json({ error: 'Not signed in.' }, 401)
  }
  return c.json({ id: user.id, email: user.email })
})

auth.post('/logout', async (c) => {
  await endSession(c)
  return c.json({ ok: true })
})

export default auth