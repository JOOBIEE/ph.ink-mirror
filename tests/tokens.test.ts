import { describe, it, expect } from 'vitest'
import { generateToken, hashToken } from '../src/lib/tokens'
import { normalizeEmail } from '../src/lib/email-address'

describe('tokens', () => {
  it('generates 64 hexadecimal characters', () => {
    expect(generateToken()).toMatch(/^[0-9a-f]{64}$/)
  })

  it('generates a different token every time', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateToken()))
    expect(tokens.size).toBe(1000)
  })

  it('hashes the same token to the same value', async () => {
    expect(await hashToken('abc')).toBe(await hashToken('abc'))
  })

  it('hashes different tokens to different values', async () => {
    expect(await hashToken('abc')).not.toBe(await hashToken('abd'))
  })

  it('returns 64 hexadecimal characters and hides the token', async () => {
    const token = generateToken()
    const hash = await hashToken(token)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toBe(token)
  })
})

describe('normalizeEmail', () => {
  it('accepts a normal address and lowercases it', () => {
    expect(normalizeEmail('  Ola@Example.COM ')).toEqual({ ok: true, email: 'ola@example.com' })
  })

  it('accepts plus addresses', () => {
    expect(normalizeEmail('ola+ph@example.com').ok).toBe(true)
  })

  it.each([
    ['empty', ''],
    ['no @', 'example.com'],
    ['no domain dot', 'ola@example'],
    ['two @', 'a@b@example.com'],
    ['spaces inside', 'ola smith@example.com'],
    ['nothing before @', '@example.com'],
  ])('rejects %s', (_name, input) => {
    expect(normalizeEmail(input).ok).toBe(false)
  })

  it('rejects very long addresses', () => {
    expect(normalizeEmail('a'.repeat(250) + '@example.com').ok).toBe(false)
  })
})