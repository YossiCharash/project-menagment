import { useState, useCallback } from 'react'
import api from '../../lib/api'
import type { TaskLabelType } from '../../pages/TaskCalendar'

interface UseDeleteTaskLabelOptions {
  onDeleted: (labelId: number) => void
  onError?: (message: string) => void
}

export function useDeleteTaskLabel({ onDeleted, onError }: UseDeleteTaskLabelOptions) {
  const [deletingLabelId, setDeletingLabelId] = useState<number | null>(null)

  const requestDeleteLabel = useCallback(async (label: TaskLabelType) => {
    if (deletingLabelId !== null) return
    let taskCount = 0
    try {
      const { data } = await api.get<{ task_count: number }>(`/tasks/labels/${label.id}/usage`)
      taskCount = data.task_count
    } catch {
      // If the usage check fails, fall through to a generic confirmation.
    }
    const confirmMessage =
      taskCount > 0
        ? `ללייבל "${label.name}" משויכות ${taskCount} משימות. מחיקת הלייבל תסיר אותו מכל המשימות האלה. להמשיך?`
        : `למחוק את הלייבל "${label.name}"?`
    if (!window.confirm(confirmMessage)) return
    setDeletingLabelId(label.id)
    try {
      await api.delete(`/tasks/labels/${label.id}`)
      onDeleted(label.id)
    } catch (err: any) {
      const message = err?.response?.data?.detail ?? 'שגיאה במחיקת הלייבל'
      if (onError) onError(message)
      else window.alert(message)
    } finally {
      setDeletingLabelId(null)
    }
  }, [deletingLabelId, onDeleted, onError])

  return { requestDeleteLabel, deletingLabelId }
}
