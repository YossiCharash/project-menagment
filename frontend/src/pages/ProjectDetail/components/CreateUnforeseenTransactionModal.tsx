import {motion} from 'framer-motion'
import {Plus, X, Upload} from 'lucide-react'
import {useState} from 'react'
import ConfirmationModal from '../../../components/ConfirmationModal'

interface UnforeseenExpense {
    amount: number
    description: string
    documentFile: File | null
    expenseId: number | null
    documentId: number | null
}

interface UnforeseenTransaction {
    id: number
    status: 'draft' | 'waiting_for_approval' | 'executed'
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

interface CreateUnforeseenTransactionModalProps {
    isOpen: boolean
    editingUnforeseenTransaction: UnforeseenTransaction | null
    unforeseenIncomeAmount: number
    unforeseenDescription: string
    unforeseenNotes: string
    unforeseenTransactionDate: string
    unforeseenExpenses: UnforeseenExpense[]
    unforeseenSubmitting: boolean
    uploadingDocumentForExpense: number | null
    onClose: () => void
    onIncomeAmountChange: (amount: number) => void
    onDescriptionChange: (description: string) => void
    onNotesChange: (notes: string) => void
    onTransactionDateChange: (date: string) => void
    onAddExpense: () => void
    onRemoveExpense: (index: number) => void
    onExpenseChange: (index: number, field: 'amount' | 'description', value: string | number) => void
    onExpenseDocumentChange: (index: number, file: File | null) => void
    onSaveAsDraft: () => void
    onSaveAsWaitingForApproval: () => void
    onSaveAndExecute: () => void
    onUpdate: () => void
    onDelete: () => void
    onExecute: () => void
    calculateTotalExpenses: () => number
    calculateProfitLoss: () => number
}

export default function CreateUnforeseenTransactionModal({
    isOpen,
    editingUnforeseenTransaction,
    unforeseenIncomeAmount,
    unforeseenDescription,
    unforeseenNotes,
    unforeseenTransactionDate,
    unforeseenExpenses,
    unforeseenSubmitting,
    uploadingDocumentForExpense,
    onClose,
    onIncomeAmountChange,
    onDescriptionChange,
    onNotesChange,
    onTransactionDateChange,
    onAddExpense,
    onRemoveExpense,
    onExpenseChange,
    onExpenseDocumentChange,
    onSaveAsDraft,
    onSaveAsWaitingForApproval,
    onSaveAndExecute,
    onUpdate,
    onDelete,
    onExecute,
    calculateTotalExpenses,
    calculateProfitLoss
}: CreateUnforeseenTransactionModalProps) {
    const [showExecuteConfirm, setShowExecuteConfirm] = useState(false)
    
    if (!isOpen) return null

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
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {editingUnforeseenTransaction ? 'ערוך עסקה לא צפויה' : 'עסקה לא צפויה חדשה'}
                    </h3>
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

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
                    {editingUnforeseenTransaction && editingUnforeseenTransaction.status === 'executed' && (
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg mb-4">
                            <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                ⚠️ עסקה זו כבר בוצעה. ניתן לערוך את הפרטים, אך לא ניתן לשנות את הסטטוס.
                            </p>
                        </div>
                    )}
                    <div className="space-y-4">
                        {/* הוצאות - ראשון */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    הוצאות
                                </label>
                                <button
                                    type="button"
                                    onClick={onAddExpense}
                                    className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1"
                                >
                                    <Plus className="w-4 h-4"/>
                                    הוסף הוצאה
                                </button>
                            </div>
                            <div className="space-y-3">
                                {unforeseenExpenses.map((exp, index) => {
                                    const originalExpense = editingUnforeseenTransaction?.expenses?.find((e: any) => e.id === exp.expenseId) || editingUnforeseenTransaction?.expenses?.[index]

                                    return (
                                        <div key={index}
                                             className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    placeholder="סכום הוצאה"
                                                    value={exp.amount}
                                                    onChange={(e) => onExpenseChange(index, 'amount', parseFloat(e.target.value) || 0)}
                                                    onWheel={(e) => e.currentTarget.blur()}
                                                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                />
                                                {unforeseenExpenses.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onRemoveExpense(index)}
                                                        className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900 rounded-lg"
                                                    >
                                                        <X className="w-5 h-5"/>
                                                    </button>
                                                )}
                                            </div>
                                            <input
                                                type="text"
                                                placeholder="תיאור הוצאה"
                                                value={exp.description}
                                                onChange={(e) => onExpenseChange(index, 'description', e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            />
                                            <div className="flex items-center gap-2">
                                                <label className="flex-1">
                                                    <input
                                                        type="file"
                                                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0] || null
                                                            onExpenseDocumentChange(index, file)
                                                        }}
                                                        className="hidden"
                                                        id={`expense-doc-${index}`}
                                                    />
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => document.getElementById(`expense-doc-${index}`)?.click()}
                                                            className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-1"
                                                        >
                                                            <Upload className="w-4 h-4"/>
                                                            {exp.documentFile ? exp.documentFile.name : 'העלה מסמך'}
                                                        </button>
                                                        {exp.documentFile && (
                                                            <span className="text-xs text-green-600 dark:text-green-400">✓</span>
                                                        )}
                                                        {editingUnforeseenTransaction && originalExpense?.document && !exp.documentFile && (
                                                            <a
                                                                href={originalExpense.document.file_path}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                                            >
                                                                צפה במסמך קיים
                                                            </a>
                                                        )}
                                                        {uploadingDocumentForExpense === originalExpense?.id && (
                                                            <span className="text-xs text-gray-500 dark:text-gray-400">מעלה...</span>
                                                        )}
                                                    </div>
                                                </label>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* הכנסה - שני */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                הכנסה (מה שגובה מהפרויקט)
                            </label>
                            <input
                                type="number"
                                step="any"
                                value={unforeseenIncomeAmount}
                                onChange={(e) => {
                                    const value = e.target.value === '' ? 0 : Number(e.target.value)
                                    onIncomeAmountChange(isNaN(value) ? 0 : value)
                                }}
                                onWheel={(e) => e.currentTarget.blur()}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>

                        {/* תאריך - שלישי */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                תאריך עסקה
                            </label>
                            <input
                                type="date"
                                value={unforeseenTransactionDate}
                                onChange={(e) => onTransactionDateChange(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                תיאור
                            </label>
                            <input
                                type="text"
                                value={unforeseenDescription}
                                onChange={(e) => onDescriptionChange(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                הערות
                            </label>
                            <textarea
                                value={unforeseenNotes}
                                onChange={(e) => onNotesChange(e.target.value)}
                                rows={3}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>

                        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm text-gray-600 dark:text-gray-400">סה"כ הוצאות:</span>
                                <span className="font-semibold text-red-600 dark:text-red-400">
                                    ₪{calculateTotalExpenses().toLocaleString('he-IL')}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600 dark:text-gray-400">רווח/הפסד:</span>
                                <span className={`font-semibold ${
                                    calculateProfitLoss() >= 0
                                        ? 'text-green-600 dark:text-green-400'
                                        : 'text-red-600 dark:text-red-400'
                                }`}>
                                    ₪{calculateProfitLoss().toLocaleString('he-IL')}
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 pt-4">
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                    ביטול
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 justify-end">
                                {editingUnforeseenTransaction && editingUnforeseenTransaction.status === 'executed' ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={onUpdate}
                                            disabled={unforeseenSubmitting}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                        >
                                            {unforeseenSubmitting ? 'מעדכן...' : 'עדכן'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={onDelete}
                                            disabled={unforeseenSubmitting}
                                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                                        >
                                            {unforeseenSubmitting ? 'מוחק...' : 'מחק'}
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={onSaveAsDraft}
                                            disabled={unforeseenSubmitting}
                                            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
                                        >
                                            {unforeseenSubmitting ? 'שומר...' : 'שמור כטיוטה'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={onSaveAsWaitingForApproval}
                                            disabled={unforeseenSubmitting}
                                            className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
                                        >
                                            {unforeseenSubmitting ? 'שומר...' : 'שמור כמחכה לאישור'}
                                        </button>
                                        {!editingUnforeseenTransaction && (
                                            <button
                                                type="button"
                                                onClick={onSaveAndExecute}
                                                disabled={unforeseenSubmitting}
                                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                                            >
                                                {unforeseenSubmitting ? 'מבצע...' : 'בצע מיד'}
                                            </button>
                                        )}
                                        {editingUnforeseenTransaction && (editingUnforeseenTransaction.status === 'waiting_for_approval' || editingUnforeseenTransaction.status === 'draft') && (
                                            <button
                                                type="button"
                                                onClick={() => setShowExecuteConfirm(true)}
                                                disabled={unforeseenSubmitting}
                                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                                            >
                                                {unforeseenSubmitting ? 'מבצע...' : 'בצע'}
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>

            <ConfirmationModal
                isOpen={showExecuteConfirm}
                onClose={() => setShowExecuteConfirm(false)}
                onConfirm={() => {
                    setShowExecuteConfirm(false)
                    onExecute()
                }}
                title="ביצוע עסקה"
                message="האם אתה בטוח שברצונך לבצע את העסקה?"
                variant="warning"
                confirmText="בצע"
                cancelText="ביטול"
                loading={unforeseenSubmitting}
            />
        </motion.div>
    )
}
