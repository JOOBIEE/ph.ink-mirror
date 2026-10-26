import { describe, it, expect } from 'vitest'
import {
  generateSlug,
  isReservedSlug,
  validateCustomSlug,
  SLUG_ALPHABET,
  SLUG_LENGTH,
} from '../src/lib/slug'

describe('generateSlug', () => {
  it('uses an alphabet of 57 unique characters', () => {
    expect(SLUG_ALPHABET.length).toBe(57)
    expect(new Set(SLUG_ALPHABET).size).toBe(57)
  })

  it('returns a slug of the default length', () => {
    expect(generateSlug()).toHaveLength(SLUG_LENGTH)
  })

  it('only uses characters from the alphabet', () => {
    for (let i = 0; i < 1000; i++) {
      for (const char of generateSlug()) {
        expect(SLUG_ALPHABET).toContain(char)
      }
    }
  })

  it('never uses look-alike characters', () => {
    for (let i = 0; i < 1000; i++) {
      expect(generateSlug()).not.toMatch(/[01OIl]/)
    }
  })

  it('produces different slugs each time', () => {
    const slugs = new Set(Array.from({ length: 1000 }, () => generateSlug()))
    expect(slugs.size).toBeGreaterThan(990)
  })
})

describe('reserved slugs', () => {
  it('blocks reserved words in any letter case', () => {
    expect(isReservedSlug('api')).toBe(true)
    expect(isReservedSlug('API')).toBe(true)
    expect(isReservedSlug('Admin')).toBe(true)
  })

  it('allows ordinary words', () => {
    expect(isReservedSlug('summer-sale')).toBe(false)
  })
})

describe('validateCustomSlug', () => {
  it('accepts a good slug', () => {
    expect(validateCustomSlug('my-link_2')).toEqual({ ok: true })
  })

  it('rejects slugs that are too short or too long', () => {
    expect(validateCustomSlug('ab').ok).toBe(false)
    expect(validateCustomSlug('a'.repeat(33)).ok).toBe(false)
  })

  it('rejects spaces, slashes and symbols', () => {
    expect(validateCustomSlug('my link').ok).toBe(false)
    expect(validateCustomSlug('a/b/c').ok).toBe(false)
    expect(validateCustomSlug('hello!').ok).toBe(false)
  })

  it('rejects reserved words', () => {
    expect(validateCustomSlug('login').ok).toBe(false)
  })
})