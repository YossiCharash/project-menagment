import { cn } from '../../lib/utils'
import type { UserForTask } from '../../pages/TaskCalendar'

export interface ParticipantPickerProps {
  /** Candidate users (mirrors /users/for-tasks; includes the current user). */
  users: UserForTask[]
  /** Currently selected participant ids. */
  selectedIds: number[]
  /** The task's assignee — always attends, so excluded from the pickable list. */
  assigneeId: number | null
  /** Emit the next set of selected participant ids. */
  onChange: (ids: number[]) => void
}

/**
 * Shared "participants" picker used by BOTH the create and edit task modals.
 * Renders toggle chips (mirroring the modals' label-chip styling) for every
 * user except the assignee (the assignee always attends). Toggling a chip
 * adds/removes that user id from the selection (Single Responsibility: it only
 * owns participant selection UI, never fetches or persists).
 */
export default function ParticipantPicker({
  users,
  selectedIds,
  assigneeId,
  onChange,
}: ParticipantPickerProps) {
  const candidates = users.filter((user) => user.id !== assigneeId)

  const toggle = (userId: number) => {
    if (selectedIds.includes(userId)) {
      onChange(selectedIds.filter((id) => id !== userId))
    } else {
      onChange([...selectedIds, userId])
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">משתתפים</label>
      {candidates.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">אין משתתפים זמינים</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {candidates.map((user) => {
            const isSelected = selectedIds.includes(user.id)
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
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
