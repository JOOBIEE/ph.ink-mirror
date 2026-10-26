import { describe, it, expect } from 'vitest'
import { hashVisitor, utcDay } from '../src/lib/visitor-hash'

describe('utcDay', () => {
  it('formats a timestamp as a UTC date', () => {
    expect(utcDay(1761436800)).toBe('2025-10-26')
  })

  it('changes at midnight UTC', () => {
    expect(utcDay(1761436800 - 1)).toBe('2025-10-25')
  })
})

describe('hashVisitor', () => {
  it('gives the same result for the same inputs', async () => {
    const a = await hashVisitor('salt-1', '203.0.113.5', 'Mozilla/5.0')
    const b = await hashVisitor('salt-1', '203.0.113.5', 'Mozilla/5.0')
    expect(a).toBe(b)
  })

  it('changes when the salt changes', async () => {
    const a = await hashVisitor('salt-1', '203.0.113.5', 'Mozilla/5.0')
    const b = await hashVisitor('salt-2', '203.0.113.5', 'Mozilla/5.0')
    expect(a).not.toBe(b)
  })

  it('differs for different visitors', async () => {
    const a = await hashVisitor('salt-1', '203.0.113.5', 'Mozilla/5.0')
    const b = await hashVisitor('salt-1', '203.0.113.6', 'Mozilla/5.0')
    const c = await hashVisitor('salt-1', '203.0.113.5', 'Safari')
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
  })

  it('is 32 hexadecimal characters and does not contain the IP', async () => {
    const hash = await hashVisitor('salt-1', '203.0.113.5', 'Mozilla/5.0')
    expect(hash).toMatch(/^[0-9a-f]{32}$/)
    expect(hash).not.toContain('203')
  })
})