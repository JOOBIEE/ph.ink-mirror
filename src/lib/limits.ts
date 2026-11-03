export const LINKS_PER_USER_PER_HOUR = 30
export const LINKS_PER_IP_PER_HOUR = 60
export const NEW_ACCOUNT_DAYS = 7
export const NEW_ACCOUNT_DAILY_LINKS = 20
export const ESTABLISHED_DAILY_LINKS = 200

export const LOGINS_PER_IP_PER_HOUR = 10
// Kept under the email provider's free daily cap of 100 messages.
export const LOGIN_EMAILS_PER_DAY = 80

export const MISSES_PER_IP_PER_WINDOW = 100
export const MISS_WINDOW_SECONDS = 600

const DAY = 86400

export function dailyLinkCap(accountCreatedAt: number, nowSeconds: number): number {
  return nowSeconds - accountCreatedAt < NEW_ACCOUNT_DAYS * DAY
    ? NEW_ACCOUNT_DAILY_LINKS
    : ESTABLISHED_DAILY_LINKS
}

export async function dailyLinkQuota(
  db: D1Database,
  userId: number,
  nowSeconds: number,
): Promise<{ cap: number; used: number }> {
  const row = await db
    .prepare(
      `SELECT (SELECT created_at FROM users WHERE id = ?) AS created_at,
              (SELECT COUNT(*) FROM links WHERE owner_id = ? AND created_at >= ?) AS used`,
    )
    .bind(userId, userId, nowSeconds - DAY)
    .first<{ created_at: number | null; used: number }>()

  const created = row?.created_at ?? nowSeconds
  return { cap: dailyLinkCap(created, nowSeconds), used: row?.used ?? 0 }
}