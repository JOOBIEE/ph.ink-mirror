import { describe, it, expect } from 'vitest'
import {
  MAX_DETAILS_LENGTH,
  parseReportedLink,
  REPORT_REASONS,
  validateReport,
} from '../src/lib/report'

const APP = 'https://ph.ink'

describe('parseReportedLink', () => {
  it('accepts a bare slug', () => {
    expect(parseReportedLink('abc123', APP)).toEqual({ ok: true, slug: 'abc123' })
  })

  it('keeps the letter case', () => {
    expect(parseReportedLink('AbC123', APP)).toEqual({ ok: true, slug: 'AbC123' })
  })

  it('accepts a full link', () => {
    expect(parseReportedLink('https://ph.ink/abc123', APP)).toEqual({ ok: true, slug: 'abc123' })
  })

  it('ignores the query and extra path', () => {
    expect(parseReportedLink('https://ph.ink/abc123?s=q', APP)).toEqual({ ok: true, slug: 'abc123' })
    expect(parseReportedLink('https://ph.ink/abc123/extra', APP)).toEqual({ ok: true, slug: 'abc123' })
  })

  it('accepts a link without a scheme', () => {
    expect(parseReportedLink('ph.ink/abc123', APP)).toEqual({ ok: true, slug: 'abc123' })
  })

  it('rejects links to other sites', () => {
    expect(parseReportedLink('https://evil.example/abc123', APP).ok).toBe(false)
    expect(parseReportedLink('https://ph.ink.evil.example/abc123', APP).ok).toBe(false)
  })

  it('rejects a path that is not a slug', () => {
    expect(parseReportedLink('https://ph.ink/', APP).ok).toBe(false)
    expect(parseReportedLink('https://ph.ink/a%20b', APP).ok).toBe(false)
    expect(parseReportedLink('https://ph.ink/ab', APP).ok).toBe(false)
  })

  it('only accepts bare slugs when the site address is unknown', () => {
    expect(parseReportedLink('abc123', undefined).ok).toBe(true)
    expect(parseReportedLink('https://ph.ink/abc123', undefined).ok).toBe(false)
  })

  it('rejects empty and very long input', () => {
    expect(parseReportedLink('   ', APP).ok).toBe(false)
    expect(parseReportedLink('a'.repeat(301), APP).ok).toBe(false)
  })
})

describe('validateReport', () => {
  const good = { link: 'abc123', reason: 'phishing', details: 'Fake login page' }

  it('accepts a complete report', () => {
    expect(validateReport(good)).toEqual({
      ok: true,
      report: { link: 'abc123', reason: 'phishing', details: 'Fake login page' },
    })
  })

  it.each([...REPORT_REASONS])('accepts the reason %s', (reason) => {
    expect(validateReport({ ...good, reason }).ok).toBe(true)
  })

  it('treats missing details as none', () => {
    const result = validateReport({ link: 'abc123', reason: 'spam' })
    expect(result.ok && result.report.details).toBeNull()
  })

  it('trims details and turns blanks into none', () => {
    const trimmed = validateReport({ ...good, details: '  hello  ' })
    expect(trimmed.ok && trimmed.report.details).toBe('hello')
    const blank = validateReport({ ...good, details: '   ' })
    expect(blank.ok && blank.report.details).toBeNull()
  })

  it('rejects a link that is not text', () => {
    expect(validateReport({ ...good, link: 5 }).ok).toBe(false)
  })

  it('rejects an unknown reason', () => {
    expect(validateReport({ ...good, reason: 'banana' }).ok).toBe(false)
    expect(validateReport({ link: 'abc123' }).ok).toBe(false)
  })

  it('rejects details that are too long', () => {
    expect(validateReport({ ...good, details: 'x'.repeat(MAX_DETAILS_LENGTH + 1) }).ok).toBe(false)
  })

  it('rejects details that are not text', () => {
    expect(validateReport({ ...good, details: 123 }).ok).toBe(false)
  })
})