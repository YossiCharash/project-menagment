import { useEffect, useRef, useState } from 'react'
import { ClipboardList, Plus, CalendarDays, User, Loader2, Archive } from 'lucide-react'
import type { ApartmentTask } from '../../types/api'
import BuildingReceptionAPI from '../../lib/buildingReceptionApi'
import { extractErrorMessage } from '../../lib/apiError'
import { ACCENT, formatDate } from './constants'

interface ApartmentTaskListProps {
  apartmentId: number
  tasks: ApartmentTask[]
  /** Changes on every task mutation; invalidates the cached archived list. */
  refreshToken: number
  onAddTask: () => void
  /** Open the full task-detail modal for the clicked task. */
  onSelectTask: (taskId: number) => void
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: 'ממתין', color: '#F59E0B' },
  in_progress: { label: 'בביצוע', color: '#3B82F6' },
  pending_closure: { label: 'ממתין לסגירה', color: '#8B5CF6' },
  completed: { label: 'הושלם', color: '#12B76A' },
}

/** A single task card, shared by the open and archived views. */
function TaskCard({ task, onSelect }: { task: ApartmentTask; onSelect: (taskId: number) => void }) {
  const status = STATUS_META[task.status] ?? { label: task.status, color: '#9CA3AF' }
  return (
    <button
      type="button"
      onClick={() => onSelect(task.id)}
      className="w-full text-right bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-3 flex items-center gap-3 transition-colors hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
      style={{ ['--tw-ring-color' as string]: ACCENT }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: `${status.color}1F`, color: status.color }}
      >
        <ClipboardList className="w-5 h-5" />
      </div>
      <div className="flex-1 leading-tight min-w-0">
        <div className="text-sm font-bold text-gray-900 dark:text-white truncate">{task.title}</div>
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2.5 mt-0.5">
          {task.start_time && (
            <span className="flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" />
              {formatDate(task.start_time)}
            </span>
          )}
          {task.assignee_name && (
            <span className="flex items-center gap-1 truncate">
              <User className="w-3.5 h-3.5" />
              {task.assignee_name}
            </span>
          )}
        </div>
      </div>
      <span
        className="text-[10.5px] font-bold px-2.5 py-1 rounded-full flex-shrink-0"
        style={{ color: status.color, background: `${status.color}1F` }}
      >
        {status.label}
      </span>
    </button>
  )
}

/** "משימות" — the tasks linked to this apartment, shown in the apartment panel. */
export default function ApartmentTaskList({
  apartmentId,
  tasks,
  refreshToken,
  onAddTask,
  onSelectTask,
}: ApartmentTaskListProps) {
  // Open tasks arrive as a prop; the archived ("אורכבו") tasks are fetched
  // lazily the first time the desk switches to that view.
  const [showArchived, setShowArchived] = useState(false)
  const [archivedTasks, setArchivedTasks] = useState<ApartmentTask[] | null>(null)
  const [loadingArchived, setLoadingArchived] = useState(false)
  const [archivedError, setArchivedError] = useState<string | null>(null)

  // Reset to the open view (and drop any cached archived list) when the panel
  // switches to a different apartment.
  useEffect(() => {
    setShowArchived(false)
    setArchivedTasks(null)
    setArchivedError(null)
  }, [apartmentId])

  // Drop the cached archived list after any task mutation (e.g. a task was just
  // archived) so it refetches — immediately if the archived tab is open, else on
  // the next switch to it. Skips the initial mount (token starts unchanged).
  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }
    setArchivedTasks(null)
    setArchivedError(null)
  }, [refreshToken])

  useEffect(() => {
    if (!showArchived || archivedTasks !== null) return
    let cancelled = false
    setLoadingArchived(true)
    setArchivedError(null)
    BuildingReceptionAPI.listApartmentArchivedTasks(apartmentId)
      .then((result) => {
        if (!cancelled) setArchivedTasks(result)
      })
      .catch((error) => {
        if (!cancelled) setArchivedError(extractErrorMessage(error, 'טעינת המשימות שאורכבו נכשלה'))
      })
      .finally(() => {
        if (!cancelled) setLoadingArchived(false)
      })
    return () => {
      cancelled = true
    }
  }, [showArchived, archivedTasks, apartmentId])

  const tabButton = (active: boolean) =>
    `text-xs font-bold rounded-lg px-3 py-1.5 transition-colors ${
      active ? 'text-white' : 'text-gray-500 dark:text-gray-400'
    }`

  const displayTasks = showArchived ? (archivedTasks ?? []) : tasks

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-0.5">
          <button
            type="button"
            onClick={() => setShowArchived(false)}
            className={tabButton(!showArchived)}
            style={!showArchived ? { background: ACCENT } : undefined}
          >
            פתוחות
          </button>
          <button
            type="button"
            onClick={() => setShowArchived(true)}
            className={`${tabButton(showArchived)} flex items-center gap-1`}
            style={showArchived ? { background: ACCENT } : undefined}
          >
            <Archive className="w-3.5 h-3.5" />
            אורכבו
          </button>
        </div>
        {!showArchived && (
          <button
            type="button"
            onClick={onAddTask}
            className="text-xs font-bold rounded-lg px-3 py-1.5 flex items-center gap-1.5 border"
            style={{ color: ACCENT, borderColor: `${ACCENT}73`, background: `${ACCENT}12` }}
          >
            <Plus className="w-4 h-4" />
            משימה
          </button>
        )}
      </div>

      {showArchived && loadingArchived && (
        <div className="flex items-center justify-center gap-2 text-xs font-semibold text-gray-400 py-6">
          <Loader2 className="w-4 h-4 animate-spin" />
          טוען משימות שאורכבו…
        </div>
      )}

      {showArchived && archivedError && !loadingArchived && (
        <div className="text-xs font-semibold text-red-500 text-center py-6">{archivedError}</div>
      )}

      {(!showArchived || (!loadingArchived && !archivedError)) &&
        displayTasks.map((task) => <TaskCard key={task.id} task={task} onSelect={onSelectTask} />)}

      {!showArchived && tasks.length === 0 && (
        <div className="text-xs font-semibold text-gray-400 text-center py-6">אין משימות פתוחות לדירה זו</div>
      )}

      {showArchived && !loadingArchived && !archivedError && displayTasks.length === 0 && (
        <div className="text-xs font-semibold text-gray-400 text-center py-6">אין משימות שאורכבו לדירה זו</div>
      )}
    </div>
  )
}
