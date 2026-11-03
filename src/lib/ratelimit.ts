export type Limit = { key: string; windowSeconds: number; max: number }

export type RateResult = {
  allowed: boolean
  count: number
  retryAfterSeconds: number
}

export function windowStart(nowSeconds: number, windowSeconds: number): number {
  return nowSeconds - (nowSeconds % windowSeconds)
}

export function secondsUntilReset(nowSeconds: number, windowSeconds: number): number {
  return windowStart(nowSeconds, windowSeconds) + windowSeconds - nowSeconds
}

export async function hit(
  db: D1Database,
  limit: Limit,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<RateResult> {
  const start = windowStart(nowSeconds, limit.windowSeconds)
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(limit.key, start)
    .first<{ count: number }>()

  const count = row?.count ?? 1
  return {
    allowed: count <= limit.max,
    count,
    retryAfterSeconds: secondsUntilReset(nowSeconds, limit.windowSeconds),
  }
}

export async function peek(
  db: D1Database,
  limit: Limit,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<RateResult> {
  const start = windowStart(nowSeconds, limit.windowSeconds)
  const row = await db
    .prepare('SELECT count FROM rate_limits WHERE key = ? AND window_start = ?')
    .bind(limit.key, start)
    .first<{ count: number }>()

  const count = row?.count ?? 0
  return {
    allowed: count < limit.max,
    count,
    retryAfterSeconds: secondsUntilReset(nowSeconds, limit.windowSeconds),
  }
}