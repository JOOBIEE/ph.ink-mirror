import { describe, it, expect } from 'vitest'
import auth from '../src/routes/auth'
import type { Bindings } from '../src/types'

const env: Bindings = { DB: {} as D1Database, APP_URL: 'https://ph.ink' }
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
})