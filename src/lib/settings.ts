export const LINKS_PAUSED_KEY = 'links_paused'

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .bind(key)
    .first<{ value: string }>()
  return row ? row.value : null
}

export async function linksPaused(db: D1Database): Promise<boolean> {
  return (await getSetting(db, LINKS_PAUSED_KEY)) === '1'
}