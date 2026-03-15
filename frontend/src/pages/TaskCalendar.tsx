import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import type { RootState } from '../store'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventChangeArg, DatesSetArg, EventClickArg, DateSelectArg } from '@fullcalendar/core'
import type { EventDragStartArg } from '@fullcalendar/interaction'
import api, { avatarUrl, fileAttachmentUrl } from '../lib/api'
import { getToken } from '../lib/authCache'
import { Calendar, User, Plus, Trash2, Pencil, CalendarSync, Link2, Unlink, Tag, Paperclip, X, Bell, CheckCircle, MessageCircle, Send, Archive } from 'lucide-react'
import Modal from '../components/Modal'
import ToastNotification, { useToast } from '../components/ToastNotification'
import { cn } from '../lib/utils'
import { updateUser } from '../store/slices/authSlice'
import { formatCalendarDay, getCalendarDayBothParts, getHebrewMonthRange, getHebrewMonthYearHeader, getJewishHolidays, getIslamicHolidays, getNextHebrewMonthStart, getPrevHebrewMonthStart, type CalendarDateDisplay } from '../lib/calendarUtils'
import './TaskCalendar.css'
import { PermissionGuard } from '../components/ui/PermissionGuard'

export interface UserForTask {
  id: number
  full_name: string
  calendar_color?: string | null
  avatar_url?: string | null
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'pending_closure'

export type EventType = 'meeting' | 'task'

export interface TaskLabelType {
  id: number
  name: string
  color: string
}

export type RecurrenceRule = '' | 'weekly' | 'monthly'

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
  /** משימה מחזורית: '' | 'weekly' | 'monthly' */
  recurrence_rule?: RecurrenceRule
  /** תאריך סיום סדרת החזרות (אופציונלי) */
  recurrence_end_date?: string | null
  assigned_user_name?: string | null
  /** צבע לוח שנה של המשתמש המוקצה (מוגדר בהגדרות עובד) */
  assigned_user_color?: string | null
  /** תמונת פרופיל של המשתמש המוקצה */
  assigned_user_avatar?: string | null
  labels?: TaskLabelType[]
  participants?: TaskParticipantType[]
  attachments?: TaskAttachmentType[]
  /** תאריך שבו הלקוח/המשתמש המוקצה אישר קבלת המשימה */
  assignee_acknowledged_at?: string | null
  assignee_viewed_at?: string | null
  is_archived?: boolean
  archived_at?: string | null
  completed_at?: string | null
  requires_closure_approval?: boolean
  is_super_task?: boolean
}

export interface TaskAttachmentType {
  id: number
  file_name: string
  file_url: string
}

export type ParticipantResponseStatus = 'pending' | 'accepted' | 'declined'

export interface TaskParticipantType {
  user_id: number
  full_name: string
  response_status: ParticipantResponseStatus
  avatar_url?: string | null
}

export interface TaskMessageType {
  id: number
  task_id: number
  user_id: number
  full_name: string
  avatar_url?: string | null
  message: string
  created_at: string
}

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'מחכה לטיפול',
  in_progress: 'בטיפול',
  completed: 'טופלה',
  pending_closure: 'ממתין לאישור סגירה',
}

const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  pending: '#6B7280',
  in_progress: '#3B82F6',
  completed: '#10B981',
  pending_closure: '#F59E0B',
}

const USER_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
]

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  meeting: 'פגישה',
  task: 'משימה',
}

const RECURRENCE_LABELS: Record<RecurrenceRule, string> = {
  '': 'ללא חזרות',
  weekly: 'כל שבוע',
  monthly: 'כל חודש',
}

/** Returns overdue info for a task that wasn't completed and has a due date in the past. */
function getOverdueInfo(task: Task): { delayText: string } | null {
  if (task.status === 'completed') return null
  const dueStr = task.end_time ?? task.start_time ?? null
  if (!dueStr) return null
  const due = new Date(dueStr)
  const now = new Date()
  if (due.getTime() >= now.getTime()) return null
  const diffMs = now.getTime() - due.getTime()
  const diffMins = Math.floor(diffMs / (60 * 1000))
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000))
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  let delayText: string
  if (diffDays > 0) {
    const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
    delayText = hours > 0 ? `פיגור של ${diffDays} ימים ו-${hours} שעות` : `פיגור של ${diffDays} ימים`
  } else if (diffHours > 0) {
    const mins = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000))
    delayText = mins > 0 ? `פיגור של ${diffHours} שעות ו-${diffMins % 60} דקות` : `פיגור של ${diffHours} שעות`
  } else {
    delayText = `פיגור של ${diffMins} דקות`
  }
  return { delayText }
}

/** Expand one task into one or more { start, end } for the calendar (for recurring tasks). */
function getTaskOccurrences(
  task: Task,
  rangeStart: Date,
  rangeEnd: Date
): { start: Date; end: Date }[] {
  const startTime = task.start_time
  const endTime = task.end_time
  if (!startTime || !endTime) return []
  const start = new Date(startTime)
  const end = new Date(endTime)
  const durationMs = end.getTime() - start.getTime()
  const rule = (task.recurrence_rule || '') as RecurrenceRule
  const endDateStr = task.recurrence_end_date || null
  const seriesEnd = endDateStr ? new Date(endDateStr) : new Date(start.getFullYear() + 1, start.getMonth(), start.getDate())

  const occurrences: { start: Date; end: Date }[] = []
  if (!rule || rule === '') {
    if (start.getTime() < rangeEnd.getTime() && end.getTime() > rangeStart.getTime()) {
      occurrences.push({ start, end })
    }
    return occurrences
  }

  let current = new Date(start)
  const maxOccurrences = 500
  let count = 0
  while (current.getTime() <= seriesEnd.getTime() && count < maxOccurrences) {
    const occEnd = new Date(current.getTime() + durationMs)
    if (current.getTime() < rangeEnd.getTime() && occEnd.getTime() > rangeStart.getTime()) {
      occurrences.push({ start: new Date(current), end: occEnd })
    }
    count++
    if (rule === 'weekly') {
      current.setDate(current.getDate() + 7)
    } else {
      current.setMonth(current.getMonth() + 1)
    }
  }
  return occurrences
}

interface TaskCalendarProps {
  embedded?: boolean
}

