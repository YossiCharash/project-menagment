import { useMemo } from 'react'
import { motion } from 'framer-motion'
import api from '../../../lib/api'
import { Transaction } from '../types'
import { getCategoryName, splitPeriodTransactionByMonth, formatCurrency } from '../utils'
import { PAYMENT_METHOD_LABELS } from '../constants'
import { formatDate, parseLocalDate } from '../../../lib/utils'
import { CATEGORY_LABELS, normalizeCategoryForFilter } from '../../../utils/calculations'

interface TransactionsListProps {
  txs: Transaction[]
  loading: boolean
  transactionTypeFilter: 'all' | 'regular' | 'recurring'
  filterType: 'all' | 'Income' | 'Expense' | 'unforeseen'
  filterExceptional: 'all' | 'only'
  filterDated: 'all' | 'only'
  categoryFilter: string
  allCategoryOptions: string[]
  dateFilterMode: 'current_month' | 'selected_month' | 'date_range' | 'all_time'
  selectedMonth: string
  startDate: string
  endDate: string
  viewingPeriodId: number | null
  suppliers: Array<{ id: number; name: string }>
  onSetFilterType: (value: 'all' | 'Income' | 'Expense' | 'unforeseen') => void
  onSetFilterExceptional: (value: 'all' | 'only') => void
  onSetFilterDated: (value: 'all' | 'only') => void
  onSetCategoryFilter: (value: string) => void
  onSetDateFilterMode: (mode: 'current_month' | 'selected_month' | 'date_range' | 'all_time') => void
  onShowTransactionDetails: (tx: Transaction) => void
  onShowDocumentsModal: (tx: Transaction) => Promise<void>
  onEditTransaction: (tx: Transaction) => void
  onDeleteTransaction: (id: number, tx: Transaction) => void
}

export default function TransactionsList({
  txs,
  loading,
  transactionTypeFilter,
  filterType,
  filterExceptional,
  filterDated,
  categoryFilter,
  allCategoryOptions,
  dateFilterMode,
  selectedMonth,
  startDate,
  endDate,
  viewingPeriodId,
  suppliers,
  onSetFilterType,
  onSetFilterExceptional,
  onSetFilterDated,
  onSetCategoryFilter,
  onSetDateFilterMode,
  onShowTransactionDetails,
  onShowDocumentsModal,
  onEditTransaction,
  onDeleteTransaction
}: TransactionsListProps) {
  // Filter transactions based on date filter mode
  const currentDate = new Date()
  const currentMonth = currentDate.getMonth() + 1
  const currentYear = currentDate.getFullYear()

  // Use useMemo to ensure filtered array is recalculated when txs changes
  const filtered = useMemo(() => txs.filter(t => {
    // Filter by transaction type
    if (transactionTypeFilter === 'regular' && t.is_generated) {
      return false
    }
    if (transactionTypeFilter === 'recurring' && !t.is_generated) {
      return false
    }

    // Exclude fund transactions from the list
    if (t.from_fund === true) {
      return false
    }
    
    const txDate = parseLocalDate(t.tx_date) || new Date()
    
    let dateMatches = false

    // When viewing historical period, skip date filtering - data is already filtered by backend
    if (viewingPeriodId) {
      dateMatches = true
    }
    // For period transactions, check if the period overlaps with the filter range
    else if (t.period_start_date && t.period_end_date) {
      const periodStart = parseLocalDate(t.period_start_date) || new Date()
      const periodEnd = parseLocalDate(t.period_end_date) || new Date()
      
      if (dateFilterMode === 'current_month') {
        // Check if period overlaps with current month
        const monthStart = new Date(currentYear, currentMonth - 1, 1)
        const monthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999)
        dateMatches = periodStart <= monthEnd && periodEnd >= monthStart
      } else if (dateFilterMode === 'selected_month') {
        // Check if period overlaps with selected month
        const [year, month] = selectedMonth.split('-').map(Number)
        const monthStart = new Date(year, month - 1, 1)
        const monthEnd = new Date(year, month, 0, 23, 59, 59, 999)
        dateMatches = periodStart <= monthEnd && periodEnd >= monthStart
      } else if (dateFilterMode === 'date_range') {
        // Check if period overlaps with date range
        if (startDate && endDate) {
          const rangeStart = parseLocalDate(startDate) || new Date(0)
          const rangeEnd = parseLocalDate(endDate) || new Date()
          rangeEnd.setHours(23, 59, 59, 999)
          dateMatches = periodStart <= rangeEnd && periodEnd >= rangeStart
        } else {
          dateMatches = true // Show all if dates not set
        }
      } else if (dateFilterMode === 'all_time') {
        dateMatches = true
      } else {
        dateMatches = true // Show all if no date filter mode
      }
    } else {
      // Regular transaction - check tx_date
      if (dateFilterMode === 'current_month') {
        // Show only current month
        const txMonth = txDate.getMonth() + 1
        const txYear = txDate.getFullYear()
        dateMatches = txMonth === currentMonth && txYear === currentYear
      } else if (dateFilterMode === 'selected_month') {
        // Show selected month
        const [year, month] = selectedMonth.split('-').map(Number)
        const txMonth = txDate.getMonth() + 1
        const txYear = txDate.getFullYear()
        dateMatches = txMonth === month && txYear === year
      } else if (dateFilterMode === 'date_range') {
        // Show date range
        if (startDate && endDate) {
          // Use string comparison to avoid timezone issues with Date objects
          // tx_date is YYYY-MM-DD, startDate/endDate are YYYY-MM-DD
          const txDateStr = typeof t.tx_date === 'string' ? t.tx_date.split('T')[0] : (parseLocalDate(t.tx_date as string)?.toISOString().split('T')[0] || '')
          dateMatches = txDateStr >= startDate && txDateStr <= endDate
        } else {
          dateMatches = true // Show all if dates not set
        }
      } else if (dateFilterMode === 'all_time') {
        dateMatches = true
      } else {
        dateMatches = true // Show all if no date filter mode
      }
    }
    
    // Category filter: if 'all', show all transactions
    // Otherwise, match by category (handle both Hebrew and English categories)
    let categoryMatches = true
    if (categoryFilter && categoryFilter !== 'all') {
      const catName = getCategoryName(t.category)
      const txCategory = normalizeCategoryForFilter(catName)
      const filterCategory = normalizeCategoryForFilter(categoryFilter)
      // Match if normalized categories are equal, or if original categories match
      const normalizedMatch: boolean = txCategory !== null && filterCategory !== null && txCategory === filterCategory
      const directMatch: boolean = !!(catName && String(catName).trim() === String(categoryFilter).trim())
      categoryMatches = normalizedMatch || directMatch
    }
    
    // Exceptional filter: if 'all', show all; if 'only', show only exceptional
    const exceptionalMatches = filterExceptional === 'all' || 
      (filterExceptional === 'only' && t.is_exceptional === true)
    
    // Dated transactions filter: if 'all', show all; if 'only', show only dated transactions
    const datedMatches = filterDated === 'all' || 
      (filterDated === 'only' && t.period_start_date && t.period_end_date)
    
    // Type filter: all | Income | Expense | unforeseen (unforeseen = only is_unforeseen transactions)
    const typeMatches = filterType === 'all' 
      ? true 
      : filterType === 'unforeseen' 
        ? t.is_unforeseen === true 
        : t.type === filterType
    
    const result = dateMatches && typeMatches && exceptionalMatches && categoryMatches && datedMatches
    
    return result
  }), [txs, transactionTypeFilter, filterType, filterExceptional, filterDated, categoryFilter, dateFilterMode, currentMonth, currentYear, selectedMonth, startDate, endDate, viewingPeriodId])
  
  // Expand period transactions into monthly splits for display
  // When filtering by month, show each period transaction split by month with proportional amounts
  const expandedTransactions = useMemo(() => {
    const expanded: (Transaction & { monthKey?: string; proportionalAmount?: number; fullAmount?: number; daysInMonth?: number; totalDays?: number })[] = []
    
    filtered.forEach(tx => {
      // If it's a period transaction, always split it by month
      if (tx.period_start_date && tx.period_end_date) {
        const splits = splitPeriodTransactionByMonth(tx)
        
        // If filtering by month, show only the relevant month
        if (dateFilterMode === 'current_month') {
          const currentMonthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`
          const monthSplit = splits.find(s => s.monthKey === currentMonthKey)
          if (monthSplit) {
            expanded.push(monthSplit)
          }
        } else if (dateFilterMode === 'selected_month' && selectedMonth) {
          const monthSplit = splits.find(s => s.monthKey === selectedMonth)
          if (monthSplit) {
            expanded.push(monthSplit)
          }
        } else if (dateFilterMode === 'date_range' && startDate && endDate) {
          // For date range, show all splits that fall within the range
          const rangeStart = new Date(startDate)
          const rangeEnd = new Date(endDate)
          splits.forEach(split => {
            const splitMonth = new Date(split.monthKey + '-01')
            const monthStart = new Date(splitMonth.getFullYear(), splitMonth.getMonth(), 1)
            const monthEnd = new Date(splitMonth.getFullYear(), splitMonth.getMonth() + 1, 0)
            
            // Check if this month overlaps with the date range
            if (monthStart <= rangeEnd && monthEnd >= rangeStart) {
              expanded.push(split)
            }
          })
        } else {
          // For 'all_time' or no filter, show all splits
          expanded.push(...splits)
        }
      } else {
        // Regular transaction - add as-is
        expanded.push(tx)
      }
    })
    
    return expanded
  }, [filtered, dateFilterMode, currentMonth, currentYear, selectedMonth, startDate, endDate])
  
  // Calculate how many transactions match category (regardless of date filter)
  const transactionsMatchingCategory = categoryFilter === 'all' 
    ? txs.filter(t => !t.from_fund).length 
    : txs.filter(t => {
        // First filter out fund transactions
        if (t.from_fund === true) return false
        
        const catName = getCategoryName(t.category)
        const txCategory = normalizeCategoryForFilter(catName)
        const filterCategory = normalizeCategoryForFilter(categoryFilter)
        return (txCategory !== null && filterCategory !== null && txCategory === filterCategory) ||
               (catName && String(catName).trim() === String(categoryFilter).trim())
      }).length

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex flex-col max-h-[480px] overflow-hidden"
    >
      <div className="mb-4 flex-shrink-0">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          רשימת עסקאות
        </h2>
      </div>
      <div className="flex flex-col flex-1 min-h-0">
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col flex-1 min-h-0">
          <div className="bg-gray-50 dark:bg-gray-700 px-6 py-4 border-b border-gray-200 dark:border-gray-600 flex-shrink-0">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end mb-4">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  <select
                    className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-nowrap"
                    value={filterType}
                    onChange={e => onSetFilterType(e.target.value as 'all' | 'Income' | 'Expense' | 'unforeseen')}
                  >
                    <option value="all">הכל</option>
                    <option value="Income">הכנסות</option>
                    <option value="Expense">הוצאות</option>
                    <option value="unforeseen">עסקאות לא צפויות</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={filterExceptional === 'only'}
                      onChange={e => onSetFilterExceptional(e.target.checked ? 'only' : 'all')}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
                    />
                    רק חריגות
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={filterDated === 'only'}
                      onChange={e => onSetFilterDated(e.target.checked ? 'only' : 'all')}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
                    />
                    רק תאריכיות
                  </label>
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    <span>קטגוריה:</span>
                    <select
                      className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={categoryFilter}
                      onChange={(e) => onSetCategoryFilter(e.target.value)}
                    >
                      <option value="all">כל הקטגוריות</option>
                      {allCategoryOptions.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400 flex-shrink-0">טוען...</div>
            ) : expandedTransactions.length === 0 ? (
              <div className="text-center py-8 space-y-3 flex-shrink-0">
                <div className="text-gray-500 dark:text-gray-400 font-medium">אין עסקאות להצגה</div>
                {txs.length > 0 && (
                  <div className="text-sm text-gray-400 dark:text-gray-500 space-y-2">
                    {categoryFilter !== 'all' && (
                      <>
                        <div>הסינון לפי קטגוריה "{categoryFilter}" לא מצא תוצאות</div>
                        {transactionsMatchingCategory > 0 && dateFilterMode === 'current_month' && (
                          <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <div className="font-medium text-blue-800 dark:text-blue-200 mb-1">
                              נמצאו {transactionsMatchingCategory} עסקאות עם הקטגוריה "{categoryFilter}"
                            </div>
                            <div className="text-blue-700 dark:text-blue-300 text-xs mb-2">
                              אבל הן לא בחודש הנוכחי. שנה את סינון התאריך לראות אותן.
                            </div>
                            <button
                              onClick={() => onSetDateFilterMode('date_range')}
                              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                            >
                              הצג את כל העסקאות עם הקטגוריה הזו
                            </button>
                          </div>
                        )}
                        {transactionsMatchingCategory === 0 && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            אין עסקאות עם הקטגוריה "{categoryFilter}" במערכת
                          </div>
                        )}
                      </>
                    )}
                    {categoryFilter === 'all' && dateFilterMode === 'current_month' && (
                      <div className="mt-1">התצוגה מוגבלת לחודש הנוכחי - נסה לשנות את סינון התאריך לראות עסקאות מחודשים קודמים</div>
                    )}
                    <div className="mt-2 text-xs">
                      סך הכל {txs.filter(t => !t.from_fund).length} עסקאות במערכת
                      {categoryFilter !== 'all' && transactionsMatchingCategory > 0 && (
                        <span> • {transactionsMatchingCategory} עם הקטגוריה "{categoryFilter}"</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div id="transactions-list" className="space-y-3 p-4">
                {expandedTransactions.map(tx => {
                  // Use monthKey for period transactions to ensure unique keys
                  const uniqueKey = (tx as any).monthKey ? `${tx.id}-${(tx as any).monthKey}` : tx.id
                  return (
                    <div key={uniqueKey} className="border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-md transition-shadow cursor-pointer">
                      <button
                        className="w-full px-4 py-3 text-right flex items-center gap-2 sm:gap-4 justify-between min-w-0"
                        onClick={() => onShowTransactionDetails(tx)}
                      >
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 ${tx.type === 'Income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {tx.type === 'Income' ? 'הכנסה' : 'הוצאה'}
                          </span>
                          {tx.is_generated && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800 whitespace-nowrap flex-shrink-0">
                              מחזורי
                            </span>
                          )}
                          {tx.is_unforeseen && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800 whitespace-nowrap flex-shrink-0">
                              לא צפויה
                            </span>
                          )}
                          {tx.period_start_date && tx.period_end_date ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800 whitespace-nowrap flex-shrink-0" key={`dated-${tx.id}`}>
                              תאריכית
                            </span>
                          ) : null}
                          <span className="text-sm text-gray-600 dark:text-gray-300 truncate min-w-0">
                            {tx.is_unforeseen && tx.description ? (
                              tx.description
                            ) : (() => {
                              const catName = getCategoryName(tx.category);
                              return catName ? (CATEGORY_LABELS[catName] || catName) : '-';
                            })()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                          <div className="text-right">
                            <div className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDate(tx.tx_date)}</div>
                            {tx.period_start_date && tx.period_end_date ? (
                              <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-0.5 whitespace-nowrap" key={`dates-${tx.id}`}>
                                \u200E{formatDate(tx.period_start_date, '', {day: '2-digit', month: '2-digit'})} - {formatDate(tx.period_end_date, '', {day: '2-digit', month: '2-digit'})}
                              </div>
                            ) : null}
                          </div>
                          <div className="text-right">
                            <span className={`text-lg font-semibold whitespace-nowrap ${tx.type === 'Income' ? 'text-green-600' : 'text-red-600'}`}>
                              {formatCurrency((tx as any).proportionalAmount !== undefined ? (tx as any).proportionalAmount : tx.amount)} ₪
                            </span>
                            {(tx as any).proportionalAmount !== undefined && (tx as any).proportionalAmount !== (tx as any).fullAmount && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                מתוך {formatCurrency((tx as any).fullAmount)} ₪
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
