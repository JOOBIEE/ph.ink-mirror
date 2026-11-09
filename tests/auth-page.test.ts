import { describe, it, expect } from 'vitest'
import auth from '../src/routes/auth'
import type { Bindings } from '../src/types'

const env: Bindings = { DB: {} as D1Database, APP_URL: 'https://phub.ink' }
const TOKEN = 'a'.repeat(64)

describe('GET /verify', () => {
  it('shows a confirm form with a referrer policy that keeps the real Origin', async () => {
    const res = await auth.request(`/verify?token=${TOKEN}`, {}, env)
    expect(res.status).toBe(200)
    expect(res.headers.get('Referrer-Policy')).toBe('same-origin')
    const html = await res.text()
    expect(html).toContain('method="post"')
    expect(html).toContain(TOKEN)
  })

  it('rejects malformed tokens without echoing them back', async () => {
    const res = await auth.request('/verify?token=<script>', {}, env)
    expect(res.status).toBe(400)
    expect(await res.text()).not.toContain('<script>')
  })

  it('carries an allowed next page through the form', async () => {
    const res = await auth.request(
      `/verify?token=${TOKEN}&next=${encodeURIComponent('/admin')}`,
      {},
      env,
    )
    expect(await res.text()).toContain('name="next" value="/admin"')
  })

  it.each([
    ['an external address', 'https://evil.example'],
    ['a protocol-relative address', '//evil.example'],
    ['a path with a query', '/admin?x=1'],
  ])('drops %s', async (_name, next) => {
    const res = await auth.request(
      `/verify?token=${TOKEN}&next=${encodeURIComponent(next)}`,
      {},
      env,
    )
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html).not.toContain('name="next"')
    expect(html).not.toContain('evil')
  })
})