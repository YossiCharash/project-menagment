import {motion} from 'framer-motion'
import {formatDate} from '../../../lib/utils'
import {UnforeseenTransaction as UnforeseenTransactionType} from '../../../types/api'
import {useState} from 'react'
import {FileText, X, Eye} from 'lucide-react'
import ConfirmationModal from '../../../components/ConfirmationModal'

interface UnforeseenTransaction {
    id: number
    description?: string | null
    transaction_date: string
    status: 'draft' | 'waiting_for_approval' | 'executed'
    profit_loss: number
    income_amount: number
    total_expenses: number
    notes?: string | null
    expenses: Array<{
        id: number
        amount: number
        description?: string | null
        document_id?: number | null
        document?: {
            file_path: string
        } | null
    }>
}

interface UnforeseenTransactionsModalProps {
    isOpen: boolean
    unforeseenTransactions: UnforeseenTransaction[]
    unforeseenTransactionsFilter: 'all' | 'draft' | 'waiting_for_approval' | 'executed'
    onClose: () => void
    onFilterChange: (filter: 'all' | 'draft' | 'waiting_for_approval' | 'executed') => void
    onExecuteTransaction: (txId: number) => Promise<void>
    onDeleteTransaction: (txId: number) => Promise<void>
    onEditTransaction: (tx: UnforeseenTransaction) => void
    onCreateNew: () => void
    onUpdateStatus?: (txId: number, status: 'draft' | 'waiting_for_approval' | 'executed') => Promise<void>
}

