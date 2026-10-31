import { describe, it, expect } from 'vitest'
import {
  csvCell,
  dayRange,
  parseDays,
  rangeBounds,
  summarize,
  toCsv,
  type ExportRow,
  type StatRow,
  type VisitorRow,
} from '../src/lib/analytics'

const MIDNIGHT = 1761436800 // 2025-10-26 00:00 UTC
const NOON = MIDNIGHT + 12 * 3600
const DAY = 86400

function row(overrides: Partial<StatRow>): StatRow {
  return {
    day: '2026-10-30',
    is_bot: 0,
    source: 'link',
    country: 'NG',
    device: 'mobile',
    browser: 'Chrome',
    referrer_host: null,
    n: 1,
    ...overrides,
  }
}

const RANGE = { fromDay: '2026-10-28', toDay: '2026-10-30' }

const ROWS: StatRow[] = [
  row({ day: '2026-10-29', referrer_host: 'google.com', n: 3 }),
  row({
    day: '2026-10-29', source: 'qr', country: 'GB', device: 'desktop',
    browser: 'Firefox', referrer_host: null, n: 2,
  }),
  row({
    day: '2026-10-30', is_bot: 1, country: null, device: 'desktop',
    browser: 'Other', referrer_host: null, n: 4,
  }),
  row({ day: '2026-10-30', referrer_host: 'google.com', n: 1 }),
]

const VISITORS: VisitorRow[] = [
  { day: '2026-10-29', is_bot: 0, v: 4 },
  { day: '2026-10-30', is_bot: 0, v: 1 },
  { day: '2026-10-30', is_bot: 1, v: 2 },
]

describe('parseDays', () => {
  it('defaults to 30 when absent', () => {
    expect(parseDays(undefined)).toBe(30)
    expect(parseDays('')).toBe(30)
  })

  it('accepts the allowed ranges', () => {
    for (const days of [7, 30, 90, 365]) {
      expect(parseDays(String(days))).toBe(days)
    }
  })

  it('rejects everything else', () => {
    for (const bad of ['1', '8', '31', 'abc', '7.5', '-7', '30 ', '0x1E']) {
      expect(parseDays(bad)).toBeNull()
    }
  })
})

describe('dayRange', () => {
  it('lists every day, both ends included', () => {
    expect(dayRange('2026-10-28', '2026-10-30')).toEqual([
      '2026-10-28', '2026-10-29', '2026-10-30',
    ])
  })

  it('crosses month boundaries', () => {
    expect(dayRange('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02',
    ])
  })

  it('returns one day when both ends match', () => {
    expect(dayRange('2026-10-30', '2026-10-30')).toEqual(['2026-10-30'])
  })
})

describe('rangeBounds', () => {
  it('covers whole UTC days ending today', () => {
    const bounds = rangeBounds(NOON, 7)
    expect(bounds.fromDay).toBe('2025-10-20')
    expect(bounds.toDay).toBe('2025-10-26')
    expect(bounds.startSeconds).toBe(MIDNIGHT - 6 * DAY)
    expect(bounds.endSeconds).toBe(MIDNIGHT + DAY)
    expect(bounds.rawFromSeconds).toBe(bounds.startSeconds)
  })

  it('switches to summaries for days older than raw retention', () => {
    const bounds = rangeBounds(NOON, 365)
    expect(bounds.rawStartDay).toBe('2025-07-28')
    expect(bounds.rawFromSeconds).toBe(MIDNIGHT - 90 * DAY)
    expect(bounds.fromDay).toBe('2024-10-27')
  })
})

describe('summarize', () => {
  it('counts people only by default and fills empty days', () => {
    const result = summarize(ROWS, VISITORS, { ...RANGE, includeBots: false })
    expect(result.totals).toEqual({
      clicks: 6, humanClicks: 6, botClicks: 4, qrScans: 2, visitors: 5,
    })
    expect(result.daily).toEqual([
      { day: '2026-10-28', clicks: 0 },
      { day: '2026-10-29', clicks: 5 },
      { day: '2026-10-30', clicks: 1 },
    ])
    expect(result.countries).toEqual([
      { name: 'NG', clicks: 4 },
      { name: 'GB', clicks: 2 },
    ])
    expect(result.devices).toEqual([
      { name: 'mobile', clicks: 4 },
      { name: 'desktop', clicks: 2 },
    ])
    expect(result.referrers).toEqual([
      { name: 'google.com', clicks: 4 },
      { name: 'Direct / none', clicks: 2 },
    ])
  })

  it('includes bots when asked', () => {
    const result = summarize(ROWS, VISITORS, { ...RANGE, includeBots: true })
    expect(result.totals).toEqual({
      clicks: 10, humanClicks: 6, botClicks: 4, qrScans: 2, visitors: 7,
    })
    expect(result.daily[2]).toEqual({ day: '2026-10-30', clicks: 5 })
    expect(result.countries).toEqual([
      { name: 'NG', clicks: 4 },
      { name: 'Unknown', clicks: 4 },
      { name: 'GB', clicks: 2 },
    ])
  })

  it('ignores rows outside the range', () => {
    const outside = row({ day: '2026-09-01', n: 99 })
    const result = summarize([...ROWS, outside], VISITORS, { ...RANGE, includeBots: false })
    expect(result.totals.clicks).toBe(6)
    expect(result.totals.botClicks).toBe(4)
  })

  it('keeps only the top 10 entries', () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      row({ country: `C${i + 1}`, n: i + 1 }),
    )
    const result = summarize(many, [], { ...RANGE, includeBots: false })
    expect(result.countries).toHaveLength(10)
    expect(result.countries[0]).toEqual({ name: 'C15', clicks: 15 })
    expect(result.countries[9]).toEqual({ name: 'C6', clicks: 6 })
  })

  it('labels missing values', () => {
    const result = summarize(
      [row({ country: null, device: '', browser: null, referrer_host: '' })],
      [],
      { ...RANGE, includeBots: false },
    )
    expect(result.countries[0]?.name).toBe('Unknown')
    expect(result.devices[0]?.name).toBe('Unknown')
    expect(result.browsers[0]?.name).toBe('Unknown')
    expect(result.referrers[0]?.name).toBe('Direct / none')
  })
})

describe('csvCell', () => {
  it('leaves plain text alone', () => {
    expect(csvCell('abc')).toBe('abc')
    expect(csvCell(12)).toBe('12')
  })

  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('a\nb')).toBe('"a\nb"')
  })

  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=1+1')).toBe("'=1+1")
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell('-cmd')).toBe("'-cmd")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
  })

  it('writes nothing for null', () => {
    expect(csvCell(null)).toBe('')
  })
})

describe('toCsv', () => {
  it('writes a header row and one line per click', () => {
    const exportRow: ExportRow = {
      clicked_at: MIDNIGHT,
      slug: 'abc123',
      source: 'qr',
      is_bot: 0,
      country: 'NG',
      device: 'mobile',
      browser: 'Chrome',
      referrer_host: null,
    }
    expect(toCsv([exportRow])).toBe(
      'time_utc,link,source,is_bot,country,device,browser,referrer_host\r\n' +
        '2025-10-26T00:00:00.000Z,abc123,qr,0,NG,mobile,Chrome,\r\n',
    )
  })
})