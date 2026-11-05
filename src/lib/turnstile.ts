import type { Bindings } from '../types'

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
export const MAX_TOKEN_LENGTH = 2048
export const VERIFY_TIMEOUT_MS = 4000

// Cloudflare's published dummy secret keys. They accept anything, so they must never run in production.
export const TEST_SECRETS = [
  '1x0000000000000000000000000000000AA',
  '2x0000000000000000000000000000000AA',
  '3x0000000000000000000000000000000AA',
]

export type FailureReason = 'missing' | 'rejected' | 'unavailable' | 'misconfigured'
export type TurnstileResult = { ok: true } | { ok: false; reason: FailureReason }

export function isTestSecret(secret: string): boolean {
  return TEST_SECRETS.includes(secret)
}

export async function verifyTurnstile(
  env: Bindings,
  token: unknown,
  fetchFn: typeof fetch = fetch,
  timeoutMs: number = VERIFY_TIMEOUT_MS,
): Promise<TurnstileResult> {
  const secret = env.TURNSTILE_SECRET_KEY ?? ''
  const development = env.APP_ENV === 'development'

  if (secret === '') {
    return development ? { ok: true } : { ok: false, reason: 'misconfigured' }
  }
  if (!development && isTestSecret(secret)) {
    return { ok: false, reason: 'misconfigured' }
  }

  if (typeof token !== 'string' || token === '' || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, reason: 'missing' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchFn(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }).toString(),
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, reason: 'unavailable' }

    const data: unknown = await response.json()
    const success =
      typeof data === 'object' &&
      data !== null &&
      (data as { success?: unknown }).success === true
    return success ? { ok: true } : { ok: false, reason: 'rejected' }
  } catch {
    return { ok: false, reason: 'unavailable' }
  } finally {
    clearTimeout(timer)
  }
}

export function turnstileProblem(reason: FailureReason): {
  status: 400 | 403 | 500 | 503
  error: string
} {
  switch (reason) {
    case 'missing':
      return { status: 400, error: 'Please complete the check before sending.' }
    case 'rejected':
      return { status: 403, error: 'The check did not pass. Please try again.' }
    case 'unavailable':
      return {
        status: 503,
        error: 'The check is temporarily unavailable. Please try again in a moment.',
      }
    case 'misconfigured':
      return { status: 500, error: 'The server is not configured.' }
  }
}