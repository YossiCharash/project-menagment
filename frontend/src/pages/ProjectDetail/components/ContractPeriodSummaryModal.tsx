import {motion} from 'framer-motion'
import {Download} from 'lucide-react'
import {formatDate, parseLocalDate, dateToLocalString} from '../../../lib/utils'
import {formatCurrency, getCategoryName} from '../utils'
import {PAYMENT_METHOD_LABELS} from '../constants'
import {ProjectAPI} from '../../../lib/apiClient'

interface PeriodSummary {
    period_id: number
    contract_year?: number
    year_label?: string
    start_date: string
    end_date: string | null
    total_income: number
    total_expense: number
    total_profit: number
    budgets?: Array<{
        category: string
        amount: number
        period_type: 'Annual' | 'Monthly'
        start_date: string | null
        end_date: string | null
        is_active: boolean
    }>
    transactions: Array<{
        id: number
        tx_date: string
        type: 'Income' | 'Expense'
        amount: number
        description: string | null
        category: string | null
        payment_method: string | null
        notes: string | null
    }>
    fund_data?: {
        final_balance: number
        initial_balance: number
        monthly_amount: number
    }
}

interface ContractPeriodSummaryModalProps {
    isOpen: boolean
    loadingPeriodSummary: boolean
    selectedPeriodSummary: PeriodSummary | null
    projectName: string
    projectId: string
    onClose: () => void
    onShowPreviousYears?: () => void
    onExportCSV?: () => void
}

