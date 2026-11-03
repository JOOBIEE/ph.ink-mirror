import { describe, it, expect } from 'vitest'
import { hit, peek, secondsUntilReset, windowStart } from '../src/lib/ratelimit'

const HOUR = 3600
const START = 1761436800 // a UTC midnight, so also the start of an hour
const LIMIT = { key: 'test', windowSeconds: HOUR, max: 3 }

function fakeDb(): D1Database {
  const counts = new Map<string, number>()
  return {
    prepare(sql: string) {
      return {
        bind(key: string, start: number) {
          const id = `${key}@${start}`
          return {
            async first() {
              if (sql.trim().startsWith('INSERT')) {
                const next = (counts.get(id) ?? 0) + 1
                counts.set(id, next)
                return { count: next }
              }
              const current = counts.get(id)
              return current === undefined ? null : { count: current }
            },
          }
        },
      }
    },
  } as unknown as D1Database
}

describe('windows', () => {
  it('rounds down to the start of the window', () => {
    expect(windowStart(START, HOUR)).toBe(START)
    expect(windowStart(START + 1, HOUR)).toBe(START)
    expect(windowStart(START + HOUR - 1, HOUR)).toBe(START)
    expect(windowStart(START + HOUR, HOUR)).toBe(START + HOUR)
  })

  it('counts down to the reset', () => {
    expect(secondsUntilReset(START, HOUR)).toBe(HOUR)
    expect(secondsUntilReset(START + 100, HOUR)).toBe(HOUR - 100)
    expect(secondsUntilReset(START + HOUR - 1, HOUR)).toBe(1)
  })
})

describe('hit', () => {
  it('counts each hit', async () => {
    const db = fakeDb()
    expect((await hit(db, LIMIT, START)).count).toBe(1)
    expect((await hit(db, LIMIT, START + 5)).count).toBe(2)
  })

  it('allows exactly max hits and refuses the next', async () => {
    const db = fakeDb()
    const results = []
    for (let i = 0; i < 4; i++) {
      results.push(await hit(db, LIMIT, START + i))
    }
    expect(results.map((result) => result.allowed)).toEqual([true, true, true, false])
  })

  it('starts fresh in the next window', async () => {
    const db = fakeDb()
    for (let i = 0; i < 4; i++) {
      await hit(db, LIMIT, START)
    }
    expect(await hit(db, LIMIT, START + HOUR)).toMatchObject({ allowed: true, count: 1 })
  })

  it('keeps separate keys apart', async () => {
    const db = fakeDb()
    for (let i = 0; i < 4; i++) {
      await hit(db, LIMIT, START)
    }
    const other = await hit(db, { ...LIMIT, key: 'other' }, START)
    expect(other).toMatchObject({ allowed: true, count: 1 })
  })

  it('reports how long until the window resets', async () => {
    const result = await hit(fakeDb(), LIMIT, START + 600)
    expect(result.retryAfterSeconds).toBe(HOUR - 600)
  })
})

describe('peek', () => {
  it('does not count', async () => {
    const db = fakeDb()
    expect(await peek(db, LIMIT, START)).toMatchObject({ allowed: true, count: 0 })
    expect(await peek(db, LIMIT, START)).toMatchObject({ count: 0 })
    expect((await hit(db, LIMIT, START)).count).toBe(1)
  })

  it('refuses once max is reached', async () => {
    const db = fakeDb()
    for (let i = 0; i < 2; i++) {
      await hit(db, LIMIT, START)
    }
    expect((await peek(db, LIMIT, START)).allowed).toBe(true)
    await hit(db, LIMIT, START)
    expect((await peek(db, LIMIT, START)).allowed).toBe(false)
  })
})