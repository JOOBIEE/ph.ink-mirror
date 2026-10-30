export const SLUG_ALPHABET =
  '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
export const SLUG_LENGTH = 6

export function generateSlug(length: number = SLUG_LENGTH): string {
  const limit = 256 - (256 % SLUG_ALPHABET.length)
  let slug = ''
  while (slug.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2))
    for (const byte of bytes) {
      if (byte < limit && slug.length < length) {
        slug += SLUG_ALPHABET[byte % SLUG_ALPHABET.length]
      }
    }
  }
  return slug
}

export const RESERVED_SLUGS = new Set([
  'api', 'admin', 'login', 'logout', 'signup', 'register', 'auth', 'verify',
  'dashboard', 'settings', 'account', 'static', 'assets', 'robots', 'sitemap',
  'favicon', 'report', 'terms', 'privacy', 'about', 'help', 'support',
  'security', 'abuse', 'status', 'health', 'qr', 'docs', 'blog', 'contact',
  'www', 'mail', 'app', 'phink', 'qr-studio', 'index',
])

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase())
}

export type SlugCheck = { ok: true } | { ok: false; reason: string }

export function validateCustomSlug(slug: string): SlugCheck {
  if (slug.length < 3 || slug.length > 32) {
    return { ok: false, reason: 'Slug must be 3 to 32 characters long.' }
  }
  if (!/^[A-Za-z0-9_-]+$/.test(slug)) {
    return { ok: false, reason: 'Use only letters, numbers, hyphens and underscores.' }
  }
  if (isReservedSlug(slug)) {
    return { ok: false, reason: 'That slug is reserved.' }
  }
  return { ok: true }
}