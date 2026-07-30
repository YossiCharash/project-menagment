import { useEffect, useRef, useState } from 'react'
import { X, Trash2, Upload, Image as ImageIcon, Pencil, PackageMinus } from 'lucide-react'
import {
  cemsApi,
  type ConsumableItem,
  type ConsumableMovement,
  type ConsumableMovementAction,
  type ConsumptionLog,
  type AssetCategory,
  type Warehouse,
} from '../../lib/cemsApi'
import { fileAttachmentUrl } from '../../lib/api'
import { formatQuantity } from '../../lib/quantity'
import { DocumentsSection } from './DocumentsSection'

// ─── Constants ───────────────────────────────────────────────────────────────

const MODAL_OVERLAY = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4'
const INPUT_CLASS = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const LABEL_CLASS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'
const BTN_PRIMARY = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'
const BTN_SECONDARY = 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors'

/** Format an optional unit price as ₪ with two decimals; '-' when unset. */
function formatUnitPrice(price: string | null): string {
  if (price == null || price === '') return '-'
  const parsed = Number(price)
  if (Number.isNaN(parsed)) return '-'
  return `₪${parsed.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ConsumableViewModalProps {
  item: ConsumableItem
  categories: AssetCategory[]
  warehouses: Warehouse[]
  isManager: boolean
  onClose: () => void
  onUpdated: (updated: ConsumableItem) => void
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ConsumableViewModal({
  item,
  categories,
  warehouses,
  isManager,
  onClose,
  onUpdated,
}: ConsumableViewModalProps) {
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [movements, setMovements] = useState<ConsumableMovement[]>([])
  const [movementsLoading, setMovementsLoading] = useState(false)
  const [consumptions, setConsumptions] = useState<ConsumptionLog[]>([])
  const [consumptionsLoading, setConsumptionsLoading] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  const category = categories.find((c) => c.id === item.category_id)
  const warehouse = warehouses.find((w) => w.id === item.warehouse_id)
  const warehouseNameById = (id: string | null) =>
    id ? warehouses.find((w) => w.id === id)?.name ?? '-' : '-'

  useEffect(() => {
    let cancelled = false
    setMovementsLoading(true)
    cemsApi
      .getConsumableMovements(item.id)
      .then((res) => {
        if (!cancelled) setMovements(res.data)
      })
      .catch(() => {
        if (!cancelled) setMovements([])
      })
      .finally(() => {
        if (!cancelled) setMovementsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [item.id])

  useEffect(() => {
    let cancelled = false
    setConsumptionsLoading(true)
    cemsApi
      .getConsumptionHistory(item.id)
      .then((res) => {
        if (!cancelled) setConsumptions(res.data)
      })
      .catch(() => {
        if (!cancelled) setConsumptions([])
      })
      .finally(() => {
        if (!cancelled) setConsumptionsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [item.id])

  const ACTION_LABELS: Record<ConsumableMovementAction, string> = {
    MOVE: 'הועבר מלא',
    TRANSFER_OUT: 'הועבר חלקית (יציאה)',
    TRANSFER_IN: 'התקבל מהעברה',
  }

  const formatDateTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('he-IL')
    } catch {
      return iso
    }
  }

  const resolveImg = (raw?: string | null) =>
    raw ? fileAttachmentUrl(raw.startsWith('http') ? raw : `/uploads/${raw}`) ?? '' : ''
  const displayUrl = resolveImg(item.image_url) || resolveImg(category?.image_url)

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoBusy(true)
    try {
      const res = await cemsApi.uploadConsumablePhoto(item.id, file)
      onUpdated(res.data)
    } catch {
      // silent
    } finally {
      setPhotoBusy(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  async function handlePhotoDelete() {
    if (!window.confirm('למחוק את התמונה?')) return
    setPhotoBusy(true)
    try {
      const res = await cemsApi.updateConsumable(item.id, { image_url: null })
      onUpdated(res.data)
    } catch {
      // silent
    } finally {
      setPhotoBusy(false)
    }
  }

  const isLow = Number(item.quantity) <= Number(item.low_stock_threshold)

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{item.name}</h3>
          <div className="flex items-center gap-1">
            {isManager && (
              <button
                onClick={() => setShowEdit(true)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                title="עריכה"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Photo */}
          <div className="flex flex-col items-center gap-2">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
            {displayUrl ? (
              <div className="relative inline-block">
                <img
                  src={displayUrl}
                  alt={item.name}
                  className="max-h-[220px] max-w-full object-contain rounded-lg border border-gray-200 dark:border-gray-700"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
                {isManager && (
                  <div className="absolute top-2 left-2 flex gap-1">
                    <button
                      type="button"
                      disabled={photoBusy}
                      onClick={() => photoInputRef.current?.click()}
                      className="p-1.5 rounded-lg bg-white/90 dark:bg-gray-800/90 hover:bg-white dark:hover:bg-gray-800 text-blue-600 dark:text-blue-400 shadow disabled:opacity-50"
                      title="החלפת תמונה"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                    {item.image_url && (
                      <button
                        type="button"
                        disabled={photoBusy}
                        onClick={handlePhotoDelete}
                        className="p-1.5 rounded-lg bg-white/90 dark:bg-gray-800/90 hover:bg-white dark:hover:bg-gray-800 text-red-600 dark:text-red-400 shadow disabled:opacity-50"
                        title="מחיקת תמונה"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center w-full max-w-xs h-[160px] rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/30 text-gray-400 dark:text-gray-500">
                <ImageIcon className="w-10 h-10 mb-2" />
                {isManager && (
                  <button
                    type="button"
                    disabled={photoBusy}
                    onClick={() => photoInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    העלאת תמונה
                  </button>
                )}
              </div>
            )}
            {photoBusy && (
              <span className="text-xs text-gray-500 dark:text-gray-400">מעלה...</span>
            )}
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-4">
            <DetailField label="שם" value={item.name} />
            <DetailField label="קטגוריה" value={category?.name ?? '-'} />
            <DetailField label="מחסן" value={warehouse?.name ?? '-'} />
            <div>
              <span className="block text-sm font-medium text-gray-500 dark:text-gray-400">כמות נוכחית</span>
              <span className={`block text-sm mt-1 font-semibold ${isLow ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {formatQuantity(item.quantity)} {item.unit}
              </span>
            </div>
            <DetailField label="סף התראה" value={`${formatQuantity(item.low_stock_threshold)} ${item.unit}`} />
            <DetailField label="כמות להזמנה מחדש" value={`${formatQuantity(item.reorder_quantity)} ${item.unit}`} />
            <DetailField label="מחיר ליחידה" value={formatUnitPrice(item.unit_price)} />
          </div>

          {/* Warehouse movements */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              תנועות מחסן
            </h4>
            {movementsLoading ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">טוען...</div>
            ) : movements.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">אין תנועות מחסן</div>
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg">
                {movements.map((m) => (
                  <li
                    key={m.id}
                    className="p-3 flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-200"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{ACTION_LABELS[m.action]}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDateTime(m.moved_at)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300">
                      {warehouseNameById(m.to_warehouse_id)}
                      {' ← '}
                      {warehouseNameById(m.from_warehouse_id)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {formatQuantity(m.quantity)} {item.unit}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Withdrawals / consumption report */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-1.5">
              <PackageMinus className="w-4 h-4" />
              משיכות מהמלאי
            </h4>
            {consumptionsLoading ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">טוען...</div>
            ) : consumptions.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">אין משיכות מהמלאי</div>
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg">
                {consumptions.map((log) => (
                  <li
                    key={log.id}
                    className="p-3 flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-200"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {log.consumed_by_name ?? `עובד #${log.consumed_by_id}`}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDateTime(log.consumed_at)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300">
                      נמשך: {formatQuantity(log.quantity_consumed)} {item.unit}
                      {log.project_name && (
                        <span className="mr-2">· פרויקט: {log.project_name}</span>
                      )}
                    </div>
                    {log.notes && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">{log.notes}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Documents */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              מסמכים
            </h4>
            <DocumentsSection
              entityType="consumable"
              entityId={item.id}
              isManager={isManager}
            />
          </div>
        </div>

        {showEdit && (
          <EditConsumableModal
            item={item}
            categories={categories}
            onClose={() => setShowEdit(false)}
            onSaved={(updated) => { onUpdated(updated); setShowEdit(false) }}
          />
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
      <span className="block text-sm text-gray-900 dark:text-white mt-1">{value}</span>
    </div>
  )
}

// ─── Edit Consumable Modal ───────────────────────────────────────────────────

interface EditConsumableModalProps {
  item: ConsumableItem
  categories: AssetCategory[]
  onClose: () => void
  onSaved: (updated: ConsumableItem) => void
}

function EditConsumableModal({ item, categories, onClose, onSaved }: EditConsumableModalProps) {
  const [name, setName] = useState(item.name)
  const [categoryId, setCategoryId] = useState(item.category_id)
  const [unit, setUnit] = useState(item.unit)
  const [quantity, setQuantity] = useState(item.quantity)
  const [lowStockThreshold, setLowStockThreshold] = useState(item.low_stock_threshold)
  const [reorderQuantity, setReorderQuantity] = useState(item.reorder_quantity)
  const [unitPrice, setUnitPrice] = useState(item.unit_price ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function validate(): string | null {
    if (!name.trim()) return 'שם הפריט הוא שדה חובה'
    const numericFields: [string, string][] = [
      ['כמות נוכחית', quantity],
      ['סף התראה', lowStockThreshold],
      ['כמות להזמנה מחדש', reorderQuantity],
    ]
    for (const [label, value] of numericFields) {
      const parsed = Number(value)
      if (value === '' || Number.isNaN(parsed) || parsed < 0) {
        return `שדה "${label}" חייב להיות מספר שאינו שלילי`
      }
    }
    // Price is optional, but when provided must be a non-negative number.
    if (unitPrice.trim() !== '') {
      const parsedPrice = Number(unitPrice)
      if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
        return 'שדה "מחיר ליחידה" חייב להיות מספר שאינו שלילי'
      }
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await cemsApi.updateConsumable(item.id, {
        name: name.trim(),
        category_id: categoryId,
        unit: unit.trim() || 'יחידה',
        quantity,
        low_stock_threshold: lowStockThreshold,
        reorder_quantity: reorderQuantity,
        unit_price: unitPrice.trim() ? unitPrice.trim() : null,
      })
      onSaved(res.data)
    } catch {
      setError('שגיאה בעדכון הפריט')
    } finally {
      setSubmitting(false)
    }
  }

  const MODAL_OVERLAY_EDIT = 'fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4'
  const MODAL_PANEL_EDIT = 'bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto'

  return (
    <div className={MODAL_OVERLAY_EDIT} onClick={onClose}>
      <div className={MODAL_PANEL_EDIT} dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">עריכת פריט מלאי</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>כמות נוכחית</label>
              <input type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={INPUT_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>יחידת מידה</label>
              <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} className={INPUT_CLASS} placeholder="יחידה" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>סף התראה</label>
              <input type="number" min="0" step="any" value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} className={INPUT_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>כמות להזמנה מחדש</label>
              <input type="number" min="0" step="any" value={reorderQuantity} onChange={(e) => setReorderQuantity(e.target.value)} className={INPUT_CLASS} />
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS}>מחיר ליחידה (₪)</label>
            <input type="number" min="0" step="any" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className={INPUT_CLASS} placeholder="לדוגמה: 12.50" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>ביטול</button>
            <button type="submit" disabled={submitting} className={`${BTN_PRIMARY} disabled:opacity-50`}>
              {submitting ? 'שומר...' : 'שמור שינויים'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
