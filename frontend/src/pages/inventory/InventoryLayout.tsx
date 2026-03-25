import { useState, useCallback, useEffect, useRef } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import {
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Package,
  Warehouse as WarehouseIcon,
  ArrowLeftRight,
  Archive,
  LayoutDashboard,
  Plus,
  Trash2,
  X,
  AlertTriangle,
} from 'lucide-react'
import { cemsApi, type AssetCategory, type Warehouse } from '../../lib/cemsApi'

// ─── Style Constants ────────────────────────────────────────────────────────

const MODAL_OVERLAY = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4'
const MODAL_PANEL = 'bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto'
const INPUT_CLASS = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const LABEL_CLASS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'
const BTN_PRIMARY = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'
const BTN_SECONDARY = 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors'
const BTN_ICON = 'p-2 rounded-lg transition-colors'
const TABLE_HEAD = 'px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider'
const TABLE_CELL = 'px-4 py-3 text-sm text-gray-900 dark:text-white'

// ─── Tab Navigation Configuration ───────────────────────────────────────────

interface TabItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  isExactMatch: boolean
}

const TAB_ITEMS: TabItem[] = [
  { label: 'סקירה', href: '/inventory', icon: LayoutDashboard, isExactMatch: true },
  { label: 'ציוד קבוע', href: '/inventory/assets', icon: Package, isExactMatch: false },
  { label: 'מתכלים', href: '/inventory/consumables', icon: Archive, isExactMatch: false },
  { label: 'מחסנים', href: '/inventory/warehouses', icon: WarehouseIcon, isExactMatch: false },
  { label: 'העברות', href: '/inventory/transfers', icon: ArrowLeftRight, isExactMatch: false },
]

// ─── Layout Component ───────────────────────────────────────────────────────

export default function InventoryLayout() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!settingsOpen) return

    function handleClickOutside(event: MouseEvent) {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(event.target as Node)
      ) {
        setSettingsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [settingsOpen])

  return (
    <div dir="rtl" className="space-y-6">
      <div className="relative" ref={settingsRef}>
        <LayoutHeader
          settingsOpen={settingsOpen}
          onToggleSettings={() => setSettingsOpen((prev) => !prev)}
        />

        {settingsOpen && (
          <div className="absolute top-full left-0 mt-2 z-50 w-full max-w-2xl shadow-xl rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <SettingsPanel onClose={() => setSettingsOpen(false)} />
          </div>
        )}
      </div>

      <TabBar />

      <Outlet />
    </div>
  )
}

// ─── Header ─────────────────────────────────────────────────────────────────

interface LayoutHeaderProps {
  settingsOpen: boolean
  onToggleSettings: () => void
}

function LayoutHeader({ settingsOpen, onToggleSettings }: LayoutHeaderProps) {
  const ChevronIcon = settingsOpen ? ChevronUp : ChevronDown

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          ניהול מלאי וציוד
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          סקירה כללית של ציוד, מחסנים ומלאי
        </p>
      </div>
      <button
        onClick={onToggleSettings}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
      >
        <SlidersHorizontal className="w-4 h-4" />
        הגדרות
        <ChevronIcon className="w-4 h-4" />
      </button>
    </div>
  )
}

// ─── Tab Bar ────────────────────────────────────────────────────────────────

