import { Hono } from 'hono'
import type { Bindings } from '../types'
import { generateSlug, validateCustomSlug } from '../lib/slug'
import { validateDestination } from '../lib/url'

// TEMPORARY: until login exists (Phase 4), every link belongs to dev user 1.
// Do not deploy this route publicly until then.
const DEV_OWNER_ID = 1
const MAX_SLUG_ATTEMPTS = 5

const links = new Hono<{ Bindings: Bindings }>()

links.post('/', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Send a JSON body.' }, 400)
  }

  const input = (
    typeof body === 'object' && body !== null ? body : {}
  ) as Record<string, unknown>

  if (typeof input.destination !== 'string') {
    return c.json({ error: 'A destination link is required.' }, 400)
  }
  const destination = validateDestination(input.destination)
  if (!destination.ok) {
    return c.json({ error: destination.reason }, 400)
  }

  let customSlug: string | undefined
  if (input.slug !== undefined && input.slug !== '') {
    if (typeof input.slug !== 'string') {
      return c.json({ error: 'Slug must be text.' }, 400)
    }
    const slugCheck = validateCustomSlug(input.slug)
    if (!slugCheck.ok) {
      return c.json({ error: slugCheck.reason }, 400)
    }
    customSlug = input.slug
  }

  const title =
    typeof input.title === 'string' ? input.title.trim().slice(0, 100) || null : null
  const now = Math.floor(Date.now() / 1000)
  const origin = new URL(c.req.url).origin

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = customSlug ?? generateSlug()
    try {
      await c.env.DB
        .prepare(
          'INSERT INTO links (slug, destination, owner_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(slug, destination.url, DEV_OWNER_ID, title, now, now)
        .run()
      return c.json(
        { slug, shortUrl: `${origin}/${slug}`, destination: destination.url },
        201,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (!message.includes('UNIQUE')) {
        throw error
      }
      if (customSlug) {
        return c.json({ error: 'That slug is already taken.' }, 409)
      }
      // A random slug collided with an existing one: loop and try another.
    }
  }

  return c.json({ error: 'Could not create a link. Please try again.' }, 500)
})

export default links