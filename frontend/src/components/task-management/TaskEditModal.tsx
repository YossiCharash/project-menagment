import { useState, useEffect, useRef, useCallback } from 'react'
import api, { fileAttachmentUrl } from '../../lib/api'
import Modal from '../Modal'
import { Tag, Paperclip, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import type {
  Task,
  TaskStatus,
  TaskLabelType,
  RecurrenceRule,
  MonthlyMode,
  RecurrenceEndMode,
  UserForTask,
} from '../../pages/TaskCalendar'
import {
  buildRecurrencePayload,
  RecurrenceEditor,
  TASK_STATUS_LABELS,
} from '../../pages/TaskCalendar'
import { useDeleteTaskLabel } from './useDeleteTaskLabel'
import AttachmentView from './AttachmentView'
import RecordButton from './RecordButton'
import ParticipantPicker from './ParticipantPicker'

/**
 * The three mutually-exclusive scheduling shapes a task can take while editing,
 * mirroring the Task Calendar's own edit form:
 *  - with_time: a timed event (start/end datetime)
 *  - date_only: a date-only task (00:00–23:59 of one day)
 *  - no_date: a task with no date at all
 */
type EditTaskType = 'with_time' | 'date_only' | 'no_date'

/** Local shape of the edit form — identical to the calendar's inline form. */
interface EditTaskForm {
  title: string
  date: string
  start_time: string
  end_time: string
  description: string
  status: TaskStatus
  assigned_to_user_id: string
  recurrence_rule: RecurrenceRule
  recurrence_interval: number
  recurrence_weekdays: number[]
  recurrence_monthly_mode: MonthlyMode
  recurrence_end_mode: RecurrenceEndMode
  recurrence_end_date: string
  recurrence_count: string
  label_ids: number[]
  participant_ids: number[]
  requires_closure_approval: boolean
}

const DEFAULT_TASK_DURATION_MINUTES = 30

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatLocalDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function addMinutesToLocalDateTime(localDateTime: string, minutes: number): string {
  if (!localDateTime) return ''
  const parsed = new Date(localDateTime)
  if (Number.isNaN(parsed.getTime())) return ''
  parsed.setMinutes(parsed.getMinutes() + minutes)
  return formatLocalDateTime(parsed)
}

/** Parse a "0,2,4" weekday string into a sorted unique number[] (0–6). */
function parseWeekdays(value: string | null | undefined): number[] {
  if (!value) return []
  return Array.from(
    new Set(
      String(value)
        .split(',')
        .map((part) => parseInt(part.trim(), 10))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    )
  ).sort((a, b) => a - b)
}

/**
 * Derive the edit form's initial state from an existing task, mirroring the
 * Task Calendar's `openEditModal` seeding logic exactly (task-type detection,
 * recurrence normalization, label/participant extraction).
 */
function seedFormFromTask(task: Task): { form: EditTaskForm; taskType: EditTaskType } {
  const hasDates = !!task.start_time && !!task.end_time
  const start = task.start_time ? new Date(task.start_time) : new Date()
  const end = task.end_time ? new Date(task.end_time) : new Date()
  const isWithTime =
    hasDates && !(start.getHours() === 0 && start.getMinutes() === 0 && end.getHours() === 23 && end.getMinutes() === 59)
  const taskType: EditTaskType = hasDates ? (isWithTime ? 'with_time' : 'date_only') : 'no_date'

  const validRules: RecurrenceRule[] = ['daily', 'weekly', 'monthly', 'yearly']
  const recRule = validRules.includes((task.recurrence_rule || '') as RecurrenceRule)
    ? (task.recurrence_rule as RecurrenceRule)
    : ''
  const recEnd = task.recurrence_end_date ? task.recurrence_end_date.slice(0, 10) : ''
  const recCount = task.recurrence_count && task.recurrence_count > 0 ? task.recurrence_count : null
  const recEndMode: RecurrenceEndMode = recCount ? 'count' : recEnd ? 'date' : 'never'

  const form: EditTaskForm = {
    title: task.title,
    date: hasDates ? `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}` : '',
    start_time: hasDates ? formatLocalDateTime(start) : '',
    end_time: hasDates ? formatLocalDateTime(end) : '',
    description: task.description || '',
    status: (task.status || 'pending') as TaskStatus,
    assigned_to_user_id: String(task.assigned_to_user_id),
    recurrence_rule: recRule,
    recurrence_interval: task.recurrence_interval && task.recurrence_interval > 1 ? task.recurrence_interval : 1,
    recurrence_weekdays: parseWeekdays(task.recurrence_weekdays),
    recurrence_monthly_mode: task.recurrence_monthly_mode === 'day_of_week' ? 'day_of_week' : 'day_of_month',
    recurrence_end_mode: recEndMode,
    recurrence_end_date: recEnd,
    recurrence_count: recCount ? String(recCount) : '',
    label_ids: task.labels?.map((l) => l.id) ?? [],
    participant_ids: task.participants?.map((p) => p.user_id) ?? [],
    requires_closure_approval: task.requires_closure_approval ?? false,
  }
  return { form, taskType }
}

export interface TaskEditModalProps {
  /** The task being edited. When null the modal renders nothing. */
  task: Task | null
  isOpen: boolean
  onClose: () => void
  /** Assignee directory (mirrors /users/for-tasks). */
  users: UserForTask[]
  /** Existing labels; the modal can also create new ones. */
  taskLabels: TaskLabelType[]
  /** Called after the task is saved successfully (parent refetches). */
  onSaved: () => void
  /** Called when the label set changed (create/delete) so the parent can refetch. */
  onLabelsChanged?: () => void
}

/**
 * Shared "edit task" modal used by BOTH the Task Calendar and the Building
 * Reception Desk. It owns its own form/recurrence/attachment state, seeds
 * itself from the incoming `task`, and performs the update request itself
 * (PUT /tasks/{id}), keeping the two call sites free of duplicated
 * task-editing logic (DRY / Single Responsibility).
 */
export default function TaskEditModal({
  task,
  isOpen,
  onClose,
  users,
  taskLabels,
  onSaved,
  onLabelsChanged,
}: TaskEditModalProps) {
  // A local copy of the task being edited so attachment add/delete can mutate
  // the shown attachments without depending on the parent re-passing `task`.
  const [editingTask, setEditingTask] = useState<Task | null>(task)
  const [editForm, setEditForm] = useState<EditTaskForm | null>(null)
  const [editTaskType, setEditTaskType] = useState<EditTaskType>('date_only')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editUploadingAttachment, setEditUploadingAttachment] = useState(false)
  const [editDeletingAttachmentId, setEditDeletingAttachmentId] = useState<number | null>(null)
  const editFileInputRef = useRef<HTMLInputElement>(null)

  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState('#3B82F6')
  const [addingLabel, setAddingLabel] = useState(false)

  const { requestDeleteLabel, deletingLabelId } = useDeleteTaskLabel({
    onDeleted: (labelId) => {
      setEditForm((form) => (form ? { ...form, label_ids: form.label_ids.filter((id) => id !== labelId) } : form))
      onLabelsChanged?.()
    },
  })

  // Seed the form each time the modal opens for a (new) task, mirroring the
  // Task Calendar's `openEditModal` seeding logic.
  useEffect(() => {
    if (!isOpen || !task) return
    const { form, taskType } = seedFormFromTask(task)
    setEditingTask(task)
    setEditForm(form)
    setEditTaskType(taskType)
    setEditError(null)
    setNewLabelName('')
    setNewLabelColor('#3B82F6')
    if (editFileInputRef.current) editFileInputRef.current.value = ''
  }, [isOpen, task])

  const handleCreateLabel = useCallback(async () => {
    const name = newLabelName.trim()
    if (!name) return
    setAddingLabel(true)
    try {
      const color = newLabelColor.startsWith('#') ? newLabelColor : `#${newLabelColor}`
      const { data } = await api.post<TaskLabelType>('/tasks/labels', { name, color: color || '#3B82F6' })
      setEditForm((form) => (form ? { ...form, label_ids: [...form.label_ids, data.id] } : form))
      setNewLabelName('')
      setNewLabelColor('#3B82F6')
      onLabelsChanged?.()
    } catch (err) {
      console.error('Failed to create label:', err)
    } finally {
      setAddingLabel(false)
    }
  }, [newLabelName, newLabelColor, onLabelsChanged])

  const uploadEditAttachments = useCallback(async (files: File[]) => {
    if (!editingTask || files.length === 0) return
    setEditUploadingAttachment(true)
    try {
      for (const file of files) {
        const formData = new FormData()
        formData.append('file', file)
        await api.post(`/tasks/${editingTask.id}/attachments`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }
      const { data } = await api.get<Task>(`/tasks/${editingTask.id}`)
      setEditingTask(data)
      if (editFileInputRef.current) editFileInputRef.current.value = ''
    } catch (err) {
      console.error('Failed to upload attachment:', err)
    } finally {
      setEditUploadingAttachment(false)
    }
  }, [editingTask])

  const handleEditAddAttachment = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) return
    await uploadEditAttachments(Array.from(event.target.files))
  }

  const handleEditDeleteAttachment = async (attachmentId: number) => {
    if (!editingTask) return
    setEditDeletingAttachmentId(attachmentId)
    try {
      await api.delete(`/tasks/${editingTask.id}/attachments/${attachmentId}`)
      setEditingTask((current) =>
        current ? { ...current, attachments: current.attachments?.filter((a) => a.id !== attachmentId) ?? [] } : null
      )
    } catch (err) {
      console.error('Failed to delete attachment:', err)
    } finally {
      setEditDeletingAttachmentId(null)
    }
  }

  const handleEditSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editingTask || !editForm) return
    setEditError(null)
    if (!editForm.title.trim() || !editForm.assigned_to_user_id) {
      setEditError('נא למלא את כל השדות החובה')
      return
    }
    let start_time: string | null | undefined = undefined
    let end_time: string | null | undefined = undefined
    if (editTaskType === 'with_time' && editForm.start_time?.trim() && editForm.end_time?.trim()) {
      let startStr = editForm.start_time.trim()
      let endStr = editForm.end_time.trim()
      if (startStr.length === 16) startStr += ':00'
      if (endStr.length === 16) endStr += ':00'
      if (new Date(startStr) >= new Date(endStr)) {
        setEditError('שעת הסיום חייבת להיות אחרי שעת ההתחלה')
        return
      }
      start_time = startStr
      end_time = endStr
    } else if (editTaskType === 'date_only' && editForm.date) {
      start_time = `${editForm.date}T00:00:00`
      end_time = `${editForm.date}T23:59:59`
    } else {
      start_time = null
      end_time = null
    }
    // No-date tasks can't recur; otherwise use the chosen recurrence settings.
    const recurrence = editTaskType === 'no_date'
      ? buildRecurrencePayload({ ...editForm, recurrence_rule: '' })
      : buildRecurrencePayload(editForm)
    setEditSaving(true)
    try {
      await api.put(`/tasks/${editingTask.id}`, {
        title: editForm.title.trim(),
        start_time: start_time,
        end_time: end_time,
        description: editForm.description || undefined,
        status: editForm.status,
        event_type: 'task',
        assigned_to_user_id: Number(editForm.assigned_to_user_id),
        label_ids: editForm.label_ids,
        participant_ids: editForm.participant_ids,
        ...recurrence,
        requires_closure_approval: editForm.requires_closure_approval,
      })
      onSaved()
      onClose()
    } catch (err: any) {
      setEditError(err.response?.data?.detail ?? 'שגיאה בעדכון משימה')
    } finally {
      setEditSaving(false)
    }
  }

  if (!isOpen || !editingTask || !editForm) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="עריכת משימה">
      <form onSubmit={handleEditSave} className="space-y-4">
        {editError && <p className="text-sm text-red-600 dark:text-red-400">{editError}</p>}
        <div>
          <label htmlFor="edit-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">כותרת</label>
          <input
            id="edit-title"
            name="edit-title"
            type="text"
            value={editForm.title}
            onChange={(e) => setEditForm((f) => (f ? { ...f, title: e.target.value } : f))}
            className={cn(
              'w-full px-3 py-2 border rounded-lg',
              'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
            )}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תזמון</label>
          <div className="flex gap-4 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="editTaskType" checked={editTaskType === 'with_time'} onChange={() => setEditTaskType('with_time')} />
              <span>עם שעה</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="editTaskType" checked={editTaskType === 'date_only'} onChange={() => setEditTaskType('date_only')} />
              <span>בלי שעה</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="editTaskType" checked={editTaskType === 'no_date'} onChange={() => setEditTaskType('no_date')} />
              <span>בלי תאריך</span>
            </label>
          </div>
        </div>
        <div>
          <label htmlFor="edit-status" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מצב משימה</label>
          <select
            id="edit-status"
            name="edit-status"
            value={editForm.status}
            onChange={(e) => setEditForm((f) => (f ? { ...f, status: e.target.value as TaskStatus } : f))}
            className={cn(
              'w-full px-3 py-2 border rounded-lg',
              'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
            )}
          >
            {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((s) => (
              <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="edit-assigned" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מוקצה למשתמש</label>
          <select
            id="edit-assigned"
            name="edit-assigned"
            value={editForm.assigned_to_user_id}
            onChange={(e) => {
              const nextAssignee = e.target.value
              const nextAssigneeId = nextAssignee ? Number(nextAssignee) : null
              setEditForm((f) =>
                f
                  ? {
                      ...f,
                      assigned_to_user_id: nextAssignee,
                      // An assignee is never also a participant.
                      participant_ids:
                        nextAssigneeId != null
                          ? f.participant_ids.filter((id) => id !== nextAssigneeId)
                          : f.participant_ids,
                    }
                  : f
              )
            }}
            className={cn(
              'w-full px-3 py-2 border rounded-lg',
              'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
            )}
            required
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name}</option>
            ))}
          </select>
        </div>
        <ParticipantPicker
          users={users}
          selectedIds={editForm.participant_ids}
          assigneeId={editForm.assigned_to_user_id ? Number(editForm.assigned_to_user_id) : null}
          onChange={(ids) => setEditForm((f) => (f ? { ...f, participant_ids: ids } : f))}
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
            <Tag className="w-4 h-4" />
            לייבלים
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {taskLabels.map((l) => (
              <span key={l.id} className="inline-flex items-center gap-0.5">
                <label
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm border cursor-pointer transition-colors',
                    editForm.label_ids.includes(l.id)
                      ? 'border-transparent text-white'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  )}
                  style={editForm.label_ids.includes(l.id) ? { backgroundColor: l.color } : undefined}
                >
                  <input
                    type="checkbox"
                    checked={editForm.label_ids.includes(l.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setEditForm((f) => (f ? { ...f, label_ids: [...f.label_ids, l.id] } : f))
                      } else {
                        setEditForm((f) => (f ? { ...f, label_ids: f.label_ids.filter((id) => id !== l.id) } : f))
                      }
                    }}
                    className="sr-only"
                  />
                  <span className="w-2 h-2 rounded-full bg-white/80 flex-shrink-0" style={editForm.label_ids.includes(l.id) ? {} : { backgroundColor: l.color }} />
                  {l.name}
                </label>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); requestDeleteLabel(l) }}
                  disabled={deletingLabelId === l.id}
                  title="מחק לייבל"
                  className="p-0.5 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="edit-new-label-name"
              name="edit-new-label-name"
              type="text"
              placeholder="שם לייבל חדש"
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              aria-label="שם לייבל חדש"
              className={cn(
                'px-3 py-1.5 border rounded-lg text-sm w-32',
                'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
              )}
            />
            <input
              id="edit-new-label-color"
              name="edit-new-label-color"
              type="color"
              value={newLabelColor}
              onChange={(e) => setNewLabelColor(e.target.value)}
              aria-label="צבע לייבל חדש"
              className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer bg-transparent"
            />
            <button
              type="button"
              onClick={handleCreateLabel}
              disabled={addingLabel || !newLabelName.trim()}
              className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-600 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50"
            >
              {addingLabel ? '...' : 'הוסף לייבל'}
            </button>
          </div>
        </div>
        {editTaskType === 'with_time' && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="edit-start-time" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">משעה *</label>
                <input
                  id="edit-start-time"
                  name="edit-start-time"
                  type="datetime-local"
                  value={editForm.start_time}
                  onChange={(e) => {
                    const newStart = e.target.value
                    setEditForm((f) => (f ? { ...f, start_time: newStart, end_time: newStart ? addMinutesToLocalDateTime(newStart, DEFAULT_TASK_DURATION_MINUTES) : f.end_time } : f))
                  }}
                  className={cn(
                    'w-full px-3 py-2 border rounded-lg',
                    'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                  )}
                />
              </div>
              <div>
                <label htmlFor="edit-end-time" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">עד שעה *</label>
                <input
                  id="edit-end-time"
                  name="edit-end-time"
                  type="datetime-local"
                  value={editForm.end_time}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, end_time: e.target.value } : f))}
                  className={cn(
                    'w-full px-3 py-2 border rounded-lg',
                    'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                  )}
                />
              </div>
            </div>
          </div>
        )}
        {editTaskType === 'date_only' && (
          <div>
            <label htmlFor="edit-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תאריך (משימה)</label>
            <input
              id="edit-date"
              name="edit-date"
              type="date"
              value={editForm.date}
              onChange={(e) => setEditForm((f) => (f ? { ...f, date: e.target.value } : f))}
              className={cn(
                'w-full px-3 py-2 border rounded-lg',
                'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
              )}
            />
          </div>
        )}
        {editTaskType !== 'no_date' && (editForm.start_time || editForm.date) && (
          <RecurrenceEditor
            idPrefix="edit"
            value={editForm}
            onChange={(patch) => setEditForm((f) => (f ? { ...f, ...patch } : f))}
            startDate={
              editForm.start_time
                ? new Date(editForm.start_time)
                : editForm.date
                  ? new Date(`${editForm.date}T00:00:00`)
                  : null
            }
          />
        )}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
            <Paperclip className="w-3.5 h-3.5" /> קבצים / תמונות
          </label>
          <input
            id="edit-files"
            name="edit-files"
            ref={editFileInputRef}
            type="file"
            multiple
            accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
            onChange={handleEditAddAttachment}
            className="hidden"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => editFileInputRef.current?.click()}
              disabled={editUploadingAttachment}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              <Paperclip className="w-3.5 h-3.5" /> {editUploadingAttachment ? 'מעלה...' : 'הוסף קובץ'}
            </button>
            <RecordButton
              onRecorded={(file) => { void uploadEditAttachments([file]) }}
              disabled={editUploadingAttachment}
            />
            {(editingTask.attachments ?? []).map((att) => (
              <span key={att.id} className="inline-flex items-center gap-1">
                <AttachmentView
                  fileName={att.file_name}
                  fileUrl={fileAttachmentUrl(att.file_url)}
                />
                <button
                  type="button"
                  onClick={() => handleEditDeleteAttachment(att.id)}
                  disabled={editDeletingAttachmentId === att.id}
                  className="p-0.5 rounded hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50"
                  aria-label="מחק קובץ"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="edit-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תיאור</label>
          <textarea
            id="edit-description"
            name="edit-description"
            value={editForm.description}
            onChange={(e) => setEditForm((f) => (f ? { ...f, description: e.target.value } : f))}
            rows={2}
            className={cn(
              'w-full px-3 py-2 border rounded-lg text-sm',
              'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
            )}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="edit-requires-closure"
            checked={editForm.requires_closure_approval}
            onChange={(e) => setEditForm((f) => (f ? { ...f, requires_closure_approval: e.target.checked } : f))}
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600"
          />
          <label htmlFor="edit-requires-closure" className="text-sm text-gray-700 dark:text-gray-300">
            דורש אישור מנהל לסגירה
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            ביטול
          </button>
          <button
            type="submit"
            disabled={editSaving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
          >
            {editSaving ? 'שומר...' : 'שמור שינויים'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
