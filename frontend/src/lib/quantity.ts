/**
 * Display helpers for numeric quantity values that arrive from the backend as
 * Numeric strings (e.g. "5.0000"). These are presentation-only utilities — never
 * feed their output back into the API or into numeric comparisons.
 */

/**
 * Formats a quantity for display by stripping insignificant trailing zeros
 * (and a dangling decimal point).
 *
 * Examples: "5.0000" → "5", "2.5000" → "2.5", "0.25" → "0.25", 3 → "3".
 * Returns "" for null/undefined and the original string when it is not a finite
 * number (so non-numeric backend values pass through untouched).
 */
export function formatQuantity(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return String(value)
  // Normalise then strip trailing zeros / trailing decimal point.
  return String(parsed)
}
