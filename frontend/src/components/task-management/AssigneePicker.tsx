import { cn } from '../../lib/utils'
import type { UserForTask } from '../../pages/TaskCalendar'

export interface AssigneePickerProps {
  /** Candidate users (mirrors /users/for-tasks; includes the current user). */
  users: UserForTask[]
  /** Currently selected assignee ids, ordered — the FIRST is the primary. */
  selectedIds: number[]
  /** Emit the next ordered set of selected assignee ids (primary first). */
  onChange: (ids: number[]) => void
}

/**
 * Multi-select "assignees" picker (מוקצים) used by BOTH the create and edit
 * task modals. Renders a toggle chip per user; selecting several assigns the
 * task to all of them (co-owners). The FIRST selected id is the PRIMARY
 * assignee (it drives the task's color/legacy single-assignee behaviour) and is
 * marked with a "ראשי" badge. Toggling appends/removes ids so the primary stays
 * the earliest still-selected user.
 *
 * Single Responsibility: it only owns assignee-selection UI — it never fetches
 * or persists.
 */
export default function AssigneePicker({ users, selectedIds, onChange }: AssigneePickerProps) {
  const primaryId = selectedIds[0] ?? null

  const toggle = (userId: number) => {
    if (selectedIds.includes(userId)) {
      onChange(selectedIds.filter((id) => id !== userId))
    } else {
      onChange([...selectedIds, userId])
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        מוקצים <span className="text-red-500">*</span>
      </label>
      {users.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">אין משתמשים זמינים</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {users.map((user) => {
            const isSelected = selectedIds.includes(user.id)
            const isPrimary = user.id === primaryId
            return (
              <label
                key={user.id}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border cursor-pointer transition-colors',
                  isSelected
                    ? 'border-transparent bg-blue-600 text-white'
                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                )}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(user.id)}
                  className="sr-only"
                />
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0',
                    isSelected ? 'bg-white/80' : 'bg-gray-400 dark:bg-gray-500'
                  )}
                />
                {user.full_name}
                {isPrimary && (
                  <span className="ml-0.5 px-1 rounded bg-white/25 text-[10px] leading-4">ראשי</span>
                )}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
