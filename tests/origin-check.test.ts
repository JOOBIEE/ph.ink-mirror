import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { originCheck } from '../src/middleware/origin-check'
import type { Bindings } from '../src/types'

const env: Bindings = { DB: {} as D1Database, APP_URL: 'https://ph.ink' }

function makeApp() {
  const app = new Hono<{ Bindings: Bindings }>()
  app.use('*', originCheck)
  app.all('/x', (c) => c.text('ok'))
  return app
}

describe('originCheck', () => {
  it('allows GET requests from any site', async () => {
    const res = await makeApp().request('/x', { headers: { Origin: 'https://evil.example' } }, env)
    expect(res.status).toBe(200)
  })

  it('allows POST with no Origin header (not a browser page)', async () => {
    const res = await makeApp().request('/x', { method: 'POST' }, env)
    expect(res.status).toBe(200)
  })

  it('allows POST from our own origin', async () => {
    const res = await makeApp().request(
      '/x',
      { method: 'POST', headers: { Origin: 'https://ph.ink' } },
      env,
    )
    expect(res.status).toBe(200)
  })

  it.each([
    ['POST', 'https://evil.example'],
    ['PATCH', 'https://evil.example'],
    ['DELETE', 'https://evil.example'],
    ['POST', 'https://ph.ink.evil.example'],
    ['POST', 'http://ph.ink'],
    ['POST', 'null'],
  ])('blocks %s from origin %s', async (method, origin) => {
    const res = await makeApp().request('/x', { method, headers: { Origin: origin } }, env)
    expect(res.status).toBe(403)
  })
})