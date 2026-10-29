import { describe, it, expect, vi } from 'vitest'
import { sendLoginEmail } from '../src/lib/email'
import type { Bindings } from '../src/types'

const fakeDb = {} as D1Database

describe('sendLoginEmail', () => {
  it('prints the link in development instead of sending', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const env: Bindings = { DB: fakeDb, APP_ENV: 'development' }

    await sendLoginEmail(env, 'a@example.com', 'http://x/link')

    expect(log).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
    log.mockRestore()
  })

  it('refuses to run in production without email settings', async () => {
    const env: Bindings = { DB: fakeDb }
    await expect(
      sendLoginEmail(env, 'a@example.com', 'http://x/link'),
    ).rejects.toThrow('not configured')
  })

  it('sends through the provider in production and never logs the link', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const env: Bindings = {
      DB: fakeDb,
      RESEND_API_KEY: 'test-key',
      EMAIL_FROM: 'ph.ink <login@ph.ink>',
    }

    await sendLoginEmail(env, 'a@example.com', 'http://x/link')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(log).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
    log.mockRestore()
  })

  it('throws when the provider rejects the message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 500 })))
    const env: Bindings = {
      DB: fakeDb,
      RESEND_API_KEY: 'test-key',
      EMAIL_FROM: 'ph.ink <login@ph.ink>',
    }
    await expect(
      sendLoginEmail(env, 'a@example.com', 'http://x/link'),
    ).rejects.toThrow('rejected')
    vi.unstubAllGlobals()
  })
})