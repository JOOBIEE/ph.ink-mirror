import { describe, it, expect } from 'vitest'
import config from '../src/routes/config'
import type { Bindings } from '../src/types'

const env = (overrides: Partial<Bindings> = {}): Bindings => ({
  DB: {} as D1Database,
  ...overrides,
})

describe('GET /api/config', () => {
  it('returns the public site key', async () => {
    const res = await config.request('/', {}, env({ TURNSTILE_SITE_KEY: 'public-key' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ turnstileSiteKey: 'public-key' })
  })

  it('returns null when no site key is set', async () => {
    const res = await config.request('/', {}, env())
    expect(await res.json()).toEqual({ turnstileSiteKey: null })
  })

  it('never exposes the secret key or other settings', async () => {
    const res = await config.request(
      '/',
      {},
      env({
        TURNSTILE_SITE_KEY: 'public-key',
        TURNSTILE_SECRET_KEY: 'super-secret',
        RESEND_API_KEY: 'mail-secret',
        ADMIN_EMAILS: 'boss@example.com',
      }),
    )
    const text = await res.text()
    expect(text).not.toContain('super-secret')
    expect(text).not.toContain('mail-secret')
    expect(text).not.toContain('boss@example.com')
  })

  it('is not cached', async () => {
    const res = await config.request('/', {}, env())
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})