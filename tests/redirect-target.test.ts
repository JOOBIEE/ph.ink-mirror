import { describe, it, expect } from 'vitest'
import { ALLOWED_NEXT, safeNext } from '../src/lib/redirect-target'

describe('safeNext', () => {
  it.each([...ALLOWED_NEXT])('accepts %s', (path) => {
    expect(safeNext(path)).toBe(path)
  })

  it.each([
    [''],
    ['admin'],
    ['/admin/'],
    ['/admin?x=1'],
    ['/admin#top'],
    ['//evil.example'],
    ['https://evil.example'],
    ['/\\evil.example'],
    ['/ADMIN'],
    [' /admin'],
    ['/api/admin/overview'],
    ['/login'],
  ])('rejects %s', (value) => {
    expect(safeNext(value)).toBeNull()
  })

  it('rejects missing values', () => {
    expect(safeNext(null)).toBeNull()
    expect(safeNext(undefined)).toBeNull()
  })
})