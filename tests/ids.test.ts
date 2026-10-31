import { describe, it, expect } from 'vitest'
import { parseId } from '../src/lib/ids'

describe('parseId', () => {
  it('accepts ordinary ids', () => {
    expect(parseId('1')).toBe(1)
    expect(parseId('42')).toBe(42)
    expect(parseId('1234567890')).toBe(1234567890)
  })

  it('rejects everything else', () => {
    for (const bad of ['', '0', '01', '-1', '1.5', 'abc', '1;DROP', '12345678901', ' 1']) {
      expect(parseId(bad)).toBeNull()
    }
  })
})