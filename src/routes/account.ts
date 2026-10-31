import { Hono } from 'hono'
import { deleteCookie } from 'hono/cookie'
import { requireUser, type AuthEnv } from '../middleware/auth'
import { SESSION_COOKIE } from '../lib/session'
import { buildExport, deleteAccount } from '../lib/account-store'
import { normalizeEmail } from '../lib/email-address'

const account = new Hono<AuthEnv>()
account.use('*', requireUser)

account.get('/export', async (c) => {
  const data = await buildExport(c.env.DB, c.get('user'))
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ph-ink-my-data.json"',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

account.post('/delete', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Send a JSON body.' }, 400)
  }

  const input = (
    typeof body === 'object' && body !== null ? body : {}
  ) as Record<string, unknown>

  const user = c.get('user')
  const typed = typeof input.confirmEmail === 'string' ? normalizeEmail(input.confirmEmail) : null
  if (!typed || !typed.ok || typed.email !== user.email.toLowerCase()) {
    return c.json({ error: 'The email address does not match your account.' }, 400)
  }

  await deleteAccount(c.env.DB, user)
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

export default account