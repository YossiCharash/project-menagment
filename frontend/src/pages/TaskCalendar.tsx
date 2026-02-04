import { useEffect, useState, useCallback, useRef } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../store/store'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventChangeArg, DatesSetArg, EventClickArg, DateSelectArg } from '@fullcalendar/core'
import api from '../lib/api'
import { Calendar, User, Plus, Trash2, Pencil, CalendarSync, Link2, Unlink } from 'lucide-react'
import Modal from '../components/Modal'
import { cn } from '../lib/utils'

export interface UserForTask {
  id: number
  full_name: string
  calendar_color?: string | null
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
  /** צבע לוח שנה של המשתמש המוקצה (מוגדר בהגדרות עובד) */
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
    try {
      const saved = sessionStorage.getItem('taskCalendarDate')
      if (saved) {
        const start = new Date(saved)
        if (!isNaN(start.getTime())) {
          const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59)
          return { start, end }
        }
      }
    } catch {
      /* ignore */
    }
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    return { start, end }
  })
  const [currentViewType, setCurrentViewType] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem('taskCalendarView')
      if (saved && ['dayGridMonth', 'timeGridDay', 'timeGridWeek', 'timeGridWorkWeek', 'listWeek'].includes(saved)) return saved
    } catch {
      /* ignore */
    }
    return 'dayGridMonth'
  })
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
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editForm, setEditForm] = useState<{
    title: string
    date: string
    start_time: string
    end_time: string
    description: string
    status: TaskStatus
    assigned_to_user_id: string
    event_type: EventType
  } | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [taskType, setTaskType] = useState<'meeting' | 'all_day' | 'no_date'>('meeting')
  const [outlookStatus, setOutlookStatus] = useState<{
    configured: boolean
    connected: boolean
    last_sync_at: string | null
  } | null>(null)
  const [outlookDisconnecting, setOutlookDisconnecting] = useState(false)
  const [updatingUserColorId, setUpdatingUserColorId] = useState<number | null>(null)
  const [dropConfirm, setDropConfirm] = useState<{
    taskId: number
    taskTitle: string
    oldStart: Date
    oldEnd: Date
    newStart: Date
    newEnd: Date
    customStart: string
    customEnd: string
    info: EventChangeArg | null
  } | null>(null)
  const [dropConfirmSaving, setDropConfirmSaving] = useState(false)
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0)

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

  const fetchOutlookStatus = useCallback(async () => {
    try {
      const { data } = await api.get<{ configured: boolean; connected: boolean; last_sync_at: string | null }>('/outlook/status')
      setOutlookStatus(data)
    } catch {
      setOutlookStatus({ configured: false, connected: false, last_sync_at: null })
    }
  }, [])

  useEffect(() => {
    fetchOutlookStatus()
  }, [fetchOutlookStatus])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const outlookParam = params.get('outlook')
    if (outlookParam === 'connected') {
      fetchOutlookStatus()
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (outlookParam === 'error') {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [fetchOutlookStatus])

  const handleOutlookConnect = () => {
    const token = localStorage.getItem('token')
    const base = (api.defaults.baseURL || '').replace(/\/$/, '')
    if (token) {
      window.location.href = `${base}/outlook/connect?token=${encodeURIComponent(token)}`
    }
  }

  const handleOutlookDisconnect = async () => {
    if (!confirm('לנתק את סנכרון Outlook?')) return
    setOutlookDisconnecting(true)
    try {
      await api.delete('/outlook/disconnect')
      await fetchOutlookStatus()
    } finally {
      setOutlookDisconnecting(false)
    }
  }

  const handleUserColorChange = async (userId: number, hex: string) => {
    const value = hex ? (hex.startsWith('#') ? hex : `#${hex}`) : ''
    setUpdatingUserColorId(userId)
    try {
      await api.put(`/users/${userId}`, { calendar_color: value || null })
      await fetchUsers()
      await fetchTasks()
    } catch {
      await fetchUsers()
    } finally {
      setUpdatingUserColorId(null)
    }
  }

  const lastEventClickRef = useRef<{ id: string; time: number } | null>(null)

  const handleEventClick = (info: EventClickArg) => {
    const task = tasks.find(t => String(t.id) === info.event.id)
    if (!task) return
    const now = Date.now()
    const last = lastEventClickRef.current
    if (last?.id === info.event.id && now - last.time < 400) {
      lastEventClickRef.current = null
      setSelectedTask(null)
      openEditModal(task)
      return
    }
    lastEventClickRef.current = { id: info.event.id, time: now }
    setSelectedTask(task)
  }

  const handleDeleteTask = async (task: Task) => {
    if (!confirm(`למחוק את "${task.title}"? פעולה זו אינה ניתנת לביטול.`)) return
    setDeletingTaskId(task.id)
    try {
      await api.delete(`/tasks/${task.id}`)
      setSelectedTask(null)
      try {
        sessionStorage.setItem('taskCalendarView', currentViewType)
        if (dateRange?.start) sessionStorage.setItem('taskCalendarDate', dateRange.start.toISOString())
      } catch {
        /* ignore */
      }
      window.location.reload()
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

  const toDateTimeLocal = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const handleEventDrop = (info: EventChangeArg) => {
    const taskId = Number(info.event.id)
    const start = info.event.start
    const end = info.event.end
    if (!start || !end) return
    const task = tasks.find(t => String(t.id) === info.event.id)
    const oldStart = task?.start_time ? new Date(task.start_time) : start
    const oldEnd = task?.end_time ? new Date(task.end_time) : end
    setDropConfirm({
      taskId,
      taskTitle: info.event.title || '',
      oldStart,
      oldEnd,
      newStart: start,
      newEnd: end,
      customStart: toDateTimeLocal(start),
      customEnd: toDateTimeLocal(end),
      info,
    })
  }

  const handleDropConfirm = async (useCustomDate: boolean) => {
    if (!dropConfirm) return
    const start = useCustomDate
      ? new Date(dropConfirm.customStart)
      : dropConfirm.newStart
    const end = useCustomDate
      ? new Date(dropConfirm.customEnd)
      : dropConfirm.newEnd
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
      alert('נא לבחור תאריך ושעה תקינים. שעת הסיום חייבת להיות אחרי שעת ההתחלה.')
      return
    }
    setDropConfirmSaving(true)
    try {
      await api.put(`/tasks/${dropConfirm.taskId}`, {
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      })
      setDropConfirm(null)
      try {
        sessionStorage.setItem('taskCalendarView', currentViewType)
        if (dateRange?.start) sessionStorage.setItem('taskCalendarDate', dateRange.start.toISOString())
      } catch {
        /* ignore */
      }
      window.location.reload()
    } catch (err) {
      console.error('Failed to update task:', err)
      if (dropConfirm.info) dropConfirm.info.revert()
      setDropConfirm(null)
    } finally {
      setDropConfirmSaving(false)
    }
  }

  const handleDropCancel = () => {
    if (dropConfirm?.info) dropConfirm.info.revert()
    setDropConfirm(null)
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

  /** Outlook-style: select time range on calendar to create new meeting */
  const handleSelect = (arg: DateSelectArg) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const start = arg.start
    const end = arg.end
    setTaskTypeWithDefaults('meeting')
    setCreateForm(f => ({
      ...f,
      start_time: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`,
      end_time: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`,
    }))
    setShowCreateModal(true)
    arg.view.calendar.unselect()
  }

  const openEditModal = useCallback((task: Task) => {
    setSelectedTask(null)
    setEditingTask(task)
    const eventType = (task.event_type || 'task') as EventType
    const hasDates = !!task.start_time && !!task.end_time
    const start = task.start_time ? new Date(task.start_time) : new Date()
    const end = task.end_time ? new Date(task.end_time) : new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    setEditForm({
      title: task.title,
      date: hasDates ? `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}` : '',
      start_time: hasDates ? `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}` : '',
      end_time: hasDates ? `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}` : '',
      description: task.description || '',
      status: (task.status || 'pending') as TaskStatus,
      assigned_to_user_id: String(task.assigned_to_user_id),
      event_type: eventType,
    })
    setEditError(null)
  }, [])

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTask || !editForm) return
    setEditError(null)
    if (!editForm.title.trim() || !editForm.assigned_to_user_id) {
      setEditError('נא למלא את כל השדות החובה')
      return
    }
    let start_time: string | null | undefined = undefined
    let end_time: string | null | undefined = undefined
    if (editForm.event_type === 'meeting' && editForm.start_time?.trim() && editForm.end_time?.trim()) {
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
    } else if (editForm.event_type === 'task' && editForm.date) {
      start_time = `${editForm.date}T00:00:00`
      end_time = `${editForm.date}T23:59:59`
    } else if (editForm.event_type === 'task') {
      start_time = null
      end_time = null
    }
    setEditSaving(true)
    try {
      await api.put(`/tasks/${editingTask.id}`, {
        title: editForm.title.trim(),
        start_time: start_time,
        end_time: end_time,
        description: editForm.description || undefined,
        status: editForm.status,
        event_type: editForm.event_type,
        assigned_to_user_id: Number(editForm.assigned_to_user_id),
      })
      setEditingTask(null)
      setEditForm(null)
      await fetchTasks()
      setSelectedTask(null)
    } catch (err: any) {
      setEditError(err.response?.data?.detail ?? 'שגיאה בעדכון משימה')
    } finally {
      setEditSaving(false)
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
      const color = t.assigned_user_color ?? USER_COLORS[(t.assigned_to_user_id - 1) % USER_COLORS.length]
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
        <div className="flex flex-wrap items-center gap-4">
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
          {outlookStatus?.configured && (
            <div className="flex items-center gap-2">
              {outlookStatus.connected ? (
                <>
                  <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                    <CalendarSync className="w-4 h-4" />
                    מחובר ל-Outlook
                  </span>
                  <button
                    type="button"
                    onClick={handleOutlookDisconnect}
                    disabled={outlookDisconnecting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    נתק
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleOutlookConnect}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg transition-colors"
                >
                  <Link2 className="w-4 h-4" />
                  סנכרון ל-Outlook
                </button>
              )}
            </div>
          )}
        </div>
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
            {users.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">צבע בלוח לפי עובד:</p>
                <ul className="space-y-2">
                  {users.map((u) => {
                    const color = u.calendar_color || USER_COLORS[(u.id - 1) % USER_COLORS.length]
                    return (
                      <li key={u.id} className="flex items-center gap-2">
                        <input
                          type="color"
                          value={color.startsWith('#') ? color : `#${color}`}
                          onChange={(e) => handleUserColorChange(u.id, e.target.value)}
                          disabled={!!updatingUserColorId}
                          className="w-7 h-7 rounded border border-gray-300 dark:border-gray-600 cursor-pointer disabled:opacity-50 bg-transparent"
                          title={`צבע ל${u.full_name}`}
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">{u.full_name}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
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
              key={`${currentViewType}-${calendarRefreshKey}`}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              initialView={currentViewType}
              initialDate={dateRange?.start ?? undefined}
              events={events}
              editable={true}
              droppable={true}
              selectable={true}
              select={handleSelect}
              eventDrop={handleEventDrop}
              eventResize={handleEventResize}
              eventClick={handleEventClick}
              datesSet={handleDatesSet}
              headerToolbar={{
                start: 'timeGridDay,timeGridWeek,timeGridWorkWeek,dayGridMonth,listWeek',
                center: 'title',
                end: 'prev,next today',
              }}
              views={{
                timeGridWorkWeek: {
                  type: 'timeGrid',
                  duration: { days: 5 },
                  buttonText: 'שבוע עבודה',
                },
              }}
              buttonText={{
                today: 'היום',
                month: 'חודש',
                week: 'שבוע',
                day: 'יום',
                listWeek: 'רשימה',
                listDay: 'רשימה (יום)',
                listMonth: 'רשימה (חודש)',
              }}
              locale="he"
              direction="rtl"
              firstDay={0}
              slotDuration="00:30:00"
              slotLabelInterval="01:00:00"
              nowIndicator={true}
              navLinks={true}
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

      {dropConfirm && (
        <Modal
          isOpen={!!dropConfirm}
          onClose={handleDropCancel}
          title="אישור הזזת אירוע"
        >
          <div className="space-y-4">
            <p className="text-gray-700 dark:text-gray-300">
              <strong>{dropConfirm.taskTitle.replace(/^[📅📋]\s*/, '')}</strong>
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              האם אתה בטוח שברצונך להעביר מתאריך ושעה אלו:
            </p>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {dropConfirm.oldStart.toLocaleString('he-IL')} – {dropConfirm.oldEnd.toLocaleString('he-IL')}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              לתאריך ושעה אלו:
            </p>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {dropConfirm.newStart.toLocaleString('he-IL')} – {dropConfirm.newEnd.toLocaleString('he-IL')}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleDropConfirm(false)}
                disabled={dropConfirmSaving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
              >
                {dropConfirmSaving ? 'שומר...' : 'כן, העבר לתאריך הזה'}
              </button>
              <button
                type="button"
                onClick={handleDropCancel}
                disabled={dropConfirmSaving}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50"
              >
                ביטול
              </button>
            </div>
            <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">או בחר תאריך ושעה אחרים:</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">משעה</label>
                  <input
                    type="datetime-local"
                    value={dropConfirm.customStart}
                    onChange={(e) => setDropConfirm(d => d ? { ...d, customStart: e.target.value } : d)}
                    className={cn(
                      "w-full px-3 py-2 border rounded-lg text-sm",
                      "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    )}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">עד שעה</label>
                  <input
                    type="datetime-local"
                    value={dropConfirm.customEnd}
                    onChange={(e) => setDropConfirm(d => d ? { ...d, customEnd: e.target.value } : d)}
                    className={cn(
                      "w-full px-3 py-2 border rounded-lg text-sm",
                      "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    )}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDropConfirm(true)}
                disabled={dropConfirmSaving}
                className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50 text-sm"
              >
                העבר לתאריך שנבחר
              </button>
            </div>
          </div>
        </Modal>
      )}

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
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">לעריכה: לחץ פעמיים על האירוע או השתמש בכפתור עריכה.</p>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-600 mt-4">
              <button
                type="button"
                onClick={() => selectedTask && openEditModal(selectedTask)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                <Pencil className="w-4 h-4" />
                עריכה
              </button>
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

      {editingTask && editForm && (
        <Modal
          isOpen={!!editingTask}
          onClose={() => { setEditingTask(null); setEditForm(null); setEditError(null); }}
          title="עריכת משימה"
        >
          <form onSubmit={handleEditSave} className="space-y-4">
            {editError && (
              <p className="text-sm text-red-600 dark:text-red-400">{editError}</p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">כותרת</label>
              <input
                type="text"
                value={editForm.title}
                onChange={(e) => setEditForm(f => f ? { ...f, title: e.target.value } : f)}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg",
                  "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                )}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סוג</label>
              <div className="flex gap-4 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="editEventType"
                    checked={editForm.event_type === 'meeting'}
                    onChange={() => setEditForm(f => f ? { ...f, event_type: 'meeting' } : f)}
                  />
                  <span>פגישה</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="editEventType"
                    checked={editForm.event_type === 'task'}
                    onChange={() => setEditForm(f => f ? { ...f, event_type: 'task' } : f)}
                  />
                  <span>משימה</span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מצב משימה</label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm(f => f ? { ...f, status: e.target.value as TaskStatus } : f)}
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
                value={editForm.assigned_to_user_id}
                onChange={(e) => setEditForm(f => f ? { ...f, assigned_to_user_id: e.target.value } : f)}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg",
                  "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                )}
                required
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            </div>
            {editForm.event_type === 'meeting' && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">משעה *</label>
                    <input
                      type="datetime-local"
                      value={editForm.start_time}
                      onChange={(e) => setEditForm(f => f ? { ...f, start_time: e.target.value } : f)}
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
                      value={editForm.end_time}
                      onChange={(e) => setEditForm(f => f ? { ...f, end_time: e.target.value } : f)}
                      className={cn(
                        "w-full px-3 py-2 border rounded-lg",
                        "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      )}
                    />
                  </div>
                </div>
              </div>
            )}
            {editForm.event_type === 'task' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תאריך (משימה)</label>
                <input
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm(f => f ? { ...f, date: e.target.value } : f)}
                  className={cn(
                    "w-full px-3 py-2 border rounded-lg",
                    "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  )}
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תיאור</label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm(f => f ? { ...f, description: e.target.value } : f)}
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
                onClick={() => { setEditingTask(null); setEditForm(null); }}
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
