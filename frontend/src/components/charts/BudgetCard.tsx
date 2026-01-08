import React, { useMemo } from 'react'
import { BudgetWithSpending } from '../../types/api'

interface BudgetCardProps {
  budget: BudgetWithSpending
  onDelete?: () => void
  deleting?: boolean
  onEdit?: () => void
}

const BudgetCard: React.FC<BudgetCardProps> = ({ budget, onDelete, deleting, onEdit }) => {
  // Calculate progress percentage
  const baseBudget = Number(budget.base_amount ?? budget.amount ?? 0)
  const effectiveBudget = Number(budget.amount ?? baseBudget)
  const expenseAmount = Number(budget.expense_amount ?? budget.spent_amount ?? 0)
  const incomeAmount = Number(budget.income_amount ?? 0)
  const netSpent = expenseAmount - incomeAmount
  const remainingAmount = Number(budget.remaining_amount ?? (effectiveBudget - expenseAmount))
  const progressPercent = effectiveBudget > 0 ? Math.min((Math.max(netSpent, 0) / effectiveBudget) * 100, 100) : 0
  
  // Determine status
  const isOverBudget = budget.is_over_budget
  const isSpendingTooFast = budget.is_spending_too_fast
  const isWarning = progressPercent > 80 && !isOverBudget
  
  // Color based on status
  let statusColor = '#10B981' // Green - good
  let statusText = 'בתקציב'
  if (isOverBudget) {
    statusColor = '#EF4444' // Red - over budget
    statusText = 'חריגה מעל התקציב!'
  } else if (isSpendingTooFast) {
    statusColor = '#F59E0B' // Orange - spending too fast
    statusText = 'הוצאה מהירה מהצפוי'
  } else if (isWarning) {
    statusColor = '#FCD34D' // Yellow - warning
    statusText = 'קרוב לתקציב'
  }

  // Calculate expected amount based on time elapsed
  const expectedAmount = useMemo(() => {
    const amount = Number(budget.amount ?? 0)
    const percentage = Number(budget.expected_spent_percentage ?? 0)
    return (amount * percentage) / 100
  }, [budget.amount, budget.expected_spent_percentage])

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-md border-2 ${isOverBudget ? 'border-red-500' : isSpendingTooFast ? 'border-orange-500' : isWarning ? 'border-yellow-400' : 'border-gray-200 dark:border-gray-700'} p-6`}>
      {/* Header */}
      <div className="mb-4">
        <h4 className="text-lg font-bold text-gray-900 dark:text-white break-words mb-2">{budget.category}</h4>
        <div className="flex items-center justify-end gap-2 mb-2">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${isOverBudget ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' : isSpendingTooFast ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' : isWarning ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'}`}>
            {statusText}
          </span>
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
              className="px-2 py-1 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200 rounded-md hover:bg-blue-200 dark:hover:bg-blue-800/50 whitespace-nowrap"
            >
              ערוך
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              disabled={deleting}
              className="px-2 py-1 text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded-md hover:bg-red-200 dark:hover:bg-red-800/50 disabled:opacity-50 whitespace-nowrap"
            >
              {deleting ? 'מוחק...' : 'מחק'}
            </button>
          )}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
          {budget.period_type === 'Annual' ? 'תקציב שנתי' : 'תקציב חודשי'}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">התקדמות</span>
          <span className={`text-sm font-bold whitespace-nowrap ${progressPercent > 100 ? 'text-red-600' : progressPercent > 80 ? 'text-orange-600' : 'text-green-600'}`}>
            {progressPercent.toFixed(1)}%
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${isOverBudget ? 'bg-red-500' : isSpendingTooFast ? 'bg-orange-500' : isWarning ? 'bg-yellow-400' : 'bg-green-500'}`}
            style={{ width: `${Math.min(progressPercent, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
          <span className="whitespace-nowrap">0 ₪</span>
          <span className="whitespace-nowrap">{Number(budget.amount ?? 0).toLocaleString()} ₪</span>
        </div>
      </div>

      {/* Comparison Details */}
      <div className="mt-4 grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="text-center bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-medium leading-tight break-words">צפוי לפי זמן</div>
          <div className="font-bold text-gray-900 dark:text-white text-lg whitespace-nowrap">
            {Number(expectedAmount ?? 0).toLocaleString()} ₪
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 whitespace-nowrap">
            {Number(budget.expected_spent_percentage ?? 0).toFixed(1)}%
          </div>
        </div>
        <div className="text-center bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-medium leading-tight break-words">הוצאה נטו</div>
          <div className="font-bold text-gray-900 dark:text-white text-lg whitespace-nowrap">
            {Number(netSpent ?? 0).toLocaleString()} ₪
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 whitespace-nowrap">
            {progressPercent.toFixed(1)}%
          </div>
        </div>
      </div>
      
      {/* Difference indicator */}
      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">הפרש:</span>
          <span className="text-lg font-bold text-gray-900 dark:text-white whitespace-nowrap">
            {netSpent > expectedAmount ? '+' : ''}{Number(netSpent - expectedAmount).toLocaleString()} ₪
          </span>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
            ({progressPercent > (budget.expected_spent_percentage ?? 0) ? '+' : ''}{(progressPercent - (budget.expected_spent_percentage ?? 0)).toFixed(1)}%)
          </span>
        </div>
      </div>

      {/* Summary Numbers */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1 leading-tight break-words">תקציב בסיסי</div>
          <div className="text-lg font-bold text-gray-900 dark:text-white whitespace-nowrap">
            {Number(baseBudget ?? 0).toLocaleString()} ₪
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1 leading-tight break-words">סה"כ הוצאות</div>
          <div className={`text-lg font-bold whitespace-nowrap ${isOverBudget ? 'text-red-600' : 'text-blue-600'}`}>
            {Number(expenseAmount ?? 0).toLocaleString()} ₪
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1 leading-tight break-words">סה"כ הכנסות</div>
          <div className="text-lg font-bold text-green-600 whitespace-nowrap">
            {Number(incomeAmount ?? 0).toLocaleString()} ₪
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1 leading-tight break-words">תקציב נוכחי</div>
          <div className="text-lg font-bold text-gray-900 dark:text-white whitespace-nowrap">
            {Number(effectiveBudget ?? 0).toLocaleString()} ₪
          </div>
        </div>
        <div className="text-center col-span-2">
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1 leading-tight break-words">נותר</div>
          <div className={`text-lg font-bold whitespace-nowrap ${remainingAmount < 0 ? 'text-red-600' : 'text-green-600'}`}>
            {Number(remainingAmount ?? 0).toLocaleString()} ₪
          </div>
        </div>
      </div>

      {/* Time-based warning */}
      {budget.is_spending_too_fast && budget.expected_spent_percentage > 0 && !budget.is_over_budget && (
        <div className="mt-4 p-4 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-300 dark:border-orange-800 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-orange-600 dark:text-orange-400 text-2xl">⚠️</span>
            <div className="flex-1">
              <div className="text-base font-bold text-orange-800 dark:text-orange-200 mb-2">
                הוצאה מהירה מהצפוי
              </div>
              <div className="text-sm text-orange-700 dark:text-orange-300">
                הוצאת <span className="font-semibold">{budget.spent_percentage.toFixed(1)}%</span> מהתקציב, אך צפוי רק <span className="font-semibold">{budget.expected_spent_percentage.toFixed(1)}%</span> לפי זמן שחלף
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Over budget warning */}
      {budget.is_over_budget && (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-800 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-red-600 dark:text-red-400 text-2xl">🚨</span>
            <div className="flex-1">
              <div className="text-base font-bold text-red-800 dark:text-red-200 mb-2">
                חריגה מעל התקציב!
              </div>
              <div className="text-sm text-red-700 dark:text-red-300">
                הוצאת <span className="font-semibold">{Number(budget.spent_amount ?? 0).toLocaleString()} ₪</span> מתוך <span className="font-semibold">{Number(budget.amount ?? 0).toLocaleString()} ₪</span>
                {budget.expected_spent_percentage > 0 && (
                  <span> - צפוי היה רק <span className="font-semibold">{budget.expected_spent_percentage.toFixed(1)}%</span> לפי זמן</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BudgetCard
