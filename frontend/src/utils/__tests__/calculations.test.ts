/**
 * Tests for calculation utilities
 */
import { describe, it, expect } from 'vitest'
import {
  normalizeCategoryForFilter,
  calculateMonthlyIncomeAccrual,
  CATEGORY_LABELS,
  CATEGORY_REVERSE_MAP,
} from '../calculations'

describe('Calculation Utilities', () => {
  describe('normalizeCategoryForFilter', () => {
    it('returns null for empty or undefined values', () => {
      expect(normalizeCategoryForFilter(null)).toBeNull()
      expect(normalizeCategoryForFilter(undefined)).toBeNull()
      expect(normalizeCategoryForFilter('')).toBeNull()
      expect(normalizeCategoryForFilter('   ')).toBeNull()
    })

    it('returns English enum values as is', () => {
      expect(normalizeCategoryForFilter('CLEANING')).toBe('CLEANING')
      expect(normalizeCategoryForFilter('ELECTRICITY')).toBe('ELECTRICITY')
    })

    it('converts Hebrew category names to English', () => {
      expect(normalizeCategoryForFilter('ניקיון')).toBe('CLEANING')
      expect(normalizeCategoryForFilter('חשמל')).toBe('ELECTRICITY')
      expect(normalizeCategoryForFilter('ביטוח')).toBe('INSURANCE')
    })

    it('handles custom categories', () => {
      const custom = normalizeCategoryForFilter('Custom Category')
      expect(custom).toBe('Custom Category')
    })
  })

  describe('calculateMonthlyIncomeAccrual', () => {
    it('returns 0 for zero or negative income', () => {
      const startDate = new Date('2024-01-15')
      const currentDate = new Date('2024-02-15')
      
      expect(calculateMonthlyIncomeAccrual(0, startDate, currentDate)).toBe(0)
      expect(calculateMonthlyIncomeAccrual(-100, startDate, currentDate)).toBe(0)
    })

    it('returns 0 if start date is in the future', () => {
      const startDate = new Date('2025-01-15')
      const currentDate = new Date('2024-01-15')
      
      expect(calculateMonthlyIncomeAccrual(1000, startDate, currentDate)).toBe(0)
    })

    it('calculates single occurrence correctly', () => {
      const startDate = new Date('2024-01-15')
      const currentDate = new Date('2024-01-15')
      
      expect(calculateMonthlyIncomeAccrual(1000, startDate, currentDate)).toBe(1000)
    })

    it('calculates multiple occurrences correctly', () => {
      const startDate = new Date('2024-01-15')
      const currentDate = new Date('2024-03-15')
      
      // Should have 3 occurrences: Jan, Feb, Mar
      expect(calculateMonthlyIncomeAccrual(1000, startDate, currentDate)).toBe(3000)
    })

    it('handles edge case of 31st day in months with fewer days', () => {
      const startDate = new Date('2024-01-31')
      const currentDate = new Date('2024-02-29') // 2024 is leap year
      
      // Should handle February correctly
      const result = calculateMonthlyIncomeAccrual(1000, startDate, currentDate)
      expect(result).toBeGreaterThan(0)
    })
  })

  describe('CATEGORY_LABELS', () => {
    it('contains expected category mappings', () => {
      expect(CATEGORY_LABELS.CLEANING).toBe('ניקיון')
      expect(CATEGORY_LABELS.ELECTRICITY).toBe('חשמל')
      expect(CATEGORY_LABELS.INSURANCE).toBe('ביטוח')
    })
  })

  describe('CATEGORY_REVERSE_MAP', () => {
    it('contains expected reverse mappings', () => {
      expect(CATEGORY_REVERSE_MAP['ניקיון']).toBe('CLEANING')
      expect(CATEGORY_REVERSE_MAP['חשמל']).toBe('ELECTRICITY')
      expect(CATEGORY_REVERSE_MAP['ביטוח']).toBe('INSURANCE')
    })
  })
})
