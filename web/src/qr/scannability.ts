export type Level = 'ok' | 'warning' | 'problem'
export type EccLevel = 'L' | 'M' | 'Q' | 'H'
export type Check = { id: string; level: Level; message: string }

export type ScanInput = {
  dots: string
  corners: string
  background: string
  transparent: boolean
  hasLogo: boolean
  logoScale: number
  ecl: EccLevel
  marginPercent: number
  payloadLength: number
}

const ECC_CAPACITY: Record<EccLevel, number> = { L: 0.07, M: 0.15, Q: 0.25, H: 0.3 }

export function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match || !match[1]) return null
  const value = parseInt(match[1], 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

export function luminance(hex: string): number | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number | null {
  const first = luminance(a)
  const second = luminance(b)
  if (first === null || second === null) return null
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

function rateContrast(ratio: number): Level {
  if (ratio >= 4.5) return 'ok'
  if (ratio >= 3) return 'warning'
  return 'problem'
}

export function checkScannability(input: ScanInput): Check[] {
  const checks: Check[] = []

  if (input.transparent) {
    checks.push({
      id: 'background',
      level: 'warning',
      message:
        'The background is transparent, so scanning depends on what it is placed on. Make sure there is strong contrast behind the code.',
    })
  } else {
    const ratio = contrastRatio(input.dots, input.background)
    if (ratio !== null) {
      const level = rateContrast(ratio)
      const shown = ratio.toFixed(1)
      checks.push({
        id: 'contrast',
        level,
        message:
          level === 'ok'
            ? `The dots and background have strong contrast (${shown}:1).`
            : level === 'warning'
              ? `Contrast between the dots and background is only ${shown}:1. It may fail in poor light or on older phones. Aim for 4.5:1 or more.`
              : `Contrast is only ${shown}:1, so many phones will not read this code. Use much darker dots on a lighter background.`,
      })
    }

    if (input.corners.toLowerCase() !== input.dots.toLowerCase()) {
      const cornerRatio = contrastRatio(input.corners, input.background)
      if (cornerRatio !== null) {
        const level = rateContrast(cornerRatio)
        const shown = cornerRatio.toFixed(1)
        checks.push({
          id: 'corners',
          level,
          message:
            level === 'ok'
              ? `The corner squares have strong contrast (${shown}:1).`
              : level === 'warning'
                ? `The corner squares have low contrast (${shown}:1). Scanners find the code by its corners, so make them darker.`
                : `The corner squares have very low contrast (${shown}:1). Scanners will struggle to find the code.`,
        })
      }
    }

    const dotsLight = luminance(input.dots)
    const backgroundLight = luminance(input.background)
    if (dotsLight !== null && backgroundLight !== null) {
      const inverted = dotsLight > backgroundLight
      checks.push({
        id: 'inverted',
        level: inverted ? 'warning' : 'ok',
        message: inverted
          ? 'The dots are lighter than the background (an inverted code). Some scanner apps cannot read these. Use dark dots on a light background if you can.'
          : 'Dark dots on a light background is the most widely readable choice.',
      })
    }
  }

  if (input.hasLogo) {
    const area = input.logoScale * input.logoScale
    const used = area / ECC_CAPACITY[input.ecl]
    const sizeLevel: Level = used > 0.8 ? 'problem' : used > 0.5 ? 'warning' : 'ok'
    checks.push({
      id: 'logo-size',
      level: sizeLevel,
      message:
        sizeLevel === 'ok'
          ? 'The logo is small enough for this error-correction level.'
          : sizeLevel === 'warning'
            ? 'The logo is fairly large for this error-correction level. Make it smaller or raise the error correction.'
            : 'The logo covers too much of the code for this error-correction level, and it is likely to stop scanning. Make it smaller or raise the error correction.',
    })

    const lowEcc = input.ecl === 'L' || input.ecl === 'M'
    checks.push({
      id: 'logo-ecl',
      level: lowEcc ? 'warning' : 'ok',
      message: lowEcc
        ? 'A logo hides part of the code, so use error correction Q or H.'
        : 'The error-correction level suits a logo.',
    })
  }

  const quiet = input.marginPercent
  const quietLevel: Level = quiet < 3 ? 'problem' : quiet < 6 ? 'warning' : 'ok'
  checks.push({
    id: 'quiet-zone',
    level: quietLevel,
    message:
      quietLevel === 'ok'
        ? `The blank border is ${quiet}% of the width, which is usually enough.`
        : `The blank border is only ${quiet}% of the width. Scanners need about four squares of empty space around the code, and 6% to 8% or more is usually enough.`,
  })

  const dense = input.payloadLength > 300
  checks.push({
    id: 'density',
    level: dense ? 'warning' : 'ok',
    message: dense
      ? 'This code holds a lot of data, so its squares are small. Print it larger or use shorter content.'
      : 'Short content keeps the squares large and easy to scan.',
  })

  return checks
}

export function summarizeChecks(checks: Check[]): {
  problems: number
  warnings: number
  passed: number
} {
  return {
    problems: checks.filter((check) => check.level === 'problem').length,
    warnings: checks.filter((check) => check.level === 'warning').length,
    passed: checks.filter((check) => check.level === 'ok').length,
  }
}