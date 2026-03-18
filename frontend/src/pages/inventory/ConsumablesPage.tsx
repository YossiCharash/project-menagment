import { useEffect, useState, useCallback } from 'react'
import {
  Package,
  Plus,
  Search,
  Minus,
  AlertTriangle,
  Filter,
  X,
  MapPin,
} from 'lucide-react'
import {
  cemsApi,
  type ConsumableItem,
  type AssetCategory,
  type Warehouse,
  type CemsProject,
} from '../../lib/cemsApi'

// ─── Constants ───────────────────────────────────────────────────────────────

const MODAL_OVERLAY = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4'
const MODAL_PANEL = 'bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto'
const INPUT_CLASS = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const LABEL_CLASS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'
const BTN_PRIMARY = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'
const BTN_SECONDARY = 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isLowStock(item: ConsumableItem): boolean {
  return Number(item.quantity) <= Number(item.low_stock_threshold)
}

function stockStatusClasses(item: ConsumableItem): string {
  return isLowStock(item)
    ? 'text-red-600 dark:text-red-400 font-semibold'
    : 'text-green-600 dark:text-green-400'
}

function stockStatusLabel(item: ConsumableItem): string {
  if (Number(item.quantity) === 0) return 'אזל מהמלאי'
  return isLowStock(item) ? 'מלאי נמוך' : 'תקין'
}

function stockBadgeClasses(item: ConsumableItem): string {
  if (Number(item.quantity) === 0) {
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
  }
  return isLowStock(item)
    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
    : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ConsumablesPage() {
  const [items, setItems] = useState<ConsumableItem[]>([])
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [projects, setProjects] = useState<CemsProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)

  // Modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [consumeItem, setConsumeItem] = useState<ConsumableItem | null>(null)
  const [moveItem, setMoveItem] = useState<ConsumableItem | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [itemsRes, categoriesRes, projectsRes, warehousesRes] = await Promise.all([
        cemsApi.getConsumables(),
        cemsApi.getCategories(),
        cemsApi.getProjects(),
        cemsApi.getWarehouses(),
      ])
      setItems(itemsRes.data)
      setCategories(categoriesRes.data)
      setProjects(projectsRes.data)
      setWarehouses(warehousesRes.data)
    } catch {
      setError('שגיאה בטעינת רשימת המתכלים')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  function getCategoryName(categoryId: string): string {
    return categories.find((c) => c.id === categoryId)?.name || '-'
  }

  function getWarehouseName(warehouseId: string): string {
    return warehouses.find((w) => w.id === warehouseId)?.name || '-'
  }

  const filteredItems = items.filter((item) => {
    if (lowStockOnly && !isLowStock(item)) return false
    if (!searchTerm) return true
    return item.name.toLowerCase().includes(searchTerm.toLowerCase())
  })

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
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">מתכלים ומלאי</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">ניהול מלאי מתכלים, צריכה ומעקב</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className={BTN_PRIMARY}>
          <span className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            הוסף פריט
          </span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <p className="text-red-800 dark:text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="חיפוש לפי שם..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`${INPUT_CLASS} pr-10`}
            />
          </div>
          <button
            onClick={() => setLowStockOnly(!lowStockOnly)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              lowStockOnly
                ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
            }`}
          >
            <Filter className="w-4 h-4" />
            {lowStockOnly ? 'מלאי נמוך בלבד' : 'הצג הכל'}
          </button>
        </div>
      </div>

      {/* Consumables Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700">
                <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">שם</th>
                <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">קטגוריה</th>
                <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">מחסן</th>
                <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">כמות נוכחית</th>
                <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">יחידת מידה</th>
                <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">סף התראה</th>
                <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">סטטוס מלאי</th>
                <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    לא נמצאו פריטי מלאי
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">{item.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{getCategoryName(item.category_id)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{getWarehouseName(item.warehouse_id)}</td>
                    <td className={`px-4 py-3 text-sm ${stockStatusClasses(item)}`}>
                      {item.quantity}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{item.unit}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{item.low_stock_threshold}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${stockBadgeClasses(item)}`}>
                        {stockStatusLabel(item)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setConsumeItem(item)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800/40 transition-colors"
                        >
                          <Minus className="w-3 h-3" />
                          צרוך מלאי
                        </button>
                        <button
                          onClick={() => setMoveItem(item)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800/40 transition-colors"
                        >
                          <MapPin className="w-3 h-3" />
                          העבר למחסן
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddConsumableModal
          categories={categories}
          warehouses={warehouses}
          onClose={() => setShowAddModal(false)}
          onCreated={loadData}
        />
      )}
      {consumeItem && (
        <ConsumeModal
          item={consumeItem}
          projects={projects}
          onClose={() => setConsumeItem(null)}
          onConsumed={loadData}
        />
      )}
      {moveItem && (
        <MoveConsumableModal
          item={moveItem}
          onClose={() => setMoveItem(null)}
          onMoved={loadData}
        />
      )}
    </div>
  )
}

