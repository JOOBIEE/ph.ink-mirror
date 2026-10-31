export const MAX_PAYLOAD_LENGTH = 900

export type PayloadInput =
  | { kind: 'url'; url: string }
  | { kind: 'text'; text: string }
  | {
      kind: 'wifi'
      ssid: string
      password: string
      security: 'WPA' | 'WEP' | 'nopass'
      hidden: boolean
    }
  | { kind: 'email'; to: string; subject: string; body: string }

export type PayloadResult = { ok: true; data: string } | { ok: false; reason: string }

function fail(reason: string): PayloadResult {
  return { ok: false, reason }
}

function finish(data: string): PayloadResult {
  if (data.length > MAX_PAYLOAD_LENGTH) {
    return fail('That is too much for a reliable QR code. Please shorten it.')
  }
  return { ok: true, data }
}

export function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1')
}

function wifiField(value: string): string {
  const escaped = escapeWifi(value)
  return /^[0-9a-f]+$/i.test(value) ? `"${escaped}"` : escaped
}

export function buildPayload(input: PayloadInput): PayloadResult {
  switch (input.kind) {
    case 'url': {
      const raw = input.url.trim()
      if (!raw) return fail('Enter a link.')
      let parsed: URL
      try {
        parsed = new URL(raw)
      } catch {
        return fail('That is not a valid link. Start it with https://')
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return fail('Only http and https links are allowed.')
      }
      if (parsed.username || parsed.password) {
        return fail('Links with a username or password are not allowed.')
      }
      return finish(parsed.href)
    }

    case 'text': {
      const text = input.text.trim()
      if (!text) return fail('Enter some text.')
      return finish(text)
    }

    case 'wifi': {
      if (!input.ssid) return fail('Enter the network name.')
      if (new TextEncoder().encode(input.ssid).length > 32) {
        return fail('A network name can be at most 32 characters.')
      }
      if (input.security !== 'nopass') {
        if (!input.password) return fail('Enter the password, or choose "No password".')
        if (input.password.length > 63) return fail('A password can be at most 63 characters.')
      }
      let data = `WIFI:T:${input.security};S:${wifiField(input.ssid)};`
      if (input.security !== 'nopass') data += `P:${wifiField(input.password)};`
      if (input.hidden) data += 'H:true;'
      return finish(data + ';')
    }

    case 'email': {
      const to = input.to.trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        return fail('Enter a valid email address.')
      }
      const params: string[] = []
      if (input.subject) params.push(`subject=${encodeURIComponent(input.subject)}`)
      if (input.body) params.push(`body=${encodeURIComponent(input.body)}`)
      return finish(`mailto:${to}` + (params.length > 0 ? `?${params.join('&')}` : ''))
    }
  }
}