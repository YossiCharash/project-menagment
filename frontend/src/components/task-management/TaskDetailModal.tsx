import { useEffect, useState, useCallback, useRef } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../../store'
import api, { avatarUrl } from '../../lib/api'
import Modal from '../Modal'
import { cn } from '../../lib/utils'
import {
  Bell,
  CheckCircle,
  MessageCircle,
  Pencil,
  Send,
  Trash2,
  Zap,
} from 'lucide-react'
import type {
  Task,
  TaskStatus,
  TaskLabelType,
  EventType,
  RecurrenceRule,
  TaskMessageType,
} from '../../pages/TaskCalendar'
import { PermissionGuard } from '../ui/PermissionGuard'
import TaskChecklist from './TaskChecklist'

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'מחכה לטיפול',
  in_progress: 'בטיפול',
  completed: 'טופלה',
  pending_closure: 'ממתין לאישור סגירה',
}

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  meeting: 'פגישה',
  task: 'משימה',
}

const RECURRENCE_LABELS: Record<RecurrenceRule, string> = {
  '': 'ללא חזרות',
  weekly: 'כל שבוע',
  monthly: 'כל חודש',
}

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

export interface TaskDetailModalProps {
  taskId: number | null
  initialTask?: Task | null
  onClose: () => void
  onTaskUpdated?: (task: Task) => void
  onTaskDeleted?: () => void
  onEdit?: (task: Task) => void
}

