import { describe, it, expect } from 'vitest'
import { isBot } from '../src/lib/bots'

const CHROME_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'

describe('isBot: real browsers', () => {
  it.each([
    ['Chrome on Windows', CHROME_DESKTOP],
    ['Safari on iPhone', IPHONE_SAFARI],
    ['Chrome on Android', ANDROID_CHROME],
  ])('treats %s as a person', (_name, ua) => {
    expect(isBot(ua)).toBe(false)
  })
})

describe('isBot: crawlers and tools', () => {
  it.each([
    ['Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
    ['WhatsApp preview', 'WhatsApp/2.23.20.0 A'],
    ['Facebook preview', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'],
    ['Slack preview', 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'],
    ['curl', 'curl/8.4.0'],
    ['Python script', 'python-requests/2.31.0'],
    ['uptime monitor', 'UptimeRobot/2.0'],
  ])('flags %s', (_name, ua) => {
    expect(isBot(ua)).toBe(true)
  })

  it('flags a missing or empty user agent', () => {
    expect(isBot('')).toBe(true)
    expect(isBot(null)).toBe(true)
    expect(isBot(undefined)).toBe(true)
  })
})