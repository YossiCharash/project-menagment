import { useEffect, useState, useCallback } from 'react'
import {
  Undo2,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  X,
} from 'lucide-react'
import {
  cemsApi,
  type WarehouseReturn,
  type ReturnStatus,
  type Warehouse,
} from '../../lib/cemsApi'
import SignaturePadModal from '../../components/inventory/SignaturePadModal'

// ─── Constants ───────────────────────────────────────────────────────────────

const MODAL_OVERLAY = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4'
const MODAL_PANEL = 'bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto'
const INPUT_CLASS = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const LABEL_CLASS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'
const BTN_PRIMARY = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50'
const BTN_DANGER = 'bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50'
const BTN_SECONDARY = 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors'

interface TabConfig {
  key: ReturnStatus
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const TABS: TabConfig[] = [
  { key: 'PENDING', label: 'ממתין לאישור', icon: Clock },
  { key: 'APPROVED', label: 'אושר', icon: CheckCircle },
  { key: 'REJECTED', label: 'נדחה', icon: XCircle },
]

const STATUS_BADGE_CLASSES: Record<ReturnStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
}

const STATUS_LABELS: Record<ReturnStatus, string> = {
  PENDING: 'ממתין',
  APPROVED: 'אושר',
  REJECTED: 'נדחה',
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ReturnsPage() {
  const [returns, setReturns] = useState<WarehouseReturn[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<ReturnStatus>('PENDING')

  // Approval flow: first pick target warehouse, then sign.
  const [approveTargetId, setApproveTargetId] = useState<string | null>(null)
  const [approveWarehouseId, setApproveWarehouseId] = useState<string | null>(null)
  const [signatureReturnId, setSignatureReturnId] = useState<string | null>(null)

  // Reject modal
  const [rejectReturnId, setRejectReturnId] = useState<string | null>(null)

  // Action loading state
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [returnsRes, warehousesRes] = await Promise.all([
        cemsApi.getReturns({ status: activeTab }),
        cemsApi.getWarehouses(),
      ])
      setReturns(returnsRes.data)
      setWarehouses(warehousesRes.data)
    } catch {
      setError('שגיאה בטעינת רשימת ההחזרות')
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    loadData()
  }, [loadData])

  function getWarehouseName(warehouseId: string | null): string {
    if (!warehouseId) return '-'
    return warehouses.find((w) => w.id === warehouseId)?.name || `מחסן #${warehouseId.slice(0, 8)}`
  }

  function handleApproveStart(returnId: string) {
    setApproveTargetId(returnId)
    setApproveWarehouseId(null)
  }

  function handleApproveWarehouseConfirm() {
    if (!approveTargetId || !approveWarehouseId) return
    setSignatureReturnId(approveTargetId)
    setApproveTargetId(null)
  }

  async function handleSignatureConfirm(hash: string) {
    if (!signatureReturnId || !approveWarehouseId) return

    setActionLoadingId(signatureReturnId)
    try {
      await cemsApi.approveReturn(signatureReturnId, {
        return_warehouse_id: approveWarehouseId,
        signature_hash: hash,
      })
      setSignatureReturnId(null)
      setApproveWarehouseId(null)
      await loadData()
    } catch {
      setError('שגיאה באישור ההחזרה')
    } finally {
      setActionLoadingId(null)
    }
  }

  async function handleReject(returnId: string, reason: string) {
    setActionLoadingId(returnId)
    try {
      await cemsApi.rejectReturn(returnId, { reason })
      setRejectReturnId(null)
      await loadData()
    } catch {
      setError('שגיאה בדחיית ההחזרה')
    } finally {
      setActionLoadingId(null)
    }
  }

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">החזרות למחסן</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">ניהול בקשות החזרת ציוד למחסן</p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <p className="text-red-800 dark:text-red-300 text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mr-auto p-1 rounded hover:bg-red-100 dark:hover:bg-red-800"
          >
            <X className="w-4 h-4 text-red-500" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Returns Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-gray-500 dark:text-gray-400">טוען...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700">
                  <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">ציוד</th>
                  <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">מחסן</th>
                  <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">סיבה</th>
                  <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">תאריך בקשה</th>
                  <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">סטטוס</th>
                  {activeTab === 'PENDING' && (
                    <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">פעולות</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {returns.length === 0 ? (
                  <tr>
                    <td
                      colSpan={activeTab === 'PENDING' ? 6 : 5}
                      className="px-4 py-12 text-center"
                    >
                      <Undo2 className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                      <p className="text-gray-500 dark:text-gray-400">אין החזרות בסטטוס זה</p>
                    </td>
                  </tr>
                ) : (
                  returns.map((wr) => (
                    <tr key={wr.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium font-mono">
                        {wr.asset_id}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {getWarehouseName(wr.warehouse_id)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-[240px] truncate">
                        {wr.return_reason || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {new Date(wr.requested_at).toLocaleDateString('he-IL', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-medium ${
                            STATUS_BADGE_CLASSES[wr.status]
                          }`}
                        >
                          {STATUS_LABELS[wr.status]}
                        </span>
                      </td>
                      {activeTab === 'PENDING' && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleApproveStart(wr.id)}
                              disabled={actionLoadingId === wr.id}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800/40 transition-colors disabled:opacity-50"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              {actionLoadingId === wr.id ? 'מאשר...' : 'אשר החזרה'}
                            </button>
                            <button
                              onClick={() => setRejectReturnId(wr.id)}
                              disabled={actionLoadingId === wr.id}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800/40 transition-colors disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              דחה
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Approve: pick target warehouse first */}
      {approveTargetId && (
        <PickWarehouseModal
          warehouses={warehouses}
          value={approveWarehouseId}
          onChange={setApproveWarehouseId}
          onConfirm={handleApproveWarehouseConfirm}
          onClose={() => {
            setApproveTargetId(null)
            setApproveWarehouseId(null)
          }}
        />
      )}

      {/* Approve: signature */}
      {signatureReturnId && (
        <SignaturePadModal
          title="חתימת אישור החזרה"
          description="חתום לאישור החזרת הציוד למחסן"
          onConfirm={(hash) => handleSignatureConfirm(hash)}
          onClose={() => {
            setSignatureReturnId(null)
            setApproveWarehouseId(null)
          }}
        />
      )}

      {/* Reject modal */}
      {rejectReturnId && (
        <RejectModal
          returnId={rejectReturnId}
          isLoading={actionLoadingId === rejectReturnId}
          onReject={handleReject}
          onClose={() => setRejectReturnId(null)}
        />
      )}
    </div>
  )
}

// ─── Pick Warehouse Modal ────────────────────────────────────────────────────

interface PickWarehouseModalProps {
  warehouses: Warehouse[]
  value: string | null
  onChange: (value: string | null) => void
  onConfirm: () => void
  onClose: () => void
}

function PickWarehouseModal({
  warehouses,
  value,
  onChange,
  onConfirm,
  onClose,
}: PickWarehouseModalProps) {
  const [validationError, setValidationError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!value) {
      setValidationError('יש לבחור מחסן יעד')
      return
    }
    setValidationError(null)
    onConfirm()
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_PANEL} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">בחר מחסן יעד</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4" dir="rtl">
          {validationError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-800 dark:text-red-300">
              {validationError}
            </div>
          )}
          <div>
            <label className={LABEL_CLASS}>מחסן להחזרה *</label>
            <select
              value={value || ''}
              onChange={(e) => onChange(e.target.value || null)}
              className={INPUT_CLASS}
              required
            >
              <option value="">— בחר —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>ביטול</button>
            <button type="submit" className={BTN_PRIMARY}>המשך לחתימה</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Reject Modal ────────────────────────────────────────────────────────────

interface RejectModalProps {
  returnId: string
  isLoading: boolean
  onReject: (returnId: string, reason: string) => void
  onClose: () => void
}

function RejectModal({ returnId, isLoading, onReject, onClose }: RejectModalProps) {
  const [reason, setReason] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason.trim()) {
      setValidationError('יש לציין סיבה לדחייה')
      return
    }
    setValidationError(null)
    onReject(returnId, reason.trim())
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_PANEL} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">דחיית החזרה</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4" dir="rtl">
          {validationError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-800 dark:text-red-300">
              {validationError}
            </div>
          )}
          <div>
            <label className={LABEL_CLASS}>סיבת הדחייה *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={INPUT_CLASS}
              rows={3}
              placeholder="תאר את הסיבה לדחיית ההחזרה..."
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>ביטול</button>
            <button type="submit" disabled={isLoading} className={BTN_DANGER}>
              {isLoading ? 'דוחה...' : 'דחה החזרה'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
