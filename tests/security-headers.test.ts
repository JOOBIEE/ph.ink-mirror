import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { HSTS, securityHeaders, WORKER_CSP } from '../src/middleware/security-headers'
import type { Bindings } from '../src/types'

function makeApp() {
  const app = new Hono<{ Bindings: Bindings }>()
  app.use('*', securityHeaders)
  app.get('/json', (c) => c.json({ ok: true }))
  app.get('/text', (c) => c.text('hello'))
  app.get('/redirect', (c) => c.redirect('/somewhere', 302))
  app.get('/locked', () => Response.redirect('https://example.com/', 302))
  app.get('/custom', () => new Response('x', { headers: { 'Referrer-Policy': 'same-origin' } }))
  app.get('/own-csp', () => new Response('x', { headers: { 'Content-Security-Policy': "default-src 'self'" } }))
  app.get('/boom', () => {
    throw new Error('boom')
  })
  return app
}

const REQUIRED = [
  'content-security-policy',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
]

describe('securityHeaders', () => {
  it.each([
    ['a JSON answer', '/json', 200],
    ['a text answer', '/text', 200],
    ['a redirect', '/redirect', 302],
    ['a missing page', '/does-not-exist', 404],
    ['an error', '/boom', 500],
  ])('adds every header to %s', async (_name, path, status) => {
    const res = await makeApp().request(path)
    expect(res.status).toBe(status)
    for (const name of REQUIRED) {
      expect(res.headers.get(name), name).not.toBeNull()
    }
  })

  it('uses the expected values', async () => {
    const res = await makeApp().request('/json')
    expect(res.headers.get('content-security-policy')).toBe(WORKER_CSP)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin')
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-origin')
  })

  it('switches everything off by default and forbids embedding', () => {
    expect(WORKER_CSP).toContain("default-src 'none'")
    expect(WORKER_CSP).toContain("frame-ancestors 'none'")
    expect(WORKER_CSP).toContain("base-uri 'none'")
    expect(WORKER_CSP).not.toContain('unsafe')
    expect(WORKER_CSP).not.toContain('*')
  })

  it('keeps a header a route already set', async () => {
    const res = await makeApp().request('/custom')
    expect(res.headers.get('referrer-policy')).toBe('same-origin')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
  })

  it('keeps a Content-Security-Policy a route already set', async () => {
    const res = await makeApp().request('/own-csp')
    expect(res.headers.get('content-security-policy')).toBe("default-src 'self'")
  })

  it('works on responses whose headers are read-only', async () => {
    const res = await makeApp().request('/locked')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://example.com/')
    for (const name of REQUIRED) {
      expect(res.headers.get(name), name).not.toBeNull()
    }
  })

  it('sends HSTS over HTTPS only', async () => {
    const secure = await makeApp().request('https://ph.ink/json')
    expect(secure.headers.get('strict-transport-security')).toBe(HSTS)
    const plain = await makeApp().request('http://ph.ink/json')
    expect(plain.headers.get('strict-transport-security')).toBeNull()
  })

  it('keeps HSTS free of includeSubDomains and preload', () => {
    expect(HSTS).toBe('max-age=31536000')
  })

  it('never lets other sites read our answers', async () => {
    const res = await makeApp().request('/json', { headers: { Origin: 'https://evil.example' } })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })
})