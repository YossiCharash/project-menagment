import { useEffect, useState, useCallback } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../store/store'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventChangeArg, DatesSetArg, EventClickArg } from '@fullcalendar/core'
import api from '../lib/api'
import { Calendar, User, Plus, Trash2 } from 'lucide-react'
import Modal from '../components/Modal'
import { cn } from '../lib/utils'

export interface UserForTask {
  id: number
  full_name: string
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type EventType = 'meeting' | 'task'

export interface Task {
  id: number
  title: string
  start_time: string | null
  end_time: string | null
  description: string | null
  status: TaskStatus
  event_type?: EventType
  assigned_to_user_id: number
  unique_tag: string
  assigned_user_name?: string | null
  assigned_user_color?: string | null
}

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'מחכה לטיפול',
  in_progress: 'בטיפול',
  completed: 'טופלה',
}

const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  pending: '#6B7280',
  in_progress: '#3B82F6',
  completed: '#10B981',
}

const USER_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
]

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  meeting: 'פגישה',
  task: 'משימה',
}

export default function TaskCalendar() {
  const me = useSelector((state: RootState) => state.auth.me)
  const isAdmin = me?.role === 'Admin'
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<UserForTask[]>([])
  const [loading, setLoading] = useState(true)
  const [filterUserId, setFilterUserId] = useState<number | null>(null)
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date } | null>(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    return { start, end }
  })
  const [currentViewType, setCurrentViewType] = useState<string>('dayGridMonth')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    title: '',
    date: '',
    start_time: '',
    end_time: '',
    description: '',
    status: 'pending' as TaskStatus,
    assigned_to_user_id: '',
  })
  const [createSaving, setCreateSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [taskType, setTaskType] = useState<'meeting' | 'all_day' | 'no_date'>('meeting')

  const setTaskTypeWithDefaults = useCallback((type: 'meeting' | 'all_day' | 'no_date') => {
    setTaskType(type)
    if (type === 'meeting') {
      const now = new Date()
      const start = new Date(now)
      start.setHours(9, 0, 0, 0)
      const end = new Date(now)
      end.setHours(10, 0, 0, 0)
      const pad = (n: number) => String(n).padStart(2, '0')
      setCreateForm(f => ({
        ...f,
        start_time: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`,
        end_time: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`,
      }))
    }
  }, [])
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null)

  const fetchTasks = useCallback(async () => {
    try {
      const params: Record<string, string> = {}
      if (filterUserId) params.assigned_to_user_id = String(filterUserId)
      if (dateRange) {
        params.start = dateRange.start.toISOString()
        params.end = dateRange.end.toISOString()
      }
      const { data } = await api.get<Task[]>('/tasks/', { params })
      setTasks(data)
    } catch (err) {
      console.error('Failed to fetch tasks:', err)
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [filterUserId, dateRange])

  const fetchUsers = useCallback(async () => {
    try {
      const { data } = await api.get<UserForTask[]>('/users/for-tasks')
      setUsers(data)
    } catch (err) {
      console.error('Failed to fetch users:', err)
      setUsers([])
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  useEffect(() => {
    setLoading(true)
    fetchTasks()
  }, [fetchTasks])

  const handleEventClick = (info: EventClickArg) => {
    const task = tasks.find(t => String(t.id) === info.event.id)
    if (task) setSelectedTask(task)
  }

  const handleDeleteTask = async (task: Task) => {
    if (!confirm(`למחוק את "${task.title}"? פעולה זו אינה ניתנת לביטול.`)) return
    setDeletingTaskId(task.id)
    try {
      await api.delete(`/tasks/${task.id}`)
      setSelectedTask(null)
      await fetchTasks()
    } catch (err) {
      console.error('Failed to delete task:', err)
    } finally {
      setDeletingTaskId(null)
    }
  }

  const handleStatusChange = async (taskId: number, newStatus: TaskStatus) => {
    setUpdatingStatus(true)
    try {
      await api.put(`/tasks/${taskId}`, { status: newStatus })
      await fetchTasks()
      setSelectedTask(prev => (prev?.id === taskId ? { ...prev, status: newStatus } : prev))
    } catch (err) {
      console.error('Failed to update task status:', err)
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleDatesSet = (arg: DatesSetArg) => {
    const viewType = arg.view?.type ?? 'dayGridMonth'
    setCurrentViewType(viewType)
    setDateRange(prev => {
      const newStart = arg.start.getTime()
      const newEnd = arg.end.getTime()
      if (prev && prev.start.getTime() === newStart && prev.end.getTime() === newEnd) return prev
      return { start: arg.start, end: arg.end }
    })
  }

  const handleEventDrop = async (info: EventChangeArg) => {
    const taskId = Number(info.event.id)
    const start = info.event.start
    const end = info.event.end
    if (!start || !end) return
    try {
      await api.put(`/tasks/${taskId}`, {
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      })
      await fetchTasks()
    } catch (err) {
      info.revert()
      console.error('Failed to update task:', err)
    }
  }

  const handleEventResize = async (info: EventChangeArg) => {
    const taskId = Number(info.event.id)
    const start = info.event.start
    const end = info.event.end
    if (!start || !end) return
    try {
      await api.put(`/tasks/${taskId}`, {
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      })
      await fetchTasks()
    } catch (err) {
      info.revert()
      console.error('Failed to update task:', err)
    }
  }

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
        setCreateError('לפגישה יש למלא תאריך ומשעה עד שעה')
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
      await api.post('/tasks/', {
        title: createForm.title.trim(),
        start_time: start_time ?? null,
        end_time: end_time ?? null,
        description: createForm.description.trim() || undefined,
        status: createForm.status,
        event_type: taskType === 'meeting' ? 'meeting' : 'task',
        assigned_to_user_id: Number(createForm.assigned_to_user_id),
      })
      setShowCreateModal(false)
      setCreateForm({ title: '', date: '', start_time: '', end_time: '', description: '', status: 'pending', assigned_to_user_id: '' })
      await fetchTasks()
    } catch (err: any) {
      setCreateError(err.response?.data?.detail ?? 'שגיאה ביצירת משימה')
    } finally {
      setCreateSaving(false)
    }
  }

  const events = tasks
    .filter(t => t.start_time && t.end_time)
    .map(t => {
      const start = new Date(t.start_time!)
      const end = new Date(t.end_time!)
      const isAllDay = start.getHours() === 0 && start.getMinutes() === 0 && end.getHours() === 23 && end.getMinutes() === 59
      const status = (t.status || 'pending') as TaskStatus
      const eventType = (t.event_type || 'task') as EventType
      const color = TASK_STATUS_COLORS[status] ?? USER_COLORS[(t.assigned_to_user_id - 1) % USER_COLORS.length]
      const icon = eventType === 'meeting' ? '📅 ' : '📋 '
      return {
        id: String(t.id),
        title: icon + t.title,
        start: t.start_time!,
        end: t.end_time!,
        allDay: eventType === 'meeting' ? false : isAllDay,
        backgroundColor: color,
        borderColor: color,
        classNames: [eventType === 'meeting' ? 'fc-event-meeting' : 'fc-event-task'],
        extendedProps: { eventType },
      }
    })

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Calendar className="w-7 h-7" />
          יומן משימות
        </h1>
        {(isAdmin || users.some(u => u.id === me?.id)) && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setTaskTypeWithDefaults('meeting')
              const updates: Partial<typeof createForm> = {}
              if (me && users.length === 1 && users[0].id === me.id) updates.assigned_to_user_id = String(me.id)
              const now = new Date()
              const start = new Date(now); start.setHours(9, 0, 0, 0)
              const end = new Date(now); end.setHours(10, 0, 0, 0)
              const pad = (n: number) => String(n).padStart(2, '0')
              updates.start_time = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`
              updates.end_time = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`
              if (Object.keys(updates).length) setCreateForm(f => ({ ...f, ...updates }))
              setShowCreateModal(true)
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Calendar className="w-4 h-4" />
            פגישה חדשה
          </button>
          <button
            type="button"
            onClick={() => {
              setTaskType('all_day')
              const updates: Partial<typeof createForm> = {}
              if (me && users.length === 1 && users[0].id === me.id) updates.assigned_to_user_id = String(me.id)
              const now = new Date()
              const pad = (n: number) => String(n).padStart(2, '0')
              updates.date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
              updates.start_time = ''
              updates.end_time = ''
              if (Object.keys(updates).length) setCreateForm(f => ({ ...f, ...updates }))
              setShowCreateModal(true)
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            משימה חדשה
          </button>
        </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {isAdmin && (
          <aside className="lg:w-64 flex-shrink-0 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <User className="w-4 h-4" />
              סינון לפי משתמש
            </h2>
            <select
              value={filterUserId ?? ''}
              onChange={(e) => setFilterUserId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="">הכל</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
            {users.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                אין משתמשים במערכת.
              </p>
            )}
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">סוג בלוח:</p>
              <div className="flex flex-wrap gap-2 mb-2">
                <span className="text-xs border-l-4 border-solid border-gray-500 pl-1">פגישה</span>
                <span className="text-xs border-2 border-dashed border-gray-500 px-1 rounded">משימה</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">מצב משימה:</p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TASK_STATUS_COLORS.pending }} />
                  <span className="text-xs">{TASK_STATUS_LABELS.pending}</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TASK_STATUS_COLORS.in_progress }} />
                  <span className="text-xs">{TASK_STATUS_LABELS.in_progress}</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TASK_STATUS_COLORS.completed }} />
                  <span className="text-xs">{TASK_STATUS_LABELS.completed}</span>
                </span>
              </div>
            </div>
          </aside>
        )}

        <div className="flex-1 min-w-0 space-y-2">
          {!isAdmin && (
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
              <span className="border-l-4 border-solid border-gray-500 pl-1 text-xs">פגישה</span>
              <span className="border border-dashed border-gray-500 px-1 rounded text-xs">משימה</span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TASK_STATUS_COLORS.pending }} />
                {TASK_STATUS_LABELS.pending}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TASK_STATUS_COLORS.in_progress }} />
                {TASK_STATUS_LABELS.in_progress}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TASK_STATUS_COLORS.completed }} />
                {TASK_STATUS_LABELS.completed}
              </span>
            </div>
          )}
          {tasks.filter(t => !t.start_time && !t.end_time).length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <h3 className="font-medium text-amber-800 dark:text-amber-200 mb-2">משימות בלי תאריך</h3>
              <ul className="space-y-1 text-sm">
                {tasks.filter(t => !t.start_time && !t.end_time).map(t => {
                  const status = (t.status || 'pending') as TaskStatus
                  const color = TASK_STATUS_COLORS[status] ?? t.assigned_user_color ?? USER_COLORS[(t.assigned_to_user_id - 1) % USER_COLORS.length]
                  return (
                  <li key={t.id} className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedTask(t)}
                      className="text-left hover:underline"
                    >
                      {t.title} – {t.assigned_user_name}
                    </button>
                  </li>
                )})}
              </ul>
            </div>
          )}
        <div className="flex-1 min-w-0 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          {loading && tasks.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-gray-500">טוען...</div>
          ) : (
            <FullCalendar
              key={currentViewType}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView={currentViewType}
              initialDate={dateRange?.start ?? undefined}
              events={events}
              editable={true}
              droppable={true}
              eventDrop={handleEventDrop}
              eventResize={handleEventResize}
              eventClick={handleEventClick}
              datesSet={handleDatesSet}
              headerToolbar={{
                start: 'timeGridDay,timeGridWeek,dayGridMonth',
                center: 'title',
                end: 'prev,next today',
              }}
              buttonText={{
                today: 'היום',
                month: 'חודש',
                week: 'שבוע',
                day: 'יום',
              }}
              locale="he"
              direction="rtl"
              height={600}
              slotMinTime="00:00:00"
              slotMaxTime="24:00:00"
              allDayText="כל היום"
              eventDisplay="block"
            />
          )}
        </div>
        </div>
      </div>

      {selectedTask && (
        <Modal
          isOpen={!!selectedTask}
          onClose={() => setSelectedTask(null)}
          title="פרטי משימה"
        >
          <div className="space-y-3">
            <p className="font-medium text-gray-900 dark:text-gray-100">{selectedTask.title}</p>
            <p className="text-sm">
              <span className="text-gray-600 dark:text-gray-400">סוג: </span>
              <span className="font-medium">{EVENT_TYPE_LABELS[(selectedTask.event_type || 'task') as EventType]}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">מצב: </span>
              <select
                value={selectedTask.status || 'pending'}
                onChange={(e) => handleStatusChange(selectedTask.id, e.target.value as TaskStatus)}
                disabled={updatingStatus}
                className={cn(
                  "px-3 py-1.5 border rounded-lg text-sm",
                  "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100",
                  "disabled:opacity-50"
                )}
              >
                {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((s) => (
                  <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <p className="text-sm">
              <span className="text-gray-600 dark:text-gray-400">מוקצה למשתמש: </span>
              <span className="font-medium">{selectedTask.assigned_user_name}</span>
            </p>
            {selectedTask.start_time && selectedTask.end_time && (
              <p className="text-sm">
                <span className="text-gray-600 dark:text-gray-400">משעה עד שעה: </span>
                {new Date(selectedTask.start_time).toLocaleString('he-IL')} – {new Date(selectedTask.end_time).toLocaleString('he-IL')}
              </p>
            )}
            {!selectedTask.start_time && !selectedTask.end_time && (
              <p className="text-sm text-gray-600 dark:text-gray-400">משימה בלי תאריך</p>
            )}
            {selectedTask.description && (
              <p className="text-sm">
                <span className="text-gray-600 dark:text-gray-400">תיאור: </span>
                {selectedTask.description}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-600 mt-4">
              <button
                type="button"
                onClick={() => selectedTask && handleDeleteTask(selectedTask)}
                disabled={!!deletingTaskId}
                className="inline-flex items-center gap-2 px-4 py-2 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {deletingTaskId === selectedTask?.id ? 'מוחק...' : 'מחק'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500"
              >
                סגור
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showCreateModal && (
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title={taskType === 'meeting' ? 'פגישה חדשה' : 'משימה חדשה'}
        >
          <form onSubmit={handleCreate} className="space-y-4">
            {createError && (
              <p className="text-sm text-red-600 dark:text-red-400">{createError}</p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">כותרת</label>
              <input
                type="text"
                value={createForm.title}
                onChange={(e) => setCreateForm(f => ({ ...f, title: e.target.value }))}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg",
                  "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                )}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סוג</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="taskType"
                    checked={taskType === 'meeting'}
                    onChange={() => setTaskTypeWithDefaults('meeting')}
                  />
                  <span className="font-medium">פגישה</span> – תאריך ומשעה עד שעה
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="taskType"
                    checked={taskType === 'all_day'}
                    onChange={() => setTaskType('all_day')}
                  />
                  <span className="font-medium">משימה בתאריך</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="taskType"
                    checked={taskType === 'no_date'}
                    onChange={() => setTaskType('no_date')}
                  />
                  <span className="font-medium">משימה בלי תאריך</span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מצב משימה</label>
              <select
                value={createForm.status}
                onChange={(e) => setCreateForm(f => ({ ...f, status: e.target.value as TaskStatus }))}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg",
                  "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                )}
              >
                {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((s) => (
                  <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מוקצה למשתמש</label>
              <select
                value={createForm.assigned_to_user_id}
                onChange={(e) => setCreateForm(f => ({ ...f, assigned_to_user_id: e.target.value }))}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg",
                  "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                )}
                required
              >
                <option value="">בחר משתמש</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            </div>
            {taskType === 'all_day' && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">משימה בתאריך</p>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תאריך *</label>
                <input
                  type="date"
                  value={createForm.date}
                  onChange={(e) => setCreateForm(f => ({ ...f, date: e.target.value }))}
                  className={cn(
                    "w-full px-3 py-2 border rounded-lg",
                    "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  )}
                />
              </div>
            )}
            {taskType === 'meeting' && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">תאריך ומשעה עד שעה</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">משעה *</label>
                    <input
                      type="datetime-local"
                      value={createForm.start_time}
                      onChange={(e) => setCreateForm(f => ({ ...f, start_time: e.target.value }))}
                      required={taskType === 'meeting'}
                      className={cn(
                        "w-full px-3 py-2 border rounded-lg",
                        "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">עד שעה *</label>
                    <input
                      type="datetime-local"
                      value={createForm.end_time}
                      onChange={(e) => setCreateForm(f => ({ ...f, end_time: e.target.value }))}
                      required={taskType === 'meeting'}
                      className={cn(
                        "w-full px-3 py-2 border rounded-lg",
                        "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      )}
                    />
                  </div>
                </div>
              </div>
            )}
            {taskType === 'no_date' && (
              <p className="text-sm text-gray-600 dark:text-gray-400">משימה בלי תאריך – תופיע ברשימת &quot;משימות בלי תאריך&quot;.</p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תיאור</label>
              <textarea
                value={createForm.description}
                onChange={(e) => setCreateForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg",
                  "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                )}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                ביטול
              </button>
              <button
                type="submit"
                disabled={createSaving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
              >
                {createSaving ? 'שומר...' : taskType === 'meeting' ? 'צור פגישה' : 'צור משימה'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
