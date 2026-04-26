import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Package,
  Warehouse as WarehouseIcon,
  ArrowLeftRight,
  AlertTriangle,
  Archive,
  Bell,
  CheckCircle,
  Shield,
  Layers,
} from 'lucide-react'
import {
  cemsApi,
  type InventoryReport,
  type StockAlert,
  type FixedAsset,
  type ConsumableItem,
  type AssetHistory,
  type AssetCategory,
  type Warehouse,
} from '../../lib/cemsApi'
import { fileAttachmentUrl } from '../../lib/api'
import { translateNote } from './AssetViewModal'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format a numeric string/number: integers shown without decimals, fractions rounded to 2 places */
function fmtQty(val: string | number): string | number {
  const n = parseFloat(val as string)
  if (isNaN(n)) return val
  return n % 1 === 0 ? Math.floor(n) : parseFloat(n.toFixed(2))
}

// ─── Constants ───────────────────────────────────────────────────────────────

type StatCardKey = keyof InventoryReport | 'expiring_warranties' | 'consumables_total'

interface StatCardConfig {
  label: string
  key: StatCardKey
  icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
}

const STAT_CARDS: StatCardConfig[] = [
  { label: 'סה"כ ציוד', key: 'total_assets', icon: Package, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  { label: 'ציוד פעיל', key: 'active_assets', icon: CheckCircle, color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30' },
  { label: 'במחסן', key: 'in_warehouse', icon: WarehouseIcon, color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-100 dark:bg-indigo-900/30' },
  { label: 'בהעברה', key: 'in_transfer', icon: ArrowLeftRight, color: 'text-yellow-600 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30' },
  { label: 'נגרט', key: 'retired', icon: Archive, color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-700' },
  { label: 'התראות מלאי', key: 'low_stock_count', icon: Bell, color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30' },
  { label: 'מתכלים', key: 'consumables_total', icon: Layers, color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
  { label: 'אחריות פגה בקרוב', key: 'expiring_warranties', icon: Shield, color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
]

const ALERT_TYPE_LABELS: Record<string, string> = {
  LOW_STOCK: 'מלאי נמוך',
  OUT_OF_STOCK: 'אזל מהמלאי',
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Detail drawer state
  const [selectedCard, setSelectedCard] = useState<StatCardKey | null>(null)
  const [cardAssets, setCardAssets] = useState<FixedAsset[]>([])
  const [cardAlerts, setCardAlerts] = useState<StockAlert[]>([])
  const [cardConsumables, setCardConsumables] = useState<ConsumableItem[]>([])
  const [cardLoading, setCardLoading] = useState(false)

  // Lookup maps for grouping
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [categories, setCategories] = useState<AssetCategory[]>([])
  // Grouping toggle for asset modal
  const [groupBy, setGroupBy] = useState<'none' | 'warehouse' | 'category'>('none')

  // Item detail panel state
  const [selectedAsset, setSelectedAsset] = useState<FixedAsset | null>(null)
  const [selectedConsumable, setSelectedConsumable] = useState<ConsumableItem | null>(null)
  const [assetHistory, setAssetHistory] = useState<AssetHistory[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    loadDashboardData()
  }, [])

  async function loadDashboardData() {
    setLoading(true)
    setError(null)
    try {
      // Use allSettled so a single failed endpoint doesn't kill the whole dashboard
      const [dashRes, warrantiesRes, consumablesRes, warehousesRes, categoriesRes] = await Promise.allSettled([
        cemsApi.getDashboard(),
        cemsApi.getExpiringWarranties(),
        cemsApi.getConsumables(),
        cemsApi.getWarehouses(),
        cemsApi.getCategories(),
      ])
      if (dashRes.status === 'fulfilled') setReport(dashRes.value.data)
      else { setError('שגיאה בטעינת נתוני לוח הבקרה'); return }
      if (warrantiesRes.status === 'fulfilled') setExpiringWarranties(warrantiesRes.value.data)
      if (consumablesRes.status === 'fulfilled') setConsumables(consumablesRes.value.data)
      if (warehousesRes.status === 'fulfilled') setWarehouses(warehousesRes.value.data)
      if (categoriesRes.status === 'fulfilled') setCategories(categoriesRes.value.data)
    } catch {
      setError('שגיאה בטעינת נתוני לוח הבקרה')
    } finally {
      setLoading(false)
    }
  }

  const STATUS_BY_CARD_KEY: Record<string, string | undefined> = {
    total_assets: undefined,
    active_assets: 'ACTIVE',
    in_warehouse: 'IN_WAREHOUSE',
    in_transfer: 'IN_TRANSFER',
    retired: 'RETIRED',
  }

  async function handleCardClick(key: StatCardKey) {
    if (selectedCard === key) {
      setSelectedCard(null)
      return
    }
    setSelectedCard(key)
    setGroupBy('none')
    setCardLoading(true)
    setCardAssets([])
    setCardAlerts([])
    setCardConsumables([])
    try {
      if (key === 'expiring_warranties') {
        setCardAssets(expiringWarranties)
      } else if (key === 'consumables_total') {
        setCardConsumables(consumables)
      } else if (key === 'low_stock_count') {
        // Re-fetch fresh alerts + consumables together so names are always available
        const [alertsRes, consumablesRes] = await Promise.allSettled([
          cemsApi.getAlerts(),
          cemsApi.getConsumables(),
        ])
        if (alertsRes.status === 'fulfilled') setCardAlerts(alertsRes.value.data)
        if (consumablesRes.status === 'fulfilled') setConsumables(consumablesRes.value.data)
      } else {
        const status = STATUS_BY_CARD_KEY[key]
        const res = await cemsApi.getAssets(status ? { status } : {})
        setCardAssets(res.data)
        if (key === 'in_warehouse') {
          setCardConsumables(consumables)
        }
      }
    } catch {
      // silent – card just shows empty
    } finally {
      setCardLoading(false)
    }
  }

  function getCardCount(key: StatCardKey): number {
    if (key === 'expiring_warranties') return expiringWarranties.length
    if (key === 'consumables_total') return consumables.length
    return report ? report[key as keyof InventoryReport] : 0
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

      {/* Detail Modal — rendered via portal to escape stacking context */}
      {selectedCard && report && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-sm bg-black/40"
          onClick={() => setSelectedCard(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {STAT_CARDS.find(c => c.key === selectedCard)?.label}
                <span className="mr-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                  ({getCardCount(selectedCard)} פריטים)
                </span>
              </h3>
              <button
                onClick={() => setSelectedCard(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="סגור"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {cardLoading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">טוען...</p>
              ) : selectedCard === 'low_stock_count' ? (
                cardAlerts.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">אין התראות</p>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 bg-white dark:bg-gray-800">
                      <tr className="bg-gray-50 dark:bg-gray-700">
                        <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">פריט</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">סוג התראה</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">כמות בהתראה</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">כמות נוכחית</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">סף מינימום</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">סטטוס</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {cardAlerts.map(alert => {
                        const item = consumables.find(c => c.id === alert.item_id)
                        return (
                          <tr
                            key={alert.id}
                            className="hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors"
                            onClick={() => item && setSelectedConsumable(item)}
                          >
                            <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">
                              {item?.name ?? <span className="text-gray-400 dark:text-gray-500 text-xs">{alert.item_id.slice(0, 8)}…</span>}
                            </td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{ALERT_TYPE_LABELS[alert.alert_type] || alert.alert_type}</td>
                            <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{fmtQty(alert.quantity_at_alert as unknown as string)}</td>
                            <td className="px-3 py-2">
                              {item ? (
                                <span className={`font-medium ${parseFloat(item.quantity) <= parseFloat(item.low_stock_threshold) ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                  {fmtQty(item.quantity)}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                              {item ? fmtQty(item.low_stock_threshold) : '—'}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${alert.resolved ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
                                {alert.resolved ? 'טופל' : 'פעיל'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )
              ) : selectedCard === 'consumables_total' ? (
                cardConsumables.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">אין פריטים</p>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 bg-white dark:bg-gray-800">
                      <tr className="bg-gray-50 dark:bg-gray-700">
                        <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">שם</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">כמות</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">סף מינימום</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">סטטוס מלאי</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {cardConsumables.map(item => {
                        const isLow = parseFloat(item.quantity) <= parseFloat(item.low_stock_threshold)
                        return (
                          <tr
                            key={item.id}
                            className="hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors"
                            onClick={() => setSelectedConsumable(item)}
                          >
                            <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{item.name}</td>
                            <td className={`px-3 py-2 font-medium ${isLow ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
                              {fmtQty(item.quantity)}
                            </td>
                            <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{fmtQty(item.low_stock_threshold)}</td>
                            <td className="px-3 py-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isLow ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'}`}>
                                {isLow ? 'מלאי נמוך' : 'תקין'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )
              ) : selectedCard === 'expiring_warranties' ? (
                cardAssets.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">אין ציוד עם אחריות שעומדת לפוג</p>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 bg-white dark:bg-gray-800">
                      <tr className="bg-gray-50 dark:bg-gray-700">
                        <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">שם</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">מס' סידורי</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">תפוגת אחריות</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">סטטוס</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {cardAssets.map(asset => (
                        <tr
                          key={asset.id}
                          className="hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors"
                          onClick={() => openAssetDetail(asset)}
                        >
                          <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{asset.name}</td>
                          <td className="px-3 py-2 font-mono text-gray-500 dark:text-gray-400 text-xs">{asset.serial_number}</td>
                          <td className="px-3 py-2 text-orange-600 dark:text-orange-400">
                            {asset.warranty_expiry ? new Date(asset.warranty_expiry).toLocaleDateString('he-IL') : '—'}
                          </td>
                          <td className="px-3 py-2"><StatusBadge status={asset.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : (
                <div className="space-y-6">
                  {/* Grouping toggle */}
                  <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-full p-1 w-fit">
                    {([
                      { value: 'none' as const, label: 'הכל' },
                      { value: 'warehouse' as const, label: 'לפי מחסן' },
                      { value: 'category' as const, label: 'לפי קטגוריה' },
                    ]).map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setGroupBy(opt.value)}
                        className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                          groupBy === opt.value
                            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Fixed assets section */}
                  <div>
                    {selectedCard === 'in_warehouse' && (
                      <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-indigo-500" />
                        ציוד קבוע ({cardAssets.length})
                      </h4>
                    )}
                    {cardAssets.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">אין ציוד קבוע</p>
                    ) : groupBy === 'none' ? (
                      <table className="w-full text-sm border-collapse">
                        <thead className="sticky top-0 bg-white dark:bg-gray-800">
                          <tr className="bg-gray-50 dark:bg-gray-700">
                            <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">#</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">שם</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">מס' סידורי</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">סטטוס</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {cardAssets.map((asset, idx) => (
                            <tr
                              key={asset.id}
                              className="hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors"
                              onClick={() => openAssetDetail(asset)}
                            >
                              <td className="px-3 py-2 text-gray-400 dark:text-gray-500">{idx + 1}</td>
                              <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{asset.name}</td>
                              <td className="px-3 py-2 font-mono text-gray-500 dark:text-gray-400 text-xs">{asset.serial_number}</td>
                              <td className="px-3 py-2"><StatusBadge status={asset.status} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div>
                        {Array.from(
                          cardAssets.reduce((groups, asset) => {
                            const key = groupBy === 'warehouse'
                              ? (asset.current_warehouse_id ?? '__none__')
                              : (asset.category_id ?? '__none__')
                            const existing = groups.get(key) ?? []
                            existing.push(asset)
                            groups.set(key, existing)
                            return groups
                          }, new Map<string, FixedAsset[]>())
                        ).map(([groupKey, items]) => {
                          const groupLabel = groupBy === 'warehouse'
                            ? (groupKey === '__none__'
                              ? 'ללא מחסן'
                              : warehouses.find(w => w.id === groupKey)?.name ?? groupKey.slice(0, 8))
                            : (groupKey === '__none__'
                              ? 'ללא קטגוריה'
                              : categories.find(c => c.id === groupKey)?.name ?? groupKey.slice(0, 8))
                          return (
                            <div key={groupKey}>
                              <div className="flex items-center gap-2 mb-2 mt-4 first:mt-0">
                                <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">{groupLabel}</span>
                                <span className="text-xs text-gray-400">({items.length})</span>
                              </div>
                              <table className="w-full text-sm border-collapse mb-2">
                                <thead className="sticky top-0 bg-white dark:bg-gray-800">
                                  <tr className="bg-gray-50 dark:bg-gray-700">
                                    <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">#</th>
                                    <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">שם</th>
                                    <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">מס' סידורי</th>
                                    <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">סטטוס</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                  {items.map((asset, idx) => (
                                    <tr
                                      key={asset.id}
                                      className="hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors"
                                      onClick={() => openAssetDetail(asset)}
                                    >
                                      <td className="px-3 py-2 text-gray-400 dark:text-gray-500">{idx + 1}</td>
                                      <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{asset.name}</td>
                                      <td className="px-3 py-2 font-mono text-gray-500 dark:text-gray-400 text-xs">{asset.serial_number}</td>
                                      <td className="px-3 py-2"><StatusBadge status={asset.status} /></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Consumables section — only shown for "במחסן" */}
                  {selectedCard === 'in_warehouse' && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-purple-500" />
                        מתכלים ({cardConsumables.length})
                      </h4>
                      {cardConsumables.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">אין מתכלים</p>
                      ) : (
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="bg-purple-50 dark:bg-purple-900/20">
                              <th className="text-right px-3 py-2 font-medium text-purple-700 dark:text-purple-300">שם</th>
                              <th className="text-right px-3 py-2 font-medium text-purple-700 dark:text-purple-300">כמות</th>
                              <th className="text-right px-3 py-2 font-medium text-purple-700 dark:text-purple-300">סף מינימום</th>
                              <th className="text-right px-3 py-2 font-medium text-purple-700 dark:text-purple-300">סטטוס</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {cardConsumables.map(item => {
                              const isLow = parseFloat(item.quantity) <= parseFloat(item.low_stock_threshold)
                              return (
                                <tr
                                  key={item.id}
                                  className="hover:bg-purple-50 dark:hover:bg-purple-900/10 cursor-pointer transition-colors"
                                  onClick={() => setSelectedConsumable(item)}
                                >
                                  <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{item.name}</td>
                                  <td className={`px-3 py-2 font-medium ${isLow ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                    {item.quantity}
                                  </td>
                                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{item.low_stock_threshold}</td>
                                  <td className="px-3 py-2">
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isLow ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'}`}>
                                      {isLow ? 'מלאי נמוך' : 'תקין'}
                                    </span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Asset Detail Panel */}
      {selectedAsset && createPortal(
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
                {selectedAsset.photo_url && (
                  <img
                    src={fileAttachmentUrl(selectedAsset.photo_url?.startsWith('http') ? selectedAsset.photo_url : `/uploads/${selectedAsset.photo_url}`) ?? ''}
                    alt={selectedAsset.name}
                    className="w-12 h-12 rounded-lg object-cover border border-gray-200 dark:border-gray-600"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                )}
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{selectedAsset.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{selectedAsset.serial_number}</p>
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
              {selectedAsset.photo_url && (
                <div className="flex justify-center">
                  <img
                    src={fileAttachmentUrl(selectedAsset.photo_url?.startsWith('http') ? selectedAsset.photo_url : `/uploads/${selectedAsset.photo_url}`) ?? ''}
                    alt={selectedAsset.name}
                    className="max-h-48 rounded-xl object-contain border border-gray-200 dark:border-gray-600 shadow-sm"
                    onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }}
                  />
                </div>
              )}

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: 'סטטוס', value: <StatusBadge status={selectedAsset.status} /> },
                  { label: 'מס\' סידורי', value: <span className="font-mono">{selectedAsset.serial_number}</span> },
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
      )}

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
