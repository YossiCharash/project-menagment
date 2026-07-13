/**
 * Shared task edit-permission rule, kept in one place so every edit affordance
 * (the detail modal, the calendar popup, …) and the backend agree.
 *
 * A task may be edited by an Admin or by any assignee of the task — the primary
 * assignee (`assigned_to_user_id`) or a co-assignee (`assigned_to_user_ids`).
 * Participants (Outlook-style invitees) are not assignees and cannot edit; they
 * respond to accept/decline instead. This mirrors the backend `update_task`
 * access check.
 *
 * Structurally typed (no import of the page-local `Task`/`CurrentUser` types) so
 * it can be reused from anywhere without creating import cycles.
 */
export function canEditTask(
  task:
    | { assigned_to_user_id?: number | null; assigned_to_user_ids?: number[] | null }
    | null
    | undefined,
  user: { id?: number; role?: string } | null | undefined,
): boolean {
  if (!task || !user) return false
  if (user.role === 'Admin') return true
  if (user.id == null) return false
  if (task.assigned_to_user_id != null && task.assigned_to_user_id === user.id) return true
  return (task.assigned_to_user_ids ?? []).includes(user.id)
}
