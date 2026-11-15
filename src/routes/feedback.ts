import { Hono } from 'hono'
import type { Bindings } from '../types'
import { clientIp, ipKey, UNKNOWN_IP } from '../lib/client-ip'
import { validateFeedback } from '../lib/feedback'
import { readJsonObject } from '../lib/json-body'
import { FEEDBACK_PER_DAY, FEEDBACK_PER_IP_PER_HOUR } from '../lib/limits'
import { hit } from '../lib/ratelimit'

const THANKS = { ok: true, message: 'Thank you! We read every message.' }

const feedback = new Hono<{ Bindings: Bindings }>()

feedback.post('/', async (c) => {
  const now = Math.floor(Date.now() / 1000)

  const ip = clientIp(c.env, (name) => c.req.header(name))
  if (ip !== UNKNOWN_IP) {
    const perIp = await hit(
      c.env.DB,
      {
        key: `feedback-ip:${await ipKey(c.env.DB, ip, now)}`,
        windowSeconds: 3600,
        max: FEEDBACK_PER_IP_PER_HOUR,
      },
      now,
    )
    if (!perIp.allowed) {
      c.header('Retry-After', String(perIp.retryAfterSeconds))
      return c.json({ error: 'You have sent a lot of feedback. Please try again later.' }, 429)
    }
  }

  const input = await readJsonObject(c)
  if (!input) {
    return c.json({ error: 'Send a JSON body.' }, 400)
  }

  // A hidden field that people never see. Only automated form-fillers write in it, so they
  // get a normal thank-you and nothing is stored.
  if (typeof input.hp === 'string' && input.hp.trim() !== '') {
    return c.json(THANKS)
  }

  const check = validateFeedback(input)
  if (!check.ok) {
    return c.json({ error: check.error }, 400)
  }

  const budget = await hit(
    c.env.DB,
    { key: 'feedback-global', windowSeconds: 86400, max: FEEDBACK_PER_DAY },
    now,
  )
  if (!budget.allowed) {
    c.header('Retry-After', String(budget.retryAfterSeconds))
    return c.json({ error: 'Feedback is temporarily unavailable. Please try again tomorrow.' }, 503)
  }

  const { kind, message, email, page } = check.feedback
  await c.env.DB
    .prepare(
      'INSERT INTO feedback (kind, message, contact_email, page, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(kind, message, email, page, now)
    .run()

  return c.json(THANKS)
})

export default feedback