import { motion } from 'framer-motion'
import { formatDate } from '../../../lib/utils'
import { UnforeseenTransaction } from '../../../types/api'
import { useState } from 'react'
import { FileText, X, Edit, Trash2 } from 'lucide-react'
import { UnforeseenTransactionAPI } from '../../../lib/apiClient'
import ConfirmationModal from '../../../components/ConfirmationModal'
import ToastNotification, { useToast } from '../../../components/ToastNotification'

interface UnforeseenTransactionDetailsModalProps {
    isOpen: boolean
    transaction: UnforeseenTransaction | null
    onClose: () => void
    onEdit: (tx: UnforeseenTransaction) => void
    onDelete: (txId: number) => Promise<void>
    onStatusChange?: (executeResult?: any, unforeseenTx?: any) => Promise<void>
}

export default function UnforeseenTransactionDetailsModal({
    isOpen,
    transaction,
    onClose,
    onEdit,
    onDelete,
    onStatusChange
}: UnforeseenTransactionDetailsModalProps) {
    const [updatingStatus, setUpdatingStatus] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showStatusConfirm, setShowStatusConfirm] = useState(false)
    const [showExecuteConfirm, setShowExecuteConfirm] = useState(false)
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
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex-1">
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                            פרטי עסקה לא צפויה
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {transaction.description || `עסקה #${transaction.id}`}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content - Scrollable */}
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
                    <div className="space-y-6">
                        {/* Status and Date */}
                        <div className="flex items-center gap-4">
                            <div>
                                <span className="text-sm text-gray-500 dark:text-gray-400">סטטוס:</span>
                                <span className={`ml-2 px-3 py-1 rounded-full text-sm ${
                                    transaction.status === 'executed'
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                        : transaction.status === 'waiting_for_approval'
                                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                }`}>
                                    {getStatusLabel(transaction.status)}
                                </span>
                            </div>
                            <div>
                                <span className="text-sm text-gray-500 dark:text-gray-400">תאריך:</span>
                                <span className="ml-2 text-sm font-medium text-gray-900 dark:text-white">
                                    {formatDate(transaction.transaction_date)}
                                </span>
                            </div>
                        </div>

                        {/* Financial Summary */}
                        <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                            <div>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">הכנסה</p>
                                <p className="text-xl font-bold text-green-600 dark:text-green-400">
                                    ₪{transaction.income_amount.toLocaleString('he-IL')}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">הוצאות</p>
                                <p className="text-xl font-bold text-red-600 dark:text-red-400">
                                    ₪{transaction.total_expenses.toLocaleString('he-IL')}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">רווח/הפסד</p>
                                <p className={`text-xl font-bold ${
                                    transaction.profit_loss >= 0
                                        ? 'text-green-600 dark:text-green-400'
                                        : 'text-red-600 dark:text-red-400'
                                }`}>
                                    {transaction.profit_loss >= 0 ? '+' : ''}₪{transaction.profit_loss.toLocaleString('he-IL')}
                                </p>
                            </div>
                        </div>

                        {/* Description */}
                        {transaction.description && (
                            <div>
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">תיאור:</h4>
                                <p className="text-gray-900 dark:text-white">{transaction.description}</p>
                            </div>
                        )}

                        {/* Notes */}
                        {transaction.notes && (
                            <div>
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">הערות:</h4>
                                <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{transaction.notes}</p>
                            </div>
                        )}

                        {/* Expenses */}
                        {transaction.expenses && transaction.expenses.length > 0 && (
                            <div>
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">הוצאות:</h4>
                                <div className="space-y-2">
                                    {transaction.expenses.map((exp) => (
                                        <div
                                            key={exp.id}
                                            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                                        >
                                            <div className="flex-1">
                                                <p className="font-medium text-gray-900 dark:text-white">
                                                    ₪{exp.amount.toLocaleString('he-IL')}
                                                </p>
                                                {exp.description && (
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                                        {exp.description}
                                                    </p>
                                                )}
                                            </div>
                                            {exp.document && (
                                                <a
                                                    href={exp.document.file_path}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="ml-4 p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                                                >
                                                    <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                                </a>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700 flex-wrap">
                            {/* Edit Button */}
                            <button
                                onClick={() => {
                                    onClose()
                                    onEdit(transaction)
                                }}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                            >
                                <Edit className="w-4 h-4" />
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
                                        className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors disabled:opacity-50"
                                    >
                                        תעביר לממתין לאישור
                                    </button>
                                    <button
                                        onClick={() => setShowExecuteConfirm(true)}
                                        disabled={updatingStatus}
                                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                                    >
                                        בצע
                                    </button>
                                </>
                            )}

                            {/* Status Change Options for Waiting for Approval */}
                            {transaction.status === 'waiting_for_approval' && (
                                <button
                                    onClick={() => setShowExecuteConfirm(true)}
                                    disabled={updatingStatus}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    בצע
                                </button>
                            )}

                            {/* Delete Button */}
                            <button
                                onClick={handleDelete}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                מחק
                            </button>
                        </div>
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
                title="ביצוע עסקה"
                message="האם אתה בטוח שברצונך לבצע את העסקה?"
                variant="warning"
                confirmText="בצע"
                cancelText="ביטול"
                loading={updatingStatus}
            />

            {/* Toast Notification */}
            <ToastNotification toast={toast} onClose={hideToast} />
        </>
        )
    }
