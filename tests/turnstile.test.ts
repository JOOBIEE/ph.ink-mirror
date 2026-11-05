import { describe, it, expect, vi } from 'vitest'
import {
  isTestSecret,
  MAX_TOKEN_LENGTH,
  TEST_SECRETS,
  turnstileProblem,
  TURNSTILE_VERIFY_URL,
  verifyTurnstile,
  type FailureReason,
} from '../src/lib/turnstile'
import type { Bindings } from '../src/types'

const DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'
const REAL_LOOKING_SECRET = '0x4AAAAAAAexampleexampleexample'
const PASSING_TEST_SECRET = TEST_SECRETS[0] as string

const env = (overrides: Partial<Bindings> = {}): Bindings => ({
  DB: {} as D1Database,
  ...overrides,
})

function answering(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))
}

function asFetch(fake: ReturnType<typeof vi.fn>): typeof fetch {
  return fake as unknown as typeof fetch
}

describe('configuration', () => {
  it('skips the check in development when no secret is set', async () => {
    const fake = answering({ success: true })
    const result = await verifyTurnstile(env({ APP_ENV: 'development' }), undefined, asFetch(fake))
    expect(result).toEqual({ ok: true })
    expect(fake).not.toHaveBeenCalled()
  })

  it('refuses to run outside development with no secret', async () => {
    const fake = answering({ success: true })
    expect(await verifyTurnstile(env(), DUMMY_TOKEN, asFetch(fake))).toEqual({
      ok: false,
      reason: 'misconfigured',
    })
    expect(await verifyTurnstile(env({ APP_ENV: 'production' }), DUMMY_TOKEN, asFetch(fake))).toEqual({
      ok: false,
      reason: 'misconfigured',
    })
    expect(fake).not.toHaveBeenCalled()
  })

  it.each(TEST_SECRETS)('refuses the dummy secret %s outside development', async (secret) => {
    const fake = answering({ success: true })
    const result = await verifyTurnstile(
      env({ APP_ENV: 'production', TURNSTILE_SECRET_KEY: secret }),
      DUMMY_TOKEN,
      asFetch(fake),
    )
    expect(result).toEqual({ ok: false, reason: 'misconfigured' })
    expect(fake).not.toHaveBeenCalled()
  })

  it('allows the dummy secret in development', async () => {
    const fake = answering({ success: true })
    const result = await verifyTurnstile(
      env({ APP_ENV: 'development', TURNSTILE_SECRET_KEY: PASSING_TEST_SECRET }),
      DUMMY_TOKEN,
      asFetch(fake),
    )
    expect(result).toEqual({ ok: true })
    expect(fake).toHaveBeenCalledTimes(1)
  })

  it('works with a real-looking secret in production', async () => {
    const fake = answering({ success: true })
    const result = await verifyTurnstile(
      env({ APP_ENV: 'production', TURNSTILE_SECRET_KEY: REAL_LOOKING_SECRET }),
      'a-real-token',
      asFetch(fake),
    )
    expect(result).toEqual({ ok: true })
  })

  it('recognises the dummy secrets', () => {
    expect(isTestSecret(PASSING_TEST_SECRET)).toBe(true)
    expect(isTestSecret(REAL_LOOKING_SECRET)).toBe(false)
  })
})

describe('the token', () => {
  const live = env({ APP_ENV: 'production', TURNSTILE_SECRET_KEY: REAL_LOOKING_SECRET })

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['empty text', ''],
    ['a number', 123],
    ['an object', { token: 'x' }],
    ['text that is too long', 'x'.repeat(MAX_TOKEN_LENGTH + 1)],
  ] as [string, unknown][])('treats %s as missing without calling Cloudflare', async (_name, token) => {
    const fake = answering({ success: true })
    expect(await verifyTurnstile(live, token, asFetch(fake))).toEqual({
      ok: false,
      reason: 'missing',
    })
    expect(fake).not.toHaveBeenCalled()
  })

  it('accepts a token of exactly the maximum length', async () => {
    const fake = answering({ success: true })
    const result = await verifyTurnstile(live, 'x'.repeat(MAX_TOKEN_LENGTH), asFetch(fake))
    expect(result).toEqual({ ok: true })
    expect(fake).toHaveBeenCalledTimes(1)
  })
})