export default function ContractPeriodSummaryModal({
    isOpen,
    loadingPeriodSummary,
    selectedPeriodSummary,
    projectName,
    projectId,
    onClose,
    onShowPreviousYears,
    onExportCSV
}: ContractPeriodSummaryModalProps) {
    if (!isOpen) return null

    const handleExportCSV = async () => {
        if (onExportCSV) {
            onExportCSV()
            return
        }
        if (!selectedPeriodSummary) return
        try {
            const blob = await ProjectAPI.exportContractPeriodCSV(
                parseInt(projectId),
                selectedPeriodSummary.period_id,
                selectedPeriodSummary.start_date,
                selectedPeriodSummary.end_date || ''
            )
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `contract_period_${selectedPeriodSummary.year_label || `שנת_${selectedPeriodSummary.contract_year}`}_${projectName}.csv`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'שגיאה בייצוא CSV')
        }
    }

    return (
        <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{opacity: 0, scale: 0.95}}
                animate={{opacity: 1, scale: 1}}
                exit={{opacity: 0, scale: 0.95}}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                            {selectedPeriodSummary.contract_year ? (selectedPeriodSummary.year_label ? `שנת ${selectedPeriodSummary.contract_year} - ${selectedPeriodSummary.year_label}` : `שנת ${selectedPeriodSummary.contract_year}`) : 'סיכום תקופת חוזה'}
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {selectedPeriodSummary.start_date && selectedPeriodSummary.end_date ? (
                                (() => {
                                    const start = parseLocalDate(selectedPeriodSummary.start_date);
                                    const end = parseLocalDate(selectedPeriodSummary.end_date);
                                    if (!start || !end) {
                                        return `\u200E${formatDate(selectedPeriodSummary.start_date)} - ${formatDate(selectedPeriodSummary.end_date)}`;
                                    }
                                    const displayStart = start <= end ? start : end;
                                    const displayEnd = start <= end ? end : start;
                                    return `\u200E${formatDate(dateToLocalString(displayStart))} - ${formatDate(dateToLocalString(displayEnd))}`;
                                })()
                            ) : selectedPeriodSummary.start_date ? formatDate(selectedPeriodSummary.start_date) : ''}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExportCSV}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                        >
                            <Download className="w-4 h-4"/>
                            הורד CSV
                        </button>
                        {onShowPreviousYears && (
                            <button
                                onClick={onShowPreviousYears}
                                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M6 18L18 6M6 6l12 12"/>
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                    {loadingPeriodSummary ? (
                        <div className="text-center py-8">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
                            <p className="mt-4 text-gray-600 dark:text-gray-400">טוען סיכום...</p>
                        </div>
                    ) : selectedPeriodSummary ? (
                        <div className="space-y-6">
                            {/* Financial Summary */}
                            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 mb-6">
                                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">סיכום כלכלי</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center">
                                        <div className="text-green-600 dark:text-green-400 font-semibold mb-1">הכנסות</div>
                                        <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                                            {formatCurrency(selectedPeriodSummary.total_income)} ₪
                                        </div>
                                    </div>
                                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center">
                                        <div className="text-red-600 dark:text-red-400 font-semibold mb-1">הוצאות</div>
                                        <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                                            {formatCurrency(selectedPeriodSummary.total_expense)} ₪
                                        </div>
                                    </div>
                                    <div className={`bg-white dark:bg-gray-800 rounded-lg p-4 text-center ${
                                        selectedPeriodSummary.total_profit < 0
                                            ? 'border-2 border-red-300 dark:border-red-700'
                                            : 'border-2 border-green-300 dark:border-green-700'
                                    }`}>
                                        <div className={`font-semibold mb-1 ${
                                            selectedPeriodSummary.total_profit < 0
                                                ? 'text-red-600 dark:text-red-400'
                                                : 'text-green-600 dark:text-green-400'
                                        }`}>
                                            רווח נטו
                                        </div>
                                        <div className={`text-2xl font-bold ${
                                            selectedPeriodSummary.total_profit < 0
                                                ? 'text-red-700 dark:text-red-300'
                                                : 'text-green-700 dark:text-green-300'
                                        }`}>
                                            {formatCurrency(selectedPeriodSummary.total_profit)} ₪
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Fund Chart (if fund data exists) */}
                            {selectedPeriodSummary.fund_data && (
                                <div>
                                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">קופה</h4>
                                    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                                        <div className="grid grid-cols-2 gap-6">
                                            <div className="text-center">
                                                <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">יתרה בסוף התקופה</div>
                                                <div className="text-3xl font-bold text-purple-600">
                                                    {formatCurrency(selectedPeriodSummary.fund_data.final_balance || 0)} ₪
                                                </div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">יתרה בתחילת התקופה</div>
                                                <div className="text-3xl font-bold text-blue-600">
                                                    {formatCurrency(selectedPeriodSummary.fund_data.initial_balance || 0)} ₪
                                                </div>
                                            </div>
                                        </div>
                                        {selectedPeriodSummary.fund_data.monthly_amount > 0 && (
                                            <div className="mt-4 text-center">
                                                <div className="text-sm text-gray-600 dark:text-gray-400">סכום חודשי</div>
                                                <div className="text-xl font-semibold text-gray-900 dark:text-white">
                                                    {formatCurrency(selectedPeriodSummary.fund_data.monthly_amount)} ₪
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                    {/* Budgets */}
                    {selectedPeriodSummary.budgets && selectedPeriodSummary.budgets.length > 0 && (
                        <div className="mb-6">
                            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">תקציבים</h3>
                            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                <table className="w-full">
                                    <thead className="bg-gray-50 dark:bg-gray-700">
                                    <tr>
                                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">קטגוריה</th>
                                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">סכום</th>
                                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">סוג תקופה</th>
                                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">תאריך התחלה</th>
                                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">תאריך סיום</th>
                                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">פעיל</th>
                                    </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {selectedPeriodSummary.budgets.map((budget, index) => (
                                        <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{budget.category}</td>
                                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{formatCurrency(budget.amount)} ₪</td>
                                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                                {budget.period_type === 'Annual' ? 'שנתי' : 'חודשי'}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                                {budget.start_date ? formatDate(budget.start_date) : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                                {budget.end_date ? formatDate(budget.end_date) : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                                {budget.is_active ? 'כן' : 'לא'}
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Transactions */}
                    <div>
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            עסקאות ({selectedPeriodSummary.transactions.length})
                        </h3>
                        {selectedPeriodSummary.transactions.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                אין עסקאות בתקופה זו
                            </div>
                        ) : (
                            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
                                    <table className="w-full">
                                        <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">תאריך</th>
                                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">סוג</th>
                                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">סכום</th>
                                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">תיאור</th>
                                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">קטגוריה</th>
                                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">אמצעי תשלום</th>
                                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">הערות</th>
                                        </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {selectedPeriodSummary.transactions.map((tx) => (
                                            <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                                    {formatDate(tx.tx_date)}
                                                </td>
                                                <td className="px-4 py-3 text-sm">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                                        tx.type === 'Income'
                                                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                                    }`}>
                                                        {tx.type === 'Income' ? 'הכנסה' : 'הוצאה'}
                                                    </span>
                                                </td>
                                                <td className={`px-4 py-3 text-sm font-semibold ${
                                                    tx.type === 'Income'
                                                        ? 'text-green-600 dark:text-green-400'
                                                        : 'text-red-600 dark:text-red-400'
                                                }`}>
                                                    {tx.type === 'Income' ? '+' : '-'}{formatCurrency(tx.amount)} ₪
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                                    {tx.description || '-'}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                                    {getCategoryName(tx.category) || '-'}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                                    {tx.payment_method ? PAYMENT_METHOD_LABELS[tx.payment_method] || tx.payment_method : '-'}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                                    {tx.notes || '-'}
                                                </td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                            אין מידע להצגה
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    )
}
