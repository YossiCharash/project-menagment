import { useEffect, useState, useCallback } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../../store'
import { motion } from 'framer-motion'
import api from '../../lib/api'
import { avatarUrl } from '../../lib/api'
import { User, RefreshCw, GripVertical } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { Task, TaskStatus } from '../../pages/TaskCalendar'

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

const STATUS_ORDER: TaskStatus[] = ['pending', 'in_progress', 'completed']

function formatDate(s: string | null): string {
  if (!s) return 'ללא תאריך'
  try {
    const d = new Date(s)
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return s
  }
}

export default function TaskBoard() {
  const me = useSelector((state: RootState) => state.auth.me)
  const isAdmin = me?.role === 'Admin'
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<Array<{ id: number; full_name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [filterUserId, setFilterUserId] = useState<number | null>(null)
  const [draggedTask, setDraggedTask] = useState<Task | null>(null)
  const [draggedOverStatus, setDraggedOverStatus] = useState<TaskStatus | null>(null)
  const [updatingId, setUpdatingId] = useState<number | null>(null)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = {}
      if (isAdmin && filterUserId) params.assigned_to_user_id = filterUserId
      const { data } = await api.get<Task[]>('/tasks/', { params })
      setTasks(data)
    } catch {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [isAdmin, filterUserId])

  const fetchUsers = useCallback(async () => {
    try {
      const { data } = await api.get<Array<{ id: number; full_name: string }>>('/users/for-tasks')
      setUsers(data)
    } catch {
      setUsers([])
    }
  }, [])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  useEffect(() => {
    if (isAdmin) fetchUsers()
  }, [isAdmin, fetchUsers])

  const updateTaskStatus = async (task: Task, newStatus: TaskStatus) => {
    setUpdatingId(task.id)
    try {
      await api.put(`/tasks/${task.id}`, { status: newStatus })
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
      )
    } catch {
      // revert on error
    } finally {
      setUpdatingId(null)
    }
  }

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setDraggedTask(task)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(task.id))
  }

  const handleDragEnd = () => {
    setDraggedTask(null)
    setDraggedOverStatus(null)
  }

  const handleDragOver = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDraggedOverStatus(status)
  }

  const handleDragLeave = () => {
    setDraggedOverStatus(null)
  }

  const handleDrop = (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault()
    setDraggedOverStatus(null)
    if (draggedTask && draggedTask.status !== targetStatus) {
      updateTaskStatus(draggedTask, targetStatus)
    }
    setDraggedTask(null)
  }

  const tasksByStatus = STATUS_ORDER.reduce(
    (acc, status) => {
      acc[status] = tasks.filter((t) => (t.status || 'pending') === status)
      return acc
    },
    {} as Record<TaskStatus, Task[]>
  )

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {isAdmin && users.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">סינון:</label>
          <select
            value={filterUserId ?? ''}
            onChange={(e) => setFilterUserId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm"
          >
            <option value="">הכל</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STATUS_ORDER.map((status) => (
          <div
            key={status}
            onDragOver={(e) => handleDragOver(e, status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, status)}
            className={cn(
              'rounded-2xl border-2 border-dashed p-4 min-h-[300px] transition-colors',
              draggedOverStatus === status
                ? 'border-violet-500 bg-violet-50/50 dark:bg-violet-900/20'
                : 'border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/60'
            )}
          >
            <div
              className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200 dark:border-gray-600"
              style={{ borderLeftColor: TASK_STATUS_COLORS[status], borderLeftWidth: 4 }}
            >
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {TASK_STATUS_LABELS[status]}
              </h3>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                ({tasksByStatus[status].length})
              </span>
            </div>
            <div className="space-y-2">
              {tasksByStatus[status].map((task) => {
                const color =
                  task.assigned_user_color ??
                  USER_COLORS[(task.assigned_to_user_id - 1) % USER_COLORS.length]
                const avatarSrc = avatarUrl(task.assigned_user_avatar)
                const isDragging = draggedTask?.id === task.id
                const isUpdating = updatingId === task.id

                return (
                  <motion.div
                    key={task.id}
                    layout
                    draggable
                    onDragStart={(e) => handleDragStart(e, task)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      'group flex items-start gap-2 p-3 rounded-xl border bg-white dark:bg-gray-800 shadow-sm cursor-grab active:cursor-grabbing transition-shadow',
                      isDragging && 'opacity-50 shadow-lg',
                      isUpdating && 'opacity-70'
                    )}
                  >
                    <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        {avatarSrc ? (
                          <img
                            src={avatarSrc}
                            alt=""
                            className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                            style={{ backgroundColor: color }}
                          >
                            {(task.assigned_user_name || '?').charAt(0)}
                          </div>
                        )}
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {task.assigned_user_name || 'לא הוגדר'}
                        </span>
                      </div>
                      {(task.start_time || task.end_time) && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {formatDate(task.end_time ?? task.start_time)}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
