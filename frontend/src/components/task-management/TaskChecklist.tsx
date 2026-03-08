import { useEffect, useState, useCallback, useRef } from 'react'
import { CheckSquare, CheckCircle, Trash2, Loader2, Plus, UserPlus, X, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { TaskChecklistAPI, type TaskChecklistItem } from '../../lib/apiClient'
import { avatarUrl } from '../../lib/api'

interface Participant {
  id: number
  name: string
  avatar?: string | null
  color?: string | null
}

interface TaskChecklistProps {
  taskId: number
  canEdit: boolean
  participants?: Participant[]
  currentUserId?: number
}

function UserInitials({ name, color, size = 'sm' }: { name: string; color?: string | null; size?: 'sm' | 'xs' }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  const sizeClasses = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-5 h-5 text-[9px]'
  return (
    <span
      className={cn('rounded-full flex items-center justify-center text-white font-medium flex-shrink-0', sizeClasses)}
      style={{ backgroundColor: color || '#6B7280' }}
    >
      {initials}
    </span>
  )
}

function AssignmentDropdown({
  participants,
  currentAssignedId,
  onSelect,
  onClear,
  onClose,
}: {
  participants: Participant[]
  currentAssignedId: number | null
  onSelect: (userId: number) => void
  onClear: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1 min-w-[180px]"
    >
      <p className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
        הקצה למשתמש
      </p>
      {currentAssignedId && (
        <button
          type="button"
          onClick={onClear}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <X className="w-3.5 h-3.5" />
          הסר הקצאה
        </button>
      )}
      {participants.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSelect(p.id)}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700',
            p.id === currentAssignedId && 'bg-blue-50 dark:bg-blue-900/20'
          )}
        >
          {avatarUrl(p.avatar) ? (
            <img src={avatarUrl(p.avatar)!} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
          ) : (
            <UserInitials name={p.name} color={p.color} size="xs" />
          )}
          <span className="truncate">{p.name}</span>
          {p.id === currentAssignedId && (
            <CheckCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 mr-auto flex-shrink-0" />
          )}
        </button>
      ))}
      {participants.length === 0 && (
        <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">אין משתתפים זמינים</p>
      )}
    </div>
  )
}

