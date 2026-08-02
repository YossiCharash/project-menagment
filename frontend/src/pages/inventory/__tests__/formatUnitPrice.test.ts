/**
 * Tests for formatUnitPrice — the consumable unit-price display helper.
 * Covers the unset/invalid branches and the ₪ two-decimal formatting.
 */
import { describe, it, expect } from 'vitest'
import { formatUnitPrice } from '../ConsumableViewModal'

describe('formatUnitPrice', () => {
  it('returns "-" when the price is unset', () => {
    expect(formatUnitPrice(null)).toBe('-')
    expect(formatUnitPrice('')).toBe('-')
  })

  it('returns "-" for a non-numeric value', () => {
    expect(formatUnitPrice('abc')).toBe('-')
  })

  it('formats a numeric price with a ₪ prefix and two decimals', () => {
    expect(formatUnitPrice('12.5')).toBe('₪12.50')
    expect(formatUnitPrice('0')).toBe('₪0.00')
  })

  it('formats thousands with grouping', () => {
    expect(formatUnitPrice('1234.5')).toBe('₪1,234.50')
  })
})
