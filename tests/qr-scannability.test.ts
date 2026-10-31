import { describe, it, expect } from 'vitest'
import {
  checkScannability,
  contrastRatio,
  summarizeChecks,
  type Check,
  type ScanInput,
} from '../web/src/qr/scannability'

const GOOD: ScanInput = {
  dots: '#09090b',
  corners: '#18181b',
  background: '#ffffff',
  transparent: false,
  hasLogo: false,
  logoScale: 0.25,
  ecl: 'Q',
  marginPercent: 8,
  payloadLength: 40,
}

function level(checks: Check[], id: string): string | undefined {
  return checks.find((check) => check.id === id)?.level
}

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })

  it('is 1 for identical colours', () => {
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5)
  })

  it('does not depend on the order', () => {
    expect(contrastRatio('#123456', '#fedcba')).toBeCloseTo(
      contrastRatio('#fedcba', '#123456') ?? 0,
      10,
    )
  })

  it('returns null for an invalid colour', () => {
    expect(contrastRatio('red', '#ffffff')).toBeNull()
  })
})

describe('checkScannability', () => {
  it('passes everything for a good design', () => {
    const checks = checkScannability(GOOD)
    expect(checks.every((check) => check.level === 'ok')).toBe(true)
  })

  it('flags very low contrast as a problem', () => {
    expect(level(checkScannability({ ...GOOD, dots: '#dddddd' }), 'contrast')).toBe('problem')
  })

  it('flags medium contrast as a warning', () => {
    expect(level(checkScannability({ ...GOOD, dots: '#888888' }), 'contrast')).toBe('warning')
  })

  it('flags low-contrast corner squares', () => {
    expect(level(checkScannability({ ...GOOD, corners: '#eeeeee' }), 'corners')).toBe('problem')
  })

  it('warns about an inverted code', () => {
    const checks = checkScannability({
      ...GOOD,
      dots: '#ffffff',
      corners: '#ffffff',
      background: '#000000',
    })
    expect(level(checks, 'inverted')).toBe('warning')
    expect(level(checks, 'contrast')).toBe('ok')
  })

  it('warns about a transparent background and skips the contrast check', () => {
    const checks = checkScannability({ ...GOOD, transparent: true })
    expect(level(checks, 'background')).toBe('warning')
    expect(level(checks, 'contrast')).toBeUndefined()
  })

  it('accepts a modest logo with strong error correction', () => {
    const checks = checkScannability({ ...GOOD, hasLogo: true, ecl: 'H', logoScale: 0.25 })
    expect(level(checks, 'logo-size')).toBe('ok')
    expect(level(checks, 'logo-ecl')).toBe('ok')
  })

  it('flags a logo that is far too big', () => {
    const checks = checkScannability({ ...GOOD, hasLogo: true, ecl: 'L', logoScale: 0.3 })
    expect(level(checks, 'logo-size')).toBe('problem')
  })

  it('warns about a fairly large logo', () => {
    const checks = checkScannability({ ...GOOD, hasLogo: true, ecl: 'M', logoScale: 0.3 })
    expect(level(checks, 'logo-size')).toBe('warning')
  })

  it('warns when a logo is used with low error correction', () => {
    const checks = checkScannability({ ...GOOD, hasLogo: true, ecl: 'M', logoScale: 0.15 })
    expect(level(checks, 'logo-ecl')).toBe('warning')
  })

  it.each([
    ['problem', 2],
    ['warning', 5],
  ])('rates a blank border as a %s at %s%%', (expected, marginPercent) => {
    expect(level(checkScannability({ ...GOOD, marginPercent }), 'quiet-zone')).toBe(expected)
  })

  it('warns about very dense content', () => {
    expect(level(checkScannability({ ...GOOD, payloadLength: 400 }), 'density')).toBe('warning')
  })
})

describe('summarizeChecks', () => {
  it('counts each kind of result', () => {
    const checks: Check[] = [
      { id: 'a', level: 'ok', message: '' },
      { id: 'b', level: 'ok', message: '' },
      { id: 'c', level: 'warning', message: '' },
      { id: 'd', level: 'problem', message: '' },
    ]
    expect(summarizeChecks(checks)).toEqual({ problems: 1, warnings: 1, passed: 2 })
  })
})