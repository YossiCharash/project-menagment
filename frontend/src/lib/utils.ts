import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Design system colors and tokens
export const colors = {
  // Light mode colors
  light: {
    background: "hsl(0 0% 100%)",
    foreground: "hsl(222.2 84% 4.9%)",
    card: "hsl(0 0% 100%)",
    cardForeground: "hsl(222.2 84% 4.9%)",
    popover: "hsl(0 0% 100%)",
    popoverForeground: "hsl(222.2 84% 4.9%)",
    primary: "hsl(221.2 83.2% 53.3%)",
    primaryForeground: "hsl(210 40% 98%)",
    secondary: "hsl(210 40% 96%)",
    secondaryForeground: "hsl(222.2 84% 4.9%)",
    muted: "hsl(210 40% 96%)",
    mutedForeground: "hsl(215.4 16.3% 46.9%)",
    accent: "hsl(210 40% 96%)",
    accentForeground: "hsl(222.2 84% 4.9%)",
    destructive: "hsl(0 84.2% 60.2%)",
    destructiveForeground: "hsl(210 40% 98%)",
    border: "hsl(214.3 31.8% 91.4%)",
    input: "hsl(214.3 31.8% 91.4%)",
    ring: "hsl(221.2 83.2% 53.3%)",
    success: "hsl(142.1 76.2% 36.3%)",
    warning: "hsl(38 92% 50%)",
    info: "hsl(221.2 83.2% 53.3%)",
  },
  // Dark mode colors
  dark: {
    background: "hsl(222.2 84% 4.9%)",
    foreground: "hsl(210 40% 98%)",
    card: "hsl(222.2 84% 4.9%)",
    cardForeground: "hsl(210 40% 98%)",
    popover: "hsl(222.2 84% 4.9%)",
    popoverForeground: "hsl(210 40% 98%)",
    primary: "hsl(217.2 91.2% 59.8%)",
    primaryForeground: "hsl(222.2 84% 4.9%)",
    secondary: "hsl(217.2 32.6% 17.5%)",
    secondaryForeground: "hsl(210 40% 98%)",
    muted: "hsl(217.2 32.6% 17.5%)",
    mutedForeground: "hsl(215 20.2% 65.1%)",
    accent: "hsl(217.2 32.6% 17.5%)",
    accentForeground: "hsl(210 40% 98%)",
    destructive: "hsl(0 62.8% 30.6%)",
    destructiveForeground: "hsl(210 40% 98%)",
    border: "hsl(217.2 32.6% 17.5%)",
    input: "hsl(217.2 32.6% 17.5%)",
    ring: "hsl(224.3 76.3% 94.1%)",
    success: "hsl(142.1 70.6% 45.3%)",
    warning: "hsl(38 92% 50%)",
    info: "hsl(217.2 91.2% 59.8%)",
  }
}

export const spacing = {
  xs: "0.25rem",
  sm: "0.5rem",
  md: "1rem",
  lg: "1.5rem",
  xl: "2rem",
  "2xl": "3rem",
  "3xl": "4rem",
}

export const borderRadius = {
  none: "0px",
  sm: "0.125rem",
  md: "0.375rem",
  lg: "0.5rem",
  xl: "0.75rem",
  "2xl": "1rem",
  "3xl": "1.5rem",
  full: "9999px",
}

export const shadows = {
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.25)",
  inner: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)",
}

export const animations = {
  fast: "150ms",
  normal: "300ms",
  slow: "500ms",
  slower: "700ms",
}

/**
 * Parse a date string as a local date to avoid timezone issues.
 * Extracts the date part (YYYY-MM-DD) and creates a Date object at local midnight.
 * @param value - Date string (ISO format or date-only)
 * @returns Date object or null if invalid
 */
export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null
  
  try {
    // Always extract just the date part to avoid timezone issues
    // This handles both "2024-01-15" and "2024-01-15T22:00:00.000Z" formats
    let dateStr = value
    if (value.includes('T')) {
      dateStr = value.split('T')[0]
    }
    
    // Validate date format (YYYY-MM-DD)
    if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Try to parse as is for other formats
      const date = new Date(value)
      if (isNaN(date.getTime())) return null
      // Create local date from extracted parts
      return new Date(date.getFullYear(), date.getMonth(), date.getDate())
    }
    
    // Parse as local date to avoid timezone conversion
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    return isNaN(date.getTime()) ? null : date
  } catch {
    return null
  }
}

/**
 * Format a date string for display in Hebrew locale.
 * Handles timezone issues by always extracting the date part first (YYYY-MM-DD),
 * then parsing as a local date.
 * @param value - Date string (ISO format or date-only)
 * @param defaultValue - Default value to return if date is invalid or null
 * @param options - Optional Intl.DateTimeFormatOptions for custom formatting
 * @returns Formatted date string in Hebrew locale
 */
export function formatDate(
  value: string | null | undefined, 
  defaultValue: string = 'לא הוגדר',
  options?: Intl.DateTimeFormatOptions
): string {
  const date = parseLocalDate(value)
  if (!date) return defaultValue
  return date.toLocaleDateString('he-IL', options)
}

/**
 * Format a date string for use in HTML date input fields (YYYY-MM-DD format).
 * Extracts the date part from ISO strings to avoid timezone issues.
 * @param dateStr - Date string (ISO format or date-only)
 * @returns Date string in YYYY-MM-DD format, or empty string if invalid
 */
export function formatDateForInput(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  // If already in YYYY-MM-DD format, return as-is
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return dateStr
  // If in ISO format with time, extract date part
  if (dateStr.includes('T')) return dateStr.split('T')[0]
  // Otherwise, try to parse and format
  try {
    const date = new Date(dateStr)
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
  } catch {
    // If parsing fails, return as-is
  }
  return dateStr
}

/**
 * Convert a Date object to YYYY-MM-DD string using LOCAL time (not UTC).
 * This avoids timezone issues where toISOString() would shift the date back.
 * @param date - Date object
 * @returns Date string in YYYY-MM-DD format, or empty string if invalid
 */
export function dateToLocalString(date: Date | null | undefined): string {
  if (!date || isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}