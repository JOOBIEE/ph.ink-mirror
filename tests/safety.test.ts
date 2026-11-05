import { describe, it, expect, vi } from 'vitest'
import {
  checkersFor,
  checkUrlSafety,
  URLHAUS_ENDPOINT,
  urlhausChecker,
  type UrlChecker,
} from '../src/lib/safety'
import type { Bindings } from '../src/types'

const signal = new AbortController().signal

function answering(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))
}

function asFetch(fake: ReturnType<typeof vi.fn>): typeof fetch {
  return fake as unknown as typeof fetch
}

const flagged: UrlChecker = { name: 'one', isFlagged: async () => true }
const clean: UrlChecker = { name: 'two', isFlagged: async () => false }
const broken: UrlChecker = {
  name: 'three',
  isFlagged: async () => {
    throw new Error('service down')
  },
}

describe('urlhausChecker', () => {
  it('treats a listed URL as flagged', async () => {
    const checker = urlhausChecker('key', asFetch(answering({ query_status: 'ok' })))
    expect(await checker.isFlagged('https://bad.example/x', signal)).toBe(true)
  })

  it('treats an unlisted URL as clean', async () => {
    const checker = urlhausChecker('key', asFetch(answering({ query_status: 'no_results' })))
    expect(await checker.isFlagged('https://fine.example/', signal)).toBe(false)
  })

  it('sends the key in a header and the address in the body, never in the web address', async () => {
    const fake = answering({ query_status: 'no_results' })
    await urlhausChecker('secret-key', asFetch(fake)).isFlagged('https://x.example/a b', signal)

    const [url, init] = fake.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(URLHAUS_ENDPOINT)
    expect(url).not.toContain('secret-key')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Auth-Key']).toBe('secret-key')
    expect(String(init.body)).toBe('url=https%3A%2F%2Fx.example%2Fa+b')
  })

  it('reports an error when the service refuses the key', async () => {
    const checker = urlhausChecker('bad', asFetch(answering({ query_status: 'ok' }, 401)))
    await expect(checker.isFlagged('https://x.example/', signal)).rejects.toThrow('401')
  })

  it('reports an error for an answer it does not understand', async () => {
    const checker = urlhausChecker('key', asFetch(answering({ query_status: 'invalid_url' })))
    await expect(checker.isFlagged('https://x.example/', signal)).rejects.toThrow()
  })

  it('reports an error when the answer is not JSON', async () => {
    const fake = vi.fn().mockResolvedValue(new Response('<html>oops</html>', { status: 200 }))
    await expect(urlhausChecker('key', asFetch(fake)).isFlagged('https://x.example/', signal)).rejects.toThrow()
  })
})

describe('checkersFor', () => {
  const env = (key?: string): Bindings => ({ DB: {} as D1Database, URLHAUS_AUTH_KEY: key })

  it('has no checkers without a key', () => {
    expect(checkersFor(env())).toEqual([])
    expect(checkersFor(env(''))).toEqual([])
  })

  it('adds the URLhaus checker when a key is set', () => {
    const checkers = checkersFor(env('abc'))
    expect(checkers).toHaveLength(1)
    expect(checkers[0]?.name).toBe('urlhaus')
  })
})

describe('checkUrlSafety', () => {
  const url = 'https://x.example/'

  it('is clean when there are no checkers', async () => {
    expect(await checkUrlSafety([], url)).toEqual({ status: 'clean' })
  })

  it('is clean when every checker says clean', async () => {
    expect(await checkUrlSafety([clean, clean], url)).toEqual({ status: 'clean' })
  })

  it('flags the link and names the source', async () => {
    expect(await checkUrlSafety([clean, flagged], url)).toEqual({ status: 'flagged', source: 'one' })
  })

  it('is unknown when a checker fails and nothing flagged', async () => {
    expect(await checkUrlSafety([clean, broken], url)).toEqual({ status: 'unknown' })
  })

  it('still flags the link when another checker fails', async () => {
    expect(await checkUrlSafety([broken, flagged], url)).toEqual({ status: 'flagged', source: 'one' })
  })

  it('treats a slow checker as unknown and cancels it', async () => {
    const captured: { signal?: AbortSignal } = {}
    const slow: UrlChecker = {
      name: 'slow',
      isFlagged: (_url, abortSignal) => {
        captured.signal = abortSignal
        return new Promise<boolean>(() => {})
      },
    }
    expect(await checkUrlSafety([slow], url, 20)).toEqual({ status: 'unknown' })
    expect(captured.signal?.aborted).toBe(true)
  })
})