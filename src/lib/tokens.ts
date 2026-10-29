export const LOGIN_TOKEN_TTL_SECONDS = 15 * 60
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60

const encoder = new TextEncoder()

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function generateToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)))
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token))
  return toHex(new Uint8Array(digest))
}