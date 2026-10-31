import { Hono, type Context } from 'hono'
import { requireUser, type AuthEnv } from '../middleware/auth'
import { generateSlug, validateCustomSlug } from '../lib/slug'
import { validateDestination } from '../lib/url'
import { parseId } from '../lib/ids'
import {
  deleteLink,
  getLink,
  insertLink,
  listLinks,
  updateLink,
  type LinkChanges,
  type LinkRecord,
} from '../lib/link-store'

const MAX_SLUG_ATTEMPTS = 5
const NOT_FOUND = { error: 'Link not found.' }

const links = new Hono<AuthEnv>()
links.use('*', requireUser)

async function readJsonObject(c: Context<AuthEnv>): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await c.req.json()
    if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
      return body as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

function present(c: Context<AuthEnv>, link: LinkRecord) {
  const base = c.env.APP_URL ?? new URL(c.req.url).origin
  return {
    id: link.id,
    slug: link.slug,
    shortUrl: `${base}/${link.slug}`,
    destination: link.destination,
    title: link.title,
    status: link.status,
    expiresAt: link.expires_at,
    createdAt: link.created_at,
    updatedAt: link.updated_at,
  }
}

function cleanTitle(value: string): string | null {
  return value.trim().slice(0, 100) || null
}

links.post('/', async (c) => {
  const input = await readJsonObject(c)
  if (!input) {
    return c.json({ error: 'Send a JSON body.' }, 400)
  }

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

  const title = typeof input.title === 'string' ? cleanTitle(input.title) : null
  const owner = c.get('user')

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = customSlug ?? generateSlug()
    try {
      const created = await insertLink(c.env.DB, owner.id, {
        slug,
        destination: destination.url,
        title,
      })
      return c.json(present(c, created), 201)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (!message.includes('UNIQUE')) {
        throw error
      }
      if (customSlug) {
        return c.json({ error: 'That slug is already taken.' }, 409)
      }
    }
  }

  return c.json({ error: 'Could not create a link. Please try again.' }, 500)
})

links.get('/', async (c) => {
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '50', 10) || 50, 1), 100)
  const offset = Math.max(parseInt(c.req.query('offset') ?? '0', 10) || 0, 0)
  const rows = await listLinks(c.env.DB, c.get('user').id, limit, offset)
  return c.json({ links: rows.map((row) => present(c, row)) })
})

links.get('/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(NOT_FOUND, 404)

  const link = await getLink(c.env.DB, c.get('user').id, id)
  if (!link) return c.json(NOT_FOUND, 404)
  return c.json(present(c, link))
})

links.patch('/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(NOT_FOUND, 404)

  const input = await readJsonObject(c)
  if (!input) {
    return c.json({ error: 'Send a JSON body.' }, 400)
  }

  const changes: LinkChanges = {}

  if (input.destination !== undefined) {
    if (typeof input.destination !== 'string') {
      return c.json({ error: 'Destination must be text.' }, 400)
    }
    const check = validateDestination(input.destination)
    if (!check.ok) {
      return c.json({ error: check.reason }, 400)
    }
    changes.destination = check.url
  }

  if (input.title !== undefined) {
    if (input.title !== null && typeof input.title !== 'string') {
      return c.json({ error: 'Title must be text.' }, 400)
    }
    changes.title = typeof input.title === 'string' ? cleanTitle(input.title) : null
  }

  if (input.status !== undefined) {
    if (input.status !== 'active' && input.status !== 'disabled') {
      return c.json({ error: 'Status must be active or disabled.' }, 400)
    }
    changes.status = input.status
  }

  if (Object.keys(changes).length === 0) {
    return c.json({ error: 'Nothing to change.' }, 400)
  }

  const updated = await updateLink(c.env.DB, c.get('user').id, id, changes)
  if (!updated) return c.json(NOT_FOUND, 404)
  return c.json(present(c, updated))
})

links.delete('/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(NOT_FOUND, 404)

  const removed = await deleteLink(c.env.DB, c.get('user').id, id)
  if (!removed) return c.json(NOT_FOUND, 404)
  return c.json({ ok: true })
})

export default links