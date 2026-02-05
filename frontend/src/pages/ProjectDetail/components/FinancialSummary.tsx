import { motion } from 'framer-motion'
import { formatCurrency } from '../utils'

interface FinancialSummaryProps {
  income: number
  expense: number
  fundBalance?: number | null
}

export default function FinancialSummary({ income, expense, fundBalance }: FinancialSummaryProps) {
  const net = income - expense
  const showFund = fundBalance != null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.03 }}
      className="financial-summary-card project-detail-card bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-3"
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
        <div className="financial-summary-item bg-blue-50 dark:bg-blue-900/20 p-2.5 sm:p-3 rounded-lg text-center min-w-0">
          <div className="text-blue-600 dark:text-blue-400 font-medium text-fluid-sm mb-0.5 whitespace-nowrap">הכנסות</div>
          <div className="text-fluid-xl font-bold text-blue-700 dark:text-blue-300 overflow-hidden text-ellipsis" title={formatCurrency(income)}>
            {formatCurrency(income)} ₪
          </div>
        </div>
        <div className="financial-summary-item bg-red-50 dark:bg-red-900/20 p-2.5 sm:p-3 rounded-lg text-center min-w-0">
          <div className="text-red-600 dark:text-red-400 font-medium text-fluid-sm mb-0.5 whitespace-nowrap">הוצאות</div>
          <div className="text-fluid-xl font-bold text-red-700 dark:text-red-300 overflow-hidden text-ellipsis" title={expense.toFixed(2)}>
            {expense.toFixed(2)} ₪
          </div>
        </div>
        <div className={`financial-summary-item p-2.5 sm:p-3 rounded-lg text-center min-w-0 ${
          net < 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20'
        }`}>
          <div className={`font-medium text-fluid-sm mb-0.5 whitespace-nowrap ${
            net < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
          }`}>
            רווח נטו
          </div>
          <div className={`text-fluid-xl font-bold overflow-hidden text-ellipsis ${
            net < 0 ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'
          }`} title={net.toFixed(2)}>
            {net.toFixed(2)} ₪
          </div>
        </div>
        {showFund && (
          <div className="financial-summary-item bg-slate-50 dark:bg-slate-800/50 p-2.5 sm:p-3 rounded-lg text-center min-w-0">
            <div className="text-slate-600 dark:text-slate-400 font-medium text-fluid-sm mb-0.5 whitespace-nowrap">יתרה בקופה</div>
            <div className="text-fluid-xl font-bold text-slate-800 dark:text-slate-200 overflow-hidden text-ellipsis" title={fundBalance.toLocaleString('he-IL')}>
              {fundBalance.toLocaleString('he-IL')} ₪
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
