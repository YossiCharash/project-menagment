import {motion} from 'framer-motion'
import {Plus, X, Upload, Calendar, TrendingDown, TrendingUp, FileText, StickyNote, Eye, ChevronDown, ChevronUp} from 'lucide-react'
import {useState, useEffect} from 'react'
import ConfirmationModal from '../../../components/ConfirmationModal'
import DocumentViewerModal from '../../../components/DocumentViewerModal'

interface UnforeseenItem {
    amount: number
    description: string
    documentFiles: File[]
    id?: number | null
    expenseId?: number | null
    incomeId?: number | null
    documentIds: number[]
}

interface UnforeseenTransaction {
    id: number
    status: 'draft' | 'waiting_for_approval' | 'executed'
    expenses: Array<{
        id: number
        amount: number
        description?: string | null
        documents?: Array<{
            id: number
            file_path: string
        }> | null
    }>
    incomes: Array<{
        id: number
        amount: number
        description?: string | null
        documents?: Array<{
            id: number
            file_path: string
        }> | null
    }>
}

interface CreateUnforeseenTransactionModalProps {
    isOpen: boolean
    editingUnforeseenTransaction: UnforeseenTransaction | null
    unforeseenIncomes: UnforeseenItem[]
    unforeseenDescription: string
    unforeseenNotes: string
    unforeseenTransactionDate: string
    unforeseenExpenses: UnforeseenItem[]
    unforeseenSubmitting: boolean
    uploadingDocumentForExpense: number | null
    uploadingDocumentForIncome: number | null
    onClose: () => void
    onAddIncome: () => void
    onRemoveIncome: (index: number) => void
    onIncomeChange: (index: number, field: 'amount' | 'description', value: string | number) => void
    onIncomeDocumentChange: (index: number, files: FileList | null) => void
    onRemoveIncomeDocument: (incomeIndex: number, fileIndex: number) => void
    onDescriptionChange: (description: string) => void
    onNotesChange: (notes: string) => void
    onTransactionDateChange: (date: string) => void
    onAddExpense: () => void
    onRemoveExpense: (index: number) => void
    onExpenseChange: (index: number, field: 'amount' | 'description', value: string | number) => void
    onExpenseDocumentChange: (index: number, files: FileList | null) => void
    onRemoveExpenseDocument: (expenseIndex: number, fileIndex: number) => void
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
    unforeseenIncomes,
    unforeseenDescription,
    unforeseenNotes,
    unforeseenTransactionDate,
    unforeseenExpenses,
    unforeseenSubmitting,
    uploadingDocumentForExpense,
    uploadingDocumentForIncome,
    onClose,
    onAddIncome,
    onRemoveIncome,
    onIncomeChange,
    onIncomeDocumentChange,
    onRemoveIncomeDocument,
    onDescriptionChange,
    onNotesChange,
    onTransactionDateChange,
    onAddExpense,
    onRemoveExpense,
    onExpenseChange,
    onExpenseDocumentChange,
    onRemoveExpenseDocument,
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
    const [expandedDocsExpense, setExpandedDocsExpense] = useState<Record<number, boolean>>({})
    const [expandedDocsIncome, setExpandedDocsIncome] = useState<Record<number, boolean>>({})
    const [selectedDocForView, setSelectedDocForView] = useState<{ file_path: string; description?: string | null } | null>(null)
    const toggleExpenseDocs = (index: number) => setExpandedDocsExpense((prev) => ({ ...prev, [index]: !prev[index] }))
    const toggleIncomeDocs = (index: number) => setExpandedDocsIncome((prev) => ({ ...prev, [index]: !prev[index] }))

