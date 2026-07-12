import { useMemo, useState, useCallback } from 'react'
import { Tag } from 'lucide-react'
import api from '../../lib/api'
import type { TaskLabelType } from '../../pages/TaskCalendar'
import SearchableMultiSelect, { type ComboOption } from './SearchableMultiSelect'
import { useDeleteTaskLabel } from './useDeleteTaskLabel'

const DEFAULT_NEW_LABEL_COLOR = '#3B82F6'

export interface LabelPickerProps {
  /** All existing labels (mirrors /tasks/labels). */
  labels: TaskLabelType[]
  /** Currently selected label ids. */
  selectedIds: number[]
  /** Emit the next set of selected label ids. */
  onChange: (ids: number[]) => void
  /** Called after the label set changes (create/delete) so the parent refetches. */
  onLabelsChanged?: () => void
}

/**
 * Searchable labels picker (לייבלים) shared by the create and edit task modals.
 * Wraps {@link SearchableMultiSelect}: the user types to filter, and when the
 * typed text matches no existing label a "create" row appears (with a color
 * swatch) that adds the label on the spot. Each dropdown row also offers a
 * delete action. Single Responsibility: it owns label selection + the label
 * create/delete side effects, keeping both modals free of duplicated logic.
 */
export default function LabelPicker({ labels, selectedIds, onChange, onLabelsChanged }: LabelPickerProps) {
  const [newColor, setNewColor] = useState(DEFAULT_NEW_LABEL_COLOR)
  const [creating, setCreating] = useState(false)

  const options = useMemo<ComboOption[]>(
    () => labels.map((label) => ({ id: label.id, label: label.name, color: label.color })),
    [labels]
  )

  const { requestDeleteLabel, deletingLabelId } = useDeleteTaskLabel({
    onDeleted: (labelId) => {
      onChange(selectedIds.filter((id) => id !== labelId))
      onLabelsChanged?.()
    },
  })

  const handleCreate = useCallback(
    async (name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      setCreating(true)
      try {
        const color = newColor.startsWith('#') ? newColor : `#${newColor}`
        const { data } = await api.post<TaskLabelType>('/tasks/labels', {
          name: trimmed,
          color: color || DEFAULT_NEW_LABEL_COLOR,
        })
        onChange([...selectedIds, data.id])
        setNewColor(DEFAULT_NEW_LABEL_COLOR)
        onLabelsChanged?.()
      } catch (err) {
        console.error('Failed to create label:', err)
      } finally {
        setCreating(false)
      }
    },
    [newColor, selectedIds, onChange, onLabelsChanged]
  )

  const handleDelete = useCallback(
    (labelId: number) => {
      const label = labels.find((candidate) => candidate.id === labelId)
      if (label) void requestDeleteLabel(label)
    },
    [labels, requestDeleteLabel]
  )

  return (
    <div>
      <div className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        <Tag className="w-3.5 h-3.5" /> לייבלים
      </div>
      <SearchableMultiSelect
        label=""
        options={options}
        selectedIds={selectedIds}
        onChange={onChange}
        placeholder="בחר או הקלד לייבל..."
        emptyText="אין לייבלים עדיין — הקלד כדי ליצור"
        onCreateOption={handleCreate}
        createLabel={(name) => `צור לייבל "${name}"`}
        createColor={newColor}
        onCreateColorChange={setNewColor}
        creating={creating}
        onDeleteOption={handleDelete}
        deletingId={deletingLabelId}
      />
    </div>
  )
}
