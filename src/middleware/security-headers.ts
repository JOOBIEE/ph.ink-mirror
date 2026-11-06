import { createMiddleware } from 'hono/factory'
import type { Bindings } from '../types'

// Responses made by the Worker are JSON, small message pages and redirects. None of them needs
// scripts, styles, images or frames, so everything is switched off. The sign-in confirm page
// posts a form back to us, which is why form-action allows our own site.
export const WORKER_CSP =
  "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"

export const HSTS = 'max-age=31536000'

const FIXED: [string, string][] = [
  ['Content-Security-Policy', WORKER_CSP],
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'],
  ['Cross-Origin-Opener-Policy', 'same-origin'],
  ['Cross-Origin-Resource-Policy', 'same-origin'],
]

function apply(headers: Headers, secure: boolean): void {
  for (const [name, value] of FIXED) {
    if (!headers.has(name)) headers.set(name, value)
  }
  if (secure && !headers.has('Strict-Transport-Security')) {
    headers.set('Strict-Transport-Security', HSTS)
  }
}

export const securityHeaders = createMiddleware<{ Bindings: Bindings }>(async (c, next) => {
  await next()

  const secure = new URL(c.req.url).protocol === 'https:'
  try {
    apply(c.res.headers, secure)
  } catch {
    // Some responses (for example Response.redirect) have read-only headers. Copy and retry.
    const copy = new Response(c.res.body, c.res)
    apply(copy.headers, secure)
    c.res = copy
  }
})