    // אחרי רענון העסקה (למשל אחרי העלאת מסמכים) – לפתוח אוטומטית את "צפה במסמכים" בשורות שיש בהן מסמכים
    const expenseDocCounts = (editingUnforeseenTransaction?.expenses ?? []).map((e: any) => e.documents?.length ?? 0).join(',')
    const incomeDocCounts = (editingUnforeseenTransaction?.incomes ?? []).map((e: any) => e.documents?.length ?? 0).join(',')
    useEffect(() => {
        if (!editingUnforeseenTransaction) return
        const exp: Record<number, boolean> = {}
        ;(editingUnforeseenTransaction.expenses ?? []).forEach((e: any, i: number) => {
            if (e.documents?.length) exp[i] = true
        })
        const inc: Record<number, boolean> = {}
        ;(editingUnforeseenTransaction.incomes ?? []).forEach((e: any, i: number) => {
            if (e.documents?.length) inc[i] = true
        })
        if (Object.keys(exp).length) setExpandedDocsExpense((prev) => ({ ...prev, ...exp }))
        if (Object.keys(inc).length) setExpandedDocsIncome((prev) => ({ ...prev, ...inc }))
    }, [editingUnforeseenTransaction?.id, expenseDocCounts, incomeDocCounts])
    
    if (!isOpen) return null

