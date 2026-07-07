/**
 * Human-readable task identifier derived from the task's numeric id.
 *
 * Single source of truth for the display-code format used across the task UI
 * (list table, detail modal, calendar cards). Pure function — no side effects.
 *
 * @example formatTaskCode(1)  // "ZP1"
 * @example formatTaskCode(42) // "ZP42"
 */
export function formatTaskCode(taskId: number): string {
  return `ZP${taskId}`
}
