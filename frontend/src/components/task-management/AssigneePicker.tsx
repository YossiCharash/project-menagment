import { useMemo } from 'react'
import type { UserForTask } from '../../pages/TaskCalendar'
import SearchableMultiSelect, { type ComboOption } from './SearchableMultiSelect'

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
 * task modals. Renders a searchable dropdown (via {@link SearchableMultiSelect}):
 * the user types to filter and picks one or more assignees. The FIRST selected
 * id is the PRIMARY assignee (it drives the task's color/legacy single-assignee
 * behaviour) and is marked with a "ראשי" badge.
 *
 * Single Responsibility: it only owns assignee-selection UI — it never fetches
 * or persists.
 */
export default function AssigneePicker({ users, selectedIds, onChange }: AssigneePickerProps) {
  const options = useMemo<ComboOption[]>(
    () => users.map((user) => ({ id: user.id, label: user.full_name })),
    [users]
  )

  return (
    <SearchableMultiSelect
      label="מוקצים"
      required
      options={options}
      selectedIds={selectedIds}
      onChange={onChange}
      placeholder="בחר מוקצים..."
      emptyText="אין משתמשים זמינים"
      badgeForSelected={(_id, index) => (index === 0 ? 'ראשי' : undefined)}
    />
  )
}
