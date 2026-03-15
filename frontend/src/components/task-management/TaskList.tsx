import { useEffect, useState, useCallback } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../../store'
import api from '../../lib/api'
import { avatarUrl } from '../../lib/api'
import { RefreshCw, User, Plus } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { Task, TaskStatus } from '../../pages/TaskCalendar'
import TaskDetailModal from './TaskDetailModal'
import CreateEventModal from './CreateEventModal'

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

function formatDate(s: string | null): string {
  if (!s) return '—'
  try {
    const d = new Date(s)
    return d.toLocaleDateString('he-IL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return s
  }
}

export default function TaskList() {
  const me = useSelector((state: RootState) => state.auth.me)
  const isAdmin = me?.role === 'Admin'
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<Array<{ id: number; full_name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [filterUserId, setFilterUserId] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('')
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  // -- Create modal --
  const [showCreateModal, setShowCreateModal] = useState(false)

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
      const { data } = await api.get<Array<{ id: number; full_name: string }>>(
        '/users/for-tasks'
      )
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

  const filteredTasks = tasks.filter((t) => {
    const status = (t.status || 'pending') as TaskStatus
    if (statusFilter && status !== statusFilter) return false
    return true
  })

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {isAdmin && users.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              משתמש:
            </label>
            <select
              value={filterUserId ?? ''}
              onChange={(e) =>
                setFilterUserId(e.target.value ? Number(e.target.value) : null)
              }
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
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            סטטוס:
          </label>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as TaskStatus | '')
            }
            className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm"
          >
            <option value="">הכל</option>
            {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        {/* Add Task button */}
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium shadow-md hover:shadow-lg transition-all duration-200 text-sm ml-auto"
        >
          <Plus className="w-4 h-4" />
          משימה חדשה
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                  משימה
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                  סטטוס
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                  מוקצה
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                  תאריך
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="py-12 text-center text-gray-500 dark:text-gray-400"
                  >
                    אין משימות להצגה
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => {
                  const status = (task.status || 'pending') as TaskStatus
                  const avatarSrc = avatarUrl(task.assigned_user_avatar)
                  return (
                    <tr
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => { setSelectedTask(task); setSelectedTaskId(task.id) }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedTask(task); setSelectedTaskId(task.id) } }}
                      className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {task.title}
                        </span>
                        {task.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
                            {task.description}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            'inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium',
                            status === 'completed'
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200'
                              : status === 'in_progress'
                              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200'
                              : status === 'pending_closure'
                              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                          )}
                          style={{
                            backgroundColor:
                              status === 'pending'
                                ? `${TASK_STATUS_COLORS[status]}20`
                                : undefined,
                            color:
                              status === 'pending'
                                ? TASK_STATUS_COLORS[status]
                                : undefined,
                          }}
                        >
                          {TASK_STATUS_LABELS[status]}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {avatarSrc ? (
                            <img
                              src={avatarSrc}
                              alt=""
                              className="w-6 h-6 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                              <User className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                            </div>
                          )}
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {task.assigned_user_name || 'לא הוגדר'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                        {formatDate(task.end_time ?? task.start_time)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <TaskDetailModal
        taskId={selectedTaskId}
        initialTask={selectedTask ?? undefined}
        onClose={() => { setSelectedTaskId(null); setSelectedTask(null) }}
        onTaskUpdated={(updated) => {
          setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
          if (selectedTask?.id === updated.id) setSelectedTask(updated)
        }}
        onTaskDeleted={() => {
          if (selectedTaskId) setTasks((prev) => prev.filter((t) => t.id !== selectedTaskId))
          setSelectedTaskId(null)
          setSelectedTask(null)
        }}
      />

      <CreateEventModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        initialEventType="task"
        onCreated={() => {
          fetchTasks()
          setShowCreateModal(false)
        }}
      />
    </div>
  )
}
