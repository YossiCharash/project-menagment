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
import { Calendar, User, Plus, Trash2, Pencil, CalendarSync, Link2, Unlink, Tag, Paperclip, X } from 'lucide-react'
import Modal from '../components/Modal'
import { cn } from '../lib/utils'
import { fetchMe, updateUser } from '../store/slices/authSlice'
import { formatCalendarDay, getCalendarDayBothParts, getHebrewMonthRange, getHebrewMonthYearHeader, getJewishHolidays, getIslamicHolidays, getNextHebrewMonthStart, getPrevHebrewMonthStart, type CalendarDateDisplay } from '../lib/calendarUtils'
import './TaskCalendar.css'

export interface UserForTask {
  id: number
  full_name: string
  calendar_color?: string | null
  avatar_url?: string | null
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed'

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

const RECURRENCE_LABELS: Record<RecurrenceRule, string> = {
  '': 'ללא חזרות',
  weekly: 'כל שבוע',
  monthly: 'כל חודש',
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

export default function TaskCalendar() {
  const dispatch = useDispatch()
  const me = useSelector((state: RootState) => state.auth.me)
  const isAdmin = me?.role === 'Admin'
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<UserForTask[]>([])
  const [taskLabels, setTaskLabels] = useState<TaskLabelType[]>([])
  const [loading, setLoading] = useState(true)
  const [filterUserId, setFilterUserId] = useState<number | null>(null)
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
  })
  const [createSaving, setCreateSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createPendingFiles, setCreatePendingFiles] = useState<File[]>([])
  const createFileInputRef = useRef<HTMLInputElement>(null)
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
    recurrence_rule: RecurrenceRule
    recurrence_end_date: string
    label_ids: number[]
    participant_ids: number[]
  } | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editUploadingAttachment, setEditUploadingAttachment] = useState(false)
  const [editDeletingAttachmentId, setEditDeletingAttachmentId] = useState<number | null>(null)
  const editFileInputRef = useRef<HTMLInputElement>(null)
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
  const calendarRef = useRef<InstanceType<typeof FullCalendar>>(null)
  /** Drag to edge of month view to go prev/next month: timeout and cooldown. */
  const edgeNavTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastEdgeNavTimeRef = useRef<number>(0)
  /** Which edge zone we're in so we don't reset the timer on every mousemove. */
  const edgeZoneRef = useRef<'left' | 'right' | null>(null)
  const currentViewTypeRef = useRef(currentViewType)
  currentViewTypeRef.current = currentViewType
  /** Anchor date = midpoint of visible range; survives display-mode switches. */
  const anchorDateRef = useRef<Date>(dateRange?.start ?? new Date())

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
    // Keep anchor date at the midpoint of the visible range so switching
    // display modes (Hebrew ↔ Gregorian) stays on the same period.
    anchorDateRef.current = new Date((arg.start.getTime() + arg.end.getTime()) / 2)
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
      await fetchTasks()
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
    const eventType = (task.event_type || 'task') as EventType
    const hasDates = !!task.start_time && !!task.end_time
    const start = task.start_time ? new Date(task.start_time) : new Date()
    const end = task.end_time ? new Date(task.end_time) : new Date()
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
      event_type: eventType,
      recurrence_rule: recRule === 'weekly' || recRule === 'monthly' ? recRule : '',
      recurrence_end_date: recEnd,
      label_ids: task.labels?.map(l => l.id) ?? [],
      participant_ids: task.participants?.map(p => p.user_id) ?? [],
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
      editFileInputRef.current?.setAttribute('value', '')
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
        label_ids: editForm.label_ids,
        participant_ids: editForm.participant_ids,
        recurrence_rule: editForm.recurrence_rule || '',
        recurrence_end_date: editForm.recurrence_end_date?.trim() || null,
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
        event_type: taskType === 'meeting' ? 'meeting' : 'task',
        assigned_to_user_id: Number(createForm.assigned_to_user_id),
        label_ids: createForm.label_ids,
        participant_ids: createForm.participant_ids,
        recurrence_rule: recurrence_rule || '',
        recurrence_end_date: recurrence_end_date || undefined,
      })
      for (const file of createPendingFiles) {
        const fd = new FormData()
        fd.append('file', file)
        await api.post(`/tasks/${created.id}/attachments`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }
      setShowCreateModal(false)
      setCreateForm({ title: '', date: '', start_time: '', end_time: '', description: '', status: 'pending', assigned_to_user_id: '', label_ids: [], participant_ids: [], recurrence_rule: '', recurrence_end_date: '' })
      setCreatePendingFiles([])
      createFileInputRef.current?.setAttribute('value', '')
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

  const calendarDateDisplay = localCalendarDateDisplay
  const showJewishHolidays = me?.show_jewish_holidays ?? true
  const showIslamicHolidays = me?.show_islamic_holidays ?? false

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
            const color = t.assigned_user_color ?? USER_COLORS[(t.assigned_to_user_id - 1) % USER_COLORS.length]
            const icon = eventType === 'meeting' ? '📅 ' : '📋 '
            const labels = t.labels || []
            const isRecurring = (t.recurrence_rule || '') !== ''
            return occurrences.map((occ, i) => {
              const start = occ.start
              const end = occ.end
              const isAllDay = start.getHours() === 0 && start.getMinutes() === 0 && end.getHours() === 23 && end.getMinutes() === 59
              const eventId = occurrences.length > 1 ? `${t.id}-${i}` : String(t.id)
              return {
                id: eventId,
                title: icon + t.title + (isRecurring ? ' 🔁' : ''),
                start: start.toISOString(),
                end: end.toISOString(),
                allDay: eventType === 'meeting' ? false : isAllDay,
                backgroundColor: color,
                borderColor: color,
                classNames: [eventType === 'meeting' ? 'fc-event-meeting' : 'fc-event-task'],
                extendedProps: { eventType, labels, taskId: t.id },
              }
            })
          })
      : []),
  ]

  return (
    <div className="task-calendar-page min-h-screen bg-[#f0f4f8] dark:bg-[#0f1419]">
      <div className="max-w-[1680px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Header */}
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

        <div className="flex flex-col lg:flex-row gap-5">
          {isAdmin && (
            <aside className="task-calendar-sidebar lg:w-72 flex-shrink-0 order-2 lg:order-1">
              <div className="rounded-2xl border border-gray-200/80 dark:border-gray-700/80 bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl shadow-xl shadow-gray-200/40 dark:shadow-none p-5 h-fit">
                <h2 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2 text-sm uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <User className="w-4 h-4" />
                  סינון לפי משתמש
                </h2>
                <select
                  value={filterUserId ?? ''}
                  onChange={(e) => setFilterUserId(e.target.value ? Number(e.target.value) : null)}
                  className="task-calendar-select w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100 text-sm font-medium focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-shadow"
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
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">צבע בלוח לפי עובד</p>
                    <ul className="space-y-2.5">
                      {users.map((u) => {
                        const color = u.calendar_color || USER_COLORS[(u.id - 1) % USER_COLORS.length]
                        const src = avatarUrl(u.avatar_url)
                        return (
                          <li key={u.id} className="flex items-center gap-3">
                            {src ? (
                              <img src={src} alt="" className="w-8 h-8 rounded-full object-cover border-2 border-white dark:border-gray-700 shadow-sm flex-shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-sm" style={{ backgroundColor: color }} title={u.full_name}>
                                {u.full_name.charAt(0)}
                              </div>
                            )}
                            <input
                              type="color"
                              value={color.startsWith('#') ? color : `#${color}`}
                              onChange={(e) => handleUserColorChange(u.id, e.target.value)}
                              disabled={!!updatingUserColorId}
                              className="w-8 h-8 rounded-lg border-2 border-gray-200 dark:border-gray-600 cursor-pointer disabled:opacity-50 bg-transparent"
                              title={`צבע ל${u.full_name}`}
                            />
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate flex-1">{u.full_name}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">סוג בלוח</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="text-xs font-medium px-2 py-1 rounded-lg border-l-4 border-solid border-gray-500 bg-gray-100 dark:bg-gray-700/50">פגישה</span>
                    <span className="text-xs font-medium px-2 py-1 rounded-lg border-2 border-dashed border-gray-500 bg-gray-50 dark:bg-gray-700/30">משימה</span>
                  </div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">מצב משימה</p>
                  <div className="flex flex-col gap-1.5">
                    <span className="inline-flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                      <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: TASK_STATUS_COLORS.pending }} />
                      {TASK_STATUS_LABELS.pending}
                    </span>
                    <span className="inline-flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                      <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: TASK_STATUS_COLORS.in_progress }} />
                      {TASK_STATUS_LABELS.in_progress}
                    </span>
                    <span className="inline-flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                      <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: TASK_STATUS_COLORS.completed }} />
                      {TASK_STATUS_LABELS.completed}
                    </span>
                  </div>
                </div>
              </div>
            </aside>
          )}

          <div className="flex-1 min-w-0 space-y-3 order-1 lg:order-2">
            {!isAdmin && (
              <div className="task-calendar-legend flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400 px-1">
                <span className="font-medium px-2 py-1 rounded-lg border-l-4 border-solid border-gray-500 bg-white/60 dark:bg-gray-800/60">פגישה</span>
                <span className="font-medium px-2 py-1 rounded-lg border-2 border-dashed border-gray-500 bg-white/60 dark:bg-gray-800/60">משימה</span>
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TASK_STATUS_COLORS.pending }} />
                  {TASK_STATUS_LABELS.pending}
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TASK_STATUS_COLORS.in_progress }} />
                  {TASK_STATUS_LABELS.in_progress}
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TASK_STATUS_COLORS.completed }} />
                  {TASK_STATUS_LABELS.completed}
                </span>
              </div>
            )}
            {tasks.filter(t => !t.start_time && !t.end_time).length > 0 && (
              <div className="rounded-2xl border border-amber-200/80 dark:border-amber-700/50 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-4 shadow-lg shadow-amber-200/20 dark:shadow-none">
                <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-2 flex items-center gap-2">משימות בלי תאריך</h3>
                <ul className="space-y-1.5 text-sm">
                  {tasks.filter(t => !t.start_time && !t.end_time).map(t => {
                    const status = (t.status || 'pending') as TaskStatus
                    const color = TASK_STATUS_COLORS[status] ?? t.assigned_user_color ?? USER_COLORS[(t.assigned_to_user_id - 1) % USER_COLORS.length]
                    const avatarSrc = avatarUrl(t.assigned_user_avatar)
                    return (
                    <li key={t.id} className="flex items-center gap-2">
                      {avatarSrc ? (
                        <img src={avatarSrc} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0 ring-2 ring-white dark:ring-gray-800" />
                      ) : (
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: color }}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedTask(t)}
                        className="text-left font-medium text-amber-900 dark:text-amber-100 hover:underline"
                      >
                        {t.title} – {t.assigned_user_name}
                      </button>
                    </li>
                  )})}
                </ul>
              </div>
            )}
            <div className="flex-1 min-w-0 rounded-2xl border border-gray-200/80 dark:border-gray-700/80 bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl shadow-xl shadow-gray-200/40 dark:shadow-none p-5 sm:p-6">
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
              key={`${calendarDateDisplay}-${calendarRefreshKey}`}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              initialView={currentViewType}
              initialDate={
                (calendarDateDisplay === 'hebrew' || calendarDateDisplay === 'both') && currentViewType === 'dayGridMonth'
                  ? (getHebrewMonthRange(anchorDateRef.current)?.start ?? anchorDateRef.current)
                  : anchorDateRef.current
              }
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
                if ((arg.event.extendedProps as { isHoliday?: boolean }).isHoliday) {
                  const title = arg.event.title
                  const esc = (s: string) => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;')
                  return {
                    html: `<div class="fc-event-main-frame"><div class="fc-event-title-container"><div class="fc-event-title fc-sticky">${esc(title)}</div></div></div>`,
                  }
                }
                const labels = (arg.event.extendedProps as { labels?: TaskLabelType[] }).labels || []
                if (labels.length === 0) return undefined
                const title = arg.event.title
                const pills = labels
                  .map(
                    (l: TaskLabelType) =>
                      `<span class="fc-event-label-pill" style="background:${l.color};color:white;padding:0 4px;border-radius:4px;font-size:10px;white-space:nowrap">${String(l.name).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`
                  )
                  .join('')
                return {
                  html: `<div class="fc-event-main-frame"><div class="fc-event-title-container"><div class="fc-event-title fc-sticky">${String(title).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div></div><div class="fc-event-labels" style="display:flex;flex-wrap:wrap;gap:2px;margin-top:2px">${pills}</div></div>`,
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
              height={640}
              slotMinTime="00:00:00"
              slotMaxTime="24:00:00"
              allDayText="כל היום"
              eventDisplay="block"
            />
            </div>
            </>
          )}
        </div>
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
                  type="text"
                  placeholder="שם לייבל חדש"
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  className={cn(
                    'px-3 py-1.5 border rounded-lg text-sm w-32',
                    'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                  )}
                />
                <input
                  type="color"
                  value={newLabelColor}
                  onChange={(e) => setNewLabelColor(e.target.value)}
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
            {(editForm.event_type === 'meeting' || editForm.event_type === 'task') && (editForm.start_time || editForm.date) && (
              <div className="p-2 bg-slate-50 dark:bg-slate-900/20 rounded-lg border border-slate-200 dark:border-slate-700">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">משימה מחזורית</p>
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">חזרה</label>
                    <select
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
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">תאריך סיום חזרות (אופציונלי)</label>
                      <input
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תיאור</label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm(f => f ? { ...f, description: e.target.value } : f)}
                rows={2}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg text-sm",
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
          onClose={() => { setShowCreateModal(false); setCreatePendingFiles([]); }}
          title={taskType === 'meeting' ? 'פגישה חדשה' : 'משימה חדשה'}
        >
          <form onSubmit={handleCreate} className="space-y-2">
            {createError && (
              <p className="text-sm text-red-600 dark:text-red-400">{createError}</p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">כותרת</label>
              <input
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
                    <span>פגישה</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                    <input type="radio" name="taskType" checked={taskType === 'all_day'} onChange={() => setTaskType('all_day')} />
                    <span>משימה בתאריך</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                    <input type="radio" name="taskType" checked={taskType === 'no_date'} onChange={() => setTaskType('no_date')} />
                    <span>בלי תאריך</span>
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">מצב</label>
                  <select
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
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">מוקצה ל</label>
                  <select
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
                  type="text"
                  placeholder="לייבל חדש"
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  className={cn(
                    'px-2 py-1 border rounded text-xs w-24',
                    'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                  )}
                />
                <input type="color" value={newLabelColor} onChange={(e) => setNewLabelColor(e.target.value)} className="w-6 h-6 rounded border border-gray-300 dark:border-gray-600 cursor-pointer bg-transparent" title="צבע" />
                <button type="button" onClick={handleCreateTaskLabel} disabled={addingLabel || !newLabelName.trim()} className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50">הוסף</button>
              </div>
            </div>
            {taskType === 'all_day' && (
              <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">תאריך *</label>
                <input
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
                    <label className="block text-xs text-gray-700 dark:text-gray-300 mb-0.5">משעה *</label>
                    <input
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
                    <label className="block text-xs text-gray-700 dark:text-gray-300 mb-0.5">עד שעה *</label>
                    <input
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
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">חזרה</span>
                <select
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
                    type="date"
                    value={createForm.recurrence_end_date}
                    onChange={(e) => setCreateForm(f => ({ ...f, recurrence_end_date: e.target.value }))}
                    className={cn(
                      "px-2 py-1 border rounded text-sm",
                      "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    )}
                    title="תאריך סיום חזרות"
                  />
                )}
              </div>
            )}
            {taskType === 'no_date' && (
              <p className="text-xs text-gray-600 dark:text-gray-400">משימה בלי תאריך – תופיע ברשימת משימות בלי תאריך.</p>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">קבצים / תמונות</label>
              <input
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
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">תיאור</label>
              <textarea
                value={createForm.description}
                onChange={(e) => setCreateForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                className={cn(
                  "w-full px-3 py-1.5 border rounded-lg text-sm",
                  "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                )}
              />
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
                {createSaving ? 'שומר...' : taskType === 'meeting' ? 'צור פגישה' : 'צור משימה'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
