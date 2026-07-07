import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../../store'
import {
  Plus,
  Search,
  Trash2,
  X,
  AlertTriangle,
  MapPin,
  History,
  Check,
  XCircle,
  UserCheck,
  Image as ImageIcon,
  FileText,
  Upload,
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
  type DocumentType,
} from '../../lib/cemsApi'
import { StatusBadge } from './InventoryDashboard'
import { AssetViewModal } from './AssetViewModal'
import { warehouseLabel } from '../../lib/warehouse'

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'הכל' },
  { value: 'ACTIVE', label: 'פעיל' },
  { value: 'IN_TRANSFER', label: 'בהעברה' },
  { value: 'IN_WAREHOUSE', label: 'במחסן' },
  { value: 'RETIRED', label: 'נגרט' },
]

const MODAL_OVERLAY = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4'
const MODAL_PANEL = 'bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto'
const INPUT_CLASS = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const LABEL_CLASS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'
const BTN_PRIMARY = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'
const BTN_DANGER = 'bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'
const BTN_SECONDARY = 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors'

const DOC_TYPE_OPTIONS: { value: DocumentType; label: string }[] = [
  { value: 'INVOICE', label: 'חשבונית' },
  { value: 'WARRANTY', label: 'תעודת אחריות' },
  { value: 'OTHER', label: 'אחר' },
  { value: 'PHOTO', label: 'תמונה' },
]

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
  const isManagerOrAdmin =
    me?.role === 'Admin' || (me as any)?.cems_role === 'Admin' || (me as any)?.cems_role === 'Manager'
  const isManager = isManagerOrAdmin

  // Modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [transferAsset, setTransferAsset] = useState<FixedAsset | null>(null)
  const [retireAsset, setRetireAsset] = useState<FixedAsset | null>(null)
  const [moveAssetTarget, setMoveAssetTarget] = useState<FixedAsset | null>(null)

  // Retirement workflow
  const [showRetiredSection, setShowRetiredSection] = useState(false)
  const [retirements, setRetirements] = useState<AssetRetirement[]>([])
  const [approvedRetirements, setApprovedRetirements] = useState<AssetRetirement[]>([])
  const [retiredAssets, setRetiredAssets] = useState<FixedAsset[]>([])
  const [retirementLoading, setRetirementLoading] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [approveNotes, setApproveNotes] = useState('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [permanentDeleteAsset, setPermanentDeleteAsset] = useState<FixedAsset | null>(null)

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

  // Retirement data: pending requests + approved retirements (for archive enrichment) + retired assets
  const loadRetirementData = useCallback(async () => {
    setRetirementLoading(true)
    try {
      const [pendingRes, approvedRes, retiredRes] = await Promise.all([
        cemsApi.getRetirements('PENDING'),
        cemsApi.getRetirements('APPROVED'),
        cemsApi.getAssets({ status: 'RETIRED' }),
      ])
      setRetirements(pendingRes.data)
      setApprovedRetirements(approvedRes.data)
      setRetiredAssets(retiredRes.data)
    } catch {
      // silently fail for secondary data
    } finally {
      setRetirementLoading(false)
    }
  }, [])

  // Map asset_id -> most-recent APPROVED retirement so the archive table can
  // display the captured `what_happened` and `reason` alongside the asset.
  const approvedRetirementByAssetId = useMemo(() => {
    const lookup = new Map<string, AssetRetirement>()
    for (const entry of approvedRetirements) {
      const existing = lookup.get(entry.asset_id)
      if (!existing || new Date(entry.requested_at) > new Date(existing.requested_at)) {
        lookup.set(entry.asset_id, entry)
      }
    }
    return lookup
  }, [approvedRetirements])

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
              placeholder="חיפוש לפי שם..."
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
              <option key={w.id} value={w.id}>{warehouseLabel(w)}</option>
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
              {showRetiredSection ? 'הסתר' : 'ציוד נגרט ובקשות'}
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
                  בקשות גריטה ממתינות לאישור
                </h2>
              </div>
              {retirementLoading ? (
                <div className="p-6 text-center text-gray-500 dark:text-gray-400">טוען...</div>
              ) : retirements.length === 0 ? (
                <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                  אין בקשות גריטה ממתינות
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
                                  title="אשר גריטה"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setRejectingId(ret.id)}
                                  className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
                                  title="דחה גריטה"
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

          {/* Section 2: Archived assets -- visible to all; permanent-delete is manager-only */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ארכיון ציוד</h2>
            </div>
            {retirementLoading ? (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">טוען...</div>
            ) : retiredAssets.length === 0 ? (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                אין ציוד בארכיון
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700">
                      <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">שם</th>
                      <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">קטגוריה</th>
                      <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">מה קרה</th>
                      <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">סיבת ארכוב</th>
                      <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">שיטת סילוק</th>
                      {isManagerOrAdmin && (
                        <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">פעולות</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {retiredAssets.map((asset) => {
                      const matchingRetirement = approvedRetirementByAssetId.get(asset.id)
                      return (
                        <tr key={asset.id}>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">{asset.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{getCategoryName(asset.category_id)}</td>
                          <td
                            className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-xs truncate"
                            title={matchingRetirement?.what_happened ?? ''}
                          >
                            {matchingRetirement?.what_happened || '—'}
                          </td>
                          <td
                            className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-xs truncate"
                            title={matchingRetirement?.reason ?? ''}
                          >
                            {matchingRetirement?.reason || '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                            {matchingRetirement?.disposal_method || '—'}
                          </td>
                          {isManagerOrAdmin && (
                            <td className="px-4 py-3">
                              <button
                                onClick={() => setPermanentDeleteAsset(asset)}
                                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
                                title="מחק לצמיתות"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
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
                <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">תיאור</th>
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
      {permanentDeleteAsset && (
        <ConfirmPermanentDeleteModal
          asset={permanentDeleteAsset}
          onClose={() => setPermanentDeleteAsset(null)}
          onDeleted={async () => {
            setPermanentDeleteAsset(null)
            await Promise.all([loadRetirementData(), loadData()])
          }}
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
}

function AssetRow({
  asset,
  categoryName,
  custodianName,
  onViewAsset,
  onTransfer,
  onRetire,
  onMoveToWarehouse,
}: AssetRowProps) {
  // A single "hand to employee" action covers both first-time handout from a
  // warehouse and re-assignment from another employee. Both create a pending
  // transfer the recipient must accept.
  const canHandToEmployee = asset.status === 'ACTIVE' || asset.status === 'IN_WAREHOUSE'
  const canMoveToWarehouse = asset.status === 'ACTIVE' && asset.current_custodian_id !== null
  const canRetire = asset.status === 'ACTIVE' || asset.status === 'IN_WAREHOUSE'

  return (
    <tr
      className="hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer"
      onClick={onViewAsset}
    >
      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">
        <div className="flex items-center gap-3">
          {asset.photo_url && (
            <img
              src={asset.photo_url?.startsWith('http') ? asset.photo_url : `/uploads/${asset.photo_url}`}
              alt={asset.name}
              className="w-14 h-14 object-cover rounded-lg border border-gray-200 dark:border-gray-700 flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          )}
          {asset.name}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-[180px] truncate" title={asset.notes ?? ''}>{asset.notes || '—'}</td>
      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{categoryName}</td>
      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{custodianName}</td>
      <td className="px-4 py-3"><StatusBadge status={asset.status} /></td>
      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
        {asset.warranty_expiry ? new Date(asset.warranty_expiry).toLocaleDateString('he-IL') : '-'}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {canHandToEmployee && (
            <button
              onClick={onTransfer}
              className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 transition-colors"
              title="מסירה לעובד"
            >
              <UserCheck className="w-4 h-4" />
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
          {canRetire && (
            <button
              onClick={onRetire}
              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
              title="גריטה"
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
  const [categoryId, setCategoryId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [warrantyExpiry, setWarrantyExpiry] = useState('')
  const [notes, setNotes] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [docFiles, setDocFiles] = useState<{ file: File; type: DocumentType }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

  const photoPreviewUrl = useMemo(
    () => (photoFile ? URL.createObjectURL(photoFile) : null),
    [photoFile]
  )

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
    }
  }, [photoPreviewUrl])

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
    if (!name.trim()) {
      setError('שם הוא שדה חובה')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const response = await cemsApi.createAsset({
        name: name.trim(),
        serial_number: name.trim(),
        category_id: categoryId || undefined,
        current_warehouse_id: warehouseId || undefined,
        purchase_date: purchaseDate || undefined,
        warranty_expiry: warrantyExpiry || undefined,
        notes: notes.trim() || undefined,
      } as Partial<FixedAsset>)
      const newId = response.data?.id
      if (newId) {
        if (photoFile) {
          await cemsApi.uploadAssetPhoto(newId, photoFile)
        }
        for (const doc of docFiles) {
          const formData = new FormData()
          formData.append('file', doc.file)
          formData.append('entity_type', 'fixed_asset')
          formData.append('entity_id', newId)
          formData.append('document_type', doc.type)
          await cemsApi.uploadDocument(formData)
        }
      }
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
            <label className={LABEL_CLASS}>תמונה</label>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            />
            <div
              onClick={() => photoInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors flex items-center justify-center min-h-[120px]"
            >
              {photoPreviewUrl ? (
                <img src={photoPreviewUrl} alt="תצוגה מקדימה" className="max-h-[160px] rounded-lg object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500">
                  <ImageIcon className="w-8 h-8" />
                  <span className="text-sm">לחץ לבחירת תמונה</span>
                </div>
              )}
            </div>
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
              {warehouses.map((w) => <option key={w.id} value={w.id}>{warehouseLabel(w)}</option>)}
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
          {/* Documents section */}
          <div>
            <label className={LABEL_CLASS}>מסמכים</label>
            <input
              ref={docInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  setDocFiles((prev) => [...prev, { file, type: 'OTHER' as DocumentType }])
                }
                e.target.value = ''
              }}
            />
            {docFiles.length > 0 && (
              <div className="space-y-2 mb-3">
                {docFiles.map((doc, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 border border-gray-200 dark:border-gray-600">
                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">{doc.file.name}</span>
                    <select
                      value={doc.type}
                      onChange={(e) => {
                        const newType = e.target.value as DocumentType
                        setDocFiles((prev) => prev.map((d, i) => i === idx ? { ...d, type: newType } : d))
                      }}
                      className="text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-1.5 py-0.5"
                    >
                      {DOC_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => setDocFiles((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => docInputRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-3 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors flex items-center justify-center gap-2 text-gray-400 dark:text-gray-500 text-sm"
            >
              <Upload className="w-4 h-4" />
              <span>הוסף מסמך (חשבונית, אחריות וכו׳)</span>
            </button>
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
  const [sendEmailNotification, setSendEmailNotification] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!toUserId) {
      setError('יש לבחור עובד מקבל')
      return
    }

    setSubmitting(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const response = await cemsApi.initiateTransfer({
        asset_id: asset.id,
        to_user_id: Number(toUserId),
        to_warehouse_id: toWarehouseId || undefined,
        notes: notes.trim() || undefined,
        send_email_notification: sendEmailNotification,
      })
      if (sendEmailNotification) {
        const emailDelivered = response?.data?.email_sent
        setSuccessMessage(
          emailDelivered === false
            ? 'ההעברה נוצרה, אך שליחת המייל נכשלה. ניתן לאשר ידנית.'
            : 'נשלח לעובד מייל עם קישור לאישור.'
        )
        // Brief delay so the user actually sees the confirmation banner.
        window.setTimeout(() => {
          onTransferred()
          onClose()
        }, 1500)
      } else {
        onTransferred()
        onClose()
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'שגיאה ביצירת העברה')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_PANEL} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            מסירה לעובד: {asset.name}
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
              {warehouses.map((w) => <option key={w.id} value={w.id}>{warehouseLabel(w)}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>הערות</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT_CLASS} rows={3} />
          </div>
          <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <input
              id="send-email-notification"
              type="checkbox"
              checked={sendEmailNotification}
              onChange={(e) => setSendEmailNotification(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label
              htmlFor="send-email-notification"
              className="text-sm text-blue-900 dark:text-blue-200 cursor-pointer select-none"
            >
              שלח לעובד מייל עם קישור לאישור קבלה
              <span className="block text-xs text-blue-700 dark:text-blue-300 mt-1">
                העובד יוכל לאשר את קבלת הציוד בלחיצה על הקישור, ללא צורך בהתחברות.
              </span>
            </label>
          </div>
          {successMessage && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm text-green-800 dark:text-green-300">
              {successMessage}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>ביטול</button>
            <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
              {submitting ? 'מוסר...' : 'מסור לעובד'}
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

const RETURN_TO_SUPPLIER = 'החזרה לספק'

function RetirementModal({ asset, onClose, onRetired }: RetirementModalProps) {
  const [whatHappened, setWhatHappened] = useState('')
  const [reason, setReason] = useState('')
  const [disposalMethod, setDisposalMethod] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isReturnToSupplier = disposalMethod === RETURN_TO_SUPPLIER

  async function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault()
    if (!whatHappened.trim()) {
      setError('יש למלא תיאור של מה שקרה לציוד')
      return
    }
    if (!reason.trim()) {
      setError('יש למלא סיבת העברה לארכיון')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await cemsApi.retireAsset(
        asset.id,
        reason.trim(),
        disposalMethod || 'אחר',
        whatHappened.trim(),
        isReturnToSupplier ? (supplierName.trim() || undefined) : undefined,
      )
      onRetired()
      onClose()
    } catch {
      setError('שגיאה בביצוע גריטה')
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
            <label className={LABEL_CLASS}>מה קרה לציוד? *</label>
            <textarea
              value={whatHappened}
              onChange={(e) => setWhatHappened(e.target.value)}
              className={INPUT_CLASS}
              rows={3}
              placeholder="תאר מה קרה לציוד – נשבר, אבד, נגנב וכו'..."
              required
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>סיבת העברה לארכיון *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={INPUT_CLASS}
              rows={3}
              placeholder="מדוע הציוד עובר לארכיון?"
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
              <option value={RETURN_TO_SUPPLIER}>{RETURN_TO_SUPPLIER}</option>
              <option value="אחר">אחר</option>
            </select>
          </div>
          {isReturnToSupplier && (
            <div>
              <label className={LABEL_CLASS}>שם ספק</label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className={INPUT_CLASS}
                placeholder="שם הספק (אופציונלי)"
              />
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>ביטול</button>
            <button type="submit" disabled={submitting} className={BTN_DANGER}>
              {submitting ? 'מבצע גריטה...' : 'בצע גריטה'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Confirm Permanent Delete Modal ──────────────────────────────────────────

interface ConfirmPermanentDeleteModalProps {
  asset: FixedAsset
  onClose: () => void
  onDeleted: () => void | Promise<void>
}

function ConfirmPermanentDeleteModal({
  asset,
  onClose,
  onDeleted,
}: ConfirmPermanentDeleteModalProps) {
  const [typedSerial, setTypedSerial] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const serialMatches = typedSerial === asset.serial_number

  async function handleConfirm() {
    if (!serialMatches) return
    setSubmitting(true)
    setError(null)
    try {
      await cemsApi.deleteAssetPermanently(asset.id)
      await onDeleted()
    } catch {
      setError('שגיאה במחיקה לצמיתות של הציוד')
      setSubmitting(false)
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_PANEL} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            מחיקה לצמיתות: {asset.name}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4" dir="rtl">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-800 dark:text-red-300">
              {error}
            </div>
          )}
          <div className="bg-red-50 dark:bg-red-900/30 border-2 border-red-300 dark:border-red-700 rounded-lg p-4 text-sm text-red-900 dark:text-red-200">
            <p className="font-semibold mb-2">אזהרה</p>
            <p>
              מחיקה לצמיתות תמחק את הציוד, כל ההיסטוריה, בקשות הגריטה,
              ההעברות והמסמכים. פעולה זו אינה הפיכה.
            </p>
          </div>
          <div>
            <label className={LABEL_CLASS}>
              הקלד את המספר הסידורי של הציוד לאישור:{' '}
              <span className="font-mono font-bold text-gray-900 dark:text-white">
                {asset.serial_number}
              </span>
            </label>
            <input
              type="text"
              value={typedSerial}
              onChange={(e) => setTypedSerial(e.target.value)}
              className={INPUT_CLASS}
              placeholder="הקלד את המספר הסידורי כאן"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>
              ביטול
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!serialMatches || submitting}
              className={`${BTN_DANGER} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {submitting ? 'מוחק...' : 'מחק לצמיתות'}
            </button>
          </div>
        </div>
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

type MoveDestination = 'warehouse' | 'location'

function MoveAssetModal({ asset, onClose, onMoved }: MoveAssetModalProps) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [destination, setDestination] = useState<MoveDestination>('warehouse')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')
  const [toLocation, setToLocation] = useState('')
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
    if (destination === 'warehouse' && !selectedWarehouseId) {
      setError('יש לבחור מחסן יעד')
      return
    }
    if (destination === 'location' && !toLocation.trim()) {
      setError('יש להזין מיקום חופשי')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await cemsApi.moveAsset(asset.id, {
        toWarehouseId: destination === 'warehouse' ? selectedWarehouseId : undefined,
        toLocation: destination === 'location' ? toLocation.trim() : undefined,
        notes: notes.trim() || undefined,
      })
      onMoved()
      onClose()
    } catch {
      setError('שגיאה בהעברת הציוד')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit =
    destination === 'warehouse' ? Boolean(selectedWarehouseId) : Boolean(toLocation.trim())

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
            <label className={LABEL_CLASS}>יעד *</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="radio"
                  name="move-destination"
                  value="warehouse"
                  checked={destination === 'warehouse'}
                  onChange={() => setDestination('warehouse')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                מחסן
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="radio"
                  name="move-destination"
                  value="location"
                  checked={destination === 'location'}
                  onChange={() => setDestination('location')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                מיקום חופשי
              </label>
            </div>
          </div>
          {destination === 'warehouse' ? (
            <div>
              <label className={LABEL_CLASS}>בחר מחסן יעד *</label>
              <select value={selectedWarehouseId} onChange={(e) => setSelectedWarehouseId(e.target.value)} className={INPUT_CLASS}>
                <option value="">בחר מחסן</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{warehouseLabel(w)}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className={LABEL_CLASS}>מיקום חופשי *</label>
              <input
                type="text"
                value={toLocation}
                onChange={(e) => setToLocation(e.target.value)}
                className={INPUT_CLASS}
                placeholder="לדוגמה: אתר בנייה, כתובת..."
              />
            </div>
          )}
          <div>
            <label className={LABEL_CLASS}>הערות</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT_CLASS} rows={2} placeholder="הערות להעברה (אופציונלי)" />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>ביטול</button>
            <button type="submit" disabled={submitting || !canSubmit} className={BTN_PRIMARY}>
              {submitting ? 'מעביר...' : 'העבר'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
