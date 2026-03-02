import { useEffect, useState, useCallback } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../../store'
import api, { getArchivedTasks, restoreTask, avatarUrl } from '../../lib/api'
import type { ArchivedTaskPreset } from '../../lib/api'
import { RefreshCw, User, RotateCcw } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { Task, TaskStatus } from '../../pages/TaskCalendar'

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'מחכה לטיפול',
  in_progress: 'בטיפול',
  completed: 'טופלה',
}

const PRESET_OPTIONS: { value: ArchivedTaskPreset; label: string }[] = [
  { value: 'last_week', label: 'שבוע אחרון' },
  { value: 'last_month', label: 'חודש אחרון' },
  { value: 'last_3_months', label: '3 חודשים' },
]

function formatDateTime(s: string | null | undefined): string {
  if (!s) return '—'
  try {
    const d = new Date(s)
    return d.toLocaleDateString('he-IL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return s
  }
}

export default function ArchivedTasksList() {
  const me = useSelector((state: RootState) => state.auth.me)
  const isAdmin = me?.role === 'Admin'
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<Array<{ id: number; full_name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [activePreset, setActivePreset] = useState<ArchivedTaskPreset | null>('last_month')
  const [filterUserId, setFilterUserId] = useState<number | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [restoringId, setRestoringId] = useState<number | null>(null)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = {}
      if (activePreset && !dateFrom && !dateTo) {
        params.preset = activePreset
      }
      if (dateFrom) params.date_from = new Date(dateFrom).toISOString()
      if (dateTo) params.date_to = new Date(dateTo + 'T23:59:59').toISOString()
      if (isAdmin && filterUserId) params.assigned_to_user_id = filterUserId
      const data = await getArchivedTasks(params)
      setTasks(data)
    } catch {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [activePreset, dateFrom, dateTo, isAdmin, filterUserId])

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

  const handlePresetClick = (preset: ArchivedTaskPreset) => {
    setDateFrom('')
    setDateTo('')
    setActivePreset(preset)
  }

  const handleDateChange = (from: string, to: string) => {
    setDateFrom(from)
    setDateTo(to)
    if (from || to) {
      setActivePreset(null)
    }
  }

  const handleRestore = async (taskId: number) => {
    setRestoringId(taskId)
    try {
      await restoreTask(taskId)
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
    } catch {
      // error handled by api interceptor
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Preset buttons */}
        <div className="flex items-center gap-2">
          {PRESET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handlePresetClick(opt.value)}
              className={cn(
                'px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                activePreset === opt.value && !dateFrom && !dateTo
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:text-violet-700 dark:hover:text-violet-300 border border-gray-200 dark:border-gray-600'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Custom date range */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">מ:</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => handleDateChange(e.target.value, dateTo)}
            className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm"
          />
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">עד:</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => handleDateChange(dateFrom, e.target.value)}
            className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm"
          />
        </div>

        {/* Admin user filter */}
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
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
        </div>
      ) : (
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
                    הושלמה
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    הועבר לארכיון
                  </th>
                  {isAdmin && (
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                      פעולות
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isAdmin ? 6 : 5}
                      className="py-12 text-center text-gray-500 dark:text-gray-400"
                    >
                      אין משימות בארכיון לטווח שנבחר
                    </td>
                  </tr>
                ) : (
                  tasks.map((task) => {
                    const status = (task.status || 'pending') as TaskStatus
                    const avatarSrc = avatarUrl(task.assigned_user_avatar)
                    return (
                      <tr
                        key={task.id}
                        className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
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
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200">
                            {TASK_STATUS_LABELS[status] || status}
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
                          {formatDateTime((task as any).completed_at)}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                          {formatDateTime((task as any).archived_at)}
                        </td>
                        {isAdmin && (
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              disabled={restoringId === task.id}
                              onClick={() => handleRestore(task.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
                            >
                              <RotateCcw className={cn('w-3.5 h-3.5', restoringId === task.id && 'animate-spin')} />
                              שחזר
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
