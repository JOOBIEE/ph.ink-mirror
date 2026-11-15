import { describe, it, expect } from 'vitest'
import { MAX_FEEDBACK_LENGTH, validateFeedback } from '../src/lib/feedback'

const base = { kind: 'idea', message: 'Please add bulk link creation.' }

describe('validateFeedback', () => {
  it('accepts a normal message and trims it', () => {
    const result = validateFeedback({ ...base, message: '  Please add bulk link creation.  ' })
    expect(result).toEqual({
      ok: true,
      feedback: { kind: 'idea', message: 'Please add bulk link creation.', email: null, page: null },
    })
  })

  it.each(['idea', 'problem', 'praise', 'other'])('accepts the topic %s', (kind) => {
    expect(validateFeedback({ ...base, kind }).ok).toBe(true)
  })

  it.each([undefined, 'spam', 42, ''])('rejects the topic %s', (kind) => {
    expect(validateFeedback({ ...base, kind }).ok).toBe(false)
  })

  it('rejects a message that is missing, not text, too short or too long', () => {
    expect(validateFeedback({ kind: 'idea' }).ok).toBe(false)
    expect(validateFeedback({ ...base, message: 42 }).ok).toBe(false)
    expect(validateFeedback({ ...base, message: 'too short' }).ok).toBe(false)
    expect(validateFeedback({ ...base, message: 'a'.repeat(MAX_FEEDBACK_LENGTH + 1) }).ok).toBe(false)
    expect(validateFeedback({ ...base, message: 'a'.repeat(MAX_FEEDBACK_LENGTH) }).ok).toBe(true)
  })

  it('does not count padding or control characters towards the length', () => {
    expect(validateFeedback({ ...base, message: '   \u0000\u0001  short  ' }).ok).toBe(false)
  })

  it('removes control characters but keeps line breaks', () => {
    const result = validateFeedback({ ...base, message: 'First line is here.\nSecond\u0000 line.' })
    expect(result.ok && result.feedback.message).toBe('First line is here.\nSecond line.')
  })

  it('treats the email as optional', () => {
    for (const email of [undefined, null, '', '   ']) {
      const result = validateFeedback({ ...base, email })
      expect(result.ok && result.feedback.email).toBeNull()
    }
  })

  it('keeps a valid email in lowercase and rejects a broken one', () => {
    const good = validateFeedback({ ...base, email: 'Someone@Example.com' })
    expect(good.ok && good.feedback.email).toBe('someone@example.com')
    expect(validateFeedback({ ...base, email: 'not an email' }).ok).toBe(false)
  })

  it('keeps a clean page path and drops anything odd', () => {
    const good = validateFeedback({ ...base, page: '/qr-studio' })
    expect(good.ok && good.feedback.page).toBe('/qr-studio')
    for (const page of ['https://evil.example', '//evil.example', '/a b', '/<script>', 42, 'x'.repeat(200)]) {
      const result = validateFeedback({ ...base, page })
      expect(result.ok && result.feedback.page).toBeNull()
    }
  })
})