import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Boxes,
  Warehouse as WarehouseIcon,
  ArrowLeftRight,
  AlertTriangle,
  Archive,
  Bell,
  CheckCircle,
  Shield,
  Layers,
  Upload,
  ShoppingCart,
  Clock,
  Truck,
  Package,
} from 'lucide-react'
import {
  cemsApi,
  type InventoryReport,
  type FixedAsset,
  type ConsumableItem,
  type AssetHistory,
  type AssetCategory,
  type Warehouse,
  type ReorderRequest,
} from '../../lib/cemsApi'
import { fileAttachmentUrl } from '../../lib/api'
import { translateNote } from './AssetViewModal'
import TotalAssetsBrowserModal, { type BrowserSpec } from '../../components/inventory/TotalAssetsBrowserModal'

/**
 * Maps every stat-card key to the BrowserSpec the modal should open with.
 * Every card now uses the same product-grid browser modal — there is no
 * legacy table modal fallback.
 *
 * - 'total_assets'         : 'all' base mode — unfiltered union of fixed + consumables.
 * - 'fixed_assets'         : 'fixed' base mode — all fixed assets.
 * - 'consumables_total'    : 'consumable' base mode — all consumables.
 * - 'active_assets'        : fixed assets filtered by status = ACTIVE.
 * - 'in_warehouse_assets'  : union (fixed IN_WAREHOUSE + consumables — consumables always live in a warehouse).
 * - 'in_transfer_assets'   : fixed assets filtered by status = IN_TRANSFER.
 * - 'retired_assets'       : fixed assets filtered by status = RETIRED.
 * - 'expiring_warranties'  : predicate strategy hitting the dedicated endpoint.
 * - 'low_stock_count'      : predicate strategy hitting the low-stock endpoint.
 * - 'active_reorders'      : predicate strategy joining reorders → consumables.
 */
