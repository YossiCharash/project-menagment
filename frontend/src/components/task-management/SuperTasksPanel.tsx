import { useEffect, useState, useCallback, useRef } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../../store'
import { Zap, Plus, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import api, { getSuperTasks } from '../../lib/api'
import type { Task } from '../../pages/TaskCalendar'
import TaskDetailModal from './TaskDetailModal'

export default function SuperTasksPanel() {
  const me = useSelector((s: RootState) => s.auth.user)
  const isAdmin = me?.role === 'Admin'

  const [superTasks, setSuperTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchSuperTasks = useCallback(async () => {
    try {
      const tasks = await getSuperTasks()
      setSuperTasks(tasks)
    } catch {
      // silent — panel is non-critical
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSuperTasks()
    const interval = setInterval(fetchSuperTasks, 60_000)
    return () => clearInterval(interval)
  }, [fetchSuperTasks])

  useEffect(() => {
    if (showCreateForm) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [showCreateForm])

  const handleTaskUpdated = useCallback((updated: Task) => {
    setSuperTasks((prev) => {
      if (updated.status === 'completed' || updated.is_super_task === false) {
        return prev.filter((t) => t.id !== updated.id)
      }
      return prev.map((t) => (t.id === updated.id ? updated : t))
    })
  }, [])

  const handleCreateSuperTask = useCallback(async () => {
    const title = newTaskTitle.trim()
    if (!title || !me) return
    setCreating(true)
    try {
      const { data } = await api.post<Task>('/tasks/', {
        title,
        assigned_to_user_id: me.id,
        is_super_task: true,
        status: 'pending',
        event_type: 'task',
      })
      setSuperTasks((prev) => [...prev, data])
      setNewTaskTitle('')
      setShowCreateForm(false)
    } catch {
      // ignore
    } finally {
      setCreating(false)
    }
  }, [newTaskTitle, me])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleCreateSuperTask()
      if (e.key === 'Escape') {
        setShowCreateForm(false)
        setNewTaskTitle('')
      }
    },
    [handleCreateSuperTask]
  )

  if (!loading && superTasks.length === 0 && !isAdmin) return null

  return (
    <>
      <div
        dir="rtl"
        className="bg-red-50 border-2 border-red-300 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3"
      >
        {/* Title + badge */}
        <div className="flex items-center gap-2 shrink-0">
          <Zap className="w-5 h-5 text-red-600" />
          <span className="font-bold text-red-700 text-sm">משימות על</span>
          {superTasks.length > 0 && (
            <span className="bg-red-600 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center">
              {superTasks.length}
            </span>
          )}
        </div>

        {/* Pill list */}
        <div className="flex flex-wrap gap-2 flex-1">
          {loading ? (
            <span className="text-red-400 text-xs">טוען...</span>
          ) : superTasks.length === 0 ? (
            <span className="text-red-400 text-xs">אין משימות על פעילות</span>
          ) : (
            superTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => { setSelectedTask(task); setSelectedTaskId(task.id) }}
                className="flex items-center gap-1.5 bg-red-100 border border-red-300 rounded-full px-3 py-1 text-xs font-medium text-red-800 hover:bg-red-200 transition-colors truncate max-w-[200px]"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                <span className="truncate">{task.title}</span>
              </button>
            ))
          )}
        </div>

        {/* Create form / button — admin only */}
        {isAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            {showCreateForm ? (
              <>
                <input
                  ref={inputRef}
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="כותרת משימת על..."
                  disabled={creating}
                  className="border border-red-300 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white text-right w-52"
                />
                <button
                  type="button"
                  onClick={handleCreateSuperTask}
                  disabled={creating || !newTaskTitle.trim()}
                  className="bg-red-600 text-white text-xs font-medium rounded-lg px-3 py-1.5 hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {creating ? '...' : 'הוסף'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false)
                    setNewTaskTitle('')
                  }}
                  className="text-red-400 hover:text-red-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="flex items-center gap-1.5 bg-red-600 text-white text-xs font-medium rounded-lg px-3 py-1.5 hover:bg-red-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                הוסף משימת על
              </button>
            )}
          </div>
        )}
      </div>

      {/* Task detail modal */}
      {selectedTaskId !== null && (
        <TaskDetailModal
          taskId={selectedTaskId}
          initialTask={selectedTask ?? undefined}
          onClose={() => { setSelectedTaskId(null); setSelectedTask(null) }}
          onTaskUpdated={(updated) => {
            handleTaskUpdated(updated)
            setSelectedTask(updated)
          }}
          onTaskDeleted={() => {
            setSuperTasks((prev) => prev.filter((t) => t.id !== selectedTaskId))
            setSelectedTaskId(null)
            setSelectedTask(null)
          }}
        />
      )}
    </>
  )
}