export default function TaskChecklist({ taskId, canEdit, participants = [], currentUserId }: TaskChecklistProps) {
  const [items, setItems] = useState<TaskChecklistItem[]>([])
  const [loading, setLoading] = useState(false)
  const [newItemText, setNewItemText] = useState('')
  const [addingItem, setAddingItem] = useState(false)
  const [togglingItemId, setTogglingItemId] = useState<number | null>(null)
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null)
  const [assignDropdownItemId, setAssignDropdownItemId] = useState<number | null>(null)
  const [assigningItemId, setAssigningItemId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    TaskChecklistAPI.list(taskId)
      .then((data) => { if (!cancelled) setItems(data) })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [taskId])

  const total = items.length
  const completed = items.filter((i) => i.is_completed).length
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100)

  const handleAdd = useCallback(async () => {
    const text = newItemText.trim()
    if (!text || addingItem) return
    setAddingItem(true)
    try {
      const created = await TaskChecklistAPI.create(taskId, text)
      setItems((prev) => [...prev, created])
      setNewItemText('')
    } finally {
      setAddingItem(false)
    }
  }, [taskId, newItemText, addingItem])

  const handleToggle = useCallback(async (item: TaskChecklistItem) => {
    if (togglingItemId === item.id) return
    const nextValue = !item.is_completed
    // Optimistic update
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? { ...i, is_completed: nextValue }
          : i
      )
    )
    setTogglingItemId(item.id)
    try {
      const updated = await TaskChecklistAPI.update(taskId, item.id, { is_completed: nextValue })
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)))
    } catch {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_completed: item.is_completed } : i)))
    } finally {
      setTogglingItemId(null)
    }
  }, [taskId, togglingItemId])

  const handleDelete = useCallback(async (item: TaskChecklistItem) => {
    if (deletingItemId === item.id) return
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    setDeletingItemId(item.id)
    try {
      await TaskChecklistAPI.delete(taskId, item.id)
    } catch {
      setItems((prev) => {
        const exists = prev.some((i) => i.id === item.id)
        if (exists) return prev
        const idx = prev.findIndex((i) => i.sort_order > item.sort_order)
        const next = [...prev]
        if (idx === -1) next.push(item)
        else next.splice(idx, 0, item)
        return next
      })
    } finally {
      setDeletingItemId(null)
    }
  }, [taskId, deletingItemId])

  const handleAssign = useCallback(async (itemId: number, userId: number) => {
    setAssignDropdownItemId(null)
    setAssigningItemId(itemId)
    try {
      const updated = await TaskChecklistAPI.update(taskId, itemId, { assigned_to_user_id: userId })
      setItems((prev) => prev.map((i) => (i.id === itemId ? updated : i)))
    } finally {
      setAssigningItemId(null)
    }
  }, [taskId])

  const handleClearAssignment = useCallback(async (itemId: number) => {
    setAssignDropdownItemId(null)
    setAssigningItemId(itemId)
    try {
      const updated = await TaskChecklistAPI.update(taskId, itemId, { clear_assignment: true })
      setItems((prev) => prev.map((i) => (i.id === itemId ? updated : i)))
    } finally {
      setAssigningItemId(null)
    }
  }, [taskId])

  return (
    <div className="border-t border-gray-200 dark:border-gray-600 pt-3 mt-3">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
        <CheckSquare className="w-4 h-4" />
        רשימת משימות
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-2 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          טוען...
        </div>
      ) : (
        <>
          {total > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className={cn(
                      'h-2 rounded-full transition-all duration-300',
                      pct === 100 ? 'bg-emerald-500' : 'bg-blue-500'
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {pct === 100 ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap">
                    <CheckCircle className="w-3.5 h-3.5" />
                    הכל הושלם
                  </span>
                ) : (
                  <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {completed}/{total} ({pct}%)
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1 mb-2">
            {items.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 py-1">
                אין פריטים. {canEdit && 'הוסף את הראשון.'}
              </p>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2 py-1.5 group"
                >
                  <input
                    type="checkbox"
                    checked={item.is_completed}
                    onChange={() => handleToggle(item)}
                    disabled={togglingItemId === item.id}
                    className="w-4 h-4 mt-0.5 accent-emerald-600 flex-shrink-0 cursor-pointer disabled:cursor-wait"
                  />
                  <div className="flex-1 min-w-0">
                    <span
                      className={cn(
                        'text-sm block',
                        item.is_completed
                          ? 'line-through text-gray-400 dark:text-gray-500'
                          : 'text-gray-800 dark:text-gray-200'
                      )}
                    >
                      {item.text}
                    </span>

                    {/* Handled-by indicator */}
                    {item.is_completed && item.handled_by_user_name && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          {avatarUrl(item.handled_by_user_avatar) ? (
                            <img src={avatarUrl(item.handled_by_user_avatar)!} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />
                          ) : (
                            <span
                              className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-white text-[7px] font-bold"
                              style={{ backgroundColor: item.handled_by_user_color || '#10B981' }}
                            >
                              {(item.handled_by_user_name || '?').charAt(0)}
                            </span>
                          )}
                          טופל ע״י {item.handled_by_user_name}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Assigned user display / assignment button */}
                    {item.assigned_to_user_id && item.assigned_user_name ? (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => canEdit && setAssignDropdownItemId(assignDropdownItemId === item.id ? null : item.id)}
                          disabled={assigningItemId === item.id || !canEdit}
                          className={cn(
                            'flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px]',
                            'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
                            'border border-blue-200 dark:border-blue-800',
                            canEdit && 'hover:bg-blue-100 dark:hover:bg-blue-900/30 cursor-pointer',
                            'disabled:opacity-50 disabled:cursor-wait'
                          )}
                          title={item.assigned_user_name}
                        >
                          {assigningItemId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : avatarUrl(item.assigned_user_avatar) ? (
                            <img src={avatarUrl(item.assigned_user_avatar)!} alt="" className="w-4 h-4 rounded-full object-cover" />
                          ) : (
                            <UserInitials name={item.assigned_user_name} color={item.assigned_user_color} size="xs" />
                          )}
                          <span className="max-w-[60px] truncate hidden sm:inline">{item.assigned_user_name.split(' ')[0]}</span>
                          {canEdit && <ChevronDown className="w-3 h-3" />}
                        </button>
                        {assignDropdownItemId === item.id && (
                          <AssignmentDropdown
                            participants={participants}
                            currentAssignedId={item.assigned_to_user_id}
                            onSelect={(userId) => handleAssign(item.id, userId)}
                            onClear={() => handleClearAssignment(item.id)}
                            onClose={() => setAssignDropdownItemId(null)}
                          />
                        )}
                      </div>
                    ) : canEdit ? (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setAssignDropdownItemId(assignDropdownItemId === item.id ? null : item.id)}
                          disabled={assigningItemId === item.id}
                          className={cn(
                            'p-1 rounded text-gray-400 hover:text-blue-500 dark:hover:text-blue-400',
                            'opacity-0 group-hover:opacity-100 transition-opacity',
                            'disabled:opacity-50 disabled:cursor-wait'
                          )}
                          title="הקצה למשתמש"
                        >
                          {assigningItemId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <UserPlus className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {assignDropdownItemId === item.id && (
                          <AssignmentDropdown
                            participants={participants}
                            currentAssignedId={null}
                            onSelect={(userId) => handleAssign(item.id, userId)}
                            onClear={() => {}}
                            onClose={() => setAssignDropdownItemId(null)}
                          />
                        )}
                      </div>
                    ) : null}

                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        disabled={deletingItemId === item.id}
                        className={cn(
                          'p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400',
                          'opacity-0 group-hover:opacity-100 transition-opacity',
                          'disabled:opacity-50 disabled:cursor-wait'
                        )}
                        title="מחק פריט"
                      >
                        {deletingItemId === item.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />
                        }
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {canEdit && (
            <div className="flex gap-2">
              <input
                type="text"
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleAdd()
                  }
                }}
                placeholder="הוסף פריט לרשימה..."
                disabled={addingItem}
                className={cn(
                  'flex-1 px-3 py-1.5 border rounded-lg text-sm',
                  'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700',
                  'text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500',
                  'disabled:opacity-50'
                )}
              />
              <button
                type="button"
                onClick={handleAdd}
                disabled={!newItemText.trim() || addingItem}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addingItem ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                הוסף
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
