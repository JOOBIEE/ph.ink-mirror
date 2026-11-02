export const DOT_STYLES = [
  'rounded', 'extra-rounded', 'dots', 'classy', 'classy-rounded', 'square',
] as const
export const CORNER_STYLES = ['extra-rounded', 'square', 'dot'] as const
export const CORNER_DOT_STYLES = ['dot', 'square'] as const
export const ECC_LEVELS = ['L', 'M', 'Q', 'H'] as const
export const EXPORT_SIZES = [512, 1024, 2048, 4096] as const

export type QrStyle = {
  dots: string
  corners: string
  background: string
  transparent: boolean
  dotStyle: (typeof DOT_STYLES)[number]
  cornerStyle: (typeof CORNER_STYLES)[number]
  cornerDot: (typeof CORNER_DOT_STYLES)[number]
  marginPercent: number
  ecl: (typeof ECC_LEVELS)[number]
  logoScale: number
  exportSize: (typeof EXPORT_SIZES)[number]
}

export type StyleCheck = { ok: true; style: QrStyle } | { ok: false; reason: string }

const COLOR = /^#[0-9a-f]{6}$/i

function bad(reason: string): StyleCheck {
  return { ok: false, reason }
}

function color(value: unknown): string | null {
  return typeof value === 'string' && COLOR.test(value) ? value.toLowerCase() : null
}

function oneOf<T extends string | number>(list: readonly T[], value: unknown): T | null {
  return list.find((item) => item === value) ?? null
}

export function validateQrStyle(input: unknown): StyleCheck {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return bad('Send a style object.')
  }
  const raw = input as Record<string, unknown>

  const dots = color(raw.dots)
  const corners = color(raw.corners)
  const background = color(raw.background)
  if (dots === null || corners === null || background === null) {
    return bad('Colours must look like #1a2b3c.')
  }

  if (typeof raw.transparent !== 'boolean') {
    return bad('Transparent must be true or false.')
  }

  const dotStyle = oneOf(DOT_STYLES, raw.dotStyle)
  const cornerStyle = oneOf(CORNER_STYLES, raw.cornerStyle)
  const cornerDot = oneOf(CORNER_DOT_STYLES, raw.cornerDot)
  if (dotStyle === null || cornerStyle === null || cornerDot === null) {
    return bad('Unknown dot or corner style.')
  }

  const ecl = oneOf(ECC_LEVELS, raw.ecl)
  if (ecl === null) {
    return bad('Unknown error-correction level.')
  }

  const exportSize = oneOf(EXPORT_SIZES, raw.exportSize)
  if (exportSize === null) {
    return bad('Unsupported PNG size.')
  }

  const margin = raw.marginPercent
  if (typeof margin !== 'number' || !Number.isInteger(margin) || margin < 0 || margin > 15) {
    return bad('The blank border must be a whole number from 0 to 15.')
  }

  const logo = raw.logoScale
  if (typeof logo !== 'number' || !Number.isFinite(logo) || logo < 0.1 || logo > 0.35) {
    return bad('The logo size must be between 0.1 and 0.35.')
  }

  return {
    ok: true,
    style: {
      dots,
      corners,
      background,
      transparent: raw.transparent,
      dotStyle,
      cornerStyle,
      cornerDot,
      marginPercent: margin,
      ecl,
      logoScale: Math.round(logo * 100) / 100,
      exportSize,
    },
  }
}