function TabBar() {
  const location = useLocation()

  return (
    <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-0">
      {TAB_ITEMS.map((tab) => {
        const isActive = tab.isExactMatch
          ? location.pathname === tab.href
          : location.pathname.startsWith(tab.href)
        const Icon = tab.icon

        return (
          <Link
            key={tab.href}
            to={tab.href}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              isActive
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}

// ─── Settings Panel (lazy-loaded data) ──────────────────────────────────────

interface SettingsPanelProps {
  onClose?: () => void
}

function SettingsPanel({ onClose: _onClose }: SettingsPanelProps) {
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [addCategoryWarehouseId, setAddCategoryWarehouseId] = useState<string | undefined>(undefined)
  const dataLoadedRef = useRef(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [catRes, whRes] = await Promise.all([
        cemsApi.getCategories(),
        cemsApi.getWarehouses(),
      ])
      setCategories(catRes.data)
      setWarehouses(whRes.data)
    } catch {
      setError('שגיאה בטעינת הנתונים')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!dataLoadedRef.current) {
      dataLoadedRef.current = true
      loadData()
    }
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

  async function handleDeleteWarehouse(id: string, name: string) {
    if (!window.confirm(`למחוק את המחסן "${name}"?`)) return
    try {
      await cemsApi.deleteWarehouse(id)
      setWarehouses((prev) => prev.filter((w) => w.id !== id))
    } catch {
      setError('שגיאה במחיקת המחסן')
    }
  }

  function handleOpenAddModal(warehouseId?: string) {
    setAddCategoryWarehouseId(warehouseId)
    setShowAddCategory(true)
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
          <SlidersHorizontal className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          הגדרות ניהול מלאי
        </h2>
      </div>

      {error && <SettingsError message={error} />}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <p className="text-gray-500 dark:text-gray-400 text-sm">טוען...</p>
        </div>
      ) : (
        <GroupedCategoriesView
          categories={categories}
          warehouses={warehouses}
          onAdd={handleOpenAddModal}
          onDelete={handleDeleteCategory}
          onDeleteWarehouse={handleDeleteWarehouse}
        />
      )}

      {showAddCategory && (
        <AddCategoryModal
          warehouses={warehouses}
          defaultWarehouseId={addCategoryWarehouseId}
          onClose={() => setShowAddCategory(false)}
          onCreated={() => {
            setShowAddCategory(false)
            loadData()
          }}
        />
      )}
    </div>
  )
}

// ─── Settings Error Banner ──────────────────────────────────────────────────

function SettingsError({ message }: { message: string }) {
  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-2">
      <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
      <p className="text-red-800 dark:text-red-300 text-sm">{message}</p>
    </div>
  )
}

// ─── Grouped Categories View ────────────────────────────────────────────────

interface GroupedCategoriesViewProps {
  categories: AssetCategory[]
  warehouses: Warehouse[]
  onAdd: (warehouseId?: string) => void
  onDelete: (id: string, name: string) => void
  onDeleteWarehouse: (id: string, name: string) => void
}

function GroupedCategoriesView({ categories, warehouses, onAdd, onDelete, onDeleteWarehouse }: GroupedCategoriesViewProps) {
  const globalCategories = categories.filter((c) => c.warehouse_id === null)

  const categoriesByWarehouse = new Map<string, AssetCategory[]>()
  for (const cat of categories) {
    if (cat.warehouse_id !== null) {
      const existing = categoriesByWarehouse.get(cat.warehouse_id) ?? []
      existing.push(cat)
      categoriesByWarehouse.set(cat.warehouse_id, existing)
    }
  }

  return (
    <>
      {/* Warehouses section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">מחסנים</h3>
        </div>
        {warehouses.length === 0 ? (
          <p className="p-4 text-gray-400 dark:text-gray-500 text-sm">אין מחסנים</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-750">
                <tr>
                  <th className={TABLE_HEAD}>שם</th>
                  <th className={`${TABLE_HEAD} w-20`}>פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {warehouses.map((wh) => (
                  <tr key={wh.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                    <td className={TABLE_CELL}>{wh.name}</td>
                    <td className={TABLE_CELL}>
                      <button
                        onClick={() => onDeleteWarehouse(wh.id, wh.name)}
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

      {/* Categories section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">קטגוריות</h3>
          <button onClick={() => onAdd(undefined)} className={BTN_PRIMARY}>
            <span className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              הוסף
            </span>
          </button>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {/* Global categories section */}
          <CategorySection
            title="קטגוריות גלובליות"
            categories={globalCategories}
            onAdd={() => onAdd(undefined)}
            onDelete={onDelete}
          />

          {/* Per-warehouse sections */}
          {warehouses.map((warehouse) => {
            const warehouseCategories = categoriesByWarehouse.get(warehouse.id) ?? []
            return (
              <CategorySection
                key={warehouse.id}
                title={warehouse.name}
                categories={warehouseCategories}
                onAdd={() => onAdd(warehouse.id)}
                onDelete={onDelete}
              />
            )
          })}
        </div>
      </div>
    </>
  )
}

// ─── Category Section (one warehouse group or global) ───────────────────────

interface CategorySectionProps {
  title: string
  categories: AssetCategory[]
  onAdd: () => void
  onDelete: (id: string, name: string) => void
}

function CategorySection({ title, categories, onAdd, onDelete }: CategorySectionProps) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200">{title}</h4>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          הוסף
        </button>
      </div>

      {categories.length === 0 ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">אין קטגוריות</p>
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
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {categories.map((cat) => (
                <tr
                  key={cat.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                >
                  <td className={TABLE_CELL}>{cat.name}</td>
                  <td className={`${TABLE_CELL} text-gray-500 dark:text-gray-400`}>
                    {cat.description || '-'}
                  </td>
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

// ─── Add Category Modal ─────────────────────────────────────────────────────

interface AddCategoryModalProps {
  warehouses: Warehouse[]
  defaultWarehouseId?: string
  onClose: () => void
  onCreated: () => void
}

function AddCategoryModal({ warehouses, defaultWarehouseId, onClose, onCreated }: AddCategoryModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('שם הקטגוריה הוא שדה חובה')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await cemsApi.createCategory({
        name: name.trim(),
        description: description.trim() || undefined,
        warehouse_id: warehouseId || undefined,
      })
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
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            הוספת קטגוריה
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
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
          <div>
            <label className={LABEL_CLASS}>מחסן</label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">גלובלי</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>
              ביטול
            </button>
            <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
              {submitting ? 'שומר...' : 'הוסף קטגוריה'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
