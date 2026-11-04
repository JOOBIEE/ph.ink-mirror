import { describe, it, expect } from 'vitest'
import {
  blockableHost,
  cleanNote,
  isAdminEmail,
  likePattern,
  parseAdminEmails,
  parseFilter,
  parsePaging,
  parseSearch,
} from '../src/lib/admin'

describe('parseAdminEmails', () => {
  it('splits, trims and lowercases', () => {
    expect([...parseAdminEmails(' A@x.com , B@Y.com ')]).toEqual(['a@x.com', 'b@y.com'])
  })

  it('ignores empty entries and a missing value', () => {
    expect([...parseAdminEmails('a@x.com,, ,')]).toEqual(['a@x.com'])
    expect(parseAdminEmails(undefined).size).toBe(0)
  })
})

describe('isAdminEmail', () => {
  it('matches in any letter case', () => {
    expect(isAdminEmail('Boss@Example.com', 'boss@example.com')).toBe(true)
    expect(isAdminEmail(' boss@example.com ', 'BOSS@EXAMPLE.COM')).toBe(true)
  })

  it('rejects anyone not listed', () => {
    expect(isAdminEmail('other@example.com', 'boss@example.com')).toBe(false)
    expect(isAdminEmail('boss@example.com.evil', 'boss@example.com')).toBe(false)
  })

  it('rejects everyone when the list is empty or missing', () => {
    expect(isAdminEmail('boss@example.com', '')).toBe(false)
    expect(isAdminEmail('boss@example.com', undefined)).toBe(false)
  })
})

describe('likePattern', () => {
  it('wraps the text in wildcards', () => {
    expect(likePattern('abc')).toBe('%abc%')
  })

  it('escapes wildcard characters so they match literally', () => {
    expect(likePattern('100%')).toBe('%100\\%%')
    expect(likePattern('a_b')).toBe('%a\\_b%')
    expect(likePattern('a\\b')).toBe('%a\\\\b%')
  })
})

describe('parseSearch', () => {
  it('returns null for empty or blank', () => {
    expect(parseSearch(undefined)).toBeNull()
    expect(parseSearch('')).toBeNull()
    expect(parseSearch('   ')).toBeNull()
  })

  it('trims and limits the length', () => {
    expect(parseSearch('  hello ')).toBe('hello')
    expect(parseSearch('x'.repeat(500))).toHaveLength(100)
  })
})

describe('parsePaging', () => {
  it('uses defaults', () => {
    expect(parsePaging(undefined, undefined)).toEqual({ limit: 50, offset: 0 })
  })

  it('clamps the limit', () => {
    expect(parsePaging('1000', '0').limit).toBe(100)
    expect(parsePaging('-5', '0').limit).toBe(1)
    expect(parsePaging('20', '40')).toEqual({ limit: 20, offset: 40 })
  })

  it('rejects negative and garbage values', () => {
    expect(parsePaging('abc', 'xyz')).toEqual({ limit: 50, offset: 0 })
    expect(parsePaging('10', '-3').offset).toBe(0)
  })
})

describe('parseFilter', () => {
  const allowed = ['open', 'closed'] as const

  it('accepts an absent value as no filter', () => {
    expect(parseFilter(allowed, undefined)).toEqual({ ok: true, value: null })
    expect(parseFilter(allowed, '')).toEqual({ ok: true, value: null })
  })

  it('accepts a listed value', () => {
    expect(parseFilter(allowed, 'open')).toEqual({ ok: true, value: 'open' })
  })

  it('rejects anything else', () => {
    expect(parseFilter(allowed, 'OPEN')).toEqual({ ok: false })
    expect(parseFilter(allowed, "open' OR 1=1")).toEqual({ ok: false })
  })
})

describe('cleanNote', () => {
  it('treats missing as no note', () => {
    expect(cleanNote(undefined)).toEqual({ ok: true, text: null })
    expect(cleanNote(null)).toEqual({ ok: true, text: null })
    expect(cleanNote('   ')).toEqual({ ok: true, text: null })
  })

  it('trims and limits', () => {
    expect(cleanNote('  hi  ')).toEqual({ ok: true, text: 'hi' })
    const long = cleanNote('x'.repeat(1000))
    expect(long.ok && long.text?.length).toBe(300)
  })

  it('rejects non-text', () => {
    expect(cleanNote(5)).toEqual({ ok: false })
    expect(cleanNote({})).toEqual({ ok: false })
  })
})

describe('blockableHost', () => {
  it('returns the host without www, lowercased', () => {
    expect(blockableHost('https://WWW.Evil.com/login?x=1')).toBe('evil.com')
    expect(blockableHost('https://a.b.evil.com./')).toBe('a.b.evil.com')
  })

  it('returns null for single-label or invalid input', () => {
    expect(blockableHost('http://localhost/')).toBeNull()
    expect(blockableHost('not a url')).toBeNull()
  })
})