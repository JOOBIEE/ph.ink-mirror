import { describe, it, expect } from 'vitest'
import { buildPayload, MAX_PAYLOAD_LENGTH } from '../web/src/qr/payload'

describe('buildPayload: link', () => {
  it('accepts a normal link', () => {
    expect(buildPayload({ kind: 'url', url: 'https://example.com/a?b=1' })).toEqual({
      ok: true,
      data: 'https://example.com/a?b=1',
    })
  })

  it('cleans up a bare domain', () => {
    expect(buildPayload({ kind: 'url', url: ' https://example.com ' })).toEqual({
      ok: true,
      data: 'https://example.com/',
    })
  })

  it.each([
    ['empty', ''],
    ['no protocol', 'example.com'],
    ['javascript link', 'javascript:alert(1)'],
    ['ftp link', 'ftp://example.com/x'],
    ['username trick', 'https://google.com@evil.com'],
  ])('rejects %s', (_name, url) => {
    expect(buildPayload({ kind: 'url', url }).ok).toBe(false)
  })

  it('rejects a link that is too long', () => {
    const url = 'https://example.com/' + 'a'.repeat(MAX_PAYLOAD_LENGTH)
    expect(buildPayload({ kind: 'url', url }).ok).toBe(false)
  })
})

describe('buildPayload: Wi-Fi', () => {
  const base = { kind: 'wifi' as const, hidden: false }

  it('builds a normal network', () => {
    expect(buildPayload({ ...base, ssid: 'Home', password: 'secret', security: 'WPA' })).toEqual({
      ok: true,
      data: 'WIFI:T:WPA;S:Home;P:secret;;',
    })
  })

  it('marks a hidden network', () => {
    expect(
      buildPayload({ ...base, hidden: true, ssid: 'Home', password: 'secret', security: 'WPA' }),
    ).toEqual({ ok: true, data: 'WIFI:T:WPA;S:Home;P:secret;H:true;;' })
  })

  it('leaves out the password for an open network', () => {
    expect(buildPayload({ ...base, ssid: 'Guest', password: 'ignored', security: 'nopass' })).toEqual({
      ok: true,
      data: 'WIFI:T:nopass;S:Guest;;',
    })
  })

  it('escapes special characters in the network name', () => {
    expect(buildPayload({ ...base, ssid: 'My;Net', password: 'secret', security: 'WPA' })).toEqual({
      ok: true,
      data: 'WIFI:T:WPA;S:My\\;Net;P:secret;;',
    })
  })

  it('escapes special characters in the password', () => {
    expect(buildPayload({ ...base, ssid: 'Home', password: 'a:b,c"d\\e', security: 'WPA' })).toEqual({
      ok: true,
      data: 'WIFI:T:WPA;S:Home;P:a\\:b\\,c\\"d\\\\e;;',
    })
  })

  it('quotes names that look like hexadecimal', () => {
    expect(buildPayload({ ...base, ssid: '1234', password: 'secret', security: 'WPA' })).toEqual({
      ok: true,
      data: 'WIFI:T:WPA;S:"1234";P:secret;;',
    })
  })

  it('requires a password on a protected network', () => {
    expect(buildPayload({ ...base, ssid: 'Home', password: '', security: 'WPA' }).ok).toBe(false)
  })

  it('requires a network name', () => {
    expect(buildPayload({ ...base, ssid: '', password: 'secret', security: 'WPA' }).ok).toBe(false)
  })

  it('rejects a network name longer than 32 bytes', () => {
    expect(
      buildPayload({ ...base, ssid: 'x'.repeat(33), password: 'secret', security: 'WPA' }).ok,
    ).toBe(false)
  })
})

describe('buildPayload: email', () => {
  it('encodes the subject and body', () => {
    expect(
      buildPayload({ kind: 'email', to: 'a@b.co', subject: 'Hi there', body: 'Line1\nLine2' }),
    ).toEqual({ ok: true, data: 'mailto:a@b.co?subject=Hi%20there&body=Line1%0ALine2' })
  })

  it('works with an address only', () => {
    expect(buildPayload({ kind: 'email', to: 'a@b.co', subject: '', body: '' })).toEqual({
      ok: true,
      data: 'mailto:a@b.co',
    })
  })

  it.each([
    ['no @', 'ab.co'],
    ['no domain', 'a'],
    ['contains a space', 'a b@c.co'],
  ])('rejects an address with %s', (_name, to) => {
    expect(buildPayload({ kind: 'email', to, subject: '', body: '' }).ok).toBe(false)
  })
})

describe('buildPayload: text', () => {
  it('accepts text', () => {
    expect(buildPayload({ kind: 'text', text: ' hello ' })).toEqual({ ok: true, data: 'hello' })
  })

  it('rejects empty text', () => {
    expect(buildPayload({ kind: 'text', text: '   ' }).ok).toBe(false)
  })

  it('rejects text that is too long', () => {
    expect(buildPayload({ kind: 'text', text: 'a'.repeat(MAX_PAYLOAD_LENGTH + 1) }).ok).toBe(false)
  })
})