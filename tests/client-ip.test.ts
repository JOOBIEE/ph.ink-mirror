import { describe, it, expect } from 'vitest'
import { clientIp, ipKey, UNKNOWN_IP } from '../src/lib/client-ip'
import type { Bindings } from '../src/types'

const env = (appEnv?: string): Bindings => ({ DB: {} as D1Database, APP_ENV: appEnv })
const headers = (values: Record<string, string>) => (name: string) => values[name]

const saltDb = {
  prepare() {
    return {
      bind() {
        return {
          async first() {
            return { salt: 'test-salt' }
          },
          async run() {
            return {}
          },
        }
      },
    }
  },
} as unknown as D1Database

const NOW = 1761436800

describe('clientIp', () => {
  it('uses the address Cloudflare reports', () => {
    expect(clientIp(env(), headers({ 'cf-connecting-ip': '203.0.113.5' }))).toBe('203.0.113.5')
  })

  it('ignores the dev header outside development', () => {
    expect(clientIp(env(), headers({ 'x-dev-ip': '203.0.113.9' }))).toBe(UNKNOWN_IP)
    expect(clientIp(env('production'), headers({ 'x-dev-ip': '203.0.113.9' }))).toBe(UNKNOWN_IP)
  })

  it('cannot be fooled by the dev header in production when a real address exists', () => {
    const result = clientIp(
      env('production'),
      headers({ 'cf-connecting-ip': '203.0.113.5', 'x-dev-ip': '203.0.113.9' }),
    )
    expect(result).toBe('203.0.113.5')
  })

  it('accepts the dev header in development', () => {
    expect(clientIp(env('development'), headers({ 'x-dev-ip': '203.0.113.9' }))).toBe('203.0.113.9')
  })

  it('prefers the dev header over the local address in development', () => {
    const result = clientIp(
      env('development'),
      headers({ 'cf-connecting-ip': '127.0.0.1', 'x-dev-ip': '203.0.113.9' }),
    )
    expect(result).toBe('203.0.113.9')
  })

  it('returns unknown when there is no address', () => {
    expect(clientIp(env('development'), headers({}))).toBe(UNKNOWN_IP)
  })
})

describe('ipKey', () => {
  it('is 16 hexadecimal characters and hides the address', async () => {
    const key = await ipKey(saltDb, '203.0.113.5', NOW)
    expect(key).toMatch(/^[0-9a-f]{16}$/)
    expect(key).not.toContain('203')
  })

  it('gives the same key for the same address', async () => {
    expect(await ipKey(saltDb, '203.0.113.5', NOW)).toBe(await ipKey(saltDb, '203.0.113.5', NOW))
  })

  it('gives different keys for different addresses', async () => {
    expect(await ipKey(saltDb, '203.0.113.5', NOW)).not.toBe(await ipKey(saltDb, '203.0.113.6', NOW))
  })
})