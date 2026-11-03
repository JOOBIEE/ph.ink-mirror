import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import type { Bindings } from '../types'
import { ADMIN_SESSION_MAX_AGE_SECONDS, isAdminEmail } from '../lib/admin'
import { SESSION_COOKIE } from '../lib/session'
import { hashToken } from '../lib/tokens'

export type AdminUser = { id: number; email: string }

export type AdminEnv = {
  Bindings: Bindings
  Variables: { admin: AdminUser }
}

export const requireAdmin = createMiddleware<AdminEnv>(async (c, next) => {
  const hidden = () => c.json({ error: 'Not found.' }, 404)

  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return hidden()

  const now = Math.floor(Date.now() / 1000)
  const row = await c.env.DB
    .prepare(
      `SELECT users.id AS id, users.email AS email, sessions.created_at AS sessionCreatedAt
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.session_hash = ?
         AND sessions.expires_at > ?
         AND users.status = 'active'`,
    )
    .bind(await hashToken(token), now)
    .first<{ id: number; email: string; sessionCreatedAt: number }>()

  if (!row || !isAdminEmail(row.email, c.env.ADMIN_EMAILS)) {
    return hidden()
  }

  if (now - row.sessionCreatedAt > ADMIN_SESSION_MAX_AGE_SECONDS) {
    return c.json(
      { error: 'Please sign in again to use the admin area.', code: 'reauth' },
      401,
    )
  }

  c.set('admin', { id: row.id, email: row.email })
  c.header('Cache-Control', 'no-store')
  await next()
})