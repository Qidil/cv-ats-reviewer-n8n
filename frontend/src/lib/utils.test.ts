import { describe, expect, it } from 'vitest'
import { parseRouteId } from './utils'

describe('parseRouteId', () => {
  it('parses a valid positive integer', () => {
    expect(parseRouteId('42')).toBe(42)
  })

  it('returns null for undefined', () => {
    expect(parseRouteId(undefined)).toBeNull()
  })

  it('returns null for non-numeric values', () => {
    expect(parseRouteId('abc')).toBeNull()
  })

  it('returns null for zero and negatives', () => {
    expect(parseRouteId('0')).toBeNull()
    expect(parseRouteId('-3')).toBeNull()
  })

  it('returns null for decimal values', () => {
    expect(parseRouteId('3.5')).toBeNull()
  })
})
