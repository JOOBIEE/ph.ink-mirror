import { createMiddleware } from 'hono/factory'
import type { Bindings } from '../types'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export const originCheck = createMiddleware<{ Bindings: Bindings }>(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) {
    await next()
    return
  }

  const origin = c.req.header('origin')
  if (origin) {
    const allowed = c.env.APP_URL ? new URL(c.env.APP_URL).origin : null
    if (origin !== allowed) {
      return c.json({ error: 'Cross-site requests are not allowed.' }, 403)
    }
  }

  await next()
})