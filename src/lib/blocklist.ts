const MAX_CANDIDATES = 10

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

export async function isBlockedDestination(
  db: D1Database,
  destinationUrl: string,
): Promise<boolean> {
  let host: string
  try {
    host = new URL(destinationUrl).hostname
  } catch {
    return true
  }

  const candidates = domainCandidates(host)
  if (candidates.length === 0) return false

  const marks = candidates.map(() => '?').join(', ')
  const row = await db
    .prepare(`SELECT 1 AS found FROM blocked_domains WHERE domain IN (${marks}) LIMIT 1`)
    .bind(...candidates)
    .first()
  return row !== null
}