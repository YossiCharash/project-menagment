import {motion} from 'framer-motion'

interface BudgetForm {
    category: string
    amount: string
    period_type: 'Annual' | 'Monthly'
    start_date: string
    end_date: string
    is_active: boolean
}

interface Budget {
    id: number
    category: string
}

interface EditBudgetModalProps {
    isOpen: boolean
    budgetToEdit: Budget | null
    editBudgetForm: BudgetForm
    availableCategories: string[]
    projectBudgets: any[]
    editBudgetError: string | null
    editBudgetSaving: boolean
    onClose: () => void
    onFormChange: (form: BudgetForm) => void
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
}

export default function EditBudgetModal({
    isOpen,
    budgetToEdit,
    editBudgetForm,
    availableCategories,
    projectBudgets,
    editBudgetError,
    editBudgetSaving,
    onClose,
    onFormChange,
    onSubmit
}: EditBudgetModalProps) {
    if (!isOpen || !budgetToEdit) return null

    const forbiddenCategories = new Set(
        projectBudgets
            .filter((b: any) => b.id !== budgetToEdit.id)
            .map((b: any) => b.category)
    )
    const selectableCategories = availableCategories.filter((cat: string) => !forbiddenCategories.has(cat) || cat === budgetToEdit.category)

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
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                            עריכת תקציב לקטגוריה
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {budgetToEdit.category}
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
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                    <form onSubmit={onSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    קטגוריה *
                                </label>
                                <select
                                    value={editBudgetForm.category}
                                    onChange={(e) => onFormChange({...editBudgetForm, category: e.target.value})}
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {selectableCategories.map((option) => (
                                        <option key={option} value={option}>
                                            {option}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    סכום (₪) *
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={editBudgetForm.amount}
                                    onChange={(e) => onFormChange({...editBudgetForm, amount: e.target.value})}
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    סוג תקופה *
                                </label>
                                <select
                                    value={editBudgetForm.period_type}
                                    onChange={(e) => {
                                        const nextPeriod = e.target.value as 'Annual' | 'Monthly'
                                        onFormChange({
                                            ...editBudgetForm,
                                            period_type: nextPeriod,
                                            end_date: nextPeriod === 'Annual' ? editBudgetForm.end_date : ''
                                        })
                                    }}
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="Annual">שנתי</option>
                                    <option value="Monthly">חודשי</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    תאריך התחלה *
                                </label>
                                <input
                                    type="date"
                                    value={editBudgetForm.start_date}
                                    onChange={(e) => onFormChange({...editBudgetForm, start_date: e.target.value})}
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            {editBudgetForm.period_type === 'Annual' && (
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        תאריך סיום (אופציונלי)
                                    </label>
                                    <input
                                        type="date"
                                        value={editBudgetForm.end_date}
                                        onChange={(e) => onFormChange({...editBudgetForm, end_date: e.target.value})}
                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            )}
                        </div>
                        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <input
                                type="checkbox"
                                checked={editBudgetForm.is_active}
                                onChange={(e) => onFormChange({...editBudgetForm, is_active: e.target.checked})}
                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                            />
                            תקציב פעיל
                        </label>
                        {editBudgetError && (
                            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                                {editBudgetError}
                            </div>
                        )}
                        <div className="flex items-center justify-end gap-3 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                            >
                                ביטול
                            </button>
                            <button
                                type="submit"
                                disabled={editBudgetSaving}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {editBudgetSaving ? 'שומר...' : 'שמור שינויים'}
                            </button>
                        </div>
                    </form>
                </div>
            </motion.div>
        </motion.div>
    )
}