// ─── Add Consumable Modal ────────────────────────────────────────────────────

interface AddConsumableModalProps {
  categories: AssetCategory[]
  warehouses: Warehouse[]
  onClose: () => void
  onCreated: () => void
}

function AddConsumableModal({ categories, warehouses, onClose, onCreated }: AddConsumableModalProps) {
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [lowStockThreshold, setLowStockThreshold] = useState('')
  const [reorderQuantity, setReorderQuantity] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('שם הפריט הוא שדה חובה')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await cemsApi.createConsumable({
        name: name.trim(),
        category_id: categoryId || undefined,
        warehouse_id: warehouseId || undefined,
        quantity: quantity || '0',
        unit: unit || 'יחידה',
        low_stock_threshold: lowStockThreshold || '0',
        reorder_quantity: reorderQuantity || '0',
      } as Partial<ConsumableItem>)
      onCreated()
      onClose()
    } catch {
      setError('שגיאה ביצירת פריט מלאי')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_PANEL} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">הוספת פריט מלאי חדש</h3>
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
            <label className={LABEL_CLASS}>שם הפריט *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} required />
          </div>
          <div>
            <label className={LABEL_CLASS}>קטגוריה</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={INPUT_CLASS}>
              <option value="">בחר קטגוריה</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>מחסן</label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={INPUT_CLASS}>
              <option value="">בחר מחסן</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>כמות התחלתית</label>
              <input type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={INPUT_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>יחידת מידה</label>
              <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} className={INPUT_CLASS} placeholder="יחידה" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>סף התראה</label>
              <input type="number" min="0" value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} className={INPUT_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>כמות להזמנה מחדש</label>
              <input type="number" min="0" value={reorderQuantity} onChange={(e) => setReorderQuantity(e.target.value)} className={INPUT_CLASS} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>ביטול</button>
            <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
              {submitting ? 'שומר...' : 'הוסף פריט'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Consume Modal ───────────────────────────────────────────────────────────

interface ConsumeModalProps {
  item: ConsumableItem
  projects: CemsProject[]
  onClose: () => void
  onConsumed: () => void
}

function ConsumeModal({ item, projects, onClose, onConsumed }: ConsumeModalProps) {
  const [quantity, setQuantity] = useState<number>(1)
  const [notes, setNotes] = useState('')
  const [projectId, setProjectId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (quantity <= 0) {
      setError('כמות חייבת להיות גדולה מ-0')
      return
    }
    if (quantity > Number(item.quantity)) {
      setError(`הכמות המבוקשת (${quantity}) גדולה מהמלאי הזמין (${item.quantity})`)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const notesParts: string[] = []
      if (projectId) {
        const proj = projects.find((p) => p.id === projectId)
        if (proj) notesParts.push(`פרויקט: ${proj.name}`)
      }
      if (notes.trim()) notesParts.push(notes.trim())

      await cemsApi.consumeStock(item.id, {
        quantity,
        notes: notesParts.length > 0 ? notesParts.join(' | ') : undefined,
      })
      onConsumed()
      onClose()
    } catch {
      setError('שגיאה בצריכת מלאי')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_PANEL} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            צריכת מלאי: {item.name}
          </h3>
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
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              מלאי זמין: <span className="font-bold">{item.quantity} {item.unit}</span>
            </p>
          </div>
          <div>
            <label className={LABEL_CLASS}>כמות לצריכה *</label>
            <input
              type="number"
              min={1}
              max={Number(item.quantity)}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className={INPUT_CLASS}
              required
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>פרויקט (אופציונלי)</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={INPUT_CLASS}>
              <option value="">בחר פרויקט</option>
              {projects.filter((p) => p.is_active).map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>הערות</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT_CLASS} rows={2} />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>ביטול</button>
            <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
              {submitting ? 'מבצע צריכה...' : 'צרוך מלאי'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Move Consumable Modal ──────────────────────────────────────────────────

interface MoveConsumableModalProps {
  item: ConsumableItem
  onClose: () => void
  onMoved: () => void
}

function MoveConsumableModal({ item, onClose, onMoved }: MoveConsumableModalProps) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    cemsApi.getWarehouses()
      .then((res) => setWarehouses(res.data))
      .catch(() => { /* silent */ })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedWarehouseId) {
      setError('יש לבחור מחסן יעד')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await cemsApi.moveConsumable(item.id, selectedWarehouseId)
      onMoved()
      onClose()
    } catch {
      setError('שגיאה בהעברת הפריט למחסן')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_PANEL} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            העברת פריט למחסן: {item.name}
          </h3>
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
            <label className={LABEL_CLASS}>בחר מחסן יעד *</label>
            <select value={selectedWarehouseId} onChange={(e) => setSelectedWarehouseId(e.target.value)} className={INPUT_CLASS} required>
              <option value="">בחר מחסן</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>ביטול</button>
            <button type="submit" disabled={submitting || !selectedWarehouseId} className={BTN_PRIMARY}>
              {submitting ? 'מעביר...' : 'העבר למחסן'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
