import { describe, it, expect } from 'vitest'
import { validateQrStyle } from '../src/lib/qr-style'

const GOOD = {
  dots: '#09090b',
  corners: '#18181b',
  background: '#ffffff',
  transparent: false,
  dotStyle: 'rounded',
  cornerStyle: 'extra-rounded',
  cornerDot: 'dot',
  marginPercent: 8,
  ecl: 'Q',
  logoScale: 0.25,
  exportSize: 1024,
}

describe('validateQrStyle: accepts', () => {
  it('accepts a complete style', () => {
    expect(validateQrStyle(GOOD)).toEqual({ ok: true, style: GOOD })
  })

  it('lowercases colours', () => {
    const result = validateQrStyle({ ...GOOD, dots: '#A1B2C3' })
    expect(result.ok && result.style.dots).toBe('#a1b2c3')
  })

  it('drops unknown fields instead of storing them', () => {
    const result = validateQrStyle({ ...GOOD, evil: '<script>alert(1)</script>' })
    expect(result.ok).toBe(true)
    expect(JSON.stringify(result)).not.toContain('evil')
  })

  it('accepts the edges of each range', () => {
    expect(validateQrStyle({ ...GOOD, marginPercent: 0 }).ok).toBe(true)
    expect(validateQrStyle({ ...GOOD, marginPercent: 15 }).ok).toBe(true)
    expect(validateQrStyle({ ...GOOD, logoScale: 0.1 }).ok).toBe(true)
    expect(validateQrStyle({ ...GOOD, logoScale: 0.35 }).ok).toBe(true)
  })
})

describe('validateQrStyle: rejects', () => {
  it.each([
    ['null', null],
    ['text', 'hello'],
    ['a list', []],
    ['a number', 5],
    ['nothing', undefined],
  ] as [string, unknown][])('rejects %s instead of an object', (_name, input) => {
    expect(validateQrStyle(input).ok).toBe(false)
  })

  it.each([
    ['a colour name', { dots: 'red' }],
    ['a short hex colour', { dots: '#fff' }],
    ['a bad hex digit', { corners: '#12345g' }],
    ['a colour that is not text', { background: 123 }],
    ['an unknown dot pattern', { dotStyle: 'evil' }],
    ['an unknown corner frame', { cornerStyle: 'round' }],
    ['an unknown corner centre', { cornerDot: 'star' }],
    ['an unknown error-correction level', { ecl: 'X' }],
    ['a border that is too big', { marginPercent: 16 }],
    ['a negative border', { marginPercent: -1 }],
    ['a fractional border', { marginPercent: 7.5 }],
    ['a border given as text', { marginPercent: '8' }],
    ['a logo that is too small', { logoScale: 0.05 }],
    ['a logo that is too big', { logoScale: 0.5 }],
    ['a logo size that is not a number', { logoScale: 'big' }],
    ['a logo size of NaN', { logoScale: NaN }],
    ['transparent given as text', { transparent: 'yes' }],
    ['an unsupported PNG size', { exportSize: 100 }],
  ] as [string, Record<string, unknown>][])('rejects %s', (_name, change) => {
    expect(validateQrStyle({ ...GOOD, ...change }).ok).toBe(false)
  })

  it('rejects a style with a missing field', () => {
    const { dots: _dots, ...rest } = GOOD
    expect(validateQrStyle(rest).ok).toBe(false)
  })
})