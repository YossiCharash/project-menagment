import { useEffect, useState, useCallback } from 'react'
import {
  SlidersHorizontal,
  Plus,
  Trash2,
  X,
  AlertTriangle,
} from 'lucide-react'
import {
  cemsApi,
  type AssetCategory,
} from '../../lib/cemsApi'

// ─── Constants ───────────────────────────────────────────────────────────────

const MODAL_OVERLAY = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4'
const MODAL_PANEL = 'bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto'
const INPUT_CLASS = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const LABEL_CLASS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'
const BTN_PRIMARY = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'
const BTN_SECONDARY = 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors'
const BTN_ICON = 'p-2 rounded-lg transition-colors'
const TABLE_HEAD = 'px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider'
const TABLE_CELL = 'px-4 py-3 text-sm text-gray-900 dark:text-white'

// ─── Main Component ──────────────────────────────────────────────────────────

export default function InventorySettings() {
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showAddCategory, setShowAddCategory] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const catRes = await cemsApi.getCategories()
      setCategories(catRes.data)
    } catch {
      setError('שגיאה בטעינת הנתונים')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function handleDeleteCategory(id: string, name: string) {
    if (!window.confirm(`למחוק את הקטגוריה "${name}"?`)) return
    try {
      await cemsApi.deleteCategory(id)
      setCategories((prev) => prev.filter((c) => c.id !== id))
    } catch {
      setError('שגיאה במחיקת הקטגוריה')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 dark:text-gray-400 text-lg">טוען...</p>
      </div>
    )
  }

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
            <SlidersHorizontal className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">הגדרות ניהול מלאי</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">קטגוריות</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-800 dark:text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Categories */}
      <CategoriesTab
        categories={categories}
        onAdd={() => setShowAddCategory(true)}
        onDelete={handleDeleteCategory}
      />

      {/* Modals */}
      {showAddCategory && (
        <AddCategoryModal
          onClose={() => setShowAddCategory(false)}
          onCreated={() => { setShowAddCategory(false); loadData() }}
        />
      )}
    </div>
  )
}

// ─── Categories Tab ──────────────────────────────────────────────────────────

interface CategoriesTabProps {
  categories: AssetCategory[]
  onAdd: () => void
  onDelete: (id: string, name: string) => void
}

function CategoriesTab({ categories, onAdd, onDelete }: CategoriesTabProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">קטגוריות</h2>
        <button onClick={onAdd} className={BTN_PRIMARY}>
          <span className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            הוסף
          </span>
        </button>
      </div>

      {categories.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">לא נמצאו קטגוריות</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-750">
              <tr>
                <th className={TABLE_HEAD}>שם</th>
                <th className={TABLE_HEAD}>תיאור</th>
                <th className={`${TABLE_HEAD} w-20`}>פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {categories.map((cat) => (
                <tr key={cat.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                  <td className={TABLE_CELL}>{cat.name}</td>
                  <td className={`${TABLE_CELL} text-gray-500 dark:text-gray-400`}>{cat.description || '-'}</td>
                  <td className={TABLE_CELL}>
                    <button
                      onClick={() => onDelete(cat.id, cat.name)}
                      className={`${BTN_ICON} text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20`}
                      title="מחק"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Add Category Modal ──────────────────────────────────────────────────────

interface AddCategoryModalProps {
  onClose: () => void
  onCreated: () => void
}

function AddCategoryModal({ onClose, onCreated }: AddCategoryModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('שם הקטגוריה הוא שדה חובה'); return }

    setSubmitting(true)
    setError(null)
    try {
      await cemsApi.createCategory({ name: name.trim(), description: description.trim() || undefined })
      onCreated()
    } catch {
      setError('שגיאה ביצירת קטגוריה')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_PANEL} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">הוספת קטגוריה</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4" dir="rtl">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-800 dark:text-red-300">
              {error}
            </div>
          )}
          <div>
            <label className={LABEL_CLASS}>שם הקטגוריה *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT_CLASS}
              placeholder="לדוגמה: כלי עבודה"
              required
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>תיאור</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={INPUT_CLASS}
              rows={3}
              placeholder="תיאור אופציונלי"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>ביטול</button>
            <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
              {submitting ? 'שומר...' : 'הוסף קטגוריה'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
