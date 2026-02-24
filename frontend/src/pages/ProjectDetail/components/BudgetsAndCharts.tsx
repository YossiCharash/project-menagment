import { motion } from 'framer-motion'
import BudgetCard from '../../../components/charts/BudgetCard'
import { BudgetWithSpending } from '../../../types/api'
import { usePermission } from '../../../hooks/usePermission'

interface BudgetsAndChartsProps {
  chartsLoading: boolean
  projectBudgets: BudgetWithSpending[]
  budgetDeleteLoading: number | null
  onDeleteBudget: (id: number) => void
  onEditBudget: (budget: BudgetWithSpending) => void
}

export default function BudgetsAndCharts({
  chartsLoading,
  projectBudgets,
  budgetDeleteLoading,
  onDeleteBudget,
  onEditBudget
}: BudgetsAndChartsProps) {
  const canEditBudget = usePermission('update', 'budget')
  const canDeleteBudget = usePermission('delete', 'budget')

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="w-full min-w-0"
    >
      <div className="mb-3">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          תקציבים לקטגוריות
        </h2>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          מעקב אחר התקציבים וההוצאות בכל קטגוריה
        </p>
      </div>

      {chartsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : projectBudgets && projectBudgets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projectBudgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              onDelete={canDeleteBudget ? () => onDeleteBudget(budget.id) : undefined}
              onEdit={canEditBudget ? () => onEditBudget(budget) : undefined}
              deleting={budgetDeleteLoading === budget.id}
            />
          ))}
        </div>
      ) : (
        !chartsLoading && (
          <div className="text-center py-6 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600">
            <p className="text-gray-500 dark:text-gray-400">
              אין תקציבים לקטגוריות לפרויקט זה
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
              הוסף תקציבים לקטגוריות כדי לעקוב אחר הוצאות מול תכנון
            </p>
          </div>
        )
      )}
    </motion.div>
  )
}
