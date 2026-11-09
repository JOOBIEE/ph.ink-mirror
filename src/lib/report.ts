export const REPORT_REASONS = ['phishing', 'malware', 'spam', 'illegal', 'other'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

export const MAX_DETAILS_LENGTH = 1000

const SLUG_FORMAT = /^[A-Za-z0-9_-]{3,32}$/

export type LinkParse = { ok: true; slug: string } | { ok: false; error: string }

export function parseReportedLink(raw: string, appUrl: string | undefined): LinkParse {
  const text = raw.trim()
  if (text === '') {
    return { ok: false, error: 'Enter the short link you want to report.' }
  }
  if (text.length > 300) {
    return { ok: false, error: 'That is too long to be a phub.ink link.' }
  }
  if (SLUG_FORMAT.test(text)) {
    return { ok: true, slug: text }
  }
  if (!appUrl) {
    return { ok: false, error: 'Enter the short link, for example https://phub.ink/abc123.' }
  }

  let url: URL
  let ours: string
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text)
    ours = new URL(appUrl).host.toLowerCase()
  } catch {
    return { ok: false, error: 'That is not a valid link.' }
  }
  if (url.host.toLowerCase() !== ours) {
    return { ok: false, error: 'That is not a phub.ink link.' }
  }

  const first = url.pathname.split('/').filter((part) => part !== '')[0] ?? ''
  if (!SLUG_FORMAT.test(first)) {
    return { ok: false, error: 'That does not look like a short link.' }
  }
  return { ok: true, slug: first }
}

export type ReportInput = { link: string; reason: ReportReason; details: string | null }
export type ReportCheck = { ok: true; report: ReportInput } | { ok: false; error: string }

export function validateReport(input: Record<string, unknown>): ReportCheck {
  if (typeof input.link !== 'string') {
    return { ok: false, error: 'Enter the short link you want to report.' }
  }

  const reason = REPORT_REASONS.find((item) => item === input.reason)
  if (!reason) {
    return { ok: false, error: 'Choose a reason.' }
  }

  let details: string | null = null
  if (input.details !== undefined && input.details !== null) {
    if (typeof input.details !== 'string') {
      return { ok: false, error: 'The details must be text.' }
    }
    const text = input.details.trim()
    if (text.length > MAX_DETAILS_LENGTH) {
      return { ok: false, error: `The details can be at most ${MAX_DETAILS_LENGTH} characters.` }
    }
    details = text === '' ? null : text
  }

  return { ok: true, report: { link: input.link, reason, details } }
}