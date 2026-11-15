import { normalizeEmail } from './email-address'

export const FEEDBACK_KINDS = ['idea', 'problem', 'praise', 'other'] as const
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

export const MIN_FEEDBACK_LENGTH = 10
export const MAX_FEEDBACK_LENGTH = 2000

// A page path such as /dashboard. A second slash straight after the first is not allowed.
const PAGE_FORMAT = /^\/(?:[A-Za-z0-9_.-][A-Za-z0-9/_.-]{0,98})?$/
// Control characters other than tab and newline have no place in a message.
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

export type FeedbackInput = {
  kind: FeedbackKind
  message: string
  email: string | null
  page: string | null
}
export type FeedbackCheck = { ok: true; feedback: FeedbackInput } | { ok: false; error: string }

export function validateFeedback(input: Record<string, unknown>): FeedbackCheck {
  const kind = FEEDBACK_KINDS.find((item) => item === input.kind)
  if (!kind) {
    return { ok: false, error: 'Choose what your feedback is about.' }
  }

  if (typeof input.message !== 'string') {
    return { ok: false, error: 'Write your feedback in the box.' }
  }
  const message = input.message.replace(CONTROL_CHARACTERS, '').trim()
  if (message.length < MIN_FEEDBACK_LENGTH) {
    return { ok: false, error: `Please write at least ${MIN_FEEDBACK_LENGTH} characters.` }
  }
  if (message.length > MAX_FEEDBACK_LENGTH) {
    return { ok: false, error: `Please keep it under ${MAX_FEEDBACK_LENGTH} characters.` }
  }

  let email: string | null = null
  if (typeof input.email === 'string' && input.email.trim() !== '') {
    const check = normalizeEmail(input.email)
    if (!check.ok) {
      return {
        ok: false,
        error: 'That email address does not look right. Leave it empty if you do not want a reply.',
      }
    }
    email = check.email
  }

  const page = typeof input.page === 'string' && PAGE_FORMAT.test(input.page) ? input.page : null

  return { ok: true, feedback: { kind, message, email, page } }
}