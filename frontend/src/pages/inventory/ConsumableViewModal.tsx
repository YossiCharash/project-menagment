import { useEffect, useRef, useState } from 'react'
import { X, Trash2, Upload, Image as ImageIcon } from 'lucide-react'
import {
  cemsApi,
  type ConsumableItem,
  type ConsumableMovement,
  type ConsumableMovementAction,
  type AssetCategory,
  type Warehouse,
} from '../../lib/cemsApi'
import { fileAttachmentUrl } from '../../lib/api'

// ─── Constants ───────────────────────────────────────────────────────────────

const MODAL_OVERLAY = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4'

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
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-500" />
          </button>
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
                {item.quantity} {item.unit}
              </span>
            </div>
            <DetailField label="סף התראה" value={`${item.low_stock_threshold} ${item.unit}`} />
            <DetailField label="כמות להזמנה מחדש" value={`${item.reorder_quantity} ${item.unit}`} />
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
                      {m.quantity} {item.unit}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
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
