export const ADMIN_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60
export const MAX_NOTE_LENGTH = 300
export const MAX_SEARCH_LENGTH = 100

export const LINK_STATUSES = ['active', 'disabled', 'blocked', 'deleted'] as const
export const ACCOUNT_STATUSES = ['active', 'banned', 'deleted'] as const
export const REPORT_STATUSES = ['open', 'actioned', 'dismissed'] as const
export const AUDIT_TARGETS = ['link', 'user', 'report', 'system'] as const

export function parseAdminEmails(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry !== ''),
  )
}

export function isAdminEmail(email: string, value: string | undefined): boolean {
  return parseAdminEmails(value).has(email.trim().toLowerCase())
}

export function likePattern(query: string): string {
  return '%' + query.replace(/[\\%_]/g, (character) => '\\' + character) + '%'
}

export function parseSearch(value: string | undefined): string | null {
  const text = (value ?? '').trim()
  if (text === '') return null
  return text.slice(0, MAX_SEARCH_LENGTH)
}

export function parsePaging(
  limitText: string | undefined,
  offsetText: string | undefined,
): { limit: number; offset: number } {
  const limit = Math.min(Math.max(parseInt(limitText ?? '', 10) || 50, 1), 100)
  const offset = Math.min(Math.max(parseInt(offsetText ?? '', 10) || 0, 0), 100000)
  return { limit, offset }
}

export function parseFilter<T extends string>(
  allowed: readonly T[],
  value: string | undefined,
): { ok: true; value: T | null } | { ok: false } {
  if (value === undefined || value === '') return { ok: true, value: null }
  const match = allowed.find((item) => item === value)
  return match === undefined ? { ok: false } : { ok: true, value: match }
}

export function cleanNote(
  value: unknown,
): { ok: true; text: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, text: null }
  if (typeof value !== 'string') return { ok: false }
  return { ok: true, text: value.trim().slice(0, MAX_NOTE_LENGTH) || null }
}

export function blockableHost(destination: string): string | null {
  try {
    const host = new URL(destination).hostname
      .toLowerCase()
      .replace(/\.$/, '')
      .replace(/^www\./, '')
    return host.includes('.') ? host : null
  } catch {
    return null
  }
}