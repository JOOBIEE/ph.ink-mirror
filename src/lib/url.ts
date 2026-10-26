export type UrlCheck = { ok: true; url: string } | { ok: false; reason: string }

const MAX_URL_LENGTH = 2000

const OWN_DOMAIN = 'ph.ink'

const SHORTENER_DOMAINS = [
  'bit.ly', 'bitly.com', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly',
  'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at', 't.ly',
]

const INTERNAL_SUFFIXES = ['.localhost', '.local', '.internal', '.lan']

function isIpAddress(host: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('[')
}

function isOrSubdomainOf(host: string, domain: string): boolean {
  return host === domain || host.endsWith('.' + domain)
}

export function validateDestination(input: string): UrlCheck {
  const raw = input.trim()

  if (raw.length === 0) {
    return { ok: false, reason: 'Enter a link.' }
  }
  if (raw.length > MAX_URL_LENGTH) {
    return { ok: false, reason: 'That link is too long.' }
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { ok: false, reason: 'That is not a valid link. Start it with https://' }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Only http and https links are allowed.' }
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'Links with a username or password are not allowed.' }
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '')

  if (isIpAddress(host)) {
    return { ok: false, reason: 'Links to IP addresses are not allowed.' }
  }
  if (host === 'localhost' || !host.includes('.')) {
    return { ok: false, reason: 'Links to local or private addresses are not allowed.' }
  }
  if (INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { ok: false, reason: 'Links to local or private addresses are not allowed.' }
  }
  if (isOrSubdomainOf(host, OWN_DOMAIN)) {
    return { ok: false, reason: 'You cannot shorten a ph.ink link.' }
  }
  if (SHORTENER_DOMAINS.some((domain) => isOrSubdomainOf(host, domain))) {
    return { ok: false, reason: 'Links from other link shorteners are not allowed.' }
  }

  return { ok: true, url: parsed.href }
}