import { ClipboardList, Plus, CalendarDays, User } from 'lucide-react'
import type { ApartmentTask } from '../../types/api'
import { ACCENT, formatDate } from './constants'

interface ApartmentTaskListProps {
  tasks: ApartmentTask[]
  onAddTask: () => void
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: 'ממתין', color: '#F59E0B' },
  in_progress: { label: 'בביצוע', color: '#3B82F6' },
  pending_closure: { label: 'ממתין לסגירה', color: '#8B5CF6' },
  completed: { label: 'הושלם', color: '#12B76A' },
}

/** "משימות" — the tasks linked to this apartment, shown in the apartment panel. */
export default function ApartmentTaskList({ tasks, onAddTask }: ApartmentTaskListProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-xs font-extrabold text-gray-500 dark:text-gray-400">משימות הדירה</span>
        <button
          type="button"
          onClick={onAddTask}
          className="text-xs font-bold rounded-lg px-3 py-1.5 flex items-center gap-1.5 border"
          style={{ color: ACCENT, borderColor: `${ACCENT}73`, background: `${ACCENT}12` }}
        >
          <Plus className="w-4 h-4" />
          משימה
        </button>
      </div>

      {tasks.map((task) => {
        const status = STATUS_META[task.status] ?? { label: task.status, color: '#9CA3AF' }
        return (
          <div
            key={task.id}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-3 flex items-center gap-3"
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
          </div>
        )
      })}

      {tasks.length === 0 && (
        <div className="text-xs font-semibold text-gray-400 text-center py-6">אין משימות פתוחות לדירה זו</div>
      )}
    </div>
  )
}
