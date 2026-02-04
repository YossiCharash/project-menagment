import { useEffect, useState, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventChangeArg, DatesSetArg } from '@fullcalendar/core'
import api from '../lib/api'
import { Calendar, User, Plus } from 'lucide-react'
import Modal from '../components/Modal'
import { cn } from '../lib/utils'

export interface Employee {
  id: number
  name: string
  email: string | null
  color: string | null
  is_active: boolean
}

export interface Task {
  id: number
  title: string
  start_time: string
  end_time: string
  description: string | null
  employee_id: number
  unique_tag: string
  employee_name?: string | null
  employee_color?: string | null
}

const EMPLOYEE_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
]

export default function TaskCalendar() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [filterEmployeeId, setFilterEmployeeId] = useState<number | null>(null)
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date } | null>(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    return { start, end }
  })
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    title: '',
    start_time: '',
    end_time: '',
    description: '',
    employee_id: '',
  })
  const [createSaving, setCreateSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newEmployeeName, setNewEmployeeName] = useState('')
  const [addingEmployee, setAddingEmployee] = useState(false)

  const fetchTasks = useCallback(async () => {
    try {
      const params: Record<string, string> = {}
      if (filterEmployeeId) params.employee_id = String(filterEmployeeId)
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
  }, [filterEmployeeId, dateRange])

  const fetchEmployees = useCallback(async () => {
    try {
      const { data } = await api.get<Employee[]>('/employees/')
      setEmployees(data)
    } catch (err) {
      console.error('Failed to fetch employees:', err)
      setEmployees([])
    }
  }, [])

  useEffect(() => {
    fetchEmployees()
  }, [fetchEmployees])

  useEffect(() => {
    setLoading(true)
    fetchTasks()
  }, [fetchTasks])

  const handleDatesSet = (arg: DatesSetArg) => {
    setDateRange({ start: arg.start, end: arg.end })
  }

  const handleEventDrop = async (info: EventChangeArg) => {
    const taskId = Number(info.event.id)
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

  const handleEventResize = async (info: EventChangeArg) => {
    const taskId = Number(info.event.id)
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)
    if (!createForm.title.trim() || !createForm.start_time || !createForm.end_time || !createForm.employee_id) {
      setCreateError('נא למלא את כל השדות החובה')
      return
    }
    setCreateSaving(true)
    try {
      await api.post('/tasks/', {
        title: createForm.title.trim(),
        start_time: createForm.start_time,
        end_time: createForm.end_time,
        description: createForm.description.trim() || undefined,
        employee_id: Number(createForm.employee_id),
      })
      setShowCreateModal(false)
      setCreateForm({ title: '', start_time: '', end_time: '', description: '', employee_id: '' })
      await fetchTasks()
    } catch (err: any) {
      setCreateError(err.response?.data?.detail ?? 'שגיאה ביצירת משימה')
    } finally {
      setCreateSaving(false)
    }
  }

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmployeeName.trim()) return
    setAddingEmployee(true)
    try {
      await api.post('/employees/', { name: newEmployeeName.trim() })
      setNewEmployeeName('')
      await fetchEmployees()
    } catch (err) {
      console.error('Failed to add employee:', err)
    } finally {
      setAddingEmployee(false)
    }
  }

  const events = tasks.map(t => ({
    id: String(t.id),
    title: t.title,
    start: t.start_time,
    end: t.end_time,
    backgroundColor: t.employee_color ?? EMPLOYEE_COLORS[(t.employee_id - 1) % EMPLOYEE_COLORS.length],
    borderColor: t.employee_color ?? EMPLOYEE_COLORS[(t.employee_id - 1) % EMPLOYEE_COLORS.length],
  }))

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Calendar className="w-7 h-7" />
          יומן משימות
        </h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          משימה חדשה
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <aside className="lg:w-64 flex-shrink-0 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
            <User className="w-4 h-4" />
            סינון לפי עובד
          </h2>
          <select
            value={filterEmployeeId ?? ''}
            onChange={(e) => setFilterEmployeeId(e.target.value ? Number(e.target.value) : null)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="">הכל</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
          {employees.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              אין עובדים. הוסף עובד ראשון:
            </p>
          )}
          <form onSubmit={handleAddEmployee} className="mt-2 flex gap-2">
            <input
              type="text"
              value={newEmployeeName}
              onChange={(e) => setNewEmployeeName(e.target.value)}
              placeholder="שם עובד"
              className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <button
              type="submit"
              disabled={addingEmployee || !newEmployeeName.trim()}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
            >
              {addingEmployee ? '...' : 'הוסף'}
            </button>
          </form>
        </aside>

        <div className="flex-1 min-w-0 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-gray-500">טוען...</div>
          ) : (
            <FullCalendar
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              events={events}
              editable={true}
              droppable={true}
              eventDrop={handleEventDrop}
              eventResize={handleEventResize}
              datesSet={handleDatesSet}
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,dayGridWeek',
              }}
              locale="he"
              direction="rtl"
              height="auto"
              eventDisplay="block"
            />
          )}
        </div>
      </div>

      {showCreateModal && (
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="משימה חדשה"
        >
          <form onSubmit={handleCreate} className="space-y-4">
            {createError && (
              <p className="text-sm text-red-600 dark:text-red-400">{createError}</p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">כותרת</label>
              <input
                type="text"
                value={createForm.title}
                onChange={(e) => setCreateForm(f => ({ ...f, title: e.target.value }))}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg",
                  "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                )}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">עובד</label>
              <select
                value={createForm.employee_id}
                onChange={(e) => setCreateForm(f => ({ ...f, employee_id: e.target.value }))}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg",
                  "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                )}
                required
              >
                <option value="">בחר עובד</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">התחלה</label>
                <input
                  type="datetime-local"
                  value={createForm.start_time}
                  onChange={(e) => setCreateForm(f => ({ ...f, start_time: e.target.value }))}
                  className={cn(
                    "w-full px-3 py-2 border rounded-lg",
                    "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  )}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סיום</label>
                <input
                  type="datetime-local"
                  value={createForm.end_time}
                  onChange={(e) => setCreateForm(f => ({ ...f, end_time: e.target.value }))}
                  className={cn(
                    "w-full px-3 py-2 border rounded-lg",
                    "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  )}
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תיאור</label>
              <textarea
                value={createForm.description}
                onChange={(e) => setCreateForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg",
                  "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                )}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                ביטול
              </button>
              <button
                type="submit"
                disabled={createSaving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
              >
                {createSaving ? 'שומר...' : 'צור משימה'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
