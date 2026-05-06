import { useState, useCallback, useEffect, useRef } from 'react'
import {
  SlidersHorizontal,
  Plus,
  Trash2,
  X,
  AlertTriangle,
} from 'lucide-react'
import { cemsApi, type Warehouse } from '../../lib/cemsApi'

// ---- Style Constants --------------------------------------------------------

const MODAL_OVERLAY = 'fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4'
const MODAL_PANEL = 'bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto'
const INPUT_CLASS = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const LABEL_CLASS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'
const BTN_PRIMARY = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'
const BTN_SECONDARY = 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors'

// ---- Settings Panel ---------------------------------------------------------

interface SettingsPanelProps {
  onClose?: () => void
}

export default function SettingsPanel({ onClose: _onClose }: SettingsPanelProps) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddWarehouse, setShowAddWarehouse] = useState(false)
  const dataLoadedRef = useRef(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const whRes = await cemsApi.getWarehouses()
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

  async function handleDeleteWarehouse(id: string, name: string) {
    if (!window.confirm(`למחוק את המחסן "${name}"?`)) return
    try {
      await cemsApi.deleteWarehouse(id)
      setWarehouses((prev) => prev.filter((w) => w.id !== id))
    } catch {
      setError('שגיאה במחיקת המחסן')
    }
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <SlidersHorizontal className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">הגדרות מלאי</h2>
      </div>

      {error && <SettingsError message={error} />}

      {loading ? (
        <div className="flex items-center justify-center h-16">
          <p className="text-gray-500 dark:text-gray-400 text-sm">טוען...</p>
        </div>
      ) : (
        <WarehousesView
          warehouses={warehouses}
          onDeleteWarehouse={handleDeleteWarehouse}
          onAddWarehouse={() => setShowAddWarehouse(true)}
        />
      )}

      {showAddWarehouse && (
        <AddWarehouseModal
          onClose={() => setShowAddWarehouse(false)}
          onCreated={(wh) => {
            setShowAddWarehouse(false)
            setWarehouses((prev) => [...prev, wh])
          }}
        />
      )}
    </div>
  )
}

// ---- Settings Error Banner --------------------------------------------------

function SettingsError({ message }: { message: string }) {
  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-2">
      <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
      <p className="text-red-800 dark:text-red-300 text-sm">{message}</p>
    </div>
  )
}

// ---- Warehouses View --------------------------------------------------------

interface WarehousesViewProps {
  warehouses: Warehouse[]
  onDeleteWarehouse: (id: string, name: string) => void
  onAddWarehouse: () => void
}

function WarehousesView({ warehouses, onDeleteWarehouse, onAddWarehouse }: WarehousesViewProps) {
  return (
    <div className="space-y-3">
      <CompactSection title="מחסנים" onAdd={onAddWarehouse}>
        {warehouses.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">אין מחסנים</p>
        ) : (
          <div className="space-y-1">
            {warehouses.map((wh) => (
              <CompactRow key={wh.id} label={wh.name} onDelete={() => onDeleteWarehouse(wh.id, wh.name)} />
            ))}
          </div>
        )}
      </CompactSection>
    </div>
  )
}

// ---- Compact Section --------------------------------------------------------

interface CompactSectionProps {
  title: string
  onAdd?: () => void
  children: React.ReactNode
}

function CompactSection({ title, onAdd, children }: CompactSectionProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-2.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">{title}</span>
        {onAdd && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors"
          >
            <Plus className="w-3 h-3" />
            הוסף
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

// ---- Compact Row ------------------------------------------------------------

interface CompactRowProps {
  label: string
  onDelete: () => void
}

function CompactRow({ label, onDelete }: CompactRowProps) {
  return (
    <div className="flex items-center justify-between px-1 py-0.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 group">
      <span className="text-xs text-gray-800 dark:text-gray-200 truncate">{label}</span>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all flex-shrink-0"
        title="מחק"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}

// ---- Add Warehouse Modal ----------------------------------------------------

interface AddWarehouseModalProps {
  onClose: () => void
  onCreated: (warehouse: Warehouse) => void
}

function AddWarehouseModal({ onClose, onCreated }: AddWarehouseModalProps) {
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('שם המחסן הוא שדה חובה'); return }

    setSubmitting(true)
    setError(null)
    try {
      const res = await cemsApi.createWarehouse({ name: name.trim(), location: location.trim() || undefined })
      onCreated(res.data)
    } catch {
      setError('שגיאה ביצירת מחסן')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_PANEL} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">הוספת מחסן</h3>
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
            <label className={LABEL_CLASS}>שם המחסן *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT_CLASS}
              placeholder="לדוגמה: מחסן ראשי"
              required
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>מיקום</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={INPUT_CLASS}
              placeholder="לדוגמה: בניין א׳, קומה 2"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>ביטול</button>
            <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
              {submitting ? 'שומר...' : 'הוסף מחסן'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
