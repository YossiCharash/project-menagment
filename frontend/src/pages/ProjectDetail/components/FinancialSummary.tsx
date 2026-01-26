import { motion } from 'framer-motion'
import { formatCurrency } from '../utils'

interface FinancialSummaryProps {
  income: number
  expense: number
}

export default function FinancialSummary({ income, expense }: FinancialSummaryProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.03 }}
      className="bg-blue-50 dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">סיכום פיננסי</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-blue-900/20 p-4 rounded-lg text-center">
          <div className="text-blue-600 dark:text-blue-400 font-semibold mb-1">
            הכנסות
          </div>
          <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
            {formatCurrency(income)} ₪
          </div>
        </div>
        <div className="bg-white dark:bg-red-900/20 p-4 rounded-lg text-center">
          <div className="text-red-600 dark:text-red-400 font-semibold mb-1">הוצאות</div>
          <div className="text-2xl font-bold text-red-700 dark:text-red-300">
            {expense.toFixed(2)} ₪
          </div>
        </div>
        <div className={`p-4 rounded-lg text-center ${
          income - expense < 0 
            ? 'bg-white dark:bg-red-900/20' 
            : 'bg-white dark:bg-green-900/20'
        }`}>
          <div className={`font-semibold mb-1 ${
            income - expense < 0 
              ? 'text-red-600 dark:text-red-400' 
              : 'text-green-600 dark:text-green-400'
          }`}>
            רווח נטו
          </div>
          <div className={`text-2xl font-bold ${
            income - expense < 0 
              ? 'text-red-700 dark:text-red-300' 
              : 'text-green-700 dark:text-green-300'
          }`}>
            {(income - expense).toFixed(2)} ₪
          </div>
        </div>
      </div>
    </motion.div>
  )
}