const BROWSER_SPEC_BY_CARD: Record<StatCardKey, BrowserSpec> = {
  total_assets: { mode: 'all', title: 'ציוד כללי' },
  fixed_assets: { mode: 'fixed', title: 'ציוד קבוע' },
  consumables_total: { mode: 'consumable', title: 'מתכלים' },
  active_assets: { mode: 'fixed', statusFilter: 'ACTIVE', title: 'ציוד פעיל' },
  in_warehouse_assets: { mode: 'all', statusFilter: 'IN_WAREHOUSE', title: 'במחסן' },
  in_transfer_assets: { mode: 'fixed', statusFilter: 'IN_TRANSFER', title: 'בהעברה' },
  retired_assets: { mode: 'fixed', statusFilter: 'RETIRED', title: 'נגרט' },
  expiring_warranties: { mode: 'fixed', predicate: 'expiring_warranty', title: 'אחריות פגה בקרוב' },
  low_stock_count: { mode: 'consumable', predicate: 'low_stock', title: 'התראות מלאי' },
  active_reorders: { mode: 'consumable', predicate: 'active_reorder', title: 'הזמנות מחדש פעילות' },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format a numeric string/number: integers shown without decimals, fractions rounded to 2 places */
function fmtQty(val: string | number): string | number {
  const numericValue = parseFloat(val as string)
  if (isNaN(numericValue)) return val
  return numericValue % 1 === 0 ? Math.floor(numericValue) : parseFloat(numericValue.toFixed(2))
}

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Stat-card identifiers. Some align 1:1 with `InventoryReport` fields,
 * others are synthetic UI-only keys (e.g. `total_assets` = fixed + consumables).
 *
 * Kept as a closed string union (not `keyof InventoryReport`) because:
 * - several keys are synthetic and don't exist on InventoryReport
 * - some InventoryReport fields (pending_transfers, pending_returns, unresolved_alerts)
 *   are not currently surfaced as cards.
 */
type StatCardKey =
  | 'total_assets'
  | 'fixed_assets'
  | 'active_assets'
  | 'in_warehouse_assets'
  | 'in_transfer_assets'
  | 'retired_assets'
  | 'low_stock_count'
  | 'consumables_total'
  | 'active_reorders'
  | 'expiring_warranties'

interface StatCardConfig {
  label: string
  key: StatCardKey
  icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
}

const STAT_CARDS: StatCardConfig[] = [
  { label: 'ציוד כללי', key: 'total_assets', icon: Boxes, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  { label: 'ציוד קבוע', key: 'fixed_assets', icon: Package, color: 'text-sky-600 dark:text-sky-400', bgColor: 'bg-sky-100 dark:bg-sky-900/30' },
  { label: 'ציוד פעיל', key: 'active_assets', icon: CheckCircle, color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30' },
  { label: 'במחסן', key: 'in_warehouse_assets', icon: WarehouseIcon, color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-100 dark:bg-indigo-900/30' },
  { label: 'בהעברה', key: 'in_transfer_assets', icon: ArrowLeftRight, color: 'text-yellow-600 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30' },
  { label: 'נגרט', key: 'retired_assets', icon: Archive, color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-700' },
  { label: 'התראות מלאי', key: 'low_stock_count', icon: Bell, color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30' },
  { label: 'מתכלים', key: 'consumables_total', icon: Layers, color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
  { label: 'הזמנות מחדש פעילות', key: 'active_reorders', icon: ShoppingCart, color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
  { label: 'אחריות פגה בקרוב', key: 'expiring_warranties', icon: Shield, color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
]

const REORDER_STATUS_CONFIG: Record<string, { label: string; badgeClass: string; icon: React.ComponentType<{ className?: string }> }> = {
  PENDING: { label: 'ממתין', badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300', icon: Clock },
  ORDERED: { label: 'הוזמן', badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', icon: Truck },
  RECEIVED: { label: 'התקבל', badgeClass: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', icon: CheckCircle },
  CANCELLED: { label: 'בוטל', badgeClass: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300', icon: Archive },
}

interface ActiveReordersPanelProps {
  reorders: ReorderRequest[]
  onClickItem?: (itemId: string) => void
}

function ActiveReordersPanel({ reorders, onClickItem }: ActiveReordersPanelProps) {
  if (reorders.length === 0) return null
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden" dir="rtl">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <ShoppingCart className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        <span className="text-sm font-semibold text-gray-900 dark:text-white">פעילות בהזמנות מחדש</span>
        <span className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 text-xs px-2 py-0.5 rounded-full font-medium">
          {reorders.length} פעילות
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700">
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">פריט</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">כמות</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">ספק</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">סטטוס</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">תאריך בקשה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {reorders.map((r) => {
              const cfg = REORDER_STATUS_CONFIG[r.status] ?? REORDER_STATUS_CONFIG.PENDING
              const StatusIcon = cfg.icon
              const clickable = !!onClickItem
              return (
                <tr
                  key={r.id}
                  className={`${clickable ? 'cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-colors' : ''}`}
                  onClick={clickable ? () => onClickItem!(r.item_id) : undefined}
                >
                  <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{r.item_name}</td>
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                    {r.quantity_requested}
                    {r.quantity_received && (
                      <span className="text-green-600 dark:text-green-400 mr-1">
                        {' '}(התקבל: {r.quantity_received})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{r.supplier || '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badgeClass}`}>
                      <StatusIcon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                    {new Date(r.requested_at).toLocaleDateString('he-IL')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const HISTORY_ACTION_LABELS: Record<string, string> = {
  ASSET_CREATED: 'ציוד נוצר',
  ASSET_UPDATED: 'ציוד עודכן',
  PHOTO_UPDATED: 'תמונה עודכנה',
  ASSIGNED_TO_EMPLOYEE: 'הוקצה לעובד',
  WAREHOUSE_MOVE: 'הועבר למחסן',
  TRANSFER_INITIATED: 'העברה יזומה',
  TRANSFER_COMPLETED: 'העברה הושלמה',
  TRANSFER_CANCELLED: 'העברה בוטלה',
  ASSET_RETIRED: 'ציוד הוצא מכלל שימוש',
  RETIREMENT_REQUESTED: 'בקשת גריטה הוגשה',
  RETIREMENT_APPROVED: 'גריטה אושרה',
  RETIREMENT_REJECTED: 'גריטה נדחתה',
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function InventoryDashboard() {
  const [report, setReport] = useState<InventoryReport | null>(null)
  const [expiringWarranties, setExpiringWarranties] = useState<FixedAsset[]>([])
  const [consumables, setConsumables] = useState<ConsumableItem[]>([])
  const [reorders, setReorders] = useState<ReorderRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Which stat card is currently expanded into the browser modal.
  const [selectedCard, setSelectedCard] = useState<StatCardKey | null>(null)

  // Lookup data passed to the browser modal for filtering.
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [categories, setCategories] = useState<AssetCategory[]>([])

  // Item detail panel state
  const [selectedAsset, setSelectedAsset] = useState<FixedAsset | null>(null)
  const [selectedConsumable, setSelectedConsumable] = useState<ConsumableItem | null>(null)
  const [assetHistory, setAssetHistory] = useState<AssetHistory[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  async function handleAssetPhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const asset = selectedAsset
    if (!file || !asset) {
      e.target.value = ''
      return
    }
    setUploadingPhoto(true)
    try {
      const res = await cemsApi.uploadAssetPhoto(asset.id, file)
      const updated = res.data
      setSelectedAsset(updated)
    } catch {
      // silent
    } finally {
      setUploadingPhoto(false)
      e.target.value = ''
    }
  }

  useEffect(() => {
    loadDashboardData()
  }, [])

  async function loadDashboardData() {
    setLoading(true)
    setError(null)
    try {
      // Use allSettled so a single failed endpoint doesn't kill the whole dashboard
      const [dashRes, warrantiesRes, consumablesRes, warehousesRes, categoriesRes, reordersRes] = await Promise.allSettled([
        cemsApi.getDashboard(),
        cemsApi.getExpiringWarranties(),
        cemsApi.getConsumables(),
        cemsApi.getWarehouses(),
        cemsApi.getCategories(),
        cemsApi.getReorderRequests(),
      ])
      if (dashRes.status === 'fulfilled') setReport(dashRes.value.data)
      else { setError('שגיאה בטעינת נתוני לוח הבקרה'); return }
      if (warrantiesRes.status === 'fulfilled') setExpiringWarranties(warrantiesRes.value.data)
      if (consumablesRes.status === 'fulfilled') setConsumables(consumablesRes.value.data)
      if (warehousesRes.status === 'fulfilled') setWarehouses(warehousesRes.value.data)
      if (categoriesRes.status === 'fulfilled') setCategories(categoriesRes.value.data)
      if (reordersRes.status === 'fulfilled') setReorders(reordersRes.value.data)
    } catch {
      setError('שגיאה בטעינת נתוני לוח הבקרה')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Toggle the expanded browser modal for a stat card. Every card opens the same
   * product-grid modal; the modal fetches its own data from the BrowserSpec, so
   * no per-card preloading happens here.
   */
  function handleCardClick(key: StatCardKey) {
    setSelectedCard(prev => (prev === key ? null : key))
  }

  const activeReorders = reorders.filter((r) => r.status === 'PENDING' || r.status === 'ORDERED')

  function getCardCount(key: StatCardKey): number {
    if (key === 'expiring_warranties') return expiringWarranties.length
    if (key === 'consumables_total') return consumables.length
    if (key === 'active_reorders') return activeReorders.length
    // The backend's `total_fixed_assets` counts fixed-asset rows; reuse it for the
    // "ציוד קבוע" (fixed-only) card. The "ציוד כללי" card surfaces the union.
    const fixedCount = Number(report?.total_fixed_assets ?? 0)
    const consumablesCount = consumables.length
    if (key === 'fixed_assets') return fixedCount
    if (key === 'total_assets') return fixedCount + consumablesCount
    const raw = report ? report[key as keyof InventoryReport] : 0
    return Number(raw ?? 0)
  }

  async function openAssetDetail(asset: FixedAsset) {
    setSelectedAsset(asset)
    setAssetHistory([])
    setHistoryLoading(true)
    try {
      const res = await cemsApi.getAssetHistory(asset.id)
      setAssetHistory(res.data)
    } catch { /* silent */ }
    finally { setHistoryLoading(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 dark:text-gray-400 text-lg">טוען...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-red-600 dark:text-red-400 text-lg">{error}</p>
          <button
            onClick={loadDashboardData}
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            נסה שוב
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {STAT_CARDS.map((card) => {
            const Icon = card.icon
            return (
              <div
                key={card.key}
                onClick={() => handleCardClick(card.key)}
                className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${
                  selectedCard === card.key
                    ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800'
                    : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'
                } p-5`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${card.bgColor}`}>
                    <Icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {getCardCount(card.key)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{card.label}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Inline activity: active reorders */}
      <ActiveReordersPanel
        reorders={activeReorders}
        onClickItem={(itemId) => {
          const match = consumables.find((c) => c.id === itemId)
          if (match) setSelectedConsumable(match)
        }}
      />

      {/* Product-grid browser modal — every stat card expands into this same
          image-rich grid; the BrowserSpec decides which data + filters apply. */}
      <TotalAssetsBrowserModal
        open={selectedCard !== null}
        spec={selectedCard ? BROWSER_SPEC_BY_CARD[selectedCard] : undefined}
        warehouses={warehouses}
        categories={categories}
        onClose={() => setSelectedCard(null)}
        onSelectAsset={(asset) => openAssetDetail(asset)}
        onSelectConsumable={(item) => setSelectedConsumable(item)}
      />

      {/* Asset Detail Panel */}
      {selectedAsset && (() => {
        const resolveImg = (raw?: string | null) =>
          raw ? fileAttachmentUrl(raw.startsWith('http') ? raw : `/uploads/${raw}`) ?? '' : ''
        const categoryImage = categories.find(c => c.id === selectedAsset.category_id)?.image_url
        const detailImageUrl = resolveImg(selectedAsset.photo_url) || resolveImg(categoryImage)
        return createPortal(
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center p-4 backdrop-blur-sm bg-black/50"
          onClick={() => setSelectedAsset(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                {detailImageUrl && (
                  <img
                    src={detailImageUrl}
                    alt={selectedAsset.name}
                    className="w-12 h-12 rounded-lg object-cover border border-gray-200 dark:border-gray-600"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                )}
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{selectedAsset.name}</h3>
                </div>
              </div>
              <button
                onClick={() => setSelectedAsset(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Photo (large) */}
              {detailImageUrl && (
                <div className="flex justify-center">
                  <img
                    src={detailImageUrl}
                    alt={selectedAsset.name}
                    className="max-h-48 rounded-xl object-contain border border-gray-200 dark:border-gray-600 shadow-sm"
                    onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }}
                  />
                </div>
              )}

              <div className="flex justify-center" dir="rtl">
                <label
                  className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors ${uploadingPhoto ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <Upload className="w-4 h-4" />
                  {uploadingPhoto ? 'מעלה...' : (selectedAsset.photo_url ? 'החלפת תמונה' : 'העלאת תמונה')}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingPhoto}
                    onChange={handleAssetPhotoUpload}
                  />
                </label>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: 'סטטוס', value: <StatusBadge status={selectedAsset.status} /> },
                  { label: 'תאריך רכישה', value: selectedAsset.purchase_date ? new Date(selectedAsset.purchase_date).toLocaleDateString('he-IL') : '—' },
                  { label: 'תפוגת אחריות', value: selectedAsset.warranty_expiry ? new Date(selectedAsset.warranty_expiry).toLocaleDateString('he-IL') : '—' },
                  { label: 'הערות', value: selectedAsset.notes || '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
                    <div className="font-medium text-gray-900 dark:text-white">{value}</div>
                  </div>
                ))}
              </div>

              {/* History */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">היסטוריה</h4>
                {historyLoading ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">טוען היסטוריה...</p>
                ) : assetHistory.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">אין היסטוריה</p>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {assetHistory.map((entry) => (
                      <div key={entry.id} className="flex items-start gap-3 text-xs p-2 bg-gray-50 dark:bg-gray-700/40 rounded-lg">
                        <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0 mt-1" />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-gray-800 dark:text-gray-200">
                            {HISTORY_ACTION_LABELS[entry.action] ?? entry.action}
                          </span>
                          {entry.notes && (
                            <p className="text-gray-500 dark:text-gray-400 truncate mt-0.5">{translateNote(entry.notes)}</p>
                          )}
                        </div>
                        <span className="text-gray-400 dark:text-gray-500 whitespace-nowrap flex-shrink-0">
                          {new Date(entry.timestamp).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )
      })()}

      {/* Consumable Detail Panel */}
      {selectedConsumable && createPortal(
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center p-4 backdrop-blur-sm bg-black/50"
          onClick={() => setSelectedConsumable(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{selectedConsumable.name}</h3>
              <button
                onClick={() => setSelectedConsumable(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: 'כמות נוכחית', value: <span className={`font-semibold ${parseFloat(selectedConsumable.quantity) <= parseFloat(selectedConsumable.low_stock_threshold) ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{fmtQty(selectedConsumable.quantity)}</span> },
                  { label: 'סף מינימום', value: fmtQty(selectedConsumable.low_stock_threshold) },
                  { label: 'כמות להזמנה', value: fmtQty(selectedConsumable.reorder_quantity) },
                  { label: 'יחידה', value: selectedConsumable.unit },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
                    <div className="font-medium text-gray-900 dark:text-white">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── Shared Status Badge ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'פעיל', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  IN_TRANSFER: { label: 'בהעברה', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  IN_WAREHOUSE: { label: 'במחסן', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  RETIRED: { label: 'נגרט', className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
}

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { label: status, className: 'bg-gray-100 text-gray-800' }
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
