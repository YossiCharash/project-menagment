import {motion} from 'framer-motion'
import {useEffect} from 'react'

interface BudgetForm {
    category: string
    amount: string
    period_type: 'Annual' | 'Monthly'
    start_date: string
    end_date: string
}

interface CreateBudgetModalProps {
    isOpen: boolean
    isViewingHistoricalPeriod: boolean
    newBudgetForm: BudgetForm
    budgetDateMode: 'project_start' | 'today' | 'custom'
    projectStartDate: string | null
    availableCategories: string[]
    projectBudgets: any[]
    budgetFormError: string | null
    budgetSaving: boolean
    onClose: () => void
    onFormChange: (form: BudgetForm) => void
    onDateModeChange: (mode: 'project_start' | 'today' | 'custom') => void
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
}

export default function CreateBudgetModal({
    isOpen,
    isViewingHistoricalPeriod,
    newBudgetForm,
    budgetDateMode,
    projectStartDate,
    availableCategories,
    projectBudgets,
    budgetFormError,
    budgetSaving,
    onClose,
    onFormChange,
    onDateModeChange,
    onSubmit
}: CreateBudgetModalProps) {
    // Update start_date when budgetDateMode changes
    useEffect(() => {
        if (budgetDateMode === 'project_start' && projectStartDate) {
            onFormChange({...newBudgetForm, start_date: projectStartDate})
        } else if (budgetDateMode === 'today') {
            onFormChange({...newBudgetForm, start_date: new Date().toISOString().split('T')[0]})
        }
        // For 'custom', user manually sets the date, so we don't auto-update
    }, [budgetDateMode, projectStartDate])

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
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                        יצירת תקציב חדש
                    </h2>
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
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                    <form onSubmit={onSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    קטגוריה *
                                </label>
                                <select
                                    value={newBudgetForm.category}
                                    onChange={(e) => onFormChange({...newBudgetForm, category: e.target.value})}
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                                >
                                    {availableCategories
                                        .filter((option: string) => {
                                            const hasBudget = projectBudgets.some((budget: any) => budget.category === option)
                                            return !hasBudget
                                        })
                                        .map((option: string) => (
                                            <option key={option} value={option}>{option}</option>
                                        ))}
                                </select>
                                {availableCategories.filter((option: string) => {
                                    const hasBudget = projectBudgets.some((budget: any) => budget.category === option)
                                    return !hasBudget
                                }).length === 0 && (
                                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                                        כל הקטגוריות כבר יש להן תקציב
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    סכום (₪) *
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={newBudgetForm.amount}
                                    onChange={(e) => onFormChange({...newBudgetForm, amount: e.target.value})}
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    סוג תקופה *
                                </label>
                                <select
                                    value={newBudgetForm.period_type}
                                    onChange={(e) => onFormChange({...newBudgetForm, period_type: e.target.value as 'Annual' | 'Monthly'})}
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                                >
                                    <option value="Annual">שנתי</option>
                                    <option value="Monthly">חודשי</option>
                                </select>
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    מתי להחיל את התקציב? *
                                </label>
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="budgetDateMode"
                                            value="project_start"
                                            checked={budgetDateMode === 'project_start'}
                                            onChange={() => onDateModeChange('project_start')}
                                            className="w-4 h-4 text-green-600 focus:ring-green-500"
                                            disabled={!projectStartDate}
                                        />
                                        <span className="text-sm text-gray-700 dark:text-gray-300">
                                            {isViewingHistoricalPeriod ? 'מתחילת התקופה' : 'מתחילת הפרויקט'} {projectStartDate && `(${new Date(projectStartDate).toLocaleDateString('he-IL')})`}
                                        </span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="budgetDateMode"
                                            value="today"
                                            checked={budgetDateMode === 'today'}
                                            onChange={() => onDateModeChange('today')}
                                            className="w-4 h-4 text-green-600 focus:ring-green-500"
                                        />
                                        <span className="text-sm text-gray-700 dark:text-gray-300">
                                            מהיום ({new Date().toLocaleDateString('he-IL')})
                                        </span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="budgetDateMode"
                                            value="custom"
                                            checked={budgetDateMode === 'custom'}
                                            onChange={() => onDateModeChange('custom')}
                                            className="w-4 h-4 text-green-600 focus:ring-green-500"
                                        />
                                        <span className="text-sm text-gray-700 dark:text-gray-300">
                                            מתאריך מותאם אישית
                                        </span>
                                    </label>
                                </div>
                                {budgetDateMode === 'custom' && (
                                    <div className="mt-3">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            תאריך התחלה *
                                        </label>
                                        <input
                                            type="date"
                                            value={newBudgetForm.start_date}
                                            onChange={(e) => onFormChange({...newBudgetForm, start_date: e.target.value})}
                                            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                                            required
                                        />
                                    </div>
                                )}
                                {budgetDateMode !== 'custom' && (
                                    <div className="mt-3">
                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                            תאריך התחלה: {newBudgetForm.start_date ? new Date(newBudgetForm.start_date).toLocaleDateString('he-IL') : '-'}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {newBudgetForm.period_type === 'Annual' && (
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        תאריך סיום (אופציונלי)
                                    </label>
                                    <input
                                        type="date"
                                        value={newBudgetForm.end_date}
                                        onChange={(e) => onFormChange({...newBudgetForm, end_date: e.target.value})}
                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                                    />
                                </div>
                            )}
                        </div>

                        {budgetFormError && (
                            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                                {budgetFormError}
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
                                disabled={budgetSaving}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {budgetSaving ? 'שומר...' : 'שמור תקציב'}
                            </button>
                        </div>
                    </form>
                </div>
            </motion.div>
        </motion.div>
    )
}
