import type { Bindings } from '../types'

export type UrlChecker = {
  name: string
  isFlagged: (url: string, signal: AbortSignal) => Promise<boolean>
}

export type Verdict =
  | { status: 'clean' }
  | { status: 'flagged'; source: string }
  | { status: 'unknown' }

// Check this against abuse.ch's current documentation when you get a key.
export const URLHAUS_ENDPOINT = 'https://urlhaus-api.abuse.ch/v1/url/'
export const CHECK_TIMEOUT_MS = 1500

export function urlhausChecker(authKey: string, fetchFn: typeof fetch = fetch): UrlChecker {
  return {
    name: 'urlhaus',
    async isFlagged(url, signal) {
      const response = await fetchFn(URLHAUS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Auth-Key': authKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ url }).toString(),
        signal,
      })
      if (!response.ok) {
        throw new Error(`urlhaus answered ${response.status}`)
      }

      const data: unknown = await response.json()
      const status =
        typeof data === 'object' && data !== null && 'query_status' in data
          ? (data as { query_status: unknown }).query_status
          : null

      if (status === 'ok') return true
      if (status === 'no_results') return false
      throw new Error('urlhaus gave an answer we do not understand')
    },
  }
}

export function checkersFor(env: Bindings, fetchFn: typeof fetch = fetch): UrlChecker[] {
  const checkers: UrlChecker[] = []
  if (env.URLHAUS_AUTH_KEY) {
    checkers.push(urlhausChecker(env.URLHAUS_AUTH_KEY, fetchFn))
  }
  return checkers
}

async function withTimeout(
  checker: UrlChecker,
  url: string,
  timeoutMs: number,
): Promise<boolean> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error(`${checker.name} timed out`))
    }, timeoutMs)
  })

  try {
    return await Promise.race([checker.isFlagged(url, controller.signal), timeout])
  } finally {
    clearTimeout(timer)
  }
}
export async function checkUrlSafety(
  checkers: UrlChecker[],
  url: string,
  timeoutMs: number = CHECK_TIMEOUT_MS,
): Promise<Verdict> {
  if (checkers.length === 0) return { status: 'clean' }

  const results = await Promise.allSettled(
    checkers.map((checker) => withTimeout(checker, url, timeoutMs)),
  )

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const checker = checkers[i]
    if (result && checker && result.status === 'fulfilled' && result.value) {
      return { status: 'flagged', source: checker.name }
    }
  }

  return results.some((result) => result.status === 'rejected')
    ? { status: 'unknown' }
    : { status: 'clean' }
}