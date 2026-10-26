import { describe, it, expect } from 'vitest'
import { validateDestination } from '../src/lib/url'

describe('validateDestination: accepts', () => {
  it('accepts a normal https link', () => {
    const result = validateDestination('https://example.com/path?x=1')
    expect(result).toEqual({ ok: true, url: 'https://example.com/path?x=1' })
  })

  it('trims spaces around the link', () => {
    expect(validateDestination('  https://example.com/  ').ok).toBe(true)
  })

  it('converts international domains to their ASCII form', () => {
    const result = validateDestination('https://münchen.de/')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.url).toBe('https://xn--mnchen-3ya.de/')
    }
  })
})

describe('validateDestination: rejects', () => {
  it.each([
    ['empty text', ''],
    ['no protocol', 'example.com'],
    ['javascript link', 'javascript:alert(1)'],
    ['data link', 'data:text/html,hello'],
    ['file link', 'file:///etc/passwd'],
    ['ftp link', 'ftp://example.com/file'],
  ])('rejects %s', (_name, input) => {
    expect(validateDestination(input).ok).toBe(false)
  })

  it.each([
    ['username trick', 'https://google.com@evil.com'],
    ['password in link', 'https://user:pass@example.com'],
  ])('rejects %s', (_name, input) => {
    expect(validateDestination(input).ok).toBe(false)
  })

  it.each([
    ['localhost', 'http://localhost:8787'],
    ['IPv4', 'http://192.168.1.1/admin'],
    ['loopback', 'http://127.0.0.1'],
    ['decimal IP', 'http://2130706433/'],
    ['hex IP', 'http://0x7f.0.0.1/'],
    ['IPv6', 'http://[::1]/'],
    ['single-word host', 'http://intranet/'],
    ['internal domain', 'https://printer.internal/'],
  ])('rejects %s', (_name, input) => {
    expect(validateDestination(input).ok).toBe(false)
  })

  it.each([
    ['own domain', 'https://ph.ink/abc123'],
    ['own subdomain', 'https://www.ph.ink/abc123'],
    ['own domain with trailing dot', 'https://ph.ink./abc123'],
    ['other shortener', 'https://bit.ly/abc'],
    ['shortener subdomain', 'https://www.bit.ly/abc'],
  ])('rejects %s', (_name, input) => {
    expect(validateDestination(input).ok).toBe(false)
  })

  it('rejects links that are too long', () => {
    const long = 'https://example.com/' + 'a'.repeat(2000)
    expect(validateDestination(long).ok).toBe(false)
  })

  it('does not block domains that only look like a shortener', () => {
    expect(validateDestination('https://notbit.ly/page').ok).toBe(true)
  })
})