export default function UnforeseenTransactionsModal({
    isOpen,
    unforeseenTransactions,
    unforeseenTransactionsFilter,
    onClose,
    onFilterChange,
    onExecuteTransaction,
    onDeleteTransaction,
    onEditTransaction,
    onCreateNew,
    onUpdateStatus
}: UnforeseenTransactionsModalProps) {
    const [selectedTransaction, setSelectedTransaction] = useState<UnforeseenTransaction | null>(null)
    const [confirmationState, setConfirmationState] = useState<{
        isOpen: boolean
        title: string
        message: string
        onConfirm: () => void
        variant?: 'danger' | 'warning' | 'info'
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => {},
        variant: 'danger'
    })
    const [executeConfirmState, setExecuteConfirmState] = useState<{
        isOpen: boolean
        transactionId: number | null
    }>({
        isOpen: false,
        transactionId: null
    })
    
    if (!isOpen) return null

    const filteredTransactions = unforeseenTransactions.filter((tx) => {
        if (unforeseenTransactionsFilter === 'all') return true
        return tx.status === unforeseenTransactionsFilter
    })

    return (
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
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                            עסקאות לא צפויות
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {filteredTransactions.length} עסקאות
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>

                {/* Filter Buttons */}
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => onFilterChange('all')}
                            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                                unforeseenTransactionsFilter === 'all'
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                        >
                            הכל
                        </button>
                        <button
                            onClick={() => onFilterChange('draft')}
                            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                                unforeseenTransactionsFilter === 'draft'
                                    ? 'bg-gray-600 text-white'
                                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                        >
                            טיוטות
                        </button>
                        <button
                            onClick={() => onFilterChange('waiting_for_approval')}
                            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                                unforeseenTransactionsFilter === 'waiting_for_approval'
                                    ? 'bg-yellow-600 text-white'
                                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                        >
                            מחכות לאישור
                        </button>
                        <button
                            onClick={() => onFilterChange('executed')}
                            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                                unforeseenTransactionsFilter === 'executed'
                                    ? 'bg-green-600 text-white'
                                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                        >
                            בוצעו
                        </button>
                    </div>
                </div>

                {/* Content - Scrollable */}
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]" style={{ overscrollBehavior: 'contain' }}>
                    {filteredTransactions.length === 0 ? (
                        <div className="text-center py-16">
                            <svg
                                className="w-24 h-24 text-gray-300 dark:text-gray-600 mx-auto mb-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                            </svg>
                            <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                אין עסקאות לא צפויות
                            </h3>
                            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                                עדיין לא נוצרו עסקאות לא צפויות
                            </p>
                            <button
                                onClick={onCreateNew}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                            >
                                צור עסקה חדשה
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredTransactions.map((tx) => (
                                <div key={tx.id}
                                     className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:border-blue-400 dark:hover:border-blue-500 transition-all cursor-pointer group"
                                     onClick={(e) => {
                                         // Don't open details if clicking on buttons, inputs, or links
                                         const target = e.target as HTMLElement
                                         if (target.closest('button') || 
                                             target.closest('input') || 
                                             target.closest('label') ||
                                             target.closest('a')) {
                                             return
                                         }
                                         setSelectedTransaction(tx)
                                     }}>
                                    <div className="flex items-center justify-between mb-3" onClick={(e) => {
                                        const target = e.target as HTMLElement
                                        if (!target.closest('button') && !target.closest('input') && !target.closest('label')) {
                                            setSelectedTransaction(tx)
                                        }
                                    }}>
                                        <div className="flex items-center gap-3">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                                        {tx.description || `עסקה #${tx.id}`}
                                                    </span>
                                                    <span className={`px-2 py-1 rounded-full text-xs ${
                                                        tx.status === 'executed'
                                                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                                            : tx.status === 'waiting_for_approval'
                                                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                                                                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                                    }`}>
                                                        {tx.status === 'draft' && 'טיוטה'}
                                                        {tx.status === 'waiting_for_approval' && 'מחכה לאישור'}
                                                        {tx.status === 'executed' && 'בוצע'}
                                                    </span>
                                                </div>
                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                    {formatDate(tx.transaction_date)}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className={`text-lg font-bold ${
                                                tx.profit_loss >= 0
                                                    ? 'text-green-600 dark:text-green-400'
                                                    : 'text-red-600 dark:text-red-400'
                                            }`}>
                                                {tx.profit_loss >= 0 ? '+' : ''}{tx.profit_loss.toLocaleString('he-IL')} ₪
                                            </span>
                                            <Eye className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 mb-3">
                                        <div>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">הכנסה: </span>
                                            <span className="text-sm font-medium text-green-600 dark:text-green-400">
                                                {tx.income_amount.toLocaleString('he-IL')} ₪
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">הוצאות: </span>
                                            <span className="text-sm font-medium text-red-600 dark:text-red-400">
                                                {tx.total_expenses.toLocaleString('he-IL')} ₪
                                            </span>
                                        </div>
                                    </div>

                                    {tx.notes && (
                                        <div className="mb-2">
                                            <span className="text-xs text-gray-500 dark:text-gray-400">הערות: </span>
                                            <span className="text-sm text-gray-700 dark:text-gray-300">{tx.notes}</span>
                                        </div>
                                    )}

                                    <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex-wrap" onClick={(e) => e.stopPropagation()}>
                                        {/* כפתור עריכה - תמיד מופיע */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                onEditTransaction(tx)
                                            }}
                                            className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
                                        >
                                            צפה/ערוך
                                        </button>

                                        {/* כפתורים לטיוטה */}
                                        {tx.status === 'draft' && (
                                            <>
                                                {onUpdateStatus && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setConfirmationState({
                                                                isOpen: true,
                                                                title: 'העברת עסקה לממתין לאישור',
                                                                message: 'האם אתה בטוח שברצונך להעביר עסקה זו לממתין לאישור?',
                                                                variant: 'warning',
                                                                onConfirm: async () => {
                                                                    setConfirmationState(prev => ({...prev, isOpen: false}))
                                                                    await onUpdateStatus(tx.id, 'waiting_for_approval')
                                                                }
                                                            })
                                                        }}
                                                        className="px-3 py-1.5 text-xs bg-yellow-600 text-white rounded hover:bg-yellow-700"
                                                    >
                                                        תעביר לממתין לאישור
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setExecuteConfirmState({ isOpen: true, transactionId: tx.id })
                                                    }}
                                                    className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                                                >
                                                    בצע
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setConfirmationState({
                                                            isOpen: true,
                                                            title: 'מחיקת עסקה',
                                                            message: 'האם אתה בטוח שברצונך למחוק עסקה זו?',
                                                            variant: 'danger',
                                                            onConfirm: async () => {
                                                                setConfirmationState(prev => ({...prev, isOpen: false}))
                                                                await onDeleteTransaction(tx.id)
                                                            }
                                                        })
                                                    }}
                                                    className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                                >
                                                    מחק
                                                </button>
                                            </>
                                        )}

                                        {/* כפתורים לממתין לאישור */}
                                        {tx.status === 'waiting_for_approval' && (
                                            <>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setExecuteConfirmState({ isOpen: true, transactionId: tx.id })
                                                    }}
                                                    className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                                                >
                                                    בצע
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setConfirmationState({
                                                            isOpen: true,
                                                            title: 'מחיקת עסקה',
                                                            message: 'האם אתה בטוח שברצונך למחוק עסקה זו?',
                                                            variant: 'danger',
                                                            onConfirm: async () => {
                                                                setConfirmationState(prev => ({...prev, isOpen: false}))
                                                                await onDeleteTransaction(tx.id)
                                                            }
                                                        })
                                                    }}
                                                    className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                                >
                                                    מחק
                                                </button>
                                            </>
                                        )}

                                        {/* כפתורים לבוצע */}
                                        {tx.status === 'executed' && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setConfirmationState({
                                                        isOpen: true,
                                                        title: 'מחיקת עסקה',
                                                        message: 'האם אתה בטוח שברצונך למחוק עסקה זו? זה ימחק גם את העסקה הרגילה שנוצרה בפרויקט כתוצאה מביצוע העסקה.',
                                                        variant: 'danger',
                                                        onConfirm: async () => {
                                                            setConfirmationState(prev => ({...prev, isOpen: false}))
                                                            await onDeleteTransaction(tx.id)
                                                        }
                                                    })
                                                }}
                                                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                            >
                                                מחק
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Transaction Details Modal */}
            {selectedTransaction && (
                <motion.div
                    initial={{opacity: 0}}
                    animate={{opacity: 1}}
                    exit={{opacity: 0}}
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
                    onClick={() => setSelectedTransaction(null)}
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
                                    {selectedTransaction.description || `עסקה #${selectedTransaction.id}`}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedTransaction(null)}
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
                                            selectedTransaction.status === 'executed'
                                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                                : selectedTransaction.status === 'waiting_for_approval'
                                                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                                                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                        }`}>
                                            {selectedTransaction.status === 'draft' && 'טיוטה'}
                                            {selectedTransaction.status === 'waiting_for_approval' && 'מחכה לאישור'}
                                            {selectedTransaction.status === 'executed' && 'בוצע'}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-sm text-gray-500 dark:text-gray-400">תאריך:</span>
                                        <span className="ml-2 text-sm font-medium text-gray-900 dark:text-white">
                                            {formatDate(selectedTransaction.transaction_date)}
                                        </span>
                                    </div>
                                </div>

                                {/* Financial Summary */}
                                <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                                    <div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">הכנסה</p>
                                        <p className="text-xl font-bold text-green-600 dark:text-green-400">
                                            ₪{selectedTransaction.income_amount.toLocaleString('he-IL')}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">הוצאות</p>
                                        <p className="text-xl font-bold text-red-600 dark:text-red-400">
                                            ₪{selectedTransaction.total_expenses.toLocaleString('he-IL')}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">רווח/הפסד</p>
                                        <p className={`text-xl font-bold ${
                                            selectedTransaction.profit_loss >= 0
                                                ? 'text-green-600 dark:text-green-400'
                                                : 'text-red-600 dark:text-red-400'
                                        }`}>
                                            {selectedTransaction.profit_loss >= 0 ? '+' : ''}₪{selectedTransaction.profit_loss.toLocaleString('he-IL')}
                                        </p>
                                    </div>
                                </div>

                                {/* Description */}
                                {selectedTransaction.description && (
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">תיאור:</h4>
                                        <p className="text-gray-900 dark:text-white">{selectedTransaction.description}</p>
                                    </div>
                                )}

                                {/* Notes */}
                                {selectedTransaction.notes && (
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">הערות:</h4>
                                        <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{selectedTransaction.notes}</p>
                                    </div>
                                )}

                                {/* Expenses */}
                                {selectedTransaction.expenses && selectedTransaction.expenses.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">הוצאות:</h4>
                                        <div className="space-y-2">
                                            {selectedTransaction.expenses.map((exp) => (
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
                                                            onClick={(e) => e.stopPropagation()}
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
                                <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                                    <button
                                        onClick={() => {
                                            setSelectedTransaction(null)
                                            onEditTransaction(selectedTransaction)
                                        }}
                                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                                    >
                                        ערוך
                                    </button>
                                    <button
                                        onClick={() => setSelectedTransaction(null)}
                                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        סגור
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}

            {/* Confirmation Modal */}
            <ConfirmationModal
                isOpen={confirmationState.isOpen}
                onClose={() => setConfirmationState(prev => ({...prev, isOpen: false}))}
                onConfirm={confirmationState.onConfirm}
                title={confirmationState.title}
                message={confirmationState.message}
                variant={confirmationState.variant}
                confirmText="אישור"
                cancelText="ביטול"
            />

            <ConfirmationModal
                isOpen={executeConfirmState.isOpen}
                onClose={() => setExecuteConfirmState({ isOpen: false, transactionId: null })}
                onConfirm={async () => {
                    if (executeConfirmState.transactionId) {
                        await onExecuteTransaction(executeConfirmState.transactionId)
                        setExecuteConfirmState({ isOpen: false, transactionId: null })
                    }
                }}
                title="ביצוע עסקה"
                message="האם אתה בטוח שברצונך לבצע את העסקה?"
                variant="warning"
                confirmText="בצע"
                cancelText="ביטול"
            />
        </motion.div>
    )
}
