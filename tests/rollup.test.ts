import { describe, it, expect } from 'vitest'
import { cutoffSeconds } from '../src/jobs/rollup'
import { utcDay } from '../src/lib/visitor-hash'

const MIDNIGHT_OCT_26_2025 = 1761436800
const NOON_OCT_26_2025 = MIDNIGHT_OCT_26_2025 + 12 * 3600

describe('cutoffSeconds', () => {
  it('returns the start of today when asked for 0 days back', () => {
    expect(cutoffSeconds(NOON_OCT_26_2025, 0)).toBe(MIDNIGHT_OCT_26_2025)
  })

  it('gives the same answer at any time of the same day', () => {
    expect(cutoffSeconds(MIDNIGHT_OCT_26_2025, 0)).toBe(
      cutoffSeconds(MIDNIGHT_OCT_26_2025 + 86399, 0),
    )
  })

  it('counts whole days back', () => {
    expect(utcDay(cutoffSeconds(NOON_OCT_26_2025, 1))).toBe('2025-10-25')
    expect(utcDay(cutoffSeconds(NOON_OCT_26_2025, 90))).toBe('2025-07-28')
  })
})