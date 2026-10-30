export type LinkRecord = {
  id: number
  slug: string
  destination: string
  title: string | null
  status: string
  expires_at: number | null
  created_at: number
  updated_at: number
}

export type LinkChanges = {
  destination?: string
  title?: string | null
  status?: 'active' | 'disabled'
}

const COLUMNS = 'id, slug, destination, title, status, expires_at, created_at, updated_at'

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

export async function insertLink(
  db: D1Database,
  ownerId: number,
  link: { slug: string; destination: string; title: string | null },
): Promise<LinkRecord> {
  const now = nowSeconds()
  const row = await db
    .prepare(
      `INSERT INTO links (slug, destination, owner_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING ${COLUMNS}`,
    )
    .bind(link.slug, link.destination, ownerId, link.title, now, now)
    .first<LinkRecord>()
  if (!row) throw new Error('Insert returned no row.')
  return row
}

export async function listLinks(
  db: D1Database,
  ownerId: number,
  limit: number,
  offset: number,
): Promise<LinkRecord[]> {
  const result = await db
    .prepare(
      `SELECT ${COLUMNS} FROM links
       WHERE owner_id = ? AND status != 'deleted'
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(ownerId, limit, offset)
    .all<LinkRecord>()
  return result.results
}

export async function getLink(
  db: D1Database,
  ownerId: number,
  id: number,
): Promise<LinkRecord | null> {
  return await db
    .prepare(
      `SELECT ${COLUMNS} FROM links
       WHERE id = ? AND owner_id = ? AND status != 'deleted'`,
    )
    .bind(id, ownerId)
    .first<LinkRecord>()
}

export async function updateLink(
  db: D1Database,
  ownerId: number,
  id: number,
  changes: LinkChanges,
): Promise<LinkRecord | null> {
  const sets: string[] = []
  const values: (string | number | null)[] = []

  if (changes.destination !== undefined) {
    sets.push('destination = ?')
    values.push(changes.destination)
  }
  if (changes.title !== undefined) {
    sets.push('title = ?')
    values.push(changes.title)
  }
  if (changes.status !== undefined) {
    sets.push('status = ?')
    values.push(changes.status)
  }
  sets.push('updated_at = ?')
  values.push(nowSeconds())

  return await db
    .prepare(
      `UPDATE links SET ${sets.join(', ')}
       WHERE id = ? AND owner_id = ? AND status NOT IN ('deleted', 'blocked')
       RETURNING ${COLUMNS}`,
    )
    .bind(...values, id, ownerId)
    .first<LinkRecord>()
}

export async function deleteLink(
  db: D1Database,
  ownerId: number,
  id: number,
): Promise<boolean> {
  const row = await db
    .prepare(
      `UPDATE links SET status = 'deleted', updated_at = ?
       WHERE id = ? AND owner_id = ? AND status NOT IN ('deleted', 'blocked')
       RETURNING id`,
    )
    .bind(nowSeconds(), id, ownerId)
    .first<{ id: number }>()
  return row !== null
}