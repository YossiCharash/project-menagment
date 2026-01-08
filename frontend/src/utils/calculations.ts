
export const CATEGORY_LABELS: Record<string, string> = {
  CLEANING: 'ניקיון',
  'ניקיון': 'ניקיון',
  ELECTRICITY: 'חשמל',
  'חשמל': 'חשמל',
  INSURANCE: 'ביטוח',
  'ביטוח': 'ביטוח',
  GARDENING: 'גינון',
  'גינון': 'גינון',
  OTHER: 'אחר',
  'אחר': 'אחר'
}

// Reverse mapping: Hebrew to English (for filtering)
export const CATEGORY_REVERSE_MAP: Record<string, string> = {
  'ניקיון': 'CLEANING',
  'חשמל': 'ELECTRICITY',
  'ביטוח': 'INSURANCE',
  'גינון': 'GARDENING',
  'אחר': 'OTHER',
  'תחזוקה': 'MAINTENANCE'
}

export const normalizeCategoryForFilter = (category: string | null | undefined): string | null => {
  if (!category) return null
  const trimmed = String(category).trim()
  if (trimmed.length === 0) return null
  
  // If it's already in English (uppercase), return as is
  // Check if all characters are uppercase letters (English enum values)
  if (trimmed === trimmed.toUpperCase() && /^[A-Z_]+$/.test(trimmed)) {
    return trimmed
  }
  
  // If it's in Hebrew, try to convert to English
  if (CATEGORY_REVERSE_MAP[trimmed]) {
    return CATEGORY_REVERSE_MAP[trimmed]
  }
  
  // Otherwise return as is (might be a custom category)
  return trimmed
}

export const calculateMonthlyIncomeAccrual = (monthlyIncome: number, incomeStartDate: Date, currentDate: Date): number => {
  if (monthlyIncome <= 0) return 0
  if (incomeStartDate.getTime() > currentDate.getTime()) return 0

  // Income accrues on the same day of month as the start date
  // First occurrence is on the start date itself
  const firstOccurrence = new Date(incomeStartDate.getTime())
  const originalDay = firstOccurrence.getDate()
  
  if (firstOccurrence.getTime() > currentDate.getTime()) return 0

  // Calculate how many monthly occurrences have passed from firstOccurrence to currentDate
  // Count occurrences on the same day of month (or last day of month if day doesn't exist)
  let occurrences = 0
  let occurrenceDate = new Date(firstOccurrence.getTime())
  
  // Count all occurrences from start date to current date (inclusive)
  while (occurrenceDate.getTime() <= currentDate.getTime()) {
    occurrences++
    
    // Calculate next occurrence date
    const nextMonth = occurrenceDate.getMonth() + 1
    const nextYear = occurrenceDate.getFullYear()
    
    // Try to use the original day of month, but handle edge cases
    let nextOccurrence: Date
    if (nextMonth === 12) {
      nextOccurrence = new Date(nextYear + 1, 0, originalDay)
    } else {
      nextOccurrence = new Date(nextYear, nextMonth, originalDay)
    }
    
    // If day doesn't exist in this month (e.g., 31st in February), use last day of month
    if (nextOccurrence.getDate() !== originalDay) {
      // Use last day of month
      if (nextMonth === 12) {
        nextOccurrence = new Date(nextYear + 1, 0, 0) // Last day of December
      } else {
        nextOccurrence = new Date(nextYear, nextMonth + 1, 0) // Last day of next month
      }
    }
    
    // Move to next occurrence for next iteration
    occurrenceDate = nextOccurrence
  }

  return monthlyIncome * occurrences
}

