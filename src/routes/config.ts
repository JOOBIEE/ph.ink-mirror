import { Hono } from 'hono'
import type { Bindings } from '../types'

const config = new Hono<{ Bindings: Bindings }>()

config.get('/', (c) => {
  c.header('Cache-Control', 'no-store')
  return c.json({ turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null })
})

export default config