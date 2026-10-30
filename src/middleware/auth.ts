import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import type { Bindings } from '../types'
import { lookupSessionUser, SESSION_COOKIE, type SessionUser } from '../lib/session'

export type AuthEnv = {
  Bindings: Bindings
  Variables: { user: SessionUser }
}

export const requireUser = createMiddleware<AuthEnv>(async (c, next) => {
  const user = await lookupSessionUser(c.env.DB, getCookie(c, SESSION_COOKIE))
  if (!user) {
    return c.json({ error: 'Sign in to continue.' }, 401)
  }
  c.set('user', user)
  c.header('Cache-Control', 'no-store')
  await next()
})