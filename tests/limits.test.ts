import { describe, it, expect } from 'vitest'
import {
  dailyLinkCap,
  ESTABLISHED_DAILY_LINKS,
  LOGIN_EMAILS_PER_DAY,
  NEW_ACCOUNT_DAILY_LINKS,
  NEW_ACCOUNT_DAYS,
} from '../src/lib/limits'

const NOW = 1761436800
const DAY = 86400

describe('dailyLinkCap', () => {
  it('gives a brand new account the low cap', () => {
    expect(dailyLinkCap(NOW - DAY, NOW)).toBe(NEW_ACCOUNT_DAILY_LINKS)
  })

  it('keeps the low cap until the account is 7 days old', () => {
    expect(dailyLinkCap(NOW - (NEW_ACCOUNT_DAYS * DAY - 1), NOW)).toBe(NEW_ACCOUNT_DAILY_LINKS)
  })

  it('raises the cap at exactly 7 days', () => {
    expect(dailyLinkCap(NOW - NEW_ACCOUNT_DAYS * DAY, NOW)).toBe(ESTABLISHED_DAILY_LINKS)
  })

  it('gives an old account the high cap', () => {
    expect(dailyLinkCap(NOW - 30 * DAY, NOW)).toBe(ESTABLISHED_DAILY_LINKS)
  })
})

describe('limit settings', () => {
  it('lets established accounts do more than new ones', () => {
    expect(NEW_ACCOUNT_DAILY_LINKS).toBeLessThan(ESTABLISHED_DAILY_LINKS)
  })

  it('keeps the daily sign-in email budget under the provider cap of 100', () => {
    expect(LOGIN_EMAILS_PER_DAY).toBeLessThanOrEqual(100)
  })
})