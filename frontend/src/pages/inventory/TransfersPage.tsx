import { useEffect, useState, useCallback } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../../store'
import {
  ArrowLeftRight,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  X,
} from 'lucide-react'
import {
  cemsApi,
  type Transfer,
  type TransferStatus,
  type CemsUser,
} from '../../lib/cemsApi'

// ─── Constants ───────────────────────────────────────────────────────────────

const MODAL_OVERLAY = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4'
const MODAL_PANEL = 'bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto'
const INPUT_CLASS = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const LABEL_CLASS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'
const BTN_PRIMARY = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'
const BTN_DANGER = 'bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'
const BTN_SECONDARY = 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors'

interface TabConfig {
  key: TransferStatus | 'ALL'
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const TABS: TabConfig[] = [
  { key: 'PENDING', label: 'ממתין לאישור', icon: Clock },
  { key: 'COMPLETED', label: 'הושלם', icon: CheckCircle },
  { key: 'REJECTED', label: 'נדחה', icon: XCircle },
]

const STATUS_BADGE_CLASSES: Record<TransferStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
}

const STATUS_LABELS: Record<TransferStatus, string> = {
  PENDING: 'ממתין',
  APPROVED: 'אושר',
  COMPLETED: 'הושלם',
  REJECTED: 'נדחה',
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function TransfersPage() {
  const me = useSelector((s: RootState) => s.auth.me)

  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [users, setUsers] = useState<CemsUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TransferStatus>('PENDING')

  // Modals
  const [rejectTransferId, setRejectTransferId] = useState<string | null>(null)

  // Action loading states
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [transfersRes, usersRes] = await Promise.all([
        cemsApi.getTransfers({ status: activeTab }),
        cemsApi.getUsers(),
      ])
      setTransfers(transfersRes.data)
      setUsers(usersRes.data)
    } catch {
      setError('שגיאה בטעינת רשימת ההעברות')
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    loadData()
  }, [loadData])

  function getUserName(userId: number): string {
    return users.find((u) => u.id === userId)?.full_name || `עובד #${userId}`
  }

  async function handleComplete(transferId: string) {
    setActionLoadingId(transferId)
    try {
      await cemsApi.completeTransfer(transferId, {
        signature_hash: crypto.randomUUID(),
      })
      await loadData()
    } catch {
      setError('שגיאה באישור ההעברה')
    } finally {
      setActionLoadingId(null)
    }
  }

  async function handleReject(transferId: string, reason: string) {
    setActionLoadingId(transferId)
    try {
      await cemsApi.rejectTransfer(transferId, { reason })
      setRejectTransferId(null)
      await loadData()
    } catch {
      setError('שגיאה בדחיית ההעברה')
    } finally {
      setActionLoadingId(null)
    }
  }

  function isCurrentUserRecipient(transfer: Transfer): boolean {
    return transfer.to_user_id === me?.id
  }

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">העברות ציוד</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">מעקב וניהול העברות ציוד בין עובדים</p>
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
              onClick={() => setActiveTab(tab.key as TransferStatus)}
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

      {/* Transfers Table */}
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
                  <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">מ-עובד</th>
                  <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">ל-עובד</th>
                  <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">תאריך</th>
                  <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">הערות</th>
                  <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">סטטוס</th>
                  {activeTab === 'PENDING' && (
                    <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">פעולות</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {transfers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={activeTab === 'PENDING' ? 7 : 6}
                      className="px-4 py-12 text-center"
                    >
                      <ArrowLeftRight className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                      <p className="text-gray-500 dark:text-gray-400">אין העברות בסטטוס זה</p>
                    </td>
                  </tr>
                ) : (
                  transfers.map((transfer) => (
                    <tr key={transfer.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium font-mono">
                        {transfer.asset_id}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {getUserName(transfer.from_user_id)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {getUserName(transfer.to_user_id)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {new Date(transfer.initiated_at).toLocaleDateString('he-IL', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-[200px] truncate">
                        {transfer.notes || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-medium ${
                            STATUS_BADGE_CLASSES[transfer.status]
                          }`}
                        >
                          {STATUS_LABELS[transfer.status]}
                        </span>
                      </td>
                      {activeTab === 'PENDING' && (
                        <td className="px-4 py-3">
                          {isCurrentUserRecipient(transfer) && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleComplete(transfer.id)}
                                disabled={actionLoadingId === transfer.id}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800/40 transition-colors disabled:opacity-50"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                {actionLoadingId === transfer.id ? 'מאשר...' : 'אשר קבלה'}
                              </button>
                              <button
                                onClick={() => setRejectTransferId(transfer.id)}
                                disabled={actionLoadingId === transfer.id}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800/40 transition-colors disabled:opacity-50"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                דחה
                              </button>
                            </div>
                          )}
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

      {/* Reject Modal */}
      {rejectTransferId && (
        <RejectModal
          transferId={rejectTransferId}
          isLoading={actionLoadingId === rejectTransferId}
          onReject={handleReject}
          onClose={() => setRejectTransferId(null)}
        />
      )}
    </div>
  )
}

// ─── Reject Modal ────────────────────────────────────────────────────────────

interface RejectModalProps {
  transferId: string
  isLoading: boolean
  onReject: (transferId: string, reason: string) => void
  onClose: () => void
}

function RejectModal({ transferId, isLoading, onReject, onClose }: RejectModalProps) {
  const [reason, setReason] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason.trim()) {
      setValidationError('יש לציין סיבה לדחייה')
      return
    }
    setValidationError(null)
    onReject(transferId, reason.trim())
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_PANEL} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">דחיית העברה</h3>
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
              placeholder="תאר את הסיבה לדחיית ההעברה..."
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>ביטול</button>
            <button type="submit" disabled={isLoading} className={BTN_DANGER}>
              {isLoading ? 'דוחה...' : 'דחה העברה'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
