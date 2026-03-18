import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Package,
  Warehouse,
  ArrowLeftRight,
  AlertTriangle,
  Archive,
  Bell,
  CheckCircle,
  Clock,
  Shield,
  SlidersHorizontal,
} from 'lucide-react'
import {
  cemsApi,
  type InventoryReport,
  type StockAlert,
  type Transfer,
  type FixedAsset,
} from '../../lib/cemsApi'

// ─── Constants ───────────────────────────────────────────────────────────────

interface StatCardConfig {
  label: string
  key: keyof InventoryReport
  icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
}

const STAT_CARDS: StatCardConfig[] = [
  { label: 'סה"כ ציוד', key: 'total_assets', icon: Package, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  { label: 'ציוד פעיל', key: 'active_assets', icon: CheckCircle, color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30' },
  { label: 'במחסן', key: 'in_warehouse', icon: Warehouse, color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-100 dark:bg-indigo-900/30' },
  { label: 'בהעברה', key: 'in_transfer', icon: ArrowLeftRight, color: 'text-yellow-600 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30' },
  { label: 'בפרישה', key: 'retired', icon: Archive, color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-700' },
  { label: 'התראות מלאי', key: 'low_stock_count', icon: Bell, color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30' },
]

interface SubNavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const SUB_NAV_ITEMS: SubNavItem[] = [
  { label: 'ציוד קבוע', href: '/inventory/assets', icon: Package },
  { label: 'מתכלים', href: '/inventory/consumables', icon: Archive },
  { label: 'מחסנים', href: '/inventory/warehouses', icon: Warehouse },
  { label: 'העברות', href: '/inventory/transfers', icon: ArrowLeftRight },
]

const ALERT_TYPE_LABELS: Record<string, string> = {
  LOW_STOCK: 'מלאי נמוך',
  OUT_OF_STOCK: 'אזל מהמלאי',
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function InventoryDashboard() {
  const location = useLocation()

  const [report, setReport] = useState<InventoryReport | null>(null)
  const [alerts, setAlerts] = useState<StockAlert[]>([])
  const [pendingTransfers, setPendingTransfers] = useState<Transfer[]>([])
  const [expiringWarranties, setExpiringWarranties] = useState<FixedAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadDashboardData()
  }, [])

  async function loadDashboardData() {
    setLoading(true)
    setError(null)
    try {
      const [dashRes, alertsRes, transfersRes, warrantiesRes] = await Promise.all([
        cemsApi.getDashboard(),
        cemsApi.getAlerts(),
        cemsApi.getTransfers({ status: 'PENDING' }),
        cemsApi.getExpiringWarranties(),
      ])
      setReport(dashRes.data)
      setAlerts(alertsRes.data)
      setPendingTransfers(transfersRes.data)
      setExpiringWarranties(warrantiesRes.data)
    } catch {
      setError('שגיאה בטעינת נתוני לוח הבקרה')
    } finally {
      setLoading(false)
    }
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
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ניהול מלאי וציוד</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">סקירה כללית של ציוד, מחסנים ומלאי</p>
        </div>
        <Link
          to="/inventory/settings"
          title="הגדרות מלאי"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
        >
          <SlidersHorizontal className="w-4 h-4" />
          הגדרות
        </Link>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-0">
        {SUB_NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.href
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          )
        })}
      </div>

      {/* Stats Cards */}
      {report && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {STAT_CARDS.map((card) => {
            const Icon = card.icon
            return (
              <div
                key={card.key}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${card.bgColor}`}>
                    <Icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {report[card.key]}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{card.label}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Alerts */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">התראות מלאי</h2>
          </div>
          {alerts.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">אין התראות פעילות</p>
          ) : (
            <div className="space-y-3">
              {alerts.slice(0, 5).map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800"
                >
                  <div>
                    <p className="text-sm font-medium text-red-800 dark:text-red-300">
                      {ALERT_TYPE_LABELS[alert.alert_type] || alert.alert_type}
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-400">
                      כמות: {alert.quantity_at_alert}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${
                      alert.resolved
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                    }`}
                  >
                    {alert.resolved ? 'טופל' : 'פעיל'}
                  </span>
                </div>
              ))}
              {alerts.length > 5 && (
                <Link
                  to="/inventory/consumables"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline block text-center"
                >
                  הצג את כל ההתראות ({alerts.length})
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Pending Transfers */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-yellow-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">העברות ממתינות</h2>
          </div>
          {pendingTransfers.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">אין העברות ממתינות</p>
          ) : (
            <div className="space-y-3">
              {pendingTransfers.slice(0, 5).map((transfer) => (
                <div
                  key={transfer.id}
                  className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800"
                >
                  <div>
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                      ציוד: {transfer.asset_id}
                    </p>
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">
                      מעובד {transfer.from_user_id} לעובד {transfer.to_user_id}
                    </p>
                  </div>
                  <span className="text-xs text-yellow-600 dark:text-yellow-400">
                    {new Date(transfer.initiated_at).toLocaleDateString('he-IL')}
                  </span>
                </div>
              ))}
              {pendingTransfers.length > 5 && (
                <Link
                  to="/inventory/transfers"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline block text-center"
                >
                  הצג את כל ההעברות ({pendingTransfers.length})
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Expiring Warranties */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-orange-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">אחריות שעומדת לפוג</h2>
          </div>
          {expiringWarranties.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">אין ציוד עם אחריות שעומדת לפוג</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700">
                    <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">שם</th>
                    <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">מס' סידורי</th>
                    <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">תפוגת אחריות</th>
                    <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">סטטוס</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {expiringWarranties.map((asset) => (
                    <tr key={asset.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{asset.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{asset.serial_number}</td>
                      <td className="px-4 py-3 text-sm text-orange-600 dark:text-orange-400">
                        {asset.warranty_expiry
                          ? new Date(asset.warranty_expiry).toLocaleDateString('he-IL')
                          : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={asset.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Shared Status Badge ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'פעיל', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  IN_TRANSFER: { label: 'בהעברה', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  IN_WAREHOUSE: { label: 'במחסן', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  RETIRED: { label: 'בפרישה', className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
}

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { label: status, className: 'bg-gray-100 text-gray-800' }
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
