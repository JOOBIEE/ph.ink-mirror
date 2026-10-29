import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Bindings } from '../types'
import { generateToken, hashToken, SESSION_TTL_SECONDS } from './tokens'

export const SESSION_COOKIE = 'ph_session'

export type SessionUser = { id: number; email: string }

type AppContext = Context<{ Bindings: Bindings }>

export async function startSession(c: AppContext, userId: number): Promise<void> {
  const token = generateToken()
  const now = Math.floor(Date.now() / 1000)

  await c.env.DB
    .prepare(
      'INSERT INTO sessions (session_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    )
    .bind(await hashToken(token), userId, now, now + SESSION_TTL_SECONDS)
    .run()

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: c.env.APP_ENV !== 'development',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
}

export async function getSessionUser(c: AppContext): Promise<SessionUser | null> {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return null

  const now = Math.floor(Date.now() / 1000)
  return await c.env.DB
    .prepare(
      `SELECT users.id AS id, users.email AS email
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.session_hash = ?
         AND sessions.expires_at > ?
         AND users.status = 'active'`,
    )
    .bind(await hashToken(token), now)
    .first<SessionUser>()
}

export async function endSession(c: AppContext): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) {
    await c.env.DB
      .prepare('DELETE FROM sessions WHERE session_hash = ?')
      .bind(await hashToken(token))
      .run()
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}