import { useEffect, useState, useCallback, useRef } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../../store'
import { ListTodo, Plus, X, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import api, { getBacklogTasks } from '../../lib/api'
import type { Task } from '../../pages/TaskCalendar'
import TaskDetailModal from './TaskDetailModal'

export default function BacklogPanel() {
  const me = useSelector((s: RootState) => s.auth.me)

  const [backlogTasks, setBacklogTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const fetchBacklogTasks = useCallback(async () => {
    try {
      const tasks = await getBacklogTasks()
      setBacklogTasks(tasks)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBacklogTasks()
    const interval = setInterval(fetchBacklogTasks, 60_000)
    return () => clearInterval(interval)
  }, [fetchBacklogTasks])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (showCreateForm) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [showCreateForm])

  const handleTaskUpdated = useCallback((updated: Task) => {
    setBacklogTasks((prev) => {
      if (updated.status === 'completed' || updated.is_backlog === false) {
        return prev.filter((t) => t.id !== updated.id)
      }
      return prev.map((t) => (t.id === updated.id ? updated : t))
    })
  }, [])

  const handleCreateBacklogTask = useCallback(async () => {
    const title = newTaskTitle.trim()
    if (!title || !me) return
    setCreating(true)
    try {
      const { data } = await api.post<Task>('/tasks/', {
        title,
        assigned_to_user_id: me.id,
        is_backlog: true,
        status: 'pending',
        event_type: 'task',
      })
      setBacklogTasks((prev) => [...prev, data])
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
      if (e.key === 'Enter') handleCreateBacklogTask()
      if (e.key === 'Escape') {
        setShowCreateForm(false)
        setNewTaskTitle('')
      }
    },
    [handleCreateBacklogTask]
  )

  return (
    <>
      <div ref={panelRef} className="relative inline-block" dir="rtl">
        {/* Toggle button */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm border-2 transition-all shadow-sm',
            open
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-indigo-50 text-indigo-700 border-indigo-300 hover:bg-indigo-100'
          )}
        >
          <ListTodo className="w-4 h-4" />
          Backlog
          {backlogTasks.length > 0 && (
            <span className={cn(
              'text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center',
              open ? 'bg-white text-indigo-600' : 'bg-indigo-600 text-white'
            )}>
              {backlogTasks.length}
            </span>
          )}
          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} />
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute top-full mt-2 right-0 z-50 w-72 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700 rounded-xl shadow-xl overflow-hidden">
            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <div className="px-4 py-3 text-sm text-gray-400">טוען...</div>
              ) : backlogTasks.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-400">אין משימות ב-Backlog</div>
              ) : (
                <ul className="divide-y divide-indigo-100 dark:divide-indigo-900/30">
                  {backlogTasks.map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => { setSelectedTask(task); setSelectedTaskId(task.id); setOpen(false) }}
                        className="w-full flex items-center gap-2 px-4 py-3 text-sm text-right hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                      >
                        <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                        <span className="flex-1 text-right font-medium text-gray-800 dark:text-gray-100 truncate">{task.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Create area (available to all users) */}
            <div className="border-t border-indigo-100 dark:border-indigo-900/30 px-3 py-2">
              {showCreateForm ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="כותרת משימה ל-Backlog..."
                    disabled={creating}
                    className="flex-1 border border-indigo-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white dark:bg-gray-700 text-right"
                  />
                  <button
                    type="button"
                    onClick={handleCreateBacklogTask}
                    disabled={creating || !newTaskTitle.trim()}
                    className="bg-indigo-600 text-white text-xs font-medium rounded-lg px-2 py-1.5 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {creating ? '...' : 'הוסף ל-Backlog'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowCreateForm(false); setNewTaskTitle('') }}
                    className="text-indigo-400 hover:text-indigo-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCreateForm(true)}
                  className="w-full flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 text-sm font-medium py-1 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  הוסף ל-Backlog
                </button>
              )}
            </div>
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
            setBacklogTasks((prev) => prev.filter((t) => t.id !== selectedTaskId))
            setSelectedTaskId(null)
            setSelectedTask(null)
          }}
        />
      )}
    </>
  )
}
