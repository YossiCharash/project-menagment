import { useEffect, useState, useCallback } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../../store'
import {
  Plus,
  Search,
  ArrowLeftRight,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  AlertTriangle,
  MapPin,
  FileText,
  Upload,
  Download,
  History,
  Check,
  XCircle,
} from 'lucide-react'
import {
  cemsApi,
  type FixedAsset,
  type AssetHistory,
  type AssetRetirement,
  type CemsUser,
  type AssetCategory,
  type Warehouse,
  type CemsDocument,
  type DocumentType,
} from '../../lib/cemsApi'
import { fileAttachmentUrl } from '../../lib/api'
import { StatusBadge } from './InventoryDashboard'

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

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  WARRANTY: 'תעודת אחריות',
  INVOICE: 'חשבונית',
  OTHER: 'אחר',
}

const DOC_TYPE_OPTIONS: { value: DocumentType; label: string }[] = [
  { value: 'INVOICE', label: 'חשבונית' },
  { value: 'WARRANTY', label: 'תעודת אחריות' },
  { value: 'OTHER', label: 'אחר' },
]

function isImageFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return ['jpg', 'jpeg', 'png'].includes(ext)
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AssetsPage() {
  const [assets, setAssets] = useState<FixedAsset[]>([])
  const [users, setUsers] = useState<CemsUser[]>([])
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Expanded rows (asset history)
  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null)
  const [assetHistory, setAssetHistory] = useState<AssetHistory[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Documents (per-asset tab + shared doc state)
  const [docTab, setDocTab] = useState<Record<string, 'history' | 'docs'>>({})
  const [assetDocs, setAssetDocs] = useState<CemsDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [uploadDocType, setUploadDocType] = useState<DocumentType>('INVOICE')
  const [uploadExpiry, setUploadExpiry] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const me = useSelector((s: RootState) => s.auth.me)
  const isManager = me?.role === 'Admin'

  // Modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [transferAsset, setTransferAsset] = useState<FixedAsset | null>(null)
  const [retireAsset, setRetireAsset] = useState<FixedAsset | null>(null)
  const [moveAssetTarget, setMoveAssetTarget] = useState<FixedAsset | null>(null)

  // Retirement workflow
  const me = useSelector((s: RootState) => s.auth.me)
  const isManagerOrAdmin =
    me?.role === 'Admin' || (me as any)?.cems_role === 'Admin' || (me as any)?.cems_role === 'Manager'
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
      const params: { status?: string } = {}
      if (statusFilter) params.status = statusFilter

      const [assetsRes, usersRes, categoriesRes] = await Promise.all([
        cemsApi.getAssets(params),
        cemsApi.getUsers(),
        cemsApi.getCategories(),
      ])
      setAssets(assetsRes.data)
      setUsers(usersRes.data)
      setCategories(categoriesRes.data)
    } catch {
      setError('שגיאה בטעינת רשימת הציוד')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Load warehouses for move modal
  useEffect(() => {
    cemsApi.getWarehouses()
      .then((res) => setWarehouses(res.data))
      .catch(() => { /* silent */ })
  }, [])

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

  async function toggleAssetHistory(assetId: string) {
    if (expandedAssetId === assetId) {
      setExpandedAssetId(null)
      return
    }
    setExpandedAssetId(assetId)
    setHistoryLoading(true)
    try {
      const res = await cemsApi.getAssetHistory(assetId)
      setAssetHistory(res.data)
    } catch {
      setAssetHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  async function loadDocuments(assetId: string) {
    setDocsLoading(true)
    try {
      const res = await cemsApi.getDocuments('fixed_asset', assetId)
      setAssetDocs(res.data)
    } catch {
      setAssetDocs([])
    } finally {
      setDocsLoading(false)
    }
  }

  function handleDocTabSwitch(assetId: string, tab: 'history' | 'docs') {
    setDocTab((prev) => ({ ...prev, [assetId]: tab }))
    if (tab === 'docs') {
      loadDocuments(assetId)
    }
  }

  async function handleDocumentUpload(assetId: string) {
    if (!uploadFile) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('entity_type', 'fixed_asset')
      formData.append('entity_id', assetId)
      formData.append('document_type', uploadDocType)
      if (uploadExpiry) formData.append('expiry_date', uploadExpiry)
      await cemsApi.uploadDocument(formData)
      setUploadFile(null)
      setUploadExpiry('')
      setUploadDocType('INVOICE')
      await loadDocuments(assetId)
    } catch {
      // Error is handled silently; the user will see no new document appear
    } finally {
      setUploading(false)
    }
  }

  async function handleDocumentDelete(docId: string, assetId: string) {
    try {
      await cemsApi.deleteDocument(docId)
      await loadDocuments(assetId)
    } catch {
      // silent
    }
  }

  function getCategoryName(categoryId: string): string {
    return categories.find((c) => c.id === categoryId)?.name || '-'
  }

  function getUserName(userId: number | null): string {
    if (!userId) return '-'
    return users.find((u) => u.id === userId)?.full_name || '-'
  }

  const filteredAssets = assets.filter((asset) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      asset.name.toLowerCase().includes(term) ||
      asset.serial_number.toLowerCase().includes(term)
    )
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
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
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
            className={`${INPUT_CLASS} w-full sm:w-48`}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
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
              {filteredAssets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    לא נמצאו פריטי ציוד
                  </td>
                </tr>
              ) : (
                filteredAssets.map((asset) => (
                  <AssetRow
                    key={asset.id}
                    asset={asset}
                    categoryName={getCategoryName(asset.category_id)}
                    custodianName={getUserName(asset.current_custodian_id)}
                    isExpanded={expandedAssetId === asset.id}
                    history={expandedAssetId === asset.id ? assetHistory : []}
                    historyLoading={historyLoading && expandedAssetId === asset.id}
                    onToggleHistory={() => toggleAssetHistory(asset.id)}
                    onTransfer={() => setTransferAsset(asset)}
                    onRetire={() => setRetireAsset(asset)}
                    onMoveToWarehouse={() => setMoveAssetTarget(asset)}
                    getUserName={getUserName}
                    activeTab={docTab[asset.id] || 'history'}
                    onTabSwitch={(tab) => handleDocTabSwitch(asset.id, tab)}
                    documents={assetDocs}
                    docsLoading={docsLoading}
                    uploadFile={uploadFile}
                    uploadDocType={uploadDocType}
                    uploadExpiry={uploadExpiry}
                    uploading={uploading}
                    isManager={isManager}
                    onUploadFileChange={setUploadFile}
                    onUploadDocTypeChange={setUploadDocType}
                    onUploadExpiryChange={setUploadExpiry}
                    onDocumentUpload={() => handleDocumentUpload(asset.id)}
                    onDocumentDelete={(docId) => handleDocumentDelete(docId, asset.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
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
    </div>
  )
}

// ─── Asset Row ───────────────────────────────────────────────────────────────

interface AssetRowProps {
  asset: FixedAsset
  categoryName: string
  custodianName: string
  isExpanded: boolean
  history: AssetHistory[]
  historyLoading: boolean
  onToggleHistory: () => void
  onTransfer: () => void
  onRetire: () => void
  onMoveToWarehouse: () => void
  getUserName: (id: number | null) => string
  activeTab: 'history' | 'docs'
  onTabSwitch: (tab: 'history' | 'docs') => void
  documents: CemsDocument[]
  docsLoading: boolean
  uploadFile: File | null
  uploadDocType: DocumentType
  uploadExpiry: string
  uploading: boolean
  isManager: boolean
  onUploadFileChange: (f: File | null) => void
  onUploadDocTypeChange: (t: DocumentType) => void
  onUploadExpiryChange: (d: string) => void
  onDocumentUpload: () => void
  onDocumentDelete: (docId: string) => void
}

function AssetRow({
  asset,
  categoryName,
  custodianName,
  isExpanded,
  history,
  historyLoading,
  onToggleHistory,
  onTransfer,
  onRetire,
  onMoveToWarehouse,
  getUserName,
  activeTab,
  onTabSwitch,
  documents,
  docsLoading,
  uploadFile,
  uploadDocType,
  uploadExpiry,
  uploading,
  isManager,
  onUploadFileChange,
  onUploadDocTypeChange,
  onUploadExpiryChange,
  onDocumentUpload,
  onDocumentDelete,
}: AssetRowProps) {
  const canTransfer = asset.status === 'ACTIVE'
  const canRetire = asset.status === 'ACTIVE' || asset.status === 'IN_WAREHOUSE'

  return (
    <>
      <tr
        className="hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer"
        onClick={onToggleHistory}
      >
        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            {asset.name}
          </div>
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
            <button
              onClick={onMoveToWarehouse}
              className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 dark:text-green-400 transition-colors"
              title="העבר למחסן"
            >
              <MapPin className="w-4 h-4" />
            </button>
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
      {isExpanded && (
        <tr>
          <td colSpan={7} className="px-4 py-4 bg-gray-50 dark:bg-gray-750">
            {/* Tab navigation */}
            <div className="flex gap-4 border-b border-gray-200 dark:border-gray-700 mb-4">
              <button
                onClick={() => onTabSwitch('history')}
                className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'history'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                היסטוריה
              </button>
              <button
                onClick={() => onTabSwitch('docs')}
                className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'docs'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                מסמכים
              </button>
            </div>

            {/* Tab content */}
            {activeTab === 'history' ? (
              <>
                {historyLoading ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">טוען היסטוריה...</p>
                ) : history.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">אין היסטוריה זמינה</p>
                ) : (
                  <div className="space-y-2">
                    {history.map((entry) => (
                      <div key={entry.id} className="flex items-start gap-3 p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div className="flex-1">
                          <p className="text-sm text-gray-900 dark:text-white">{entry.action}</p>
                          {entry.from_custodian_id && entry.to_custodian_id && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              מ: {getUserName(entry.from_custodian_id)} &larr; ל: {getUserName(entry.to_custodian_id)}
                            </p>
                          )}
                          {entry.notes && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{entry.notes}</p>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {new Date(entry.timestamp).toLocaleString('he-IL')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <AssetDocumentsPanel
                documents={documents}
                docsLoading={docsLoading}
                uploadFile={uploadFile}
                uploadDocType={uploadDocType}
                uploadExpiry={uploadExpiry}
                uploading={uploading}
                isManager={isManager}
                onUploadFileChange={onUploadFileChange}
                onUploadDocTypeChange={onUploadDocTypeChange}
                onUploadExpiryChange={onUploadExpiryChange}
                onDocumentUpload={onDocumentUpload}
                onDocumentDelete={onDocumentDelete}
              />
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Asset Documents Panel ────────────────────────────────────────────────────

interface AssetDocumentsPanelProps {
  documents: CemsDocument[]
  docsLoading: boolean
  uploadFile: File | null
  uploadDocType: DocumentType
  uploadExpiry: string
  uploading: boolean
  isManager: boolean
  onUploadFileChange: (f: File | null) => void
  onUploadDocTypeChange: (t: DocumentType) => void
  onUploadExpiryChange: (d: string) => void
  onDocumentUpload: () => void
  onDocumentDelete: (docId: string) => void
}

function AssetDocumentsPanel({
  documents,
  docsLoading,
  uploadFile,
  uploadDocType,
  uploadExpiry,
  uploading,
  isManager,
  onUploadFileChange,
  onUploadDocTypeChange,
  onUploadExpiryChange,
  onDocumentUpload,
  onDocumentDelete,
}: AssetDocumentsPanelProps) {
  if (docsLoading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">טוען מסמכים...</p>
  }

  return (
    <div className="space-y-4">
      {/* Document list */}
      {documents.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">אין מסמכים מצורפים</p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              {/* File type icon */}
              <span className="text-lg flex-shrink-0">
                {isImageFile(doc.filename) ? (
                  <FileText className="w-5 h-5 text-purple-500" />
                ) : (
                  <FileText className="w-5 h-5 text-blue-500" />
                )}
              </span>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-white truncate">{doc.filename}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                    doc.document_type === 'WARRANTY'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      : doc.document_type === 'INVOICE'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                  }`}>
                    {DOC_TYPE_LABELS[doc.document_type]}
                  </span>
                  {doc.expiry_date && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      תוקף: {new Date(doc.expiry_date).toLocaleDateString('he-IL')}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => {
                    const url = fileAttachmentUrl(doc.file_url)
                    if (url) window.open(url, '_blank')
                  }}
                  className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 transition-colors"
                  title="הורדה"
                >
                  <Download className="w-4 h-4" />
                </button>
                {isManager && (
                  <button
                    onClick={() => onDocumentDelete(doc.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
                    title="מחיקה"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload form */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <Upload className="w-4 h-4" />
          העלאת מסמך חדש
        </h5>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className={LABEL_CLASS}>קובץ</label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
              onChange={(e) => onUploadFileChange(e.target.files?.[0] || null)}
              className={`${INPUT_CLASS} text-xs`}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>סוג מסמך</label>
            <select
              value={uploadDocType}
              onChange={(e) => onUploadDocTypeChange(e.target.value as DocumentType)}
              className={INPUT_CLASS}
            >
              {DOC_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>תאריך תוקף</label>
            <input
              type="date"
              value={uploadExpiry}
              onChange={(e) => onUploadExpiryChange(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <button
            onClick={onDocumentUpload}
            disabled={!uploadFile || uploading}
            className={`${BTN_PRIMARY} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {uploading ? 'מעלה...' : 'העלאה'}
          </button>
        </div>
      </div>
    </div>
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
