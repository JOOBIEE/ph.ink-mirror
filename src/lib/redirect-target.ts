export const ALLOWED_NEXT = ['/admin', '/dashboard', '/settings', '/qr-studio'] as const
export type NextPath = (typeof ALLOWED_NEXT)[number]

export function safeNext(value: string | null | undefined): NextPath | null {
  if (typeof value !== 'string') return null
  return ALLOWED_NEXT.find((path) => path === value) ?? null
}