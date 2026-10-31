export function parseId(value: string): number | null {
  return /^[1-9][0-9]{0,9}$/.test(value) ? Number(value) : null
}