    return (
        <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{opacity: 0, scale: 0.96, y: 8}}
                animate={{opacity: 1, scale: 1, y: 0}}
                exit={{opacity: 0, scale: 0.96, y: 8}}
                transition={{type: 'spring', damping: 25, stiffness: 300}}
                className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl ring-1 ring-gray-200/50 dark:ring-gray-700/50 max-w-2xl w-full max-h-[90vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 bg-gradient-to-l from-gray-50 to-white dark:from-gray-800/80 dark:to-gray-900 border-b border-gray-200 dark:border-gray-700/80">
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                        {editingUnforeseenTransaction ? 'ערוך עסקה לא צפויה' : 'עסקה לא צפויה חדשה'}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/80 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95"
                    >
                        <X className="w-5 h-5"/>
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
                    <div className="space-y-5">
                        {/* הוצאות - ראשון */}
                        <motion.div
                            initial={{opacity: 0, x: -8}}
                            animate={{opacity: 1, x: 0}}
                            className="rounded-xl border border-gray-200 dark:border-gray-700/80 border-r-4 border-r-red-500 dark:border-r-red-500 bg-gray-50/50 dark:bg-gray-800/40 overflow-hidden"
                        >
                            <div className="flex items-center justify-between px-4 py-3 bg-white/60 dark:bg-gray-800/60 border-b border-gray-200/80 dark:border-gray-700/80">
                                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                                    <TrendingDown className="w-4 h-4 text-red-500 dark:text-red-400"/>
                                    הוצאות
                                </label>
                                <button
                                    type="button"
                                    onClick={onAddExpense}
                                    className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-all duration-200 font-medium"
                                >
                                    <Plus className="w-4 h-4"/>
                                    הוסף הוצאה
                                </button>
                            </div>
                            <div className="p-4 space-y-3">
                                {unforeseenExpenses.map((exp, index) => {
                                    const expenseBackendId = (exp as any).expenseId ?? (exp as any).id
                                    const originalExpense = (expenseBackendId != null && editingUnforeseenTransaction?.expenses)
                                        ? editingUnforeseenTransaction.expenses.find((e: any) => e.id === expenseBackendId)
                                        : editingUnforeseenTransaction?.expenses?.[index]

                                    return (
                                        <motion.div
                                            key={index}
                                            initial={{opacity: 0, y: 4}}
                                            animate={{opacity: 1, y: 0}}
                                            className="rounded-xl border border-gray-200 dark:border-gray-600/80 bg-white dark:bg-gray-800/60 p-3 space-y-2.5 shadow-sm"
                                        >
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    placeholder="סכום"
                                                    value={exp.amount}
                                                    onChange={(e) => onExpenseChange(index, 'amount', parseFloat(e.target.value) || 0)}
                                                    onWheel={(e) => e.currentTarget.blur()}
                                                    className="w-24 shrink-0 px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/80 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-red-500/30 focus:border-red-400 dark:focus:ring-red-500/40 transition-all"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="תיאור הוצאה"
                                                    value={exp.description}
                                                    onChange={(e) => onExpenseChange(index, 'description', e.target.value)}
                                                    className="min-w-0 flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/80 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-red-500/30 focus:border-red-400 transition-all"
                                                />
                                                {unforeseenExpenses.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onRemoveExpense(index)}
                                                        className="p-2.5 shrink-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-colors"
                                                    >
                                                        <X className="w-4 h-4"/>
                                                    </button>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <label className="flex-1 min-w-[120px]">
                                                    <input
                                                        type="file"
                                                        multiple
                                                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                                        onChange={(e) => {
                                                            onExpenseDocumentChange(index, e.target.files)
                                                        }}
                                                        className="hidden"
                                                        id={`expense-doc-${index}`}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => document.getElementById(`expense-doc-${index}`)?.click()}
                                                        className="w-full px-3 py-2 text-xs rounded-xl bg-gray-100 dark:bg-gray-700/80 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center gap-2 border border-gray-200/80 dark:border-gray-600/80 hover:border-gray-300 dark:hover:border-gray-500 transition-all"
                                                    >
                                                        <Upload className="w-4 h-4 opacity-70"/>
                                                        {exp.documentFiles.length > 0 ? `${exp.documentFiles.length} קבצים נבחרו` : 'העלה מסמכים'}
                                                    </button>
                                                </label>
                                                {uploadingDocumentForExpense === (originalExpense?.id ?? expenseBackendId) && (
                                                    <span className="text-xs text-gray-500 dark:text-gray-400 self-center">מעלה...</span>
                                                )}
                                            </div>
                                            
                                            {/* נבחרו עכשיו */}
                                            {exp.documentFiles.length > 0 && (
                                                <div className="flex flex-wrap gap-2 pt-1">
                                                    {exp.documentFiles.map((file, fileIdx) => (
                                                        <div key={fileIdx} className="flex items-center gap-1 text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-lg">
                                                            <span className="truncate max-w-[100px]">{file.name}</span>
                                                            <button 
                                                                onClick={() => onRemoveExpenseDocument(index, fileIdx)}
                                                                className="text-red-500 hover:text-red-700"
                                                            >
                                                                <X className="w-3 h-3"/>
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* כפתור צפה במסמכים – תמיד מוצג בעריכה (טיוטה/מחכה/בוצע) */}
                                            {editingUnforeseenTransaction && (
                                                <div className="pt-2 border-t border-gray-100 dark:border-gray-700 mt-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleExpenseDocs(index)}
                                                        className="flex items-center gap-2 w-full px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-blue-200/80 dark:border-blue-800/80 transition-all text-sm font-medium"
                                                    >
                                                        <Eye className="w-4 h-4 shrink-0" />
                                                        <span>צפה במסמכים להוצאה זו</span>
                                                        <span className="mr-auto">({originalExpense?.documents?.length ?? 0})</span>
                                                        {expandedDocsExpense[index] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                    </button>
                                                    {expandedDocsExpense[index] && (
                                                        <div className="mt-2 flex flex-wrap gap-2">
                                                            {(originalExpense?.documents?.length ?? 0) > 0 ? (
                                                                originalExpense!.documents!.map((doc: any, docIdx: number) => (
                                                                    <button
                                                                        key={docIdx}
                                                                        type="button"
                                                                        onClick={() => setSelectedDocForView(doc)}
                                                                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50 border border-green-200/80 dark:border-green-800/80 text-sm font-medium transition-colors"
                                                                    >
                                                                        <FileText className="w-4 h-4 shrink-0" />
                                                                        <span>מסמך {docIdx + 1}</span>
                                                                    </button>
                                                                ))
                                                            ) : (
                                                                <p className="text-sm text-gray-500 dark:text-gray-400 py-2">אין מסמכים להוצאה זו.</p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </motion.div>
                                    )
                                })}
                            </div>
                        </motion.div>

                        {/* הכנסה - שני */}
                        <motion.div
                            initial={{opacity: 0, x: 8}}
                            animate={{opacity: 1, x: 0}}
                            className="rounded-xl border border-gray-200 dark:border-gray-700/80 border-r-4 border-r-emerald-500 dark:border-r-emerald-500 bg-gray-50/50 dark:bg-gray-800/40 overflow-hidden"
                        >
                            <div className="flex items-center justify-between px-4 py-3 bg-white/60 dark:bg-gray-800/60 border-b border-gray-200/80 dark:border-gray-700/80">
                                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                                    <TrendingUp className="w-4 h-4 text-emerald-500 dark:text-emerald-400"/>
                                    הכנסה (מה שגובה מהפרויקט)
                                </label>
                                <button
                                    type="button"
                                    onClick={onAddIncome}
                                    className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all duration-200 font-medium"
                                >
                                    <Plus className="w-4 h-4"/>
                                    הוסף הכנסה
                                </button>
                            </div>
                            <div className="p-4 space-y-3">
                                {unforeseenIncomes.map((inc, index) => {
                                    const incomeBackendIdForUpload = (inc as any).incomeId ?? (inc as any).id
                                    const originalIncomeForUpload = (incomeBackendIdForUpload != null && editingUnforeseenTransaction?.incomes)
                                        ? editingUnforeseenTransaction.incomes.find((i: any) => i.id === incomeBackendIdForUpload)
                                        : editingUnforeseenTransaction?.incomes?.[index]
                                    return (
                                    <motion.div
                                        key={index}
                                        initial={{opacity: 0, y: 4}}
                                        animate={{opacity: 1, y: 0}}
                                        className="rounded-xl border border-gray-200 dark:border-gray-600/80 bg-white dark:bg-gray-800/60 p-3 space-y-2.5 shadow-sm"
                                    >
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                step="0.01"
                                                placeholder="סכום"
                                                value={inc.amount}
                                                onChange={(e) => onIncomeChange(index, 'amount', parseFloat(e.target.value) || 0)}
                                                onWheel={(e) => e.currentTarget.blur()}
                                                className="w-24 shrink-0 px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/80 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
                                            />
                                            <input
                                                type="text"
                                                placeholder="תיאור הכנסה"
                                                value={inc.description}
                                                onChange={(e) => onIncomeChange(index, 'description', e.target.value)}
                                                className="min-w-0 flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/80 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
                                            />
                                            {unforeseenIncomes.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => onRemoveIncome(index)}
                                                    className="p-2.5 shrink-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-colors"
                                                >
                                                    <X className="w-4 h-4"/>
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <label className="flex-1 min-w-[120px]">
                                                <input
                                                    type="file"
                                                    multiple
                                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                                    onChange={(e) => onIncomeDocumentChange(index, e.target.files)}
                                                    className="hidden"
                                                    id={`income-doc-${index}`}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => document.getElementById(`income-doc-${index}`)?.click()}
                                                    className="w-full px-3 py-2 text-xs rounded-xl bg-gray-100 dark:bg-gray-700/80 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center gap-2 border border-gray-200/80 dark:border-gray-600/80 hover:border-gray-300 dark:hover:border-gray-500 transition-all"
                                                >
                                                    <Upload className="w-4 h-4 opacity-70"/>
                                                    {inc.documentFiles?.length > 0 ? `${inc.documentFiles.length} קבצים נבחרו` : 'העלה מסמכים'}
                                                </button>
                                            </label>
                                            {uploadingDocumentForIncome === (originalIncomeForUpload?.id ?? incomeBackendIdForUpload) && (
                                                <span className="text-xs text-gray-500 dark:text-gray-400 self-center">מעלה...</span>
                                            )}
                                        </div>
                                        {inc.documentFiles?.length > 0 && (
                                            <div className="flex flex-wrap gap-2 pt-1">
                                                {inc.documentFiles.map((file: File, fileIdx: number) => (
                                                    <div key={fileIdx} className="flex items-center gap-1 text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-lg">
                                                        <span className="truncate max-w-[100px]">{file.name}</span>
                                                        <button
                                                            onClick={() => onRemoveIncomeDocument(index, fileIdx)}
                                                            className="text-red-500 hover:text-red-700"
                                                        >
                                                            <X className="w-3 h-3"/>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {/* כפתור צפה במסמכים – תמיד מוצג בעריכה (טיוטה/מחכה/בוצע) */}
                                        {editingUnforeseenTransaction && (
                                            <div className="pt-2 border-t border-gray-100 dark:border-gray-700 mt-2">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleIncomeDocs(index)}
                                                    className="flex items-center gap-2 w-full px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-200/80 dark:border-emerald-800/80 transition-all text-sm font-medium"
                                                >
                                                    <Eye className="w-4 h-4 shrink-0" />
                                                    <span>צפה במסמכים להכנסה זו</span>
                                                    <span className="mr-auto">({originalIncomeForUpload?.documents?.length ?? 0})</span>
                                                    {expandedDocsIncome[index] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </button>
                                                {expandedDocsIncome[index] && (
                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                        {(originalIncomeForUpload?.documents?.length ?? 0) > 0 ? (
                                                            originalIncomeForUpload!.documents!.map((doc: any, docIdx: number) => (
                                                                <button
                                                                    key={docIdx}
                                                                    type="button"
                                                                    onClick={() => setSelectedDocForView(doc)}
                                                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50 border border-green-200/80 dark:border-green-800/80 text-sm font-medium transition-colors"
                                                                >
                                                                    <FileText className="w-4 h-4 shrink-0" />
                                                                    <span>מסמך {docIdx + 1}</span>
                                                                </button>
                                                            ))
                                                        ) : (
                                                            <p className="text-sm text-gray-500 dark:text-gray-400 py-2">אין מסמכים להכנסה זו.</p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </motion.div>
                                    )
                                })}
                            </div>
                        </motion.div>

                        {/* תאריך + תיאור + הערות */}
                        <motion.div
                            initial={{opacity: 0, y: 8}}
                            animate={{opacity: 1, y: 0}}
                            className="space-y-4 rounded-xl border border-gray-200 dark:border-gray-700/80 bg-gray-50/30 dark:bg-gray-800/30 p-4"
                        >
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    <Calendar className="w-4 h-4 text-indigo-500 dark:text-indigo-400"/>
                                    תאריך עסקה
                                </label>
                                <input
                                    type="date"
                                    value={unforeseenTransactionDate}
                                    onChange={(e) => onTransactionDateChange(e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700/80 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                                />
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400"/>
                                    תיאור
                                </label>
                                <input
                                    type="text"
                                    value={unforeseenDescription}
                                    onChange={(e) => onDescriptionChange(e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700/80 text-gray-900 dark:text-white focus:ring-2 focus:ring-slate-400/30 transition-all"
                                />
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    <StickyNote className="w-4 h-4 text-amber-500 dark:text-amber-400"/>
                                    הערות
                                </label>
                                <textarea
                                    value={unforeseenNotes}
                                    onChange={(e) => onNotesChange(e.target.value)}
                                    rows={3}
                                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700/80 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all resize-none"
                                />
                            </div>
                        </motion.div>

                        {/* סיכום */}
                        <motion.div
                            initial={{opacity: 0, scale: 0.98}}
                            animate={{opacity: 1, scale: 1}}
                            className="p-4 rounded-xl bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800/80 dark:to-gray-800/50 border border-gray-200/80 dark:border-gray-700/80 shadow-sm"
                        >
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-sm text-gray-600 dark:text-gray-400">סה"כ הכנסות</span>
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                    ₪{unforeseenIncomes.reduce((sum, inc) => sum + (parseFloat(String(inc.amount)) || 0), 0).toLocaleString('he-IL')}
                                </span>
                            </div>
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-sm text-gray-600 dark:text-gray-400">סה"כ הוצאות</span>
                                <span className="font-semibold text-red-600 dark:text-red-400">
                                    ₪{calculateTotalExpenses().toLocaleString('he-IL')}
                                </span>
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-600/80">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">רווח/הפסד</span>
                                <span className={`font-bold text-lg ${
                                    calculateProfitLoss() >= 0
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-red-600 dark:text-red-400'
                                }`}>
                                    ₪{calculateProfitLoss().toLocaleString('he-IL')}
                                </span>
                            </div>
                        </motion.div>

                        {/* חסימת שינוי סטטוס עד שהמסמכים הנבחרים הועלו */}
                        {(() => {
                            const hasPendingDocumentFiles =
                                unforeseenExpenses.some((e: any) => (e.documentFiles?.length ?? 0) > 0) ||
                                unforeseenIncomes.some((i: any) => (i.documentFiles?.length ?? 0) > 0)
                            return hasPendingDocumentFiles ? (
                                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-sm">
                                    יש לשמור קודם (שמור כטיוטה) כדי להעלות את המסמכים הנבחרים. לאחר מכן תוכל לשנות סטטוס.
                                </div>
                            ) : null
                        })()}

                        <div className="flex flex-col gap-3 pt-2">
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors font-medium"
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
                                            className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 font-medium transition-all hover:shadow-md active:scale-[0.98]"
                                        >
                                            {unforeseenSubmitting ? 'מעדכן...' : 'עדכן'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={onDelete}
                                            disabled={unforeseenSubmitting}
                                            className="px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 font-medium transition-all hover:shadow-md active:scale-[0.98]"
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
                                            className="px-4 py-2.5 bg-gray-600 text-white rounded-xl hover:bg-gray-700 disabled:opacity-50 font-medium transition-all hover:shadow-md active:scale-[0.98]"
                                        >
                                            {unforeseenSubmitting ? 'שומר...' : 'שמור כטיוטה'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={onSaveAsWaitingForApproval}
                                            disabled={unforeseenSubmitting || unforeseenExpenses.some((e: any) => (e.documentFiles?.length ?? 0) > 0) || unforeseenIncomes.some((i: any) => (i.documentFiles?.length ?? 0) > 0)}
                                            className="px-4 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 disabled:opacity-50 font-medium transition-all hover:shadow-md active:scale-[0.98]"
                                        >
                                            {unforeseenSubmitting ? 'שומר...' : 'שמור כמחכה לאישור'}
                                        </button>
                                        {!editingUnforeseenTransaction && (
                                            <button
                                                type="button"
                                                onClick={onSaveAndExecute}
                                                disabled={unforeseenSubmitting || unforeseenExpenses.some((e: any) => (e.documentFiles?.length ?? 0) > 0) || unforeseenIncomes.some((i: any) => (i.documentFiles?.length ?? 0) > 0)}
                                                className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 font-medium transition-all hover:shadow-md active:scale-[0.98]"
                                            >
                                                {unforeseenSubmitting ? 'מבצע...' : 'בצע מיד'}
                                            </button>
                                        )}
                                        {editingUnforeseenTransaction && (editingUnforeseenTransaction.status === 'waiting_for_approval' || editingUnforeseenTransaction.status === 'draft') && (
                                            <button
                                                type="button"
                                                onClick={() => setShowExecuteConfirm(true)}
                                                disabled={unforeseenSubmitting || unforeseenExpenses.some((e: any) => (e.documentFiles?.length ?? 0) > 0) || unforeseenIncomes.some((i: any) => (i.documentFiles?.length ?? 0) > 0)}
                                                className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 font-medium transition-all hover:shadow-md active:scale-[0.98]"
                                            >
                                                {unforeseenSubmitting ? 'מבצע...' : 'אשר כבוצע'}
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
                title="אישור כבוצע"
                message="האם אתה בטוח שברצונך לאשר ולבצע את העסקה?"
                variant="warning"
                confirmText="אשר כבוצע"
                cancelText="ביטול"
                loading={unforeseenSubmitting}
            />

            <DocumentViewerModal
                isOpen={!!selectedDocForView}
                document={selectedDocForView}
                onClose={() => setSelectedDocForView(null)}
            />
        </motion.div>
    )
}
