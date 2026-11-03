import { describe, it, expect } from 'vitest'
import { domainCandidates, isBlockedDestination } from '../src/lib/blocklist'

function dbBlocking(domains: string[]): D1Database {
  return {
    prepare() {
      return {
        bind(...params: string[]) {
          return {
            async first() {
              return params.some((param) => domains.includes(param)) ? { found: 1 } : null
            },
          }
        },
      }
    },
  } as unknown as D1Database
}

describe('domainCandidates', () => {
  it('lists a plain domain once', () => {
    expect(domainCandidates('evil.com')).toEqual(['evil.com'])
  })

  it('lists every parent domain of a subdomain', () => {
    expect(domainCandidates('a.b.evil.com')).toEqual(['a.b.evil.com', 'b.evil.com', 'evil.com'])
  })

  it('lowercases and removes a trailing dot', () => {
    expect(domainCandidates('EVIL.com.')).toEqual(['evil.com'])
  })

  it('never lists a bare ending such as com', () => {
    expect(domainCandidates('localhost')).toEqual([])
    expect(domainCandidates('com')).toEqual([])
    expect(domainCandidates('evil.com')).not.toContain('com')
  })

  it('keeps only the 10 candidates closest to the ending', () => {
    const host = 'a.b.c.d.e.f.g.h.i.j.k.com'
    const result = domainCandidates(host)
    expect(result).toHaveLength(10)
    expect(result[result.length - 1]).toBe('k.com')
    expect(result).not.toContain(host)
  })
})

describe('isBlockedDestination', () => {
  const db = dbBlocking(['evil.com'])

  it('blocks the listed domain', async () => {
    expect(await isBlockedDestination(db, 'https://evil.com/')).toBe(true)
  })

  it('blocks its subdomains', async () => {
    expect(await isBlockedDestination(db, 'https://www.evil.com/login')).toBe(true)
    expect(await isBlockedDestination(db, 'https://a.b.evil.com/')).toBe(true)
  })

  it('ignores the path and query', async () => {
    expect(await isBlockedDestination(db, 'https://evil.com/x?y=1#z')).toBe(true)
  })

  it('does not block a look-alike name', async () => {
    expect(await isBlockedDestination(db, 'https://notevil.com/')).toBe(false)
    expect(await isBlockedDestination(db, 'https://evil.com.example.org/')).toBe(false)
  })

  it('does not block unrelated domains', async () => {
    expect(await isBlockedDestination(db, 'https://example.com/')).toBe(false)
  })

  it('refuses anything it cannot parse', async () => {
    expect(await isBlockedDestination(db, 'not a url')).toBe(true)
  })
})