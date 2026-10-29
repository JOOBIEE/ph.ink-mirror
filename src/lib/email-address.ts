export type EmailCheck = { ok: true; email: string } | { ok: false; reason: string }

const MAX_EMAIL_LENGTH = 254

export function normalizeEmail(input: string): EmailCheck {
  const email = input.trim().toLowerCase()

  if (email.length === 0) {
    return { ok: false, reason: 'Enter your email address.' }
  }
  if (email.length > MAX_EMAIL_LENGTH) {
    return { ok: false, reason: 'That email address is too long.' }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, reason: 'That does not look like an email address.' }
  }
  return { ok: true, email }
}