const encoder = new TextEncoder()

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function utcDay(nowSeconds: number): string {
  return new Date(nowSeconds * 1000).toISOString().slice(0, 10)
}

export async function hashVisitor(
  salt: string,
  ip: string,
  userAgent: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(salt),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(ip + '|' + userAgent),
  )
  return toHex(new Uint8Array(signature)).slice(0, 32)
}

export async function getDailySalt(db: D1Database, day: string): Promise<string> {
  const find = () =>
    db.prepare('SELECT salt FROM daily_salts WHERE day = ?').bind(day).first<{ salt: string }>()

  const existing = await find()
  if (existing) return existing.salt

  const fresh = toHex(crypto.getRandomValues(new Uint8Array(32)))
  await db
    .prepare('INSERT OR IGNORE INTO daily_salts (day, salt) VALUES (?, ?)')
    .bind(day, fresh)
    .run()

  const stored = await find()
  return stored ? stored.salt : fresh
}