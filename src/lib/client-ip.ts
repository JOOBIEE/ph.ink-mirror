import type { Bindings } from '../types'
import { getDailySalt, hashVisitor, utcDay } from './visitor-hash'

export const UNKNOWN_IP = 'unknown'

export function clientIp(
  env: Bindings,
  header: (name: string) => string | undefined,
): string {
  // Local development only: lets tests pretend to be different networks.
  // APP_ENV is never set in production, so this header is ignored there.
  if (env.APP_ENV === 'development') {
    const fake = header('x-dev-ip')
    if (fake) return fake
  }

  const real = header('cf-connecting-ip')
  if (real) return real

  return UNKNOWN_IP
}

let cachedSalt: { day: string; salt: string } | null = null

export async function ipKey(
  db: D1Database,
  ip: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const day = utcDay(nowSeconds)
  if (!cachedSalt || cachedSalt.day !== day) {
    cachedSalt = { day, salt: await getDailySalt(db, day) }
  }
  return (await hashVisitor(cachedSalt.salt, ip, '')).slice(0, 16)
}