export default function TaskDetailModal({
  taskId,
  initialTask,
  onClose,
  onTaskUpdated,
  onTaskDeleted,
  onEdit,
}: TaskDetailModalProps) {
  const me = useSelector((state: RootState) => state.auth.me)
  const [task, setTask] = useState<Task | null>(initialTask ?? null)
  const [taskLoading, setTaskLoading] = useState(false)
  const [taskMessages, setTaskMessages] = useState<TaskMessageType[]>([])
  const [taskMessagesLoading, setTaskMessagesLoading] = useState(false)
  const [taskMessageInput, setTaskMessageInput] = useState('')
  const [taskMessageSending, setTaskMessageSending] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [acknowledgingTaskId, setAcknowledgingTaskId] = useState<number | null>(null)
  const [remindingTaskId, setRemindingTaskId] = useState<number | null>(null)
  const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null)
  const [togglingSuper, setTogglingSuper] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  const fetchTask = useCallback(async (id: number) => {
    setTaskLoading(true)
    try {
      const { data } = await api.get<Task>(`/tasks/${id}`)
      setTask(data)
      return data
    } catch {
      setTask(null)
      return null
    } finally {
      setTaskLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!taskId) {
      setTask(initialTask ?? null)
      setTaskMessages([])
      setTaskMessageInput('')
      return
    }
    if (initialTask?.id === taskId) {
      setTask(initialTask)
    } else {
      fetchTask(taskId)
    }
  }, [taskId, initialTask?.id, initialTask, fetchTask])

  useEffect(() => {
    if (!taskId) return
    let cancelled = false
    setTaskMessagesLoading(true)
    api.get<TaskMessageType[]>(`/tasks/${taskId}/messages`)
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
  }, [taskId])

  useEffect(() => {
    if (!taskId || taskMessages.length === 0) return
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [taskId, taskMessages])

  const handleStatusChange = useCallback(async (id: number, newStatus: TaskStatus) => {
    setUpdatingStatus(true)
    try {
      const { data } = await api.put<Task>(`/tasks/${id}`, { status: newStatus })
      setTask(data)
      onTaskUpdated?.(data)
    } finally {
      setUpdatingStatus(false)
    }
  }, [onTaskUpdated])

  const handleAcknowledgeTask = useCallback(async (t: Task) => {
    setAcknowledgingTaskId(t.id)
    try {
      const { data } = await api.post<Task>(`/tasks/${t.id}/acknowledge`)
      setTask(data)
      onTaskUpdated?.(data)
    } finally {
      setAcknowledgingTaskId(null)
    }
  }, [onTaskUpdated])

  const handleRemindTask = useCallback(async (t: Task) => {
    setRemindingTaskId(t.id)
    try {
      await api.post(`/tasks/${t.id}/remind`)
    } finally {
      setRemindingTaskId(null)
    }
  }, [])

  const handleDeleteTask = useCallback(async (t: Task) => {
    if (!window.confirm('למחוק את המשימה?')) return
    setDeletingTaskId(t.id)
    try {
      await api.delete(`/tasks/${t.id}`)
      onTaskDeleted?.()
      onClose()
    } finally {
      setDeletingTaskId(null)
    }
  }, [onClose, onTaskDeleted])

  const handleToggleSuperTask = useCallback(async (t: Task) => {
    setTogglingSuper(true)
    try {
      const { data } = await api.put<Task>(`/tasks/${t.id}`, { is_super_task: !t.is_super_task })
      setTask(data)
      onTaskUpdated?.(data)
    } finally {
      setTogglingSuper(false)
    }
  }, [onTaskUpdated])

  const handleSendMessage = useCallback(async () => {
    if (!taskId || !taskMessageInput.trim() || taskMessageSending) return
    const text = taskMessageInput.trim()
    setTaskMessageInput('')
    setTaskMessageSending(true)
    try {
      const { data } = await api.post<TaskMessageType>(`/tasks/${taskId}/messages`, { message: text })
      setTaskMessages(prev => [...prev, data])
    } catch {
      setTaskMessageInput(text)
    } finally {
      setTaskMessageSending(false)
    }
  }, [taskId, taskMessageInput, taskMessageSending])

  if (!taskId) return null

  const showEditButton = typeof onEdit === 'function'

  return (
    <Modal isOpen={!!taskId} onClose={onClose} title="פרטי משימה">
      {taskLoading && !task ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-4">טוען...</p>
      ) : !task ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-4">המשימה לא נמצאה.</p>
      ) : (
        <div className="space-y-3">
          <p className="font-medium text-gray-900 dark:text-gray-100">{task.title}</p>
          <p className="text-sm">
            <span className="text-gray-600 dark:text-gray-400">סוג: </span>
            <span className="font-medium">{EVENT_TYPE_LABELS[(task.event_type || 'task') as EventType]}</span>
          </p>
          {(() => {
            const overdueInfo = getOverdueInfo(task)
            const isAdmin = me?.role === 'Admin'
            const isPendingClosure = task.status === 'pending_closure'

            return (
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="detail-status" className="text-sm text-gray-600 dark:text-gray-400">מצב: </label>
                {isPendingClosure && !isAdmin ? (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                    ממתין לאישור סגירה
                  </span>
                ) : (
                  <select
                    id="detail-status"
                    value={task.status || 'pending'}
                    onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                    disabled={updatingStatus}
                    className={cn(
                      'px-3 py-1.5 border rounded-lg text-sm',
                      'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100',
                      'disabled:opacity-50'
                    )}
                  >
                    {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[])
                      .filter((s) => {
                        if (isAdmin) return true
                        return s === 'pending' || s === 'in_progress' || s === 'completed'
                      })
                      .map((s) => (
                        <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
                      ))}
                  </select>
                )}
                {isAdmin && isPendingClosure && (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(task.id, 'completed')}
                    disabled={updatingStatus}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {updatingStatus ? 'מאשר...' : 'אשר סגירה'}
                  </button>
                )}
                {overdueInfo && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200" title={overdueInfo.delayText}>
                    משימות בפיגור: {overdueInfo.delayText}
                  </span>
                )}
              </div>
            )
          })()}
          {task.requires_closure_approval && (
            <p className="text-sm flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <span>🔒</span>
              <span>דורש אישור סגירה</span>
            </p>
          )}
              <PermissionGuard action="update" resource="task">
                <div className="flex items-center gap-3 py-1">
                  <Zap className={cn('w-4 h-4', task.is_super_task ? 'text-red-600' : 'text-gray-400')} />
                  <span className="text-sm text-gray-600 dark:text-gray-400">משימת על:</span>
                  <button
                    type="button"
                    onClick={() => handleToggleSuperTask(task)}
                    disabled={togglingSuper}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                      task.is_super_task ? 'bg-red-600' : 'bg-gray-300 dark:bg-gray-600',
                      'disabled:opacity-50'
                    )}
                    role="switch"
                    aria-checked={!!task.is_super_task}
                  >
                    <span
                      className={cn(
                        'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                        task.is_super_task ? 'translate-x-6' : 'translate-x-1'
                      )}
                    />
                  </button>
                  <span className={cn('text-sm font-medium', task.is_super_task ? 'text-red-600' : 'text-gray-500')}>
                    {togglingSuper ? '...' : task.is_super_task ? 'כן' : 'לא'}
                  </span>
                </div>
              </PermissionGuard>
          <p className="text-sm flex items-center gap-2">
            <span className="text-gray-600 dark:text-gray-400">מוקצה למשתמש: </span>
            {avatarUrl(task.assigned_user_avatar) ? (
              <span className="flex items-center gap-2">
                <img src={avatarUrl(task.assigned_user_avatar)!} alt="" className="w-6 h-6 rounded-full object-cover" />
                <span className="font-medium">{task.assigned_user_name}</span>
              </span>
            ) : (
              <span className="font-medium">{task.assigned_user_name}</span>
            )}
          </p>
          {task.assignee_acknowledged_at ? (
            <p className="text-sm flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>הלקוח אימת קבלת המשימה ב־{new Date(task.assignee_acknowledged_at).toLocaleString('he-IL')}</span>
            </p>
          ) : me?.id === task.assigned_to_user_id && (
            <button
              type="button"
              onClick={() => handleAcknowledgeTask(task)}
              disabled={acknowledgingTaskId === task.id}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              {acknowledgingTaskId === task.id ? 'מאשר...' : 'אישרתי קבלת המשימה'}
            </button>
          )}
          {task.start_time && task.end_time && (
            <p className="text-sm">
              <span className="text-gray-600 dark:text-gray-400">משעה עד שעה: </span>
              {new Date(task.start_time).toLocaleString('he-IL')} – {new Date(task.end_time).toLocaleString('he-IL')}
            </p>
          )}
          {!task.start_time && !task.end_time && (
            <p className="text-sm text-gray-600 dark:text-gray-400">משימה בלי תאריך</p>
          )}
          {(task.recurrence_rule === 'weekly' || task.recurrence_rule === 'monthly') && (
            <p className="text-sm">
              <span className="text-gray-600 dark:text-gray-400">משימה מחזורית: </span>
              <span className="font-medium">{RECURRENCE_LABELS[task.recurrence_rule as RecurrenceRule]}</span>
              {task.recurrence_end_date && (
                <span className="text-gray-600 dark:text-gray-400"> עד {task.recurrence_end_date}</span>
              )}
            </p>
          )}
          {task.description && (
            <p className="text-sm">
              <span className="text-gray-600 dark:text-gray-400">תיאור: </span>
              {task.description}
            </p>
          )}
          {(task.labels?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">לייבלים: </span>
              {task.labels?.map((l: TaskLabelType) => (
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

          {/* רשימת משימות */}
          <TaskChecklist
            taskId={task.id}
            canEdit={me?.role === 'Admin' || me?.id === task.assigned_to_user_id}
            participants={(task.participants || []).map((p) => ({
              id: p.user_id,
              name: p.full_name,
              avatar: p.avatar_url ?? null,
              color: null,
            }))}
            currentUserId={me?.id}
          />

          {/* שיח משימה */}
          <div className="border-t border-gray-200 dark:border-gray-600 pt-3 mt-3">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
              <MessageCircle className="w-4 h-4" />
              שיח משימה
            </p>
            <div
              ref={chatScrollRef}
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
                    handleSendMessage()
                  }
                }}
                placeholder="כתוב הודעה..."
                className={cn(
                  'flex-1 px-3 py-2 border rounded-lg text-sm',
                  'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100',
                  'placeholder:text-gray-400 dark:placeholder:text-gray-500'
                )}
                disabled={taskMessageSending}
              />
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={!taskMessageInput.trim() || taskMessageSending}
                className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                title="שלח"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-600 mt-4">
            <button
              type="button"
              onClick={() => handleRemindTask(task)}
              disabled={remindingTaskId === task.id}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50"
              title="שלח תזכורת לעובד המוקצה"
            >
              <Bell className="w-4 h-4" />
              {remindingTaskId === task.id ? 'שולח...' : 'הזכר'}
            </button>
            {showEditButton && (
              <PermissionGuard action="update" resource="task">
                <button
                  type="button"
                  onClick={() => { onEdit?.(task); onClose() }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                >
                  <Pencil className="w-4 h-4" />
                  עריכה
                </button>
              </PermissionGuard>
            )}
            <PermissionGuard action="delete" resource="task">
              <button
                type="button"
                onClick={() => handleDeleteTask(task)}
                disabled={!!deletingTaskId}
                className="inline-flex items-center gap-2 px-4 py-2 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {deletingTaskId === task.id ? 'מוחק...' : 'מחק'}
              </button>
            </PermissionGuard>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500"
            >
              סגור
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
