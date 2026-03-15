import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../lib/api'
import Modal from '../Modal'
import { Tag, Paperclip, X, Zap } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { Task, TaskStatus, TaskLabelType, RecurrenceRule } from '../../pages/TaskCalendar'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'מחכה לטיפול',
  in_progress: 'בטיפול',
  completed: 'טופלה',
  pending_closure: 'ממתין לאישור סגירה',
}

const RECURRENCE_LABELS: Record<RecurrenceRule, string> = {
  '': 'ללא חזרות',
  weekly: 'כל שבוע',
  monthly: 'כל חודש',
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CreateEventModalProps {
  isOpen: boolean
  onClose: () => void
  initialEventType: 'meeting' | 'task'
  onCreated: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TaskTypeOption = 'meeting' | 'all_day' | 'no_date'

interface CreateForm {
  title: string
  date: string
  start_time: string
  end_time: string
  description: string
  status: TaskStatus
  assigned_to_user_id: string
  label_ids: number[]
  participant_ids: number[]
  recurrence_rule: RecurrenceRule
  recurrence_end_date: string
  is_super_task: boolean
  requires_closure_approval: boolean
}

const EMPTY_FORM: CreateForm = {
  title: '',
  date: '',
  start_time: '',
  end_time: '',
  description: '',
  status: 'pending',
  assigned_to_user_id: '',
  label_ids: [],
  participant_ids: [],
  recurrence_rule: '',
  recurrence_end_date: '',
  is_super_task: false,
  requires_closure_approval: false,
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function todayDateString(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function defaultMeetingTimes(): { start_time: string; end_time: string } {
  const now = new Date()
  const start = new Date(now)
  start.setHours(9, 0, 0, 0)
  const end = new Date(now)
  end.setHours(10, 0, 0, 0)
  return {
    start_time: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`,
    end_time: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`,
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CreateEventModal({ isOpen, onClose, initialEventType, onCreated }: CreateEventModalProps) {
  // -- Data fetched once --
  const [users, setUsers] = useState<Array<{ id: number; full_name: string }>>([])
  const [taskLabels, setTaskLabels] = useState<TaskLabelType[]>([])

  // -- Form state --
  const [createForm, setCreateForm] = useState<CreateForm>({ ...EMPTY_FORM })
  const [taskType, setTaskType] = useState<TaskTypeOption>('meeting')
  const [createSaving, setCreateSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createPendingFiles, setCreatePendingFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // -- Label creation --
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState('#3B82F6')
  const [addingLabel, setAddingLabel] = useState(false)

  // -- Fetch users & labels on mount --
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { data } = await api.get<Array<{ id: number; full_name: string }>>('/users/for-tasks')
        setUsers(data)
      } catch {
        setUsers([])
      }
    }
    const fetchLabels = async () => {
      try {
        const { data } = await api.get<TaskLabelType[]>('/tasks/labels')
        setTaskLabels(data)
      } catch {
        setTaskLabels([])
      }
    }
    fetchUsers()
    fetchLabels()
  }, [])

  // -- Reset form when modal opens --
  useEffect(() => {
    if (!isOpen) return

    setCreateError(null)
    setCreatePendingFiles([])
    setNewLabelName('')
    setNewLabelColor('#3B82F6')
    if (fileInputRef.current) fileInputRef.current.value = ''

    if (initialEventType === 'meeting') {
      const times = defaultMeetingTimes()
      setTaskType('meeting')
      setCreateForm({ ...EMPTY_FORM, start_time: times.start_time, end_time: times.end_time })
    } else {
      setTaskType('all_day')
      setCreateForm({ ...EMPTY_FORM, date: todayDateString() })
    }
  }, [isOpen, initialEventType])

  // -- Set task type with sensible defaults --
  const setTaskTypeWithDefaults = useCallback((type: TaskTypeOption) => {
    setTaskType(type)
    if (type === 'meeting') {
      const times = defaultMeetingTimes()
      setCreateForm(f => ({ ...f, start_time: times.start_time, end_time: times.end_time }))
    } else if (type === 'all_day') {
      setCreateForm(f => ({ ...f, date: todayDateString(), start_time: '', end_time: '' }))
    }
  }, [])

  // -- Close handler --
  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  // -- Create label --
  const handleCreateLabel = useCallback(async () => {
    const name = newLabelName.trim()
    if (!name) return
    setAddingLabel(true)
    try {
      const color = newLabelColor.startsWith('#') ? newLabelColor : `#${newLabelColor}`
      const { data } = await api.post<TaskLabelType>('/tasks/labels', { name, color: color || '#3B82F6' })
      setTaskLabels(prev => [...prev, data])
      setCreateForm(f => ({ ...f, label_ids: [...f.label_ids, data.id] }))
      setNewLabelName('')
      setNewLabelColor('#3B82F6')
    } catch (err) {
      console.error('Failed to create label:', err)
    } finally {
      setAddingLabel(false)
    }
  }, [newLabelName, newLabelColor])

  // -- Create event/task --
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)

    if (!createForm.title.trim() || !createForm.assigned_to_user_id) {
      setCreateError('נא למלא את כל השדות החובה')
      return
    }

    let start_time: string | undefined
    let end_time: string | undefined

    if (taskType === 'no_date') {
      start_time = undefined
      end_time = undefined
    } else if (taskType === 'all_day' && createForm.date) {
      start_time = `${createForm.date}T00:00:00`
      end_time = `${createForm.date}T23:59:59`
    } else if (taskType === 'meeting') {
      if (!createForm.start_time?.trim() || !createForm.end_time?.trim()) {
        setCreateError('לאירוע יש למלא תאריך ומשעה עד שעה')
        return
      }
      let startStr = createForm.start_time.trim()
      let endStr = createForm.end_time.trim()
      if (startStr.length === 16) startStr += ':00'
      if (endStr.length === 16) endStr += ':00'
      start_time = startStr
      end_time = endStr
      if (new Date(start_time) >= new Date(end_time)) {
        setCreateError('שעת הסיום (עד שעה) חייבת להיות אחרי שעת ההתחלה (משעה)')
        return
      }
    } else {
      setCreateError('נא למלא תאריך או שעות לפי סוג')
      return
    }

    setCreateSaving(true)
    try {
      const recurrence_rule = (taskType === 'no_date' ? '' : (createForm.recurrence_rule || '')) as RecurrenceRule
      const recurrence_end_date = recurrence_rule && createForm.recurrence_end_date?.trim() ? createForm.recurrence_end_date.trim() : null

      const { data: created } = await api.post<Task>('/tasks/', {
        title: createForm.title.trim(),
        start_time: start_time ?? null,
        end_time: end_time ?? null,
        description: createForm.description.trim() || undefined,
        status: createForm.status,
        event_type: 'task',
        assigned_to_user_id: Number(createForm.assigned_to_user_id),
        label_ids: createForm.label_ids,
        participant_ids: createForm.participant_ids,
        recurrence_rule: recurrence_rule || '',
        recurrence_end_date: recurrence_end_date || undefined,
        requires_closure_approval: createForm.requires_closure_approval,
        is_super_task: createForm.is_super_task,
      })

      for (const file of createPendingFiles) {
        const fd = new FormData()
        fd.append('file', file)
        await api.post(`/tasks/${created.id}/attachments`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }

      onCreated()
      handleClose()
    } catch (err: any) {
      setCreateError(err.response?.data?.detail ?? 'שגיאה ביצירת משימה')
    } finally {
      setCreateSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="משימה חדשה">
      <form onSubmit={handleCreate} className="space-y-2">
        {/* error */}
        {createError && <p className="text-sm text-red-600 dark:text-red-400">{createError}</p>}

        {/* title */}
        <div>
          <label htmlFor="create-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">כותרת</label>
          <input id="create-title" name="create-title" type="text" value={createForm.title}
            onChange={(e) => setCreateForm(f => ({ ...f, title: e.target.value }))}
            className="w-full px-3 py-1.5 border rounded-lg text-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            required />
        </div>

        {/* type + status + assigned */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">סוג</label>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                <input type="radio" name="taskType" checked={taskType === 'meeting'} onChange={() => setTaskTypeWithDefaults('meeting')} />
                <span>עם שעה</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                <input type="radio" name="taskType" checked={taskType === 'all_day'} onChange={() => setTaskTypeWithDefaults('all_day')} />
                <span>משימה (בלי שעה)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                <input type="radio" name="taskType" checked={taskType === 'no_date'} onChange={() => setTaskType('no_date')} />
                <span>משימה (בלי תאריך)</span>
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="ce-status" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">מצב</label>
              <select id="ce-status" value={createForm.status} onChange={(e) => setCreateForm(f => ({ ...f, status: e.target.value as TaskStatus }))}
                className="w-full px-2 py-1.5 border rounded-lg text-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((s) => (
                  <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ce-assigned" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">מוקצה ל</label>
              <select id="ce-assigned" value={createForm.assigned_to_user_id} onChange={(e) => setCreateForm(f => ({ ...f, assigned_to_user_id: e.target.value }))}
                className="w-full px-2 py-1.5 border rounded-lg text-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" required>
                <option value="">בחר</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* labels */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
            <Tag className="w-3.5 h-3.5" /> לייבלים
          </label>
          <div className="flex flex-wrap gap-1.5 mb-1">
            {taskLabels.map((l) => (
              <label key={l.id} className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border cursor-pointer', createForm.label_ids.includes(l.id) ? 'border-transparent text-white' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700')} style={createForm.label_ids.includes(l.id) ? { backgroundColor: l.color } : undefined}>
                <input type="checkbox" checked={createForm.label_ids.includes(l.id)} onChange={(e) => { if (e.target.checked) setCreateForm(f => ({ ...f, label_ids: [...f.label_ids, l.id] })); else setCreateForm(f => ({ ...f, label_ids: f.label_ids.filter(id => id !== l.id) })) }} className="sr-only" />
                <span className="w-1.5 h-1.5 rounded-full bg-white/80 flex-shrink-0" style={createForm.label_ids.includes(l.id) ? {} : { backgroundColor: l.color }} />
                {l.name}
              </label>
            ))}
            <input type="text" placeholder="לייבל חדש" value={newLabelName} onChange={(e) => setNewLabelName(e.target.value)} className="px-2 py-1 border rounded text-xs w-24 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
            <input type="color" value={newLabelColor} onChange={(e) => setNewLabelColor(e.target.value)} className="w-6 h-6 rounded border border-gray-300 dark:border-gray-600 cursor-pointer bg-transparent" />
            <button type="button" onClick={handleCreateLabel} disabled={addingLabel || !newLabelName.trim()} className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50">הוסף</button>
          </div>
        </div>

        {/* date fields based on type */}
        {taskType === 'all_day' && (
          <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
            <label htmlFor="ce-date" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">תאריך *</label>
            <input id="ce-date" type="date" value={createForm.date} onChange={(e) => setCreateForm(f => ({ ...f, date: e.target.value }))}
              className="w-full px-2 py-1.5 border rounded-lg text-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
          </div>
        )}
        {taskType === 'meeting' && (
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="ce-start" className="block text-xs text-gray-700 dark:text-gray-300 mb-0.5">משעה *</label>
                <input id="ce-start" type="datetime-local" value={createForm.start_time} onChange={(e) => setCreateForm(f => ({ ...f, start_time: e.target.value }))}
                  className="w-full px-2 py-1.5 border rounded-lg text-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <label htmlFor="ce-end" className="block text-xs text-gray-700 dark:text-gray-300 mb-0.5">עד שעה *</label>
                <input id="ce-end" type="datetime-local" value={createForm.end_time} onChange={(e) => setCreateForm(f => ({ ...f, end_time: e.target.value }))}
                  className="w-full px-2 py-1.5 border rounded-lg text-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
              </div>
            </div>
          </div>
        )}

        {/* recurrence */}
        {(taskType === 'meeting' || taskType === 'all_day') && (
          <div className="p-2 bg-slate-50 dark:bg-slate-900/20 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-2">
            <label htmlFor="ce-recurrence" className="text-xs font-medium text-gray-700 dark:text-gray-300">חזרה</label>
            <select id="ce-recurrence" value={createForm.recurrence_rule} onChange={(e) => setCreateForm(f => ({ ...f, recurrence_rule: e.target.value as RecurrenceRule }))}
              className="px-2 py-1 border rounded text-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
              {(Object.keys(RECURRENCE_LABELS) as RecurrenceRule[]).map((r) => (
                <option key={r || 'none'} value={r}>{RECURRENCE_LABELS[r]}</option>
              ))}
            </select>
            {(createForm.recurrence_rule === 'weekly' || createForm.recurrence_rule === 'monthly') && (
              <input type="date" value={createForm.recurrence_end_date} onChange={(e) => setCreateForm(f => ({ ...f, recurrence_end_date: e.target.value }))}
                className="px-2 py-1 border rounded text-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
            )}
          </div>
        )}

        {/* hints */}
        {taskType === 'all_day' && <p className="text-xs text-gray-600 dark:text-gray-400">משימה בלי שעה -- תופיע ביומן תחת משימות.</p>}
        {taskType === 'no_date' && <p className="text-xs text-gray-600 dark:text-gray-400">משימה בלי תאריך -- תופיע ברשימת המשימות.</p>}

        {/* attachments */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">קבצים / תמונות</label>
          <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip" onChange={(e) => { const files = e.target.files ? Array.from(e.target.files) : []; setCreatePendingFiles(prev => [...prev, ...files]) }} className="hidden" />
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600">
              <Paperclip className="w-3.5 h-3.5" /> הוסף קבצים
            </button>
            {createPendingFiles.map((file, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-600 text-xs">
                {file.name}
                <button type="button" onClick={() => setCreatePendingFiles(p => p.filter((_, j) => j !== i))} className="p-0.5 rounded hover:bg-gray-300 dark:hover:bg-gray-500"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        </div>

        {/* description */}
        <div>
          <label htmlFor="ce-description" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">תיאור</label>
          <textarea id="ce-description" value={createForm.description} onChange={(e) => setCreateForm(f => ({ ...f, description: e.target.value }))} rows={2}
            className="w-full px-3 py-1.5 border rounded-lg text-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
        </div>

        {/* super task */}
        <div className="flex items-center gap-2">
          <input type="checkbox" id="ce-is-super-task" checked={createForm.is_super_task} onChange={(e) => setCreateForm(f => ({ ...f, is_super_task: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 accent-red-600" />
          <label htmlFor="ce-is-super-task" className="text-sm text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
            <Zap className="w-3.5 h-3.5" /> משימת על
          </label>
        </div>

        {/* requires closure */}
        <div className="flex items-center gap-2">
          <input type="checkbox" id="ce-requires-closure" checked={createForm.requires_closure_approval} onChange={(e) => setCreateForm(f => ({ ...f, requires_closure_approval: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 dark:border-gray-600" />
          <label htmlFor="ce-requires-closure" className="text-sm text-gray-700 dark:text-gray-300">דורש אישור מנהל לסגירה</label>
        </div>

        {/* actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={handleClose} className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">ביטול</button>
          <button type="submit" disabled={createSaving} className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
            {createSaving ? 'שומר...' : 'צור משימה'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
