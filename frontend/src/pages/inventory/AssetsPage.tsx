import { useEffect, useState, useCallback } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../../store'
import {
  Plus,
  Search,
  ArrowLeftRight,
  Trash2,
  X,
  AlertTriangle,
  MapPin,
  History,
  Check,
  XCircle,
  UserCheck,
} from 'lucide-react'
import {
  cemsApi,
  type FixedAsset,
  type AssetRetirement,
  type AssetQueryParams,
  type CemsUser,
  type AssetCategory,
  type CemsProject,
  type Warehouse,
} from '../../lib/cemsApi'
import { StatusBadge } from './InventoryDashboard'
import { AssetViewModal } from './AssetViewModal'

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'הכל' },
  { value: 'ACTIVE', label: 'פעיל' },
  { value: 'IN_TRANSFER', label: 'בהעברה' },
  { value: 'IN_WAREHOUSE', label: 'במחסן' },
  { value: 'RETIRED', label: 'בפרישה' },
]

const MODAL_OVERLAY = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4'
const MODAL_PANEL = 'bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto'
const INPUT_CLASS = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const LABEL_CLASS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'
const BTN_PRIMARY = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'
const BTN_DANGER = 'bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'
const BTN_SECONDARY = 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors'

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AssetsPage() {
  const [assets, setAssets] = useState<FixedAsset[]>([])
  const [users, setUsers] = useState<CemsUser[]>([])
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [projects, setProjects] = useState<CemsProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  // View modal
  const [viewAsset, setViewAsset] = useState<FixedAsset | null>(null)

  const me = useSelector((s: RootState) => s.auth.me)
  const isManager = me?.role === 'Admin'
  const isManagerOrAdmin =
    me?.role === 'Admin' || (me as any)?.cems_role === 'Admin' || (me as any)?.cems_role === 'Manager'

  // Modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [transferAsset, setTransferAsset] = useState<FixedAsset | null>(null)
  const [retireAsset, setRetireAsset] = useState<FixedAsset | null>(null)
  const [moveAssetTarget, setMoveAssetTarget] = useState<FixedAsset | null>(null)
  const [assignAssetTarget, setAssignAssetTarget] = useState<FixedAsset | null>(null)

  // Retirement workflow
  const [showRetiredSection, setShowRetiredSection] = useState(false)
  const [retirements, setRetirements] = useState<AssetRetirement[]>([])
  const [retiredAssets, setRetiredAssets] = useState<FixedAsset[]>([])
  const [retirementLoading, setRetirementLoading] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [approveNotes, setApproveNotes] = useState('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: AssetQueryParams = {}
      if (statusFilter) params.status = statusFilter
      if (warehouseFilter) params.warehouse_id = warehouseFilter
      if (projectFilter) params.project_id = projectFilter
      if (categoryFilter) params.category_id = categoryFilter
      if (searchTerm) params.search = searchTerm

      const [assetsRes, usersRes, categoriesRes, warehousesRes, projectsRes] = await Promise.all([
        cemsApi.getAssets(params),
        cemsApi.getUsers(),
        cemsApi.getCategories(),
        cemsApi.getWarehouses(),
        cemsApi.getProjects(),
      ])
      setAssets(assetsRes.data)
      setUsers(usersRes.data)
      setCategories(categoriesRes.data)
      setWarehouses(warehousesRes.data)
      setProjects(projectsRes.data)
    } catch {
      setError('שגיאה בטעינת רשימת הציוד')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, warehouseFilter, projectFilter, categoryFilter, searchTerm])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Retirement data
  const loadRetirementData = useCallback(async () => {
    setRetirementLoading(true)
    try {
      const [retRes, retiredRes] = await Promise.all([
        cemsApi.getRetirements('PENDING'),
        cemsApi.getAssets({ status: 'RETIRED' }),
      ])
      setRetirements(retRes.data)
      setRetiredAssets(retiredRes.data)
    } catch {
      // silently fail for secondary data
    } finally {
      setRetirementLoading(false)
    }
  }, [])

  useEffect(() => {
    if (showRetiredSection) {
      loadRetirementData()
    }
  }, [showRetiredSection, loadRetirementData])

  async function handleApproveRetirement(retirementId: string) {
    try {
      await cemsApi.approveRetirement(retirementId, approveNotes || undefined)
      setApprovingId(null)
      setApproveNotes('')
      await Promise.all([loadRetirementData(), loadData()])
    } catch {
      // error handling is implicit via UI refresh
    }
  }

  async function handleRejectRetirement(retirementId: string) {
    if (!rejectReason.trim()) return
    try {
      await cemsApi.rejectRetirement(retirementId, rejectReason.trim())
      setRejectingId(null)
      setRejectReason('')
      await loadRetirementData()
    } catch {
      // error handling is implicit via UI refresh
    }
  }

  function getCategoryName(categoryId: string): string {
    return categories.find((c) => c.id === categoryId)?.name || '-'
  }

  function getUserName(userId: number | null): string {
    if (!userId) return '-'
    return users.find((u) => u.id === userId)?.full_name || '-'
  }

  const hasActiveFilters = statusFilter || warehouseFilter || projectFilter || categoryFilter || searchTerm

  function clearAllFilters() {
    setSearchTerm('')
    setStatusFilter('')
    setWarehouseFilter('')
    setProjectFilter('')
    setCategoryFilter('')
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ציוד קבוע</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">ניהול ומעקב אחר כל פריטי הציוד הקבוע</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className={BTN_PRIMARY}>
          <span className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            הוסף ציוד
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
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="חיפוש לפי שם או מספר סידורי..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`${INPUT_CLASS} pr-10`}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`${INPUT_CLASS} w-full sm:w-40`}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className={`${INPUT_CLASS} w-full sm:w-44`}
          >
            <option value="">כל המחסנים</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className={`${INPUT_CLASS} w-full sm:w-44`}
          >
            <option value="">כל הפרויקטים</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={`${INPUT_CLASS} w-full sm:w-44`}
          >
            <option value="">כל הקטגוריות</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              נקה פילטרים
            </button>
          )}
          <button
            onClick={() => setShowRetiredSection((prev) => !prev)}
            className={BTN_SECONDARY}
          >
            <span className="flex items-center gap-2">
              <History className="w-4 h-4" />
              {showRetiredSection ? 'הסתר' : 'ציוד פרוש ובקשות'}
            </span>
          </button>
        </div>
      </div>

      {/* Retired Assets & Pending Retirement Requests */}
      {showRetiredSection && (
        <div className="space-y-4">
          {/* Section 1: Pending retirement requests -- managers only */}
          {isManagerOrAdmin && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  בקשות פרישה ממתינות לאישור
                </h2>
              </div>
              {retirementLoading ? (
                <div className="p-6 text-center text-gray-500 dark:text-gray-400">טוען...</div>
              ) : retirements.length === 0 ? (
                <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                  אין בקשות פרישה ממתינות
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-700">
                        <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">מזהה ציוד</th>
                        <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">סיבה</th>
                        <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">שיטת סילוק</th>
                        <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">מבקש</th>
                        <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">תאריך בקשה</th>
                        <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">פעולות</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {retirements.map((ret) => (
                        <tr key={ret.id}>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-mono">
                            {ret.asset_id.slice(0, 8)}...
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-xs truncate">
                            {ret.reason}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                            {ret.disposal_method}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                            {getUserName(ret.requested_by_id)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {new Date(ret.requested_at).toLocaleDateString('he-IL')}
                          </td>
                          <td className="px-4 py-3">
                            {approvingId === ret.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  placeholder="הערות (אופציונלי)"
                                  value={approveNotes}
                                  onChange={(e) => setApproveNotes(e.target.value)}
                                  className={`${INPUT_CLASS} w-40`}
                                />
                                <button
                                  onClick={() => handleApproveRetirement(ret.id)}
                                  className="p-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors"
                                  title="אשר"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => { setApprovingId(null); setApproveNotes('') }}
                                  className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 transition-colors"
                                  title="בטל"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : rejectingId === ret.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  placeholder="סיבת דחייה *"
                                  value={rejectReason}
                                  onChange={(e) => setRejectReason(e.target.value)}
                                  className={`${INPUT_CLASS} w-40`}
                                />
                                <button
                                  onClick={() => handleRejectRetirement(ret.id)}
                                  disabled={!rejectReason.trim()}
                                  className="p-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                                  title="דחה"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => { setRejectingId(null); setRejectReason('') }}
                                  className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 transition-colors"
                                  title="בטל"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setApprovingId(ret.id)}
                                  className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 dark:text-green-400 transition-colors"
                                  title="אשר פרישה"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setRejectingId(ret.id)}
                                  className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
                                  title="דחה פרישה"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Section 2: Retired assets -- visible to all */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ציוד פרוש</h2>
            </div>
            {retirementLoading ? (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">טוען...</div>
            ) : retiredAssets.length === 0 ? (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                אין ציוד פרוש
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700">
                      <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">שם</th>
                      <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">מס' סידורי</th>
                      <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">קטגוריה</th>
                      <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">הערות</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {retiredAssets.map((asset) => (
                      <tr key={asset.id}>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">{asset.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono">{asset.serial_number}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{getCategoryName(asset.category_id)}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{asset.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Assets Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700">
                <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">שם</th>
                <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">מס' סידורי</th>
                <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">קטגוריה</th>
                <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">מחזיק</th>
                <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">סטטוס</th>
                <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">אחריות</th>
                <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {assets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    לא נמצאו פריטי ציוד
                  </td>
                </tr>
              ) : (
                assets.map((asset) => (
                  <AssetRow
                    key={asset.id}
                    asset={asset}
                    categoryName={getCategoryName(asset.category_id)}
                    custodianName={getUserName(asset.current_custodian_id)}
                    onViewAsset={() => setViewAsset(asset)}
                    onTransfer={() => setTransferAsset(asset)}
                    onRetire={() => setRetireAsset(asset)}
                    onMoveToWarehouse={() => setMoveAssetTarget(asset)}
                    onAssignToEmployee={() => setAssignAssetTarget(asset)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {viewAsset && (
        <AssetViewModal
          asset={viewAsset}
          categoryName={getCategoryName(viewAsset.category_id)}
          custodianName={getUserName(viewAsset.current_custodian_id)}
          categories={categories}
          isManager={isManager}
          onClose={() => setViewAsset(null)}
          onUpdated={(updated) => {
            setAssets((prev) => prev.map((a) => a.id === updated.id ? updated : a))
            setViewAsset(updated)
          }}
          onTransfer={() => { setTransferAsset(viewAsset); setViewAsset(null) }}
          onRetire={() => { setRetireAsset(viewAsset); setViewAsset(null) }}
          onMoveToWarehouse={() => { setMoveAssetTarget(viewAsset); setViewAsset(null) }}
          onAssignToEmployee={() => { setAssignAssetTarget(viewAsset); setViewAsset(null) }}
        />
      )}
      {showAddModal && (
        <AddAssetModal
          categories={categories}
          warehouses={warehouses}
          onClose={() => setShowAddModal(false)}
          onCreated={loadData}
        />
      )}
      {transferAsset && (
        <TransferModal
          asset={transferAsset}
          users={users}
          warehouses={warehouses}
          onClose={() => setTransferAsset(null)}
          onTransferred={loadData}
        />
      )}
      {retireAsset && (
        <RetirementModal
          asset={retireAsset}
          onClose={() => setRetireAsset(null)}
          onRetired={loadData}
        />
      )}
      {moveAssetTarget && (
        <MoveAssetModal
          asset={moveAssetTarget}
          onClose={() => setMoveAssetTarget(null)}
          onMoved={loadData}
        />
      )}
      {assignAssetTarget && (
        <AssignAssetModal
          asset={assignAssetTarget}
          users={users}
          onClose={() => setAssignAssetTarget(null)}
          onAssigned={loadData}
        />
      )}
    </div>
  )
}

// ─── Asset Row ───────────────────────────────────────────────────────────────

interface AssetRowProps {
  asset: FixedAsset
  categoryName: string
  custodianName: string
  onViewAsset: () => void
  onTransfer: () => void
  onRetire: () => void
  onMoveToWarehouse: () => void
  onAssignToEmployee: () => void
}

function AssetRow({
  asset,
  categoryName,
  custodianName,
  onViewAsset,
  onTransfer,
  onRetire,
  onMoveToWarehouse,
  onAssignToEmployee,
}: AssetRowProps) {
  const canTransfer = asset.status === 'ACTIVE' && asset.current_custodian_id !== null
  const canMoveToWarehouse = asset.status === 'ACTIVE' && asset.current_custodian_id !== null
  const canAssignToEmployee = asset.status === 'IN_WAREHOUSE' || (asset.status === 'ACTIVE' && asset.current_custodian_id === null)
  const canRetire = asset.status === 'ACTIVE' || asset.status === 'IN_WAREHOUSE'

  return (
    <tr
      className="hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer"
      onClick={onViewAsset}
    >
      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">
        {asset.name}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono">{asset.serial_number}</td>
      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{categoryName}</td>
      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{custodianName}</td>
      <td className="px-4 py-3"><StatusBadge status={asset.status} /></td>
      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
        {asset.warranty_expiry ? new Date(asset.warranty_expiry).toLocaleDateString('he-IL') : '-'}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {canTransfer && (
            <button
              onClick={onTransfer}
              className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 transition-colors"
              title="העבר ציוד"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          )}
          {canMoveToWarehouse && (
            <button
              onClick={onMoveToWarehouse}
              className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 dark:text-green-400 transition-colors"
              title="החזר למחסן"
            >
              <MapPin className="w-4 h-4" />
            </button>
          )}
          {canAssignToEmployee && (
            <button
              onClick={onAssignToEmployee}
              className="p-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 text-purple-600 dark:text-purple-400 transition-colors"
              title="הקצה לעובד"
            >
              <UserCheck className="w-4 h-4" />
            </button>
          )}
          {canRetire && (
            <button
              onClick={onRetire}
              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
              title="פרישה"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Add Asset Modal ─────────────────────────────────────────────────────────

interface AddAssetModalProps {
  categories: AssetCategory[]
  warehouses: Warehouse[]
  onClose: () => void
  onCreated: () => void
}

function AddAssetModal({ categories, warehouses, onClose, onCreated }: AddAssetModalProps) {
  const [name, setName] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [warrantyExpiry, setWarrantyExpiry] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // When a warehouse is selected, show only categories that belong to that
  // warehouse plus global categories (warehouse_id === null).  When no
  // warehouse is selected, show all categories.
  const filteredCategories = warehouseId
    ? categories.filter((c) => c.warehouse_id === null || c.warehouse_id === warehouseId)
    : categories

  // Reset category selection when warehouse changes and the currently
  // selected category is no longer in the filtered list.
  function handleWarehouseChange(newWarehouseId: string) {
    setWarehouseId(newWarehouseId)
    if (categoryId) {
      const stillValid = (newWarehouseId
        ? categories.filter((c) => c.warehouse_id === null || c.warehouse_id === newWarehouseId)
        : categories
      ).some((c) => c.id === categoryId)
      if (!stillValid) {
        setCategoryId('')
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !serialNumber.trim()) {
      setError('שם ומספר סידורי הם שדות חובה')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await cemsApi.createAsset({
        name: name.trim(),
        serial_number: serialNumber.trim(),
        category_id: categoryId || undefined,
        current_warehouse_id: warehouseId || undefined,
        purchase_date: purchaseDate || undefined,
        warranty_expiry: warrantyExpiry || undefined,
        notes: notes.trim() || undefined,
      } as Partial<FixedAsset>)
      onCreated()
      onClose()
    } catch {
      setError('שגיאה ביצירת פריט ציוד')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_PANEL} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">הוספת ציוד חדש</h3>
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
            <label className={LABEL_CLASS}>שם *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} required />
          </div>
          <div>
            <label className={LABEL_CLASS}>מס' סידורי *</label>
            <input type="text" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} className={INPUT_CLASS} required />
          </div>
          <div>
            <label className={LABEL_CLASS}>קטגוריה</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={INPUT_CLASS}>
              <option value="">בחר קטגוריה</option>
              {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>מחסן</label>
            <select value={warehouseId} onChange={(e) => handleWarehouseChange(e.target.value)} className={INPUT_CLASS}>
              <option value="">בחר מחסן</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>תאריך רכישה</label>
              <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={INPUT_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>תאריך אחריות</label>
              <input type="date" value={warrantyExpiry} onChange={(e) => setWarrantyExpiry(e.target.value)} className={INPUT_CLASS} />
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS}>הערות</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT_CLASS} rows={3} />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>ביטול</button>
            <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
              {submitting ? 'שומר...' : 'הוסף ציוד'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Transfer Modal ──────────────────────────────────────────────────────────

interface TransferModalProps {
  asset: FixedAsset
  users: CemsUser[]
  warehouses: Warehouse[]
  onClose: () => void
  onTransferred: () => void
}

function TransferModal({ asset, users, warehouses, onClose, onTransferred }: TransferModalProps) {
  const [toUserId, setToUserId] = useState('')
  const [toWarehouseId, setToWarehouseId] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!toUserId) {
      setError('יש לבחור עובד מקבל')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await cemsApi.initiateTransfer({
        asset_id: asset.id,
        to_user_id: Number(toUserId),
        to_warehouse_id: toWarehouseId || undefined,
        notes: notes.trim() || undefined,
      })
      onTransferred()
      onClose()
    } catch {
      setError('שגיאה ביצירת העברה')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_PANEL} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            העברת ציוד: {asset.name}
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
            <label className={LABEL_CLASS}>בחר עובד מקבל *</label>
            <select value={toUserId} onChange={(e) => setToUserId(e.target.value)} className={INPUT_CLASS} required>
              <option value="">בחר עובד</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>בחר מחסן יעד</label>
            <select value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)} className={INPUT_CLASS}>
              <option value="">בחר מחסן (אופציונלי)</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>הערות</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT_CLASS} rows={3} />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>ביטול</button>
            <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
              {submitting ? 'מעביר...' : 'העבר ציוד'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Retirement Modal ────────────────────────────────────────────────────────

interface RetirementModalProps {
  asset: FixedAsset
  onClose: () => void
  onRetired: () => void
}

function RetirementModal({ asset, onClose, onRetired }: RetirementModalProps) {
  const [reason, setReason] = useState('')
  const [disposalMethod, setDisposalMethod] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason.trim()) {
      setError('יש למלא סיבה לפרישה')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await cemsApi.retireAsset(asset.id, reason.trim(), disposalMethod || 'אחר')
      onRetired()
      onClose()
    } catch {
      setError('שגיאה בביצוע פרישה')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_PANEL} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            פרישת ציוד: {asset.name}
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
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-sm text-yellow-800 dark:text-yellow-300">
            שים לב: הבקשה תועבר לאישור מנהל.
          </div>
          <div>
            <label className={LABEL_CLASS}>סיבה לפרישה *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={INPUT_CLASS}
              rows={3}
              placeholder="תאר את הסיבה לפרישת הציוד..."
              required
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>שיטת סילוק</label>
            <select value={disposalMethod} onChange={(e) => setDisposalMethod(e.target.value)} className={INPUT_CLASS}>
              <option value="">בחר שיטת סילוק</option>
              <option value="מכירה">מכירה</option>
              <option value="תרומה">תרומה</option>
              <option value="מיחזור">מיחזור</option>
              <option value="השמדה">השמדה</option>
              <option value="אחר">אחר</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>ביטול</button>
            <button type="submit" disabled={submitting} className={BTN_DANGER}>
              {submitting ? 'מבצע פרישה...' : 'בצע פרישה'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Move Asset Modal ─────────────────────────────────────────────────────────

interface MoveAssetModalProps {
  asset: FixedAsset
  onClose: () => void
  onMoved: () => void
}

function MoveAssetModal({ asset, onClose, onMoved }: MoveAssetModalProps) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')
  const [notes, setNotes] = useState('')
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
      await cemsApi.moveAsset(asset.id, selectedWarehouseId, notes.trim() || undefined)
      onMoved()
      onClose()
    } catch {
      setError('שגיאה בהעברת הציוד למחסן')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_PANEL} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            העברת ציוד למחסן: {asset.name}
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
          <div>
            <label className={LABEL_CLASS}>הערות</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT_CLASS} rows={2} placeholder="הערות להעברה (אופציונלי)" />
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

// ─── Assign Asset Modal ───────────────────────────────────────────────────────

interface AssignAssetModalProps {
  asset: FixedAsset
  users: CemsUser[]
  onClose: () => void
  onAssigned: () => void
}

function AssignAssetModal({ asset, users, onClose, onAssigned }: AssignAssetModalProps) {
  const [toUserId, setToUserId] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!toUserId) {
      setError('יש לבחור עובד')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await cemsApi.assignAsset(asset.id, Number(toUserId), notes.trim() || undefined)
      onAssigned()
      onClose()
    } catch {
      setError('שגיאה בהקצאת הציוד לעובד')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_PANEL} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            הקצאת ציוד לעובד: {asset.name}
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
            <label className={LABEL_CLASS}>בחר עובד *</label>
            <select value={toUserId} onChange={(e) => setToUserId(e.target.value)} className={INPUT_CLASS} required>
              <option value="">בחר עובד</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>הערות</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT_CLASS} rows={2} placeholder="הערות (אופציונלי)" />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>ביטול</button>
            <button type="submit" disabled={submitting || !toUserId} className={BTN_PRIMARY}>
              {submitting ? 'מקצה...' : 'הקצה לעובד'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