export default function TaskCalendar({ embedded }: TaskCalendarProps = {}) {
  const dispatch = useDispatch()
  const me = useSelector((state: RootState) => state.auth.me)
  const isAdmin = me?.role === 'Admin'
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<UserForTask[]>([])
  const [taskLabels, setTaskLabels] = useState<TaskLabelType[]>([])
  const [loading, setLoading] = useState(true)
  const [filterUserId, setFilterUserId] = useState<number | null>(null)
  const [includeArchived, setIncludeArchived] = useState(false)
  // On refresh always show today's date in Gregorian (לוח לועזי) — no restore from sessionStorage
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date } | null>(() => {
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
    label_ids: [] as number[],
    participant_ids: [] as number[],
    recurrence_rule: '' as RecurrenceRule,
    recurrence_end_date: '',
    requires_closure_approval: false,
  })
  const [createSaving, setCreateSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createPendingFiles, setCreatePendingFiles] = useState<File[]>([])
  const createFileInputRef = useRef<HTMLInputElement>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [taskMessages, setTaskMessages] = useState<TaskMessageType[]>([])
  const [taskMessagesLoading, setTaskMessagesLoading] = useState(false)
  const [taskMessageInput, setTaskMessageInput] = useState('')
  const [taskMessageSending, setTaskMessageSending] = useState(false)
  const taskChatScrollRef = useRef<HTMLDivElement>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editForm, setEditForm] = useState<{
    title: string
    date: string
    start_time: string
    end_time: string
    description: string
    status: TaskStatus
    assigned_to_user_id: string
    recurrence_rule: RecurrenceRule
    recurrence_end_date: string
    label_ids: number[]
    participant_ids: number[]
    requires_closure_approval: boolean
  } | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editUploadingAttachment, setEditUploadingAttachment] = useState(false)
  const [editDeletingAttachmentId, setEditDeletingAttachmentId] = useState<number | null>(null)
  const editFileInputRef = useRef<HTMLInputElement>(null)
  const [taskType, setTaskType] = useState<'meeting' | 'all_day' | 'no_date'>('meeting')
  const [editTaskType, setEditTaskType] = useState<'with_time' | 'date_only' | 'no_date'>('date_only')
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
  const [remindingTaskId, setRemindingTaskId] = useState<number | null>(null)
  const [acknowledgingTaskId, setAcknowledgingTaskId] = useState<number | null>(null)
  const { toast, showToast, hideToast } = useToast()

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
    } else if (type === 'all_day') {
      const now = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
      setCreateForm(f => ({ ...f, date: dateStr, start_time: '', end_time: '' }))
    }
  }, [])
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null)
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState('#3B82F6')
  const [addingLabel, setAddingLabel] = useState(false)

  const [localCalendarDateDisplay, setLocalCalendarDateDisplay] = useState<CalendarDateDisplay>(() => {
    try {
      const saved = sessionStorage.getItem('taskCalendarDateDisplay')
      if (saved === 'hebrew' || saved === 'both' || saved === 'gregorian') return saved
    } catch {
      /* ignore */
    }
    return (me?.calendar_date_display as CalendarDateDisplay) ?? 'gregorian'
  })
  useEffect(() => {
    const v = (me?.calendar_date_display as CalendarDateDisplay) ?? 'gregorian'
    setLocalCalendarDateDisplay(v)
    try {
      if (v === 'hebrew' || v === 'both' || v === 'gregorian') sessionStorage.setItem('taskCalendarDateDisplay', v)
    } catch {
      /* ignore */
    }
  }, [me?.calendar_date_display])

  const [localShowJewishHolidays, setLocalShowJewishHolidays] = useState<boolean>(
    () => me?.show_jewish_holidays ?? true
  )
  const [localShowIslamicHolidays, setLocalShowIslamicHolidays] = useState<boolean>(
    () => me?.show_islamic_holidays ?? false
  )

  useEffect(() => {
    setLocalShowJewishHolidays(me?.show_jewish_holidays ?? true)
  }, [me?.show_jewish_holidays])

  useEffect(() => {
    setLocalShowIslamicHolidays(me?.show_islamic_holidays ?? false)
  }, [me?.show_islamic_holidays])

  const fetchTasks = useCallback(async () => {
    try {
      const params: Record<string, string | boolean> = {}
      if (filterUserId) params.assigned_to_user_id = String(filterUserId)
      if (includeArchived) params.include_archived = true
      if (dateRange) {
        // Send local time strings (no timezone) — the backend stores naive datetimes
        // that represent local time. Using toISOString() would send UTC, causing mismatches.
        const pad = (n: number) => String(n).padStart(2, '0')
        const fmtLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
        params.start = fmtLocal(dateRange.start)
        params.end = fmtLocal(dateRange.end)
      }
      const { data } = await api.get<Task[]>('/tasks/', { params })
      setTasks(data)
    } catch (err) {
      console.error('Failed to fetch tasks:', err)
      setTasks([])
      showToast('שגיאה בטעינת משימות. נסה לרענן את הדף.', 'error')
    } finally {
      setLoading(false)
    }
  }, [filterUserId, dateRange, includeArchived])

  const fetchUsers = useCallback(async () => {
    try {
      const { data } = await api.get<UserForTask[]>('/users/for-tasks')
      setUsers(data)
    } catch (err) {
      console.error('Failed to fetch users:', err)
      setUsers([])
    }
  }, [])

  const fetchTaskLabels = useCallback(async () => {
    try {
      const { data } = await api.get<TaskLabelType[]>('/tasks/labels')
      setTaskLabels(data)
    } catch (err) {
      console.error('Failed to fetch task labels:', err)
      setTaskLabels([])
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  useEffect(() => {
    fetchTaskLabels()
  }, [fetchTaskLabels])

  useEffect(() => {
    setLoading(true)
    fetchTasks()
  }, [fetchTasks])

  useEffect(() => {
    if (!selectedTask?.id) {
      setTaskMessages([])
      setTaskMessageInput('')
      return
    }
    let cancelled = false
    setTaskMessagesLoading(true)
    api.get<TaskMessageType[]>(`/tasks/${selectedTask.id}/messages`)
      .then(({ data }) => {
        if (!cancelled) setTaskMessages(data)
      })
      .catch(() => {
        if (!cancelled) setTaskMessages([])
      })
      .finally(() => {
        if (!cancelled) setTaskMessagesLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedTask?.id])

  useEffect(() => {
    if (!selectedTask?.id || taskMessages.length === 0) return
    taskChatScrollRef.current?.scrollTo({ top: taskChatScrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [selectedTask?.id, taskMessages])

  const handleSendTaskMessage = useCallback(async () => {
    if (!selectedTask?.id || !taskMessageInput.trim() || taskMessageSending) return
    const text = taskMessageInput.trim()
    setTaskMessageInput('')
    setTaskMessageSending(true)
    try {
      const { data } = await api.post<TaskMessageType>(`/tasks/${selectedTask.id}/messages`, { message: text })
      setTaskMessages(prev => [...prev, data])
    } catch {
      setTaskMessageInput(text)
    } finally {
      setTaskMessageSending(false)
    }
  }, [selectedTask?.id, taskMessageInput, taskMessageSending])

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
    const token = getToken()
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
  const calendarRef = useRef<InstanceType<typeof FullCalendar>>(null)
  /** Drag to edge of month view to go prev/next month: timeout and cooldown. */
  const edgeNavTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastEdgeNavTimeRef = useRef<number>(0)
  /** Which edge zone we're in so we don't reset the timer on every mousemove. */
  const edgeZoneRef = useRef<'left' | 'right' | null>(null)
  const currentViewTypeRef = useRef(currentViewType)
  currentViewTypeRef.current = currentViewType
  /** Track previous isHebrewMode to detect display-mode transitions. */
  const prevIsHebrewModeRef = useRef<boolean | null>(null)

  const handleEventClick = (info: EventClickArg) => {
    if (info.event.id.startsWith('jewish-') || info.event.id.startsWith('islamic-')) return
    const taskId = info.event.extendedProps?.taskId ?? (info.event.id.includes('-') ? parseInt(info.event.id.split('-')[0], 10) : parseInt(info.event.id, 10))
    const task = tasks.find(t => t.id === taskId)
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
      await fetchTasks()
    } catch (err) {
      console.error('Failed to delete task:', err)
    } finally {
      setDeletingTaskId(null)
    }
  }

  const handleRemindTask = async (task: Task) => {
    setRemindingTaskId(task.id)
    try {
      await api.post(`/tasks/${task.id}/remind`)
      showToast('תזכורת נשלחה לעובד בהודעות', 'success')
    } catch (err: any) {
      showToast(err?.response?.data?.detail ?? 'שגיאה בשליחת תזכורת', 'error')
    } finally {
      setRemindingTaskId(null)
    }
  }

  const handleAcknowledgeTask = async (task: Task) => {
    setAcknowledgingTaskId(task.id)
    try {
      const { data } = await api.post<Task>(`/tasks/${task.id}/acknowledge`)
      setTasks(prev => prev.map(t => t.id === task.id ? data : t))
      setSelectedTask(prev => prev?.id === task.id ? data : prev)
      showToast('אישרת קבלת המשימה', 'success')
    } catch (err: any) {
      showToast(err?.response?.data?.detail ?? 'שגיאה באישור קבלת המשימה', 'error')
    } finally {
      setAcknowledgingTaskId(null)
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

  // Update toolbar title when switching hebrew/gregorian display (datesSet handles date navigation)
  // In Hebrew month view, use the middle of the range to determine the current month header.
  // We use a MutationObserver because FullCalendar may re-render its own Gregorian title
  // after our manual override, causing both titles to appear together.
  useEffect(() => {
    if (currentViewType !== 'dayGridMonth' || !dateRange?.start || !dateRange?.end) return
    const el = document.querySelector('.task-calendar-wrap .fc-toolbar-title')
    if (!el) return

    let desiredTitle: string
    if (localCalendarDateDisplay === 'hebrew' || localCalendarDateDisplay === 'both') {
      const midDate = new Date((dateRange.start.getTime() + dateRange.end.getTime()) / 2)
      desiredTitle = getHebrewMonthYearHeader(midDate)
    } else {
      desiredTitle = dateRange.start.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
    }

    const applyTitle = () => {
      if (el.textContent !== desiredTitle) {
        el.textContent = desiredTitle
      }
    }
    applyTitle()

    // Watch for FullCalendar overwriting our title and re-apply
    const observer = new MutationObserver(applyTitle)
    observer.observe(el, { childList: true, characterData: true, subtree: true })
    return () => observer.disconnect()
  }, [localCalendarDateDisplay, currentViewType, dateRange?.start, dateRange?.end])

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

  /** Local ISO string with seconds — matches the format used by the create flow.
   *  IMPORTANT: Do NOT use Date.toISOString() for task times — that produces UTC
   *  (with Z suffix) which the backend strips, causing a timezone shift. */
  const toLocalISO = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  const EDGE_NAV_ZONE = 0.18
  const EDGE_NAV_DELAY_MS = 450
  const EDGE_NAV_COOLDOWN_MS = 700

  const handleDragMoveForEdgeNav = useCallback((e: MouseEvent) => {
    if (currentViewTypeRef.current !== 'dayGridMonth') return
    const wrap = document.querySelector('.task-calendar-wrap')
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    const now = Date.now()
    if (now - lastEdgeNavTimeRef.current < EDGE_NAV_COOLDOWN_MS) return
    const x = e.clientX
    const isRtl = document.documentElement.dir === 'rtl'
    const nearLeft = x <= rect.left + rect.width * EDGE_NAV_ZONE
    const nearRight = x >= rect.right - rect.width * EDGE_NAV_ZONE
    if (!nearLeft && !nearRight) {
      edgeZoneRef.current = null
      if (edgeNavTimeoutRef.current) {
        clearTimeout(edgeNavTimeoutRef.current)
        edgeNavTimeoutRef.current = null
      }
      return
    }
    const zone: 'left' | 'right' = nearLeft ? 'left' : 'right'
    if (edgeZoneRef.current === zone) return
    edgeZoneRef.current = zone
    if (edgeNavTimeoutRef.current) {
      clearTimeout(edgeNavTimeoutRef.current)
      edgeNavTimeoutRef.current = null
    }
    const go = (zone === 'left' && isRtl) || (zone === 'right' && !isRtl) ? 'next' : 'prev'
    edgeNavTimeoutRef.current = setTimeout(() => {
      edgeNavTimeoutRef.current = null
      lastEdgeNavTimeRef.current = Date.now()
      edgeZoneRef.current = null
      calendarRef.current?.getApi()?.[go]()
    }, EDGE_NAV_DELAY_MS)
  }, [])

  const handleEventDragStart = useCallback((_arg: EventDragStartArg) => {
    lastEdgeNavTimeRef.current = 0
    edgeZoneRef.current = null
    if (edgeNavTimeoutRef.current) {
      clearTimeout(edgeNavTimeoutRef.current)
      edgeNavTimeoutRef.current = null
    }
    document.addEventListener('mousemove', handleDragMoveForEdgeNav)
  }, [handleDragMoveForEdgeNav])

  const handleEventDragStop = useCallback(() => {
    document.removeEventListener('mousemove', handleDragMoveForEdgeNav)
    edgeZoneRef.current = null
    if (edgeNavTimeoutRef.current) {
      clearTimeout(edgeNavTimeoutRef.current)
      edgeNavTimeoutRef.current = null
    }
  }, [handleDragMoveForEdgeNav])

  // Cleanup edge-nav timeout & listener on unmount (e.g. if user navigates away mid-drag)
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleDragMoveForEdgeNav)
      if (edgeNavTimeoutRef.current) {
        clearTimeout(edgeNavTimeoutRef.current)
        edgeNavTimeoutRef.current = null
      }
    }
  }, [handleDragMoveForEdgeNav])

  const handleEventDrop = (info: EventChangeArg) => {
    if (info.event.id.startsWith('jewish-') || info.event.id.startsWith('islamic-')) {
      info.revert()
      return
    }
    const taskId = info.event.extendedProps?.taskId ?? (info.event.id.includes('-') ? parseInt(info.event.id.split('-')[0], 10) : parseInt(info.event.id, 10))
    const start = info.event.start
    const end = info.event.end
    if (!start || !end) return
    const task = tasks.find(t => t.id === taskId)
    if (!task) {
      info.revert()
      return
    }
    const oldStart = task.start_time ? new Date(task.start_time) : start
    const oldEnd = task.end_time ? new Date(task.end_time) : end
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
      const { data: updatedTask } = await api.put<Task>(`/tasks/${dropConfirm.taskId}`, {
        start_time: toLocalISO(start),
        end_time: toLocalISO(end),
      })
      setDropConfirm(null)
      // Update task in state from server response so the calendar shows new position
      // (refetch would exclude the task if it was dragged outside current date range)
      setTasks((prev) =>
        prev.map((t) => (t.id === updatedTask.id ? { ...t, ...updatedTask } : t))
      )
      try {
        sessionStorage.setItem('taskCalendarView', currentViewType)
        if (dateRange?.start) sessionStorage.setItem('taskCalendarDate', dateRange.start.toISOString())
      } catch {
        /* ignore */
      }
      // Force calendar to re-render with new event positions
      setCalendarRefreshKey((k) => k + 1)
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
    if (info.event.id.startsWith('jewish-') || info.event.id.startsWith('islamic-')) {
      info.revert()
      return
    }
    const taskId = info.event.extendedProps?.taskId ?? (info.event.id.includes('-') ? parseInt(info.event.id.split('-')[0], 10) : parseInt(info.event.id, 10))
    const start = info.event.start
    const end = info.event.end
    if (!start || !end) return
    try {
      await api.put(`/tasks/${taskId}`, {
        start_time: toLocalISO(start),
        end_time: toLocalISO(end),
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

  const handleCreateTaskLabel = useCallback(async () => {
    const name = newLabelName.trim()
    if (!name) return
    setAddingLabel(true)
    try {
      const color = newLabelColor.startsWith('#') ? newLabelColor : `#${newLabelColor}`
      const { data } = await api.post<TaskLabelType>('/tasks/labels', { name, color: color || '#3B82F6' })
      setTaskLabels((prev) => [...prev, data])
      setNewLabelName('')
      setNewLabelColor('#3B82F6')
      if (editForm) {
        setEditForm((f) => (f ? { ...f, label_ids: [...f.label_ids, data.id] } : f))
      } else {
        setCreateForm((f) => ({ ...f, label_ids: [...f.label_ids, data.id] }))
      }
    } catch (err) {
      console.error('Failed to create label:', err)
    } finally {
      setAddingLabel(false)
    }
  }, [newLabelName, newLabelColor, editForm])

  const openEditModal = useCallback((task: Task) => {
    setSelectedTask(null)
    setEditingTask(task)
    const hasDates = !!task.start_time && !!task.end_time
    const start = task.start_time ? new Date(task.start_time) : new Date()
    const end = task.end_time ? new Date(task.end_time) : new Date()
    const isWithTime = hasDates && !(start.getHours() === 0 && start.getMinutes() === 0 && end.getHours() === 23 && end.getMinutes() === 59)
    setEditTaskType(hasDates ? (isWithTime ? 'with_time' : 'date_only') : 'no_date')
    const pad = (n: number) => String(n).padStart(2, '0')
    const recRule = (task.recurrence_rule || '') as RecurrenceRule
    const recEnd = task.recurrence_end_date ? task.recurrence_end_date.slice(0, 10) : ''
    setEditForm({
      title: task.title,
      date: hasDates ? `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}` : '',
      start_time: hasDates ? `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}` : '',
      end_time: hasDates ? `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}` : '',
      description: task.description || '',
      status: (task.status || 'pending') as TaskStatus,
      assigned_to_user_id: String(task.assigned_to_user_id),
      recurrence_rule: recRule === 'weekly' || recRule === 'monthly' ? recRule : '',
      recurrence_end_date: recEnd,
      label_ids: task.labels?.map(l => l.id) ?? [],
      participant_ids: task.participants?.map(p => p.user_id) ?? [],
      requires_closure_approval: task.requires_closure_approval ?? false,
    })
    setEditError(null)
  }, [])

  const handleEditAddAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editingTask || !e.target.files?.length) return
    setEditUploadingAttachment(true)
    try {
      for (const file of Array.from(e.target.files)) {
        const fd = new FormData()
        fd.append('file', file)
        await api.post(`/tasks/${editingTask.id}/attachments`, fd, {
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
  }

  const handleEditDeleteAttachment = async (attachmentId: number) => {
    if (!editingTask) return
    setEditDeletingAttachmentId(attachmentId)
    try {
      await api.delete(`/tasks/${editingTask.id}/attachments/${attachmentId}`)
      setEditingTask((t) =>
        t ? { ...t, attachments: t.attachments?.filter((a) => a.id !== attachmentId) ?? [] } : null
      )
    } catch (err) {
      console.error('Failed to delete attachment:', err)
    } finally {
      setEditDeletingAttachmentId(null)
    }
  }

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
        recurrence_rule: editForm.recurrence_rule || '',
        recurrence_end_date: editForm.recurrence_end_date?.trim() || null,
        requires_closure_approval: editForm.requires_closure_approval,
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
      })
      for (const file of createPendingFiles) {
        const fd = new FormData()
        fd.append('file', file)
        await api.post(`/tasks/${created.id}/attachments`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }
      setShowCreateModal(false)
      setCreateForm({ title: '', date: '', start_time: '', end_time: '', description: '', status: 'pending', assigned_to_user_id: '', label_ids: [], participant_ids: [], recurrence_rule: '', recurrence_end_date: '', requires_closure_approval: false })
      setCreatePendingFiles([])
      if (createFileInputRef.current) createFileInputRef.current.value = ''
      await fetchTasks()
    } catch (err: any) {
      setCreateError(err.response?.data?.detail ?? 'שגיאה ביצירת משימה')
    } finally {
      setCreateSaving(false)
    }
  }

  const handleCalendarDateDisplayChange = async (value: CalendarDateDisplay) => {
    setLocalCalendarDateDisplay(value)
    try {
      sessionStorage.setItem('taskCalendarDateDisplay', value)
    } catch {
      /* ignore */
    }
    // Optimistically update Redux store to avoid "revert" flicker from useEffect
    dispatch(updateUser({ calendar_date_display: value }))
    
    try {
      await api.patch('/users/me', { calendar_date_display: value })
      // No need to fetchMe() here, we already updated locally.
      // This prevents the global loading spinner and full page refresh.
    } catch {
      // Revert if failed
      setLocalCalendarDateDisplay((me?.calendar_date_display as CalendarDateDisplay) ?? 'gregorian')
      dispatch(updateUser({ calendar_date_display: (me?.calendar_date_display as CalendarDateDisplay) ?? 'gregorian' }))
    }
  }

  const handleJewishHolidaysChange = async (value: boolean) => {
    setLocalShowJewishHolidays(value)
    dispatch(updateUser({ show_jewish_holidays: value }))
    try {
      await api.patch('/users/me', { show_jewish_holidays: value })
    } catch {
      /* ignore */
    }
  }

  const handleIslamicHolidaysChange = async (value: boolean) => {
    setLocalShowIslamicHolidays(value)
    dispatch(updateUser({ show_islamic_holidays: value }))
    try {
      await api.patch('/users/me', { show_islamic_holidays: value })
    } catch {
      /* ignore */
    }
  }

  const calendarDateDisplay = localCalendarDateDisplay
  const showJewishHolidays = localShowJewishHolidays
  const showIslamicHolidays = localShowIslamicHolidays

  /** Stable visibleRange for Hebrew month – prevents re-render loops and navigation issues. */
  const hebrewVisibleRange = useCallback((currentDate: Date) => {
    const range = getHebrewMonthRange(currentDate)
    if (!range) {
      const s = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
      const e = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
      return { start: s, end: new Date(e.getTime() + 86400000) }
    }
    const end = new Date(range.end)
    end.setDate(end.getDate() + 1) // FullCalendar end is exclusive
    return { start: range.start, end }
  }, [])

  const isHebrewMode = calendarDateDisplay === 'hebrew' || calendarDateDisplay === 'both'

  const hebrewMonthViews = useMemo(() => {
    const base: Record<string, object> = {
      timeGridWorkWeek: {
        type: 'timeGrid',
        duration: { days: 5 },
        buttonText: 'שבוע עבודה',
      },
    }
    if (isHebrewMode) {
      base.dayGridMonth = {
        fixedWeekCount: false,
        showNonCurrentDates: false,
        visibleRange: hebrewVisibleRange,
      }
    }
    return base
  }, [isHebrewMode, hebrewVisibleRange])

  /**
   * Custom prev/next/today buttons for Hebrew mode.
   * Standard FullCalendar prev/next computes dateIncrement from the visible range duration,
   * which breaks for variable-length Hebrew months (29–30 days) – going back from a 30-day
   * month can skip a 29-day month entirely.
   * These custom buttons always navigate to the exact adjacent Hebrew month.
   */
  const hebrewCustomButtons = useMemo(() => {
    if (!isHebrewMode) return undefined
    return {
      hebrewPrev: {
        text: '‹',
        click: () => {
          const cal = calendarRef.current?.getApi()
          if (!cal) return
          if (cal.view.type === 'dayGridMonth') {
            const prevStart = getPrevHebrewMonthStart(cal.getDate())
            cal.gotoDate(prevStart)
          } else {
            cal.prev()
          }
        },
      },
      hebrewNext: {
        text: '›',
        click: () => {
          const cal = calendarRef.current?.getApi()
          if (!cal) return
          if (cal.view.type === 'dayGridMonth') {
            const nextStart = getNextHebrewMonthStart(cal.getDate())
            cal.gotoDate(nextStart)
          } else {
            cal.next()
          }
        },
      },
      hebrewToday: {
        text: 'היום',
        click: () => {
          calendarRef.current?.getApi()?.today()
        },
      },
    }
  }, [isHebrewMode])

  // When the display mode changes (Hebrew ↔ Gregorian ↔ Both), the calendar stays mounted
  // (no key change). We use the API to re-evaluate the view so Hebrew month boundaries,
  // day-cell rendering, and the toolbar update correctly – without losing the current date.
  useEffect(() => {
    const calApi = calendarRef.current?.getApi()
    if (!calApi) return
    // Skip the very first render – nothing to transition from
    if (prevIsHebrewModeRef.current === null) {
      prevIsHebrewModeRef.current = isHebrewMode
      return
    }
    const hebrewModeChanged = prevIsHebrewModeRef.current !== isHebrewMode
    prevIsHebrewModeRef.current = isHebrewMode

    if (hebrewModeChanged && calApi.view.type === 'dayGridMonth') {
      // Re-initialize month view so FullCalendar picks up the new visibleRange config
      const currentDate = calApi.getDate()
      calApi.changeView('dayGridMonth', currentDate)
    } else {
      // For non-month views or same-mode switches (hebrew ↔ both), just re-render cells
      calApi.render()
    }
  }, [calendarDateDisplay, isHebrewMode])

  const holidayEvents =
    dateRange?.start && dateRange?.end
      ? [
          ...(showJewishHolidays ? getJewishHolidays(dateRange.start, dateRange.end) : []),
          ...(showIslamicHolidays ? getIslamicHolidays(dateRange.start, dateRange.end) : []),
        ]
      : []

  const events = [
    ...holidayEvents,
    ...(dateRange
      ? tasks
          .filter(t => t.start_time && t.end_time)
          .flatMap(t => {
            const rangeStart = dateRange.start
            const rangeEnd = dateRange.end
            const occurrences = getTaskOccurrences(t, rangeStart, rangeEnd)
            const eventType = (t.event_type || 'task') as EventType
            const status = (t.status || 'pending') as TaskStatus
            const color = status === 'completed'
              ? TASK_STATUS_COLORS.completed
              : (t.assigned_user_color ?? USER_COLORS[(t.assigned_to_user_id - 1) % USER_COLORS.length])
            const labels = t.labels || []
            const isRecurring = (t.recurrence_rule || '') !== ''
            return occurrences.map((occ, i) => {
              const start = occ.start
              const end = occ.end
              const isAllDay = start.getHours() === 0 && start.getMinutes() === 0 && end.getHours() === 23 && end.getMinutes() === 59
              const isAllDayTask = isAllDay
              const eventId = occurrences.length > 1 ? `${t.id}-${i}` : String(t.id)
              return {
                id: eventId,
                title: t.title,
                start: start.toISOString(),
                end: isAllDayTask ? undefined : end.toISOString(),
                allDay: isAllDayTask,
                backgroundColor: isAllDayTask ? color : 'transparent',
                borderColor: isAllDayTask ? color : 'transparent',
                textColor: 'inherit',
                classNames: [eventType === 'meeting' ? 'fc-event-meeting' : 'fc-event-task', isAllDayTask ? 'fc-event-task-no-time' : '', 'fc-event-outlook'],
                extendedProps: { eventType, labels, taskId: t.id, isAllDayTask, status, isRecurring, color },
              }
            })
          })
      : []),
  ]

  return (
    <div className={cn('task-calendar-page', !embedded && 'min-h-screen bg-[#f0f4f8] dark:bg-[#0f1419]')}>
      <div className={cn('max-w-[1680px] mx-auto px-4 sm:px-6 space-y-6', !embedded && 'py-6 sm:py-8')}>
        {!embedded && (
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25 dark:shadow-violet-600/20">
              <Calendar className="w-7 h-7" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                יומן משימות
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                ניהול פגישות ומשימות
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
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
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
                >
                  <Calendar className="w-4 h-4" />
                  פגישה חדשה
                </button>
                <PermissionGuard action="write" resource="task">
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
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
                  >
                    <Plus className="w-4 h-4" />
                    משימה חדשה
                  </button>
                </PermissionGuard>
              </div>
            )}
            {outlookStatus?.configured && (
              <div className="flex items-center gap-2">
                {outlookStatus.connected ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                      <CalendarSync className="w-4 h-4" />
                      מחובר ל-Outlook
                    </span>
                    <button
                      type="button"
                      onClick={handleOutlookDisconnect}
                      disabled={outlookDisconnecting}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700/50 disabled:opacity-50 transition-colors"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      נתק
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleOutlookConnect}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 transition-colors shadow-sm"
                  >
                    <Link2 className="w-4 h-4" />
                    סנכרון ל-Outlook
                  </button>
                )}
              </div>
            )}
          </div>
        </header>
        )}

        <div className="space-y-3">
            <div className="rounded-2xl border border-gray-200/80 dark:border-gray-700/80 bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl shadow-xl shadow-gray-200/40 dark:shadow-none p-5 sm:p-6">
              {loading && tasks.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400 font-medium">טוען...</div>
              ) : (
                <>
                <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b border-gray-200 dark:border-gray-600">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">סוג תאריך בתאים:</span>
                  <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700/50 p-0.5">
                    {(['gregorian', 'hebrew', 'both'] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => handleCalendarDateDisplayChange(opt)}
                        className={cn(
                          'px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200',
                          calendarDateDisplay === opt
                            ? 'bg-violet-600 text-white shadow-md'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        )}
                      >
                        {opt === 'gregorian' ? 'לועזי' : opt === 'hebrew' ? 'עברי' : 'עברי ולועזי'}
                      </button>
                    ))}
                  </div>
                  <div className="h-5 w-px bg-gray-200 dark:bg-gray-600" />
                  <button
                    type="button"
                    onClick={() => handleJewishHolidaysChange(!showJewishHolidays)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
                      showJewishHolidays
                        ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300'
                        : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                    )}
                  >
                    ✡️ חגי ישראל
                  </button>
                  <button
                    type="button"
                    onClick={() => handleIslamicHolidaysChange(!showIslamicHolidays)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
                      showIslamicHolidays
                        ? 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-800 dark:text-green-300'
                        : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                    )}
                  >
                    ☪️ חגים אסלאמיים
                  </button>
                  <div className="h-5 w-px bg-gray-200 dark:bg-gray-600" />
                  {isAdmin && (
                    <>
                      <select
                        id="filter-user"
                        name="filter-user"
                        value={filterUserId ?? ''}
                        onChange={(e) => setFilterUserId(e.target.value ? Number(e.target.value) : null)}
                        className="task-calendar-select px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100 text-sm font-medium focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-shadow"
                      >
                        <option value="">כל המשתמשים</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.full_name}</option>
                        ))}
                      </select>
                      {users.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-400 dark:text-gray-500">צבע:</span>
                          {users.map((u) => {
                            const color = u.calendar_color || USER_COLORS[(u.id - 1) % USER_COLORS.length]
                            return (
                              <label key={u.id} title={u.full_name} className="relative cursor-pointer group">
                                <div
                                  className="w-6 h-6 rounded-full shadow-sm ring-2 ring-white dark:ring-gray-800 group-hover:ring-violet-400 transition-all"
                                  style={{ backgroundColor: color }}
                                />
                                <input
                                  id={`user-color-${u.id}`}
                                  name={`user-color-${u.id}`}
                                  type="color"
                                  value={color.startsWith('#') ? color : `#${color}`}
                                  onChange={(e) => handleUserColorChange(u.id, e.target.value)}
                                  disabled={!!updatingUserColorId}
                                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full disabled:cursor-not-allowed"
                                  aria-label={`צבע ל${u.full_name}`}
                                />
                              </label>
                            )
                          })}
                        </div>
                      )}
                      <div className="h-5 w-px bg-gray-200 dark:bg-gray-600" />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setIncludeArchived(v => !v)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
                      includeArchived
                        ? 'bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300'
                        : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 hover:border-amber-300 hover:text-amber-700 dark:hover:text-amber-400'
                    )}
                  >
                    <Archive className="w-3.5 h-3.5" />
                    {includeArchived ? 'הסתר ארכיון' : 'הצג ארכיון'}
                  </button>
                </div>
                <div
                  className={cn(
                    'task-calendar-wrap',
                    currentViewType === 'dayGridMonth' && 'task-calendar-wrap--month',
                    (calendarDateDisplay === 'hebrew' || calendarDateDisplay === 'both') && currentViewType === 'dayGridMonth' && 'task-calendar-wrap--hebrew-month'
                  )}
                >
            <FullCalendar
              ref={calendarRef}
              key={calendarRefreshKey}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              initialView={currentViewType}
              initialDate={dateRange?.start ?? undefined}
              events={events}
              dayCellContent={(arg) => {
                const esc = (s: string) => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;')
                if (calendarDateDisplay === 'both') {
                  const parts = getCalendarDayBothParts(arg.date)
                  if (parts) {
                    const html = `<span class="fc-daygrid-day-number fc-day-both"><span class="fc-day-greg">${esc(String(parts.gregorian))}</span><span class="fc-day-heb">${esc(parts.hebrew)}</span></span>`
                    return { html }
                  }
                }
                const text = formatCalendarDay(arg.date, calendarDateDisplay)
                return { html: `<span class="fc-daygrid-day-number">${esc(text)}</span>` }
              }}
              eventDidMount={(info) => {
                const el = info.el
                const ev = info.event
                const ext = ev.extendedProps as { isHoliday?: boolean; kind?: 'jewish' | 'islamic'; taskId?: number }
                if (ext.isHoliday) {
                  el.setAttribute('title', ev.title || '')
                  return
                }
                const taskId = ext.taskId
                if (taskId != null) {
                  const t = tasks.find(x => x.id === taskId)
                  if (t) {
                    const typeLabel = EVENT_TYPE_LABELS[(t.event_type || 'task') as EventType]
                    const statusLabel = TASK_STATUS_LABELS[(t.status || 'pending') as TaskStatus]
                    const parts: string[] = [
                      t.title,
                      `סוג: ${typeLabel}`,
                      `מוקצה: ${t.assigned_user_name || '-'}`,
                      `מצב: ${statusLabel}`,
                    ]
                    const overdue = getOverdueInfo(t)
                    if (overdue) parts.push(`משימות בפיגור: ${overdue.delayText}`)
                    if (t.start_time && t.end_time) {
                      const fmt = (s: string) => new Date(s).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
                      parts.push(`משעה: ${fmt(t.start_time)}`, `עד שעה: ${fmt(t.end_time)}`)
                    }
                    if (t.description?.trim()) parts.push(`תיאור: ${t.description.trim()}`)
                    el.setAttribute('title', parts.join('\n'))
                  }
                }
              }}
              editable={true}
              droppable={true}
              selectable={true}
              fixedMirrorParent={typeof document !== 'undefined' ? document.body : undefined}
              select={handleSelect}
              eventDragStart={handleEventDragStart}
              eventDragStop={handleEventDragStop}
              eventDrop={handleEventDrop}
              eventResize={handleEventResize}
              eventClick={handleEventClick}
              datesSet={handleDatesSet}
              eventContent={(arg) => {
                const esc = (s: string) => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;')
                if ((arg.event.extendedProps as { isHoliday?: boolean }).isHoliday) {
                  const title = arg.event.title
                  return {
                    html: `<div class="fc-event-main-frame"><div class="fc-event-title-container"><div class="fc-event-title fc-sticky">${esc(title)}</div></div></div>`,
                  }
                }
                const ext = arg.event.extendedProps as {
                  labels?: TaskLabelType[]
                  eventType?: EventType
                  status?: TaskStatus
                  isRecurring?: boolean
                  color?: string
                  isAllDayTask?: boolean
                }
                const labels = ext.labels || []
                const eventType = ext.eventType || 'task'
                const status = ext.status || 'pending'
                const isRecurring = ext.isRecurring || false
                const color = ext.color || '#6B7280'
                const isAllDayTask = ext.isAllDayTask || false
                const title = arg.event.title

                if (isAllDayTask) return undefined

                // Format time
                const startDate = arg.event.start
                const endDate = arg.event.end
                let timeStr = ''
                if (startDate && !arg.event.allDay) {
                  const pad = (n: number) => String(n).padStart(2, '0')
                  const startHH = pad(startDate.getHours())
                  const startMM = pad(startDate.getMinutes())
                  timeStr = `${startHH}:${startMM}`
                  if (endDate) {
                    const endHH = pad(endDate.getHours())
                    const endMM = pad(endDate.getMinutes())
                    timeStr += ` - ${endHH}:${endMM}`
                  }
                }

                // Status icon
                const statusIcon = status === 'completed' ? '✓' : status === 'in_progress' ? '●' : status === 'pending_closure' ? '◐' : '○'
                const typeIcon = eventType === 'meeting' ? '📅' : '📋'
                const recurIcon = isRecurring ? ' 🔁' : ''

                // Labels pills
                const pills = labels
                  .map((l: TaskLabelType) =>
                    `<span class="fc-event-label-pill" style="background:${l.color};color:white;padding:1px 5px;border-radius:4px;font-size:10px;white-space:nowrap;line-height:1.4">${esc(l.name)}</span>`
                  )
                  .join('')

                return {
                  html: `<div class="fc-outlook-event" style="--evt-color:${color}">
                    <div class="fc-outlook-bar" style="background:${color}"></div>
                    <div class="fc-outlook-body">
                      ${timeStr ? `<div class="fc-outlook-time">${typeIcon} ${esc(timeStr)}${recurIcon}</div>` : `<div class="fc-outlook-time">${typeIcon}${recurIcon}</div>`}
                      <div class="fc-outlook-title">${esc(title)}</div>
                      ${labels.length > 0 ? `<div class="fc-outlook-labels">${pills}</div>` : ''}
                    </div>
                    <div class="fc-outlook-status" title="${esc(TASK_STATUS_LABELS[status as TaskStatus] || '')}">${statusIcon}</div>
                  </div>`,
                }
              }}
              customButtons={hebrewCustomButtons}
              headerToolbar={{
                start: 'timeGridDay,timeGridWeek,timeGridWorkWeek,dayGridMonth,listWeek',
                center: 'title',
                end: isHebrewMode ? 'hebrewPrev,hebrewNext hebrewToday' : 'prev,next today',
              }}
              views={hebrewMonthViews}
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
              contentHeight={720}
              slotMinTime="00:00:00"
              slotMaxTime="24:00:00"
              allDayText="כל היום"
              eventDisplay="block"
            />
            </div>
            </>
          )}
        </div>
            {(() => {
              const noDateTasks = tasks.filter(t => !t.start_time && !t.end_time)
              const tasksWithDateNoTime = tasks.filter(t => {
                if (!t.start_time || !t.end_time) return false
                const s = new Date(t.start_time)
                const e = new Date(t.end_time)
                return s.getHours() === 0 && s.getMinutes() === 0 && e.getHours() === 23 && e.getMinutes() === 59
              })
              const hasAny = noDateTasks.length > 0 || tasksWithDateNoTime.length > 0
              if (!hasAny) return null
              const taskItem = (t: Task) => {
                const status = (t.status || 'pending') as TaskStatus
                const color = TASK_STATUS_COLORS[status] ?? t.assigned_user_color ?? USER_COLORS[(t.assigned_to_user_id - 1) % USER_COLORS.length]
                const avatarSrc = avatarUrl(t.assigned_user_avatar)
                return (
                  <li key={t.id} className="flex items-center gap-2">
                    {avatarSrc ? (
                      <img src={avatarSrc} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0 ring-2 ring-white dark:ring-gray-800" />
                    ) : (
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    )}
                    <button type="button" onClick={() => setSelectedTask(t)} className="text-left font-medium text-amber-900 dark:text-amber-100 hover:underline">
                      {t.title} – {t.assigned_user_name}
                    </button>
                  </li>
                )
              }
              const byDate = new Map<string, Task[]>()
              tasksWithDateNoTime.forEach(t => {
                const d = t.start_time!.slice(0, 10)
                if (!byDate.has(d)) byDate.set(d, [])
                byDate.get(d)!.push(t)
              })
              const sortedDates = Array.from(byDate.keys()).sort()
              return (
                <div className="rounded-2xl border border-amber-200/80 dark:border-amber-700/50 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-4 shadow-lg shadow-amber-200/20 dark:shadow-none">
                  <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-2 flex items-center gap-2">משימות</h3>
                  {noDateTasks.length > 0 && (
                    <div className="mb-3">
                      <h4 className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1.5">בלי תאריך</h4>
                      <ul className="space-y-1.5 text-sm">{noDateTasks.map(taskItem)}</ul>
                    </div>
                  )}
                  {sortedDates.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1.5">עם תאריך (בלי שעה)</h4>
                      <ul className="space-y-2 text-sm">
                        {sortedDates.map(dateStr => (
                          <li key={dateStr}>
                            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">{new Date(dateStr + 'T12:00:00').toLocaleDateString('he-IL')}</span>
                            <ul className="mt-0.5 space-y-1 pr-2 border-r-2 border-amber-200 dark:border-amber-700">
                              {byDate.get(dateStr)!.map(taskItem)}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })()}
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
                  <label htmlFor="drop-custom-start" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">משעה</label>
                  <input
                    id="drop-custom-start"
                    name="drop-custom-start"
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
                  <label htmlFor="drop-custom-end" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">עד שעה</label>
                  <input
                    id="drop-custom-end"
                    name="drop-custom-end"
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

      {selectedTask && (() => {
        const overdueInfo = getOverdueInfo(selectedTask)
        return (
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
              <label htmlFor="detail-status" className="text-sm text-gray-600 dark:text-gray-400">מצב: </label>
              <select
                id="detail-status"
                name="detail-status"
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
              {overdueInfo && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200" title={overdueInfo.delayText}>
                  משימות בפיגור: {overdueInfo.delayText}
                </span>
              )}
            </div>
            <p className="text-sm flex items-center gap-2">
              <span className="text-gray-600 dark:text-gray-400">מוקצה למשתמש: </span>
              {avatarUrl(selectedTask.assigned_user_avatar) ? (
                <span className="flex items-center gap-2">
                  <img src={avatarUrl(selectedTask.assigned_user_avatar)!} alt="" className="w-6 h-6 rounded-full object-cover" />
                  <span className="font-medium">{selectedTask.assigned_user_name}</span>
                </span>
              ) : (
                <span className="font-medium">{selectedTask.assigned_user_name}</span>
              )}
            </p>
            {selectedTask.assignee_acknowledged_at ? (
              <p className="text-sm flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>הלקוח אימת קבלת המשימה ב־{new Date(selectedTask.assignee_acknowledged_at).toLocaleString('he-IL')}</span>
              </p>
            ) : me?.id === selectedTask.assigned_to_user_id && (
              <button
                type="button"
                onClick={() => selectedTask && handleAcknowledgeTask(selectedTask)}
                disabled={acknowledgingTaskId === selectedTask?.id}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                {acknowledgingTaskId === selectedTask?.id ? 'מאשר...' : 'אישרתי קבלת המשימה'}
              </button>
            )}
            {selectedTask.start_time && selectedTask.end_time && (
              <p className="text-sm">
                <span className="text-gray-600 dark:text-gray-400">משעה עד שעה: </span>
                {new Date(selectedTask.start_time).toLocaleString('he-IL')} – {new Date(selectedTask.end_time).toLocaleString('he-IL')}
              </p>
            )}
            {!selectedTask.start_time && !selectedTask.end_time && (
              <p className="text-sm text-gray-600 dark:text-gray-400">משימה בלי תאריך</p>
            )}
            {(selectedTask.recurrence_rule === 'weekly' || selectedTask.recurrence_rule === 'monthly') && (
              <p className="text-sm">
                <span className="text-gray-600 dark:text-gray-400">משימה מחזורית: </span>
                <span className="font-medium">{RECURRENCE_LABELS[selectedTask.recurrence_rule as RecurrenceRule]}</span>
                {selectedTask.recurrence_end_date && (
                  <span className="text-gray-600 dark:text-gray-400"> עד {selectedTask.recurrence_end_date}</span>
                )}
              </p>
            )}
            {selectedTask.description && (
              <p className="text-sm">
                <span className="text-gray-600 dark:text-gray-400">תיאור: </span>
                {selectedTask.description}
              </p>
            )}
            {(selectedTask.labels?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">לייבלים: </span>
                {selectedTask.labels?.map((l) => (
                  <span
                    key={l.id}
                    className="px-2 py-0.5 rounded-full text-xs text-white"
                    style={{ backgroundColor: l.color }}
                  >
                    {l.name}
                  </span>
                ))}
              </div>
            )}

            {/* שיח משימה – צ'אט למשימה, גלוי לכל משתתפי המשימה */}
            <div className="border-t border-gray-200 dark:border-gray-600 pt-3 mt-3">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                <MessageCircle className="w-4 h-4" />
                שיח משימה
              </p>
              <div
                ref={taskChatScrollRef}
                className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-600 overflow-y-auto min-h-[120px] max-h-[220px] p-2 space-y-2"
              >
                {taskMessagesLoading ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">טוען הודעות...</p>
                ) : taskMessages.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">אין הודעות. התחל שיחה.</p>
                ) : (
                  taskMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex gap-2 p-2 rounded-lg',
                        msg.user_id === me?.id
                          ? 'bg-blue-50 dark:bg-blue-900/20 ml-4'
                          : 'bg-white dark:bg-gray-700/50 mr-4'
                      )}
                    >
                      {avatarUrl(msg.avatar_url) ? (
                        <img src={avatarUrl(msg.avatar_url)!} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center flex-shrink-0 text-xs text-gray-600 dark:text-gray-300">
                          {(msg.full_name || '?').charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{msg.full_name}</p>
                        <p className="text-sm text-gray-900 dark:text-gray-100 break-words whitespace-pre-wrap">{msg.message}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {new Date(msg.created_at).toLocaleString('he-IL')}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={taskMessageInput}
                  onChange={(e) => setTaskMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendTaskMessage()
                    }
                  }}
                  placeholder="כתוב הודעה..."
                  className={cn(
                    "flex-1 px-3 py-2 border rounded-lg text-sm",
                    "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100",
                    "placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  )}
                  disabled={taskMessageSending}
                />
                <button
                  type="button"
                  onClick={handleSendTaskMessage}
                  disabled={!taskMessageInput.trim() || taskMessageSending}
                  className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  title="שלח"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">לעריכה: לחץ פעמיים על האירוע או השתמש בכפתור עריכה.</p>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-600 mt-4">
              <button
                type="button"
                onClick={() => selectedTask && handleRemindTask(selectedTask)}
                disabled={remindingTaskId === selectedTask?.id}
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50"
                title="שלח תזכורת לעובד המוקצה – תופיע בהודעות"
              >
                <Bell className="w-4 h-4" />
                {remindingTaskId === selectedTask?.id ? 'שולח...' : 'הזכר'}
              </button>
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
        )
      })()}

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
              <label htmlFor="edit-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">כותרת</label>
              <input
                id="edit-title"
                name="edit-title"
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
              <label htmlFor="edit-assigned" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מוקצה למשתמש</label>
              <select
                id="edit-assigned"
                name="edit-assigned"
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
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                <Tag className="w-4 h-4" />
                לייבלים
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {taskLabels.map((l) => (
                  <label
                    key={l.id}
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
                  onClick={handleCreateTaskLabel}
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
                      onChange={(e) => setEditForm(f => f ? { ...f, start_time: e.target.value } : f)}
                      className={cn(
                        "w-full px-3 py-2 border rounded-lg",
                        "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
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
            {editTaskType === 'date_only' && (
              <div>
                <label htmlFor="edit-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תאריך (משימה)</label>
                <input
                  id="edit-date"
                  name="edit-date"
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
            {editTaskType !== 'no_date' && (editForm.start_time || editForm.date) && (
              <div className="p-2 bg-slate-50 dark:bg-slate-900/20 rounded-lg border border-slate-200 dark:border-slate-700">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">משימה מחזורית</p>
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <label htmlFor="edit-recurrence" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">חזרה</label>
                    <select
                      id="edit-recurrence"
                      name="edit-recurrence"
                      value={editForm.recurrence_rule}
                      onChange={(e) => setEditForm(f => f ? { ...f, recurrence_rule: e.target.value as RecurrenceRule } : f)}
                      className={cn(
                        "px-3 py-2 border rounded-lg text-sm",
                        "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      )}
                    >
                      {(Object.keys(RECURRENCE_LABELS) as RecurrenceRule[]).map((r) => (
                        <option key={r || 'none'} value={r}>{RECURRENCE_LABELS[r]}</option>
                      ))}
                    </select>
                  </div>
                  {(editForm.recurrence_rule === 'weekly' || editForm.recurrence_rule === 'monthly') && (
                    <div>
                      <label htmlFor="edit-recurrence-end" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">תאריך סיום חזרות (אופציונלי)</label>
                      <input
                        id="edit-recurrence-end"
                        name="edit-recurrence-end"
                        type="date"
                        value={editForm.recurrence_end_date}
                        onChange={(e) => setEditForm(f => f ? { ...f, recurrence_end_date: e.target.value } : f)}
                        className={cn(
                          "px-3 py-2 border rounded-lg text-sm",
                          "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        )}
                      />
                    </div>
                  )}
                </div>
              </div>
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
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
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
                {(editingTask?.attachments ?? []).map((att) => (
                  <span key={att.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-600 text-xs">
                    <a
                      href={fileAttachmentUrl(att.file_url) ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate max-w-[120px] hover:underline"
                      title={att.file_name}
                    >
                      {att.file_name}
                    </a>
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
                onChange={(e) => setEditForm(f => f ? { ...f, description: e.target.value } : f)}
                rows={2}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg text-sm",
                  "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                )}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-requires-closure"
                checked={editForm.requires_closure_approval}
                onChange={(e) => setEditForm(f => f ? { ...f, requires_closure_approval: e.target.checked } : f)}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600"
              />
              <label htmlFor="edit-requires-closure" className="text-sm text-gray-700 dark:text-gray-300">
                דורש אישור מנהל לסגירה
              </label>
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
          onClose={() => { setShowCreateModal(false); setCreatePendingFiles([]); }}
          title="משימה חדשה"
        >
          <form onSubmit={handleCreate} className="space-y-2">
            {createError && (
              <p className="text-sm text-red-600 dark:text-red-400">{createError}</p>
            )}
            <div>
              <label htmlFor="create-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">כותרת</label>
              <input
                id="create-title"
                name="create-title"
                type="text"
                value={createForm.title}
                onChange={(e) => setCreateForm(f => ({ ...f, title: e.target.value }))}
                className={cn(
                  "w-full px-3 py-1.5 border rounded-lg text-sm",
                  "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                )}
                required
              />
            </div>
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
                  <label htmlFor="create-status" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">מצב</label>
                  <select
                    id="create-status"
                    name="create-status"
                    value={createForm.status}
                    onChange={(e) => setCreateForm(f => ({ ...f, status: e.target.value as TaskStatus }))}
                    className={cn(
                      "w-full px-2 py-1.5 border rounded-lg text-sm",
                      "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    )}
                  >
                    {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((s) => (
                      <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="create-assigned" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">מוקצה ל</label>
                  <select
                    id="create-assigned"
                    name="create-assigned"
                    value={createForm.assigned_to_user_id}
                    onChange={(e) => setCreateForm(f => ({ ...f, assigned_to_user_id: e.target.value }))}
                    className={cn(
                      "w-full px-2 py-1.5 border rounded-lg text-sm",
                      "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    )}
                    required
                  >
                    <option value="">בחר</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5" /> לייבלים
              </label>
              <div className="flex flex-wrap gap-1.5 mb-1">
                {taskLabels.map((l) => (
                  <label
                    key={l.id}
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border cursor-pointer',
                      createForm.label_ids.includes(l.id) ? 'border-transparent text-white' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
                    )}
                    style={createForm.label_ids.includes(l.id) ? { backgroundColor: l.color } : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={createForm.label_ids.includes(l.id)}
                      onChange={(e) => {
                        if (e.target.checked) setCreateForm((f) => ({ ...f, label_ids: [...f.label_ids, l.id] }))
                        else setCreateForm((f) => ({ ...f, label_ids: f.label_ids.filter((id) => id !== l.id) }))
                      }}
                      className="sr-only"
                    />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/80 flex-shrink-0" style={createForm.label_ids.includes(l.id) ? {} : { backgroundColor: l.color }} />
                    {l.name}
                  </label>
                ))}
                <input
                  id="create-new-label-name"
                  name="create-new-label-name"
                  type="text"
                  placeholder="לייבל חדש"
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  aria-label="שם לייבל חדש"
                  className={cn(
                    'px-2 py-1 border rounded text-xs w-24',
                    'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                  )}
                />
                <input id="create-new-label-color" name="create-new-label-color" type="color" value={newLabelColor} onChange={(e) => setNewLabelColor(e.target.value)} className="w-6 h-6 rounded border border-gray-300 dark:border-gray-600 cursor-pointer bg-transparent" title="צבע" aria-label="צבע לייבל חדש" />
                <button type="button" onClick={handleCreateTaskLabel} disabled={addingLabel || !newLabelName.trim()} className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50">הוסף</button>
              </div>
            </div>
            {taskType === 'all_day' && (
              <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <label htmlFor="create-date" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">תאריך *</label>
                <input
                  id="create-date"
                  name="create-date"
                  type="date"
                  value={createForm.date}
                  onChange={(e) => setCreateForm(f => ({ ...f, date: e.target.value }))}
                  className={cn(
                    "w-full px-2 py-1.5 border rounded-lg text-sm",
                    "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  )}
                />
              </div>
            )}
            {taskType === 'meeting' && (
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="create-start-time" className="block text-xs text-gray-700 dark:text-gray-300 mb-0.5">משעה *</label>
                    <input
                      id="create-start-time"
                      name="create-start-time"
                      type="datetime-local"
                      value={createForm.start_time}
                      onChange={(e) => setCreateForm(f => ({ ...f, start_time: e.target.value }))}
                      required={taskType === 'meeting'}
                      className={cn(
                        "w-full px-2 py-1.5 border rounded-lg text-sm",
                        "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      )}
                    />
                  </div>
                  <div>
                    <label htmlFor="create-end-time" className="block text-xs text-gray-700 dark:text-gray-300 mb-0.5">עד שעה *</label>
                    <input
                      id="create-end-time"
                      name="create-end-time"
                      type="datetime-local"
                      value={createForm.end_time}
                      onChange={(e) => setCreateForm(f => ({ ...f, end_time: e.target.value }))}
                      required={taskType === 'meeting'}
                      className={cn(
                        "w-full px-2 py-1.5 border rounded-lg text-sm",
                        "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      )}
                    />
                  </div>
                </div>
              </div>
            )}
            {(taskType === 'meeting' || taskType === 'all_day') && (
              <div className="p-2 bg-slate-50 dark:bg-slate-900/20 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-2">
                <label htmlFor="create-recurrence" className="text-xs font-medium text-gray-700 dark:text-gray-300">חזרה</label>
                <select
                  id="create-recurrence"
                  name="create-recurrence"
                  value={createForm.recurrence_rule}
                  onChange={(e) => setCreateForm(f => ({ ...f, recurrence_rule: e.target.value as RecurrenceRule }))}
                  className={cn(
                    "px-2 py-1 border rounded text-sm",
                    "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  )}
                >
                  {(Object.keys(RECURRENCE_LABELS) as RecurrenceRule[]).map((r) => (
                    <option key={r || 'none'} value={r}>{RECURRENCE_LABELS[r]}</option>
                  ))}
                </select>
                {(createForm.recurrence_rule === 'weekly' || createForm.recurrence_rule === 'monthly') && (
                  <input
                    id="create-recurrence-end"
                    name="create-recurrence-end"
                    type="date"
                    value={createForm.recurrence_end_date}
                    onChange={(e) => setCreateForm(f => ({ ...f, recurrence_end_date: e.target.value }))}
                    className={cn(
                      "px-2 py-1 border rounded text-sm",
                      "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    )}
                    title="תאריך סיום חזרות"
                    aria-label="תאריך סיום חזרות"
                  />
                )}
              </div>
            )}
            {taskType === 'all_day' && (
              <p className="text-xs text-gray-600 dark:text-gray-400">משימה בלי שעה – תופיע תחת משימות ביומן (ובלוח החודש בתא הנבחר).</p>
            )}
            {taskType === 'no_date' && (
              <p className="text-xs text-gray-600 dark:text-gray-400">משימה בלי תאריך – תופיע תחת משימות (רשימת משימות בלי תאריך).</p>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">קבצים / תמונות</label>
              <input
                id="create-files"
                name="create-files"
                ref={createFileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
                onChange={(e) => {
                  const files = e.target.files ? Array.from(e.target.files) : []
                  setCreatePendingFiles((prev) => [...prev, ...files])
                }}
                className="hidden"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => createFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
                >
                  <Paperclip className="w-3.5 h-3.5" /> הוסף קבצים
                </button>
                {createPendingFiles.map((file, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-600 text-xs">
                    {file.name}
                    <button type="button" onClick={() => setCreatePendingFiles((p) => p.filter((_, j) => j !== i))} className="p-0.5 rounded hover:bg-gray-300 dark:hover:bg-gray-500" aria-label="הסר"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="create-description" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">תיאור</label>
              <textarea
                id="create-description"
                name="create-description"
                value={createForm.description}
                onChange={(e) => setCreateForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                className={cn(
                  "w-full px-3 py-1.5 border rounded-lg text-sm",
                  "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                )}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="create-requires-closure"
                checked={createForm.requires_closure_approval}
                onChange={(e) => setCreateForm(f => ({ ...f, requires_closure_approval: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600"
              />
              <label htmlFor="create-requires-closure" className="text-sm text-gray-700 dark:text-gray-300">
                דורש אישור מנהל לסגירה
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setShowCreateModal(false); setCreatePendingFiles([]); }}
                className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                ביטול
              </button>
              <button
                type="submit"
                disabled={createSaving}
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
              >
                {createSaving ? 'שומר...' : 'צור משימה'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      <ToastNotification toast={toast} onClose={hideToast} />
    </div>
  )
}
