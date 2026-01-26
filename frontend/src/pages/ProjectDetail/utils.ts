import { parseLocalDate } from '../../lib/utils'
import { Transaction, SplitTransaction } from './types'

// Helper to safely get category name whether it's a string or an object
export const getCategoryName = (category: any): string => {
  if (!category) return '';
  if (typeof category === 'object' && category.name) {
    return category.name;
  }
  return String(category);
}

// Helper function to split period transactions by month
export const splitPeriodTransactionByMonth = (tx: Transaction): SplitTransaction[] => {
  if (!tx.period_start_date || !tx.period_end_date) {
    // Not a period transaction, return as-is
    const txDate = parseLocalDate(tx.tx_date) || new Date()
    const monthKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`
    return [{
      ...tx,
      monthKey,
      proportionalAmount: tx.amount,
      fullAmount: tx.amount,
      daysInMonth: 0,
      totalDays: 0
    }]
  }

  // Normalize dates to work with date-only (no time component)
  const startDate = parseLocalDate(tx.period_start_date) || new Date()
  startDate.setHours(0, 0, 0, 0)
  const endDate = parseLocalDate(tx.period_end_date) || new Date()
  endDate.setHours(23, 59, 59, 999) // Set to end of day to include the full last day
  
  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
  
  if (totalDays <= 0) {
    // Invalid period, return as-is
    const txDate = parseLocalDate(tx.tx_date) || new Date()
    const monthKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`
    return [{
      ...tx,
      monthKey,
      proportionalAmount: tx.amount,
      fullAmount: tx.amount,
      daysInMonth: 0,
      totalDays: 0
    }]
  }

  const dailyRate = tx.amount / totalDays
  const splits: SplitTransaction[] = []
  
  // Iterate through each month in the period
  // Start from the first day of the start date's month
  const startYear = startDate.getFullYear()
  const startMonth = startDate.getMonth()
  const current = new Date(startYear, startMonth, 1)
  current.setHours(0, 0, 0, 0)
  
  // Create a date for the end of the period month to compare
  const endYear = endDate.getFullYear()
  const endMonth = endDate.getMonth()
  const periodEndMonth = new Date(endYear, endMonth + 1, 0) // Last day of end date's month
  periodEndMonth.setHours(23, 59, 59, 999)
  
  while (current <= periodEndMonth) {
    const year = current.getFullYear()
    const month = current.getMonth()
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
    
    // Calculate the first and last day of this month that are within the period
    const monthStart = new Date(year, month, 1)
    monthStart.setHours(0, 0, 0, 0)
    const monthEnd = new Date(year, month + 1, 0) // Last day of month
    monthEnd.setHours(23, 59, 59, 999) // Set to end of day
    
    // Calculate overlap between transaction period and this month
    // Use getTime() for accurate comparison
    const overlapStartTime = Math.max(startDate.getTime(), monthStart.getTime())
    const overlapEndTime = Math.min(endDate.getTime(), monthEnd.getTime())
    
    // Check if there's any overlap at all (even if it's just one day)
    if (overlapStartTime <= overlapEndTime) {
      // Calculate days including both start and end dates
      // The difference in milliseconds divided by milliseconds per day, plus 1 to include both days
      let daysInMonth = Math.floor((overlapEndTime - overlapStartTime) / (1000 * 60 * 60 * 24)) + 1
      
      // Ensure we have at least 1 day if there's any overlap
      // This handles edge cases where the period starts and ends on the same day of the month
      if (daysInMonth <= 0) {
        daysInMonth = 1
      }
      
      // Additional check: if startDate is exactly on the first day of the month, ensure we count it
      if (startDate.getTime() === monthStart.getTime() && daysInMonth === 0) {
        daysInMonth = 1
      }
      
      const proportionalAmount = dailyRate * daysInMonth
      
      splits.push({
        ...tx,
        monthKey,
        proportionalAmount,
        fullAmount: tx.amount,
        daysInMonth,
        totalDays
      })
    }
    
    // Move to next month - use setMonth to handle year overflow correctly
    if (month === 11) {
      // December -> January of next year
      current.setFullYear(year + 1)
      current.setMonth(0)
    } else {
      current.setMonth(month + 1)
    }
    current.setDate(1)
    current.setHours(0, 0, 0, 0)
  }
  
  // Normalize to ensure sum equals original amount (fix rounding errors)
  if (splits.length > 0) {
    const totalProportional = splits.reduce((sum, split) => sum + split.proportionalAmount, 0)
    const difference = tx.amount - totalProportional
    
    // Adjust the last split to account for any rounding differences
    if (Math.abs(difference) > 0.0001) {
      splits[splits.length - 1].proportionalAmount += difference
    }
  }
  
  return splits
}

export const formatCurrency = (value: number | string | null | undefined) => {
  return Number(value || 0).toLocaleString('he-IL')
}

export const resolveFileUrl = (fileUrl: string | null | undefined): string | null => {
  if (!fileUrl) return null
  if (fileUrl.startsWith('http')) {
    return fileUrl
  }
  const apiUrl = import.meta.env.VITE_API_URL || ''
  // @ts-ignore
  const baseUrl = apiUrl ? apiUrl.replace('/api/v1', '') : ''
  return `${baseUrl}/uploads/${fileUrl}`
}
