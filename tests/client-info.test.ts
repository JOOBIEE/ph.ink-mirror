import { describe, it, expect } from 'vitest'
import { parseDevice, parseBrowser, referrerHost } from '../src/lib/client-info'

const CHROME_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const ANDROID_PHONE =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const ANDROID_TABLET =
  'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const IPAD =
  'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'
const FIREFOX =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0'
const INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 340.0.0.0.0'

describe('parseDevice', () => {
  it.each([
    ['iPhone', IPHONE_SAFARI, 'mobile'],
    ['Android phone', ANDROID_PHONE, 'mobile'],
    ['Android tablet', ANDROID_TABLET, 'tablet'],
    ['iPad', IPAD, 'tablet'],
    ['Windows desktop', CHROME_DESKTOP, 'desktop'],
  ])('classifies %s', (_name, ua, expected) => {
    expect(parseDevice(ua)).toBe(expected)
  })
})

describe('parseBrowser', () => {
  it.each([
    ['Chrome', CHROME_DESKTOP, 'Chrome'],
    ['Safari', IPHONE_SAFARI, 'Safari'],
    ['Edge (which also says Chrome and Safari)', EDGE, 'Edge'],
    ['Firefox', FIREFOX, 'Firefox'],
    ['Instagram in-app browser', INSTAGRAM, 'Instagram app'],
    ['curl', 'curl/8.4.0', 'Other'],
  ])('recognises %s', (_name, ua, expected) => {
    expect(parseBrowser(ua)).toBe(expected)
  })
})

describe('referrerHost', () => {
  it('keeps only the host and drops www', () => {
    expect(referrerHost('https://www.google.com/search?q=secret')).toBe('google.com')
  })

  it('returns null for missing or invalid values', () => {
    expect(referrerHost(null)).toBeNull()
    expect(referrerHost(undefined)).toBeNull()
    expect(referrerHost('')).toBeNull()
    expect(referrerHost('not a url')).toBeNull()
  })
})