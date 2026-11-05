const MAX_CANDIDATES = 10
const DOMAIN_FORMAT =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/

export function hostOf(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, '')
    return host === '' ? null : host
  } catch {
    return null
  }
}

export function domainCandidates(host: string): string[] {
  const labels = host
    .toLowerCase()
    .replace(/\.$/, '')
    .split('.')
    .filter((label) => label !== '')

  const candidates: string[] = []
  for (let i = 0; i <= labels.length - 2; i++) {
    candidates.push(labels.slice(i).join('.'))
  }
  return candidates.slice(-MAX_CANDIDATES)
}

export function normalizeBlockDomain(input: string): string | null {
  const domain = input.trim().toLowerCase().replace(/\.$/, '')
  if (domain.length === 0 || domain.length > 253) return null
  if (!DOMAIN_FORMAT.test(domain)) return null

  const ending = domain.slice(domain.lastIndexOf('.') + 1)
  if (/^[0-9]+$/.test(ending)) return null
  return domain
}

export async function isBlockedDestination(
  db: D1Database,
  destinationUrl: string,
): Promise<boolean> {
  const host = hostOf(destinationUrl)
  if (host === null) return true

  const candidates = domainCandidates(host)
  if (candidates.length === 0) return false

  const marks = candidates.map(() => '?').join(', ')
  const row = await db
    .prepare(`SELECT 1 AS found FROM blocked_domains WHERE domain IN (${marks}) LIMIT 1`)
    .bind(...candidates)
    .first()
  return row !== null
}