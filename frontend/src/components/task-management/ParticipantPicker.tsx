import { useMemo } from 'react'
import type { UserForTask } from '../../pages/TaskCalendar'
import SearchableMultiSelect, { type ComboOption } from './SearchableMultiSelect'

export interface ParticipantPickerProps {
  /** Candidate users (mirrors /users/for-tasks; includes the current user). */
  users: UserForTask[]
  /** Currently selected participant ids. */
  selectedIds: number[]
  /** The task's assignees — they always attend, so excluded from the pickable list. */
  assigneeIds: number[]
  /** Emit the next set of selected participant ids. */
  onChange: (ids: number[]) => void
}

/**
 * Shared "participants" picker (משתתפים) used by BOTH the create and edit task
 * modals. Renders a searchable dropdown (via {@link SearchableMultiSelect}) of
 * every user except the assignees (an assignee always attends). Single
 * Responsibility: it only owns participant selection UI, never fetches or
 * persists.
 */
export default function ParticipantPicker({
  users,
  selectedIds,
  assigneeIds,
  onChange,
}: ParticipantPickerProps) {
  const options = useMemo<ComboOption[]>(
    () =>
      users
        .filter((user) => !assigneeIds.includes(user.id))
        .map((user) => ({ id: user.id, label: user.full_name })),
    [users, assigneeIds]
  )

  return (
    <SearchableMultiSelect
      label="משתתפים"
      options={options}
      selectedIds={selectedIds}
      onChange={onChange}
      placeholder="בחר משתתפים..."
      emptyText="אין משתתפים זמינים"
    />
  )
}
