import { motion } from 'framer-motion'
import { formatDate } from '../../../lib/utils'
import { UnforeseenTransaction } from '../../../types/api'
import { useState } from 'react'
import { FileText, X, Edit, Trash2 } from 'lucide-react'
import { UnforeseenTransactionAPI } from '../../../lib/apiClient'
import ConfirmationModal from '../../../components/ConfirmationModal'
import DocumentViewerModal from '../../../components/DocumentViewerModal'
import ToastNotification, { useToast } from '../../../components/ToastNotification'

interface UnforeseenTransactionDetailsModalProps {
    isOpen: boolean
    transaction: UnforeseenTransaction | null
    onClose: () => void
    onEdit: (tx: UnforeseenTransaction) => void
    onDelete: (txId: number) => Promise<void>
    onStatusChange?: (executeResult?: any, unforeseenTx?: any) => Promise<void>
    /** מצב צפייה בלבד (מהרשימת העסקאות) – ללא כפתורי עריכה/מחיקה/שינוי סטטוס */
    readOnly?: boolean
}

export default function UnforeseenTransactionDetailsModal({
    isOpen,
    transaction,
    onClose,
    onEdit,
    onDelete,
    onStatusChange,
    readOnly = false
}: UnforeseenTransactionDetailsModalProps) {
    const [updatingStatus, setUpdatingStatus] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showStatusConfirm, setShowStatusConfirm] = useState(false)
    const [showExecuteConfirm, setShowExecuteConfirm] = useState(false)
    const [selectedDocForView, setSelectedDocForView] = useState<{ file_path: string; description?: string | null } | null>(null)
    const { toast, showToast, hideToast } = useToast()

    if (!isOpen || !transaction) return null

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'draft':
                return 'טיוטה'
            case 'waiting_for_approval':
                return 'מחכה לאישור'
            case 'executed':
                return 'בוצע'
            default:
                return status
        }
    }

    const handleUpdateStatus = async (newStatus: 'draft' | 'waiting_for_approval' | 'executed') => {
        if (!transaction) return
        setUpdatingStatus(true)
        try {
            let executeResult = null
            // If moving to executed, use the execute endpoint instead
            if (newStatus === 'executed') {
                executeResult = await UnforeseenTransactionAPI.executeUnforeseenTransaction(transaction.id)
            } else {
                await UnforeseenTransactionAPI.updateUnforeseenTransaction(transaction.id, { status: newStatus })
            }
            if (onStatusChange) {
                await onStatusChange(executeResult, transaction)
            }
            // Close modal after successful status update
            onClose()
        } catch (err: any) {
            showToast(err.response?.data?.detail || 'שגיאה בעדכון הסטטוס', 'error')
        } finally {
            setUpdatingStatus(false)
        }
    }

    const handleExecute = async () => {
        if (!transaction) return
        setShowExecuteConfirm(false)
        setUpdatingStatus(true)
        try {
            const executeResult = await UnforeseenTransactionAPI.executeUnforeseenTransaction(transaction.id)
            if (onStatusChange) {
                await onStatusChange(executeResult, transaction)
            }
            // Close modal after successful execution
            onClose()
        } catch (err: any) {
            showToast(err.response?.data?.detail || 'שגיאה בביצוע העסקה', 'error')
        } finally {
            setUpdatingStatus(false)
        }
    }

    const handleDelete = async () => {
        if (!transaction) return
        setShowDeleteConfirm(true)
    }

    const confirmDelete = async () => {
        if (!transaction) return
        setShowDeleteConfirm(false)
        await onDelete(transaction.id)
        if (onStatusChange) {
            await onStatusChange()
        }
        onClose()
    }

    return (
        <>
        <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{opacity: 0, scale: 0.95}}
                animate={{opacity: 1, scale: 1}}
                exit={{opacity: 0, scale: 0.95}}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header – קומפקטי: כותרת + סטטוס + תאריך + סגירה */}
                <div className="flex items-center justify-between gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                            פרטי עסקה לא צפויה
                        </h3>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${
                                transaction.status === 'executed'
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                    : transaction.status === 'waiting_for_approval'
                                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                            }`}>
                                {getStatusLabel(transaction.status)}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                {formatDate(transaction.transaction_date)}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors shrink-0"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content – גלילה, ריווח קטן */}
                <div className="p-4 overflow-y-auto max-h-[calc(85vh-140px)]">
                    <div className="space-y-4">
                        {/* סיכום כספי – שורה אחת קומפקטית */}
                        <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                            <div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">הכנסה</p>
                                <p className="text-base font-bold text-green-600 dark:text-green-400">
                                    ₪{(transaction.total_incomes ?? transaction.income_amount ?? 0).toLocaleString('he-IL')}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">הוצאות</p>
                                <p className="text-base font-bold text-red-600 dark:text-red-400">
                                    ₪{transaction.total_expenses.toLocaleString('he-IL')}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">רווח/הפסד</p>
                                <p className={`text-base font-bold ${
                                    transaction.profit_loss >= 0
                                        ? 'text-green-600 dark:text-green-400'
                                        : 'text-red-600 dark:text-red-400'
                                }`}>
                                    {transaction.profit_loss >= 0 ? '+' : ''}₪{transaction.profit_loss.toLocaleString('he-IL')}
                                </p>
                            </div>
                        </div>

                        {/* מסמכי העסקה – חלוקה להכנסות והוצאות */}
                        <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                <FileText className="w-4 h-4" />
                                מסמכי העסקה
                            </h4>
                            {/* מסמכי הוצאות */}
                            <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-900/20 overflow-hidden">
                                <div className="px-3 py-2 bg-red-100 dark:bg-red-900/40 border-b border-red-200 dark:border-red-800">
                                    <span className="text-sm font-medium text-red-800 dark:text-red-300">מסמכי הוצאות</span>
                                </div>
                                <div className="p-3 space-y-2">
                                    {transaction.expenses && transaction.expenses.length > 0 &&
                                        transaction.expenses.map((exp) => {
                                            const docs = exp.documents ?? []
                                            if (docs.length === 0) return null
                                            return (
                                                <div key={exp.id} className="space-y-1.5">
                                                    <span className="text-xs text-gray-600 dark:text-gray-400">
                                                        הוצאה ₪{exp.amount.toLocaleString('he-IL')}
                                                        {exp.description ? ` · ${exp.description}` : ''}
                                                    </span>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {docs.map((doc: { id: number; file_path: string; description?: string | null }, docIdx: number) => (
                                                            <button
                                                                key={doc.id}
                                                                type="button"
                                                                onClick={() => setSelectedDocForView(doc)}
                                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 text-xs font-medium transition-colors"
                                                                title={doc.description || `מסמך ${docIdx + 1}`}
                                                            >
                                                                <FileText className="w-3.5 h-3.5 shrink-0" />
                                                                <span>{doc.description || `מסמך ${docIdx + 1}`}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        })
                                    }
                                    {(!transaction.expenses?.length || transaction.expenses.every((e) => !(e.documents?.length))) && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400">אין מסמכי הוצאות</p>
                                    )}
                                </div>
                            </div>
                            {/* מסמכי הכנסות */}
                            <div className="rounded-lg border border-green-200 dark:border-green-900/50 bg-green-50/50 dark:bg-green-900/20 overflow-hidden">
                                <div className="px-3 py-2 bg-green-100 dark:bg-green-900/40 border-b border-green-200 dark:border-green-800">
                                    <span className="text-sm font-medium text-green-800 dark:text-green-300">מסמכי הכנסות</span>
                                </div>
                                <div className="p-3 space-y-2">
                                    {transaction.incomes && transaction.incomes.length > 0 &&
                                        transaction.incomes.map((inc) => {
                                            const docs = inc.documents ?? []
                                            if (docs.length === 0) return null
                                            return (
                                                <div key={inc.id} className="space-y-1.5">
                                                    <span className="text-xs text-gray-600 dark:text-gray-400">
                                                        הכנסה ₪{inc.amount.toLocaleString('he-IL')}
                                                        {inc.description ? ` · ${inc.description}` : ''}
                                                    </span>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {docs.map((doc: { id: number; file_path: string; description?: string | null }, docIdx: number) => (
                                                            <button
                                                                key={doc.id}
                                                                type="button"
                                                                onClick={() => setSelectedDocForView(doc)}
                                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white dark:bg-gray-800 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/30 text-xs font-medium transition-colors"
                                                                title={doc.description || `מסמך ${docIdx + 1}`}
                                                            >
                                                                <FileText className="w-3.5 h-3.5 shrink-0" />
                                                                <span>{doc.description || `מסמך ${docIdx + 1}`}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        })
                                    }
                                    {(!transaction.incomes?.length || transaction.incomes.every((i) => !(i.documents?.length))) && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400">אין מסמכי הכנסות</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* תיאור + הערות – בלוק אחד קומפקטי */}
                        {(transaction.description || transaction.notes) && (
                            <div className="space-y-2">
                                {transaction.description && (
                                    <div>
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">תיאור: </span>
                                        <span className="text-sm text-gray-900 dark:text-white">{transaction.description}</span>
                                    </div>
                                )}
                                {transaction.notes && (
                                    <div>
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">הערות: </span>
                                        <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap mt-0.5">{transaction.notes}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* הוצאות – קומפקטי */}
                        {transaction.expenses && transaction.expenses.length > 0 && (
                            <div>
                                <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">הוצאות</h4>
                                <div className="space-y-2">
                                    {transaction.expenses.map((exp) => {
                                        const docs = exp.documents ?? []
                                        return (
                                            <div
                                                key={exp.id}
                                                className="flex items-center justify-between gap-2 py-2 px-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200/80 dark:border-gray-600/80"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <span className="font-medium text-gray-900 dark:text-white text-sm">
                                                        ₪{exp.amount.toLocaleString('he-IL')}
                                                    </span>
                                                    {exp.description && (
                                                        <span className="text-xs text-gray-600 dark:text-gray-400 mr-1"> · {exp.description}</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    {docs.length > 0 ? (
                                                        docs.map((doc: { id: number; file_path: string; description?: string | null }, docIdx: number) => (
                                                            <button
                                                                key={doc.id}
                                                                type="button"
                                                                onClick={() => setSelectedDocForView(doc)}
                                                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-xs font-medium transition-colors"
                                                                title={`צפה במסמך ${docIdx + 1}`}
                                                            >
                                                                <FileText className="w-3.5 h-3.5 shrink-0" />
                                                                <span>מסמך {docIdx + 1}</span>
                                                            </button>
                                                        ))
                                                    ) : (
                                                        <span className="text-xs text-gray-500 dark:text-gray-400">אין מסמכים</span>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* הכנסות – קומפקטי */}
                        {transaction.incomes && transaction.incomes.length > 0 && (
                            <div>
                                <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">הכנסות</h4>
                                <div className="space-y-2">
                                    {transaction.incomes.map((inc) => {
                                        const docs = inc.documents ?? []
                                        return (
                                            <div
                                                key={inc.id}
                                                className="flex items-center justify-between gap-2 py-2 px-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200/80 dark:border-gray-600/80"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <span className="font-medium text-gray-900 dark:text-white text-sm">
                                                        ₪{inc.amount.toLocaleString('he-IL')}
                                                    </span>
                                                    {inc.description && (
                                                        <span className="text-xs text-gray-600 dark:text-gray-400 mr-1"> · {inc.description}</span>
                                                    )}
                                                </div>
                                                <div className="shrink-0">
                                                    {docs.length > 0 ? (
                                                        <div className="flex items-center gap-1">
                                                            {docs.map((doc: { id: number; file_path: string; description?: string | null }, docIdx: number) => (
                                                                <button
                                                                    key={doc.id}
                                                                    type="button"
                                                                    onClick={() => setSelectedDocForView(doc)}
                                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-xs font-medium transition-colors"
                                                                    title={`צפה במסמך ${docIdx + 1}`}
                                                                >
                                                                    <FileText className="w-3.5 h-3.5 shrink-0" />
                                                                    <span>מסמך {docIdx + 1}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-gray-500 dark:text-gray-400">אין מסמכים</span>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        {!readOnly && (
                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700 flex-wrap">
                            {/* Edit Button */}
                            <button
                                onClick={() => {
                                    onClose()
                                    onEdit(transaction)
                                }}
                                className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-1.5"
                            >
                                <Edit className="w-3.5 h-3.5" />
                                צפה/ערוך
                            </button>

                            {/* Status Change Options for Draft */}
                            {transaction.status === 'draft' && (
                                <>
                                    <button
                                        onClick={() => {
                                            setShowStatusConfirm(true)
                                        }}
                                        disabled={updatingStatus}
                                        className="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors disabled:opacity-50"
                                    >
                                        תעביר לממתין לאישור
                                    </button>
                                    <button
                                        onClick={() => setShowExecuteConfirm(true)}
                                        disabled={updatingStatus}
                                        className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                    >
                                        אשר כבוצע
                                    </button>
                                </>
                            )}

                            {/* Status Change Options for Waiting for Approval */}
                            {transaction.status === 'waiting_for_approval' && (
                                <button
                                    onClick={() => setShowExecuteConfirm(true)}
                                    disabled={updatingStatus}
                                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                >
                                    אשר כבוצע
                                </button>
                            )}

                            {/* Delete Button */}
                            <button
                                onClick={handleDelete}
                                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1.5"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                מחק
                            </button>
                        </div>
                        )}
                        {readOnly && (
                        <div className="flex items-center justify-end pt-3 border-t border-gray-200 dark:border-gray-700">
                            <button
                                onClick={onClose}
                                className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                            >
                                סגור
                            </button>
                        </div>
                        )}
                        </div>
                    </div>
                </motion.div>
            </motion.div>

            {/* Confirmation Modals */}
            <ConfirmationModal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={confirmDelete}
                title="מחיקת עסקה"
                message="האם אתה בטוח שברצונך למחוק עסקה זו?"
                variant="danger"
                confirmText="מחק"
                cancelText="ביטול"
            />

            <ConfirmationModal
                isOpen={showStatusConfirm}
                onClose={() => setShowStatusConfirm(false)}
                onConfirm={async () => {
                    setShowStatusConfirm(false)
                    await handleUpdateStatus('waiting_for_approval')
                }}
                title="העברת עסקה לממתין לאישור"
                message="האם אתה בטוח שברצונך להעביר עסקה זו לממתין לאישור?"
                variant="warning"
                confirmText="אישור"
                cancelText="ביטול"
                loading={updatingStatus}
            />

            <ConfirmationModal
                isOpen={showExecuteConfirm}
                onClose={() => setShowExecuteConfirm(false)}
                onConfirm={handleExecute}
                title="אישור כבוצע"
                message="האם אתה בטוח שברצונך לאשר ולבצע את העסקה?"
                variant="warning"
                confirmText="אשר כבוצע"
                cancelText="ביטול"
                loading={updatingStatus}
            />

            <DocumentViewerModal
                isOpen={!!selectedDocForView}
                document={selectedDocForView}
                onClose={() => setSelectedDocForView(null)}
            />

            {/* Toast Notification */}
            <ToastNotification toast={toast} onClose={hideToast} />
        </>
        )
    }