describe('what Cloudflare says', () => {
  const live = env({ APP_ENV: 'production', TURNSTILE_SECRET_KEY: REAL_LOOKING_SECRET })

  it('passes when the check succeeds', async () => {
    expect(await verifyTurnstile(live, 'tok', asFetch(answering({ success: true })))).toEqual({
      ok: true,
    })
  })

  it('rejects when the check fails', async () => {
    const fake = answering({ success: false, 'error-codes': ['invalid-input-response'] })
    expect(await verifyTurnstile(live, 'tok', asFetch(fake))).toEqual({
      ok: false,
      reason: 'rejected',
    })
  })

  it.each([
    ['text instead of true', { success: 'true' }],
    ['a missing field', {}],
    ['a list', []],
    ['null', null],
  ] as [string, unknown][])('rejects an answer with %s', async (_name, body) => {
    expect(await verifyTurnstile(live, 'tok', asFetch(answering(body)))).toEqual({
      ok: false,
      reason: 'rejected',
    })
  })

  it('fails closed when Cloudflare answers with an error status', async () => {
    expect(await verifyTurnstile(live, 'tok', asFetch(answering({ success: true }, 500)))).toEqual({
      ok: false,
      reason: 'unavailable',
    })
  })

  it('fails closed on a network error', async () => {
    const fake = vi.fn().mockRejectedValue(new Error('offline'))
    expect(await verifyTurnstile(live, 'tok', asFetch(fake))).toEqual({
      ok: false,
      reason: 'unavailable',
    })
  })

  it('fails closed when the answer is not JSON', async () => {
    const fake = vi.fn().mockResolvedValue(new Response('<html>oops</html>', { status: 200 }))
    expect(await verifyTurnstile(live, 'tok', asFetch(fake))).toEqual({
      ok: false,
      reason: 'unavailable',
    })
  })

  it('fails closed on a timeout and cancels the request', async () => {
    let seenSignal: AbortSignal | null | undefined
    const hanging = ((_url: string, init?: RequestInit) => {
      seenSignal = init?.signal
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    }) as unknown as typeof fetch

    expect(await verifyTurnstile(live, 'tok', hanging, 20)).toEqual({
      ok: false,
      reason: 'unavailable',
    })
    expect(seenSignal?.aborted).toBe(true)
  })
})

describe('the request we send', () => {
  it('posts the secret and token in the body, never in the web address', async () => {
    const fake = answering({ success: true })
    await verifyTurnstile(
      env({ APP_ENV: 'production', TURNSTILE_SECRET_KEY: REAL_LOOKING_SECRET }),
      'my-token',
      asFetch(fake),
    )

    const [url, init] = fake.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(TURNSTILE_VERIFY_URL)
    expect(url).not.toContain(REAL_LOOKING_SECRET)
    expect(url).not.toContain('my-token')
    expect(init.method).toBe('POST')
    const sent = new URLSearchParams(String(init.body))
    expect(sent.get('secret')).toBe(REAL_LOOKING_SECRET)
    expect(sent.get('response')).toBe('my-token')
  })

  it('never puts the secret or token in its result', async () => {
    const result = await verifyTurnstile(
      env({ APP_ENV: 'production', TURNSTILE_SECRET_KEY: REAL_LOOKING_SECRET }),
      'my-token',
      asFetch(answering({ success: false })),
    )
    const text = JSON.stringify(result)
    expect(text).not.toContain(REAL_LOOKING_SECRET)
    expect(text).not.toContain('my-token')
  })
})

describe('turnstileProblem', () => {
  it.each([
    ['missing', 400],
    ['rejected', 403],
    ['unavailable', 503],
    ['misconfigured', 500],
  ] as [FailureReason, number][])('answers %s with status %s', (reason, status) => {
    expect(turnstileProblem(reason).status).toBe(status)
  })

  it('never reveals configuration details', () => {
    for (const reason of ['missing', 'rejected', 'unavailable', 'misconfigured'] as FailureReason[]) {
      expect(turnstileProblem(reason).error.toLowerCase()).not.toContain('secret')
    }
  })
})