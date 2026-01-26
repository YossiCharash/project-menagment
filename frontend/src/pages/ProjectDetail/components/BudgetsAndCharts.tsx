import { motion } from 'framer-motion'
import { FileText } from 'lucide-react'
import BudgetCard from '../../../components/charts/BudgetCard'
import { BudgetWithSpending } from '../../../types/api'
import { UnforeseenTransaction } from '../../../types/api'
import { formatDate } from '../../../lib/utils'
import { useRef, useState, useEffect } from 'react'

interface BudgetsAndChartsProps {
  chartsLoading: boolean
  projectBudgets: BudgetWithSpending[]
  budgetDeleteLoading: number | null
  fundData: any
  fundLoading: boolean
  unforeseenTransactions: UnforeseenTransaction[]
  unforeseenTransactionsLoading: boolean
  onDeleteBudget: (id: number) => void
  onEditBudget: (budget: BudgetWithSpending) => void
  onShowFundTransactionsModal: () => void
  onShowEditFundModal: () => void
  onShowUnforeseenTransactionsModal: () => void
  onShowCreateUnforeseenTransactionModal: () => void
  onResetUnforeseenForm: () => void
  onViewUnforeseenTransaction?: (tx: UnforeseenTransaction) => void
}

export default function BudgetsAndCharts({
  chartsLoading,
  projectBudgets,
  budgetDeleteLoading,
  fundData,
  fundLoading,
  unforeseenTransactions,
  unforeseenTransactionsLoading,
  onDeleteBudget,
  onEditBudget,
  onShowFundTransactionsModal,
  onShowEditFundModal,
  onShowUnforeseenTransactionsModal,
  onShowCreateUnforeseenTransactionModal,
  onResetUnforeseenForm,
  onViewUnforeseenTransaction
}: BudgetsAndChartsProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [needsScrolling, setNeedsScrolling] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [isAtTop, setIsAtTop] = useState(true)
  const [isAtBottom, setIsAtBottom] = useState(false)

  // Check if scrolling is needed
  useEffect(() => {
    const checkScrolling = () => {
      if (scrollContainerRef.current) {
        const container = scrollContainerRef.current
        const hasScroll = container.scrollHeight > container.clientHeight
        setNeedsScrolling(hasScroll)
        
        // Update scroll position state
        const { scrollTop, scrollHeight, clientHeight } = container
        setIsAtTop(scrollTop <= 1)
        setIsAtBottom(scrollTop + clientHeight >= scrollHeight - 1)
      }
    }

    checkScrolling()
    // Recheck when transactions change
    const timeoutId = setTimeout(checkScrolling, 100)
    
    // Also check on window resize
    window.addEventListener('resize', checkScrolling)
    
    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', checkScrolling)
    }
  }, [unforeseenTransactions, unforeseenTransactionsLoading])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1 md:mb-0">
            תקציבים לקטגוריות ומגמות פיננסיות
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            מעקב אחר התקציבים וההוצאות בכל קטגוריה ומגמות פיננסיות
          </p>
        </div>
      </div>

      {chartsLoading ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-96 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="mt-6 h-96 bg-gray-100 dark:bg-gray-700 rounded-2xl animate-pulse" />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Budgets Section - Left Side */}
            <div className="flex flex-col gap-6">
              {projectBudgets && projectBudgets.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {projectBudgets.map((budget) => (
                    <BudgetCard
                      key={budget.id}
                      budget={budget}
                      onDelete={() => onDeleteBudget(budget.id)}
                      onEdit={() => onEditBudget(budget)}
                      deleting={budgetDeleteLoading === budget.id}
                    />
                  ))}
                </div>
              ) : (
                !chartsLoading && (
                  <div className="mt-6 text-center py-8 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600">
                    <p className="text-gray-500 dark:text-gray-400">
                      אין תקציבים לקטגוריות לפרויקט זה
                    </p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-2 mb-4">
                      הוסף תקציבים לקטגוריות כדי לעקוב אחר הוצאות מול תכנון
                    </p>
                  </div>
                )
              )}
            </div>

            {/* Fund and Unforeseen Transactions Section - Right Side */}
            <div className="flex flex-col gap-6">
              {/* Fund Section */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 h-full">
                <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 whitespace-nowrap">פרטי הקופה</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">מעקב אחר יתרת הקופה ועסקאות מהקופה</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {fundData && fundData.transactions && fundData.transactions.length > 0 && (
                      <button onClick={onShowFundTransactionsModal} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center gap-2 whitespace-nowrap">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                        עסקאות קופה ({fundData.transactions.length})
                      </button>
                    )}
                    {fundData && (
                      <button onClick={onShowEditFundModal} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm flex items-center gap-2 whitespace-nowrap">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        ערוך קופה
                      </button>
                    )}
                  </div>
                </div>
                {fundLoading ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">טוען פרטי קופה...</div>
                ) : fundData ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 overflow-hidden min-w-0">
                      <div className="flex items-center justify-between mb-2 min-w-0 gap-2">
                        <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300 whitespace-nowrap min-w-0 flex-1">יתרה נוכחית</h3>
                        <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                      </div>
                      <p className="text-3xl font-bold text-blue-900 dark:text-blue-100 whitespace-nowrap">{fundData.current_balance.toLocaleString('he-IL')} ₪</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 whitespace-nowrap">יתרה זמינה כעת</p>
                    </div>
                    <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border border-green-200 dark:border-green-800 rounded-xl p-6 overflow-hidden min-w-0">
                      <div className="flex items-center justify-between mb-2 min-w-0 gap-2">
                        <h3 className="text-sm font-medium text-green-700 dark:text-green-300 whitespace-nowrap min-w-0 flex-1">כמה היה מתחילה</h3>
                        <svg className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <p className="text-3xl font-bold text-green-900 dark:text-green-100 whitespace-nowrap">{fundData.initial_total.toLocaleString('he-IL')} ₪</p>
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1 whitespace-nowrap">סכום כולל שנכנס לקופה</p>
                    </div>
                    <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border border-red-200 dark:border-red-800 rounded-xl p-6 overflow-hidden min-w-0">
                      <div className="flex items-center justify-between mb-2 min-w-0 gap-2">
                        <h3 className="text-sm font-medium text-red-700 dark:text-red-300 whitespace-nowrap min-w-0 flex-1">כמה יצא</h3>
                        <svg className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                      </div>
                      <p className="text-3xl font-bold text-red-900 dark:text-red-100 whitespace-nowrap">{fundData.total_deductions.toLocaleString('he-IL')} ₪</p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1 whitespace-nowrap">סה"כ סכום שירד מהקופה</p>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border border-purple-200 dark:border-purple-800 rounded-xl p-6 overflow-hidden min-w-0">
                      <div className="flex items-center justify-between mb-2 min-w-0 gap-2">
                        <h3 className="text-sm font-medium text-purple-700 dark:text-purple-300 whitespace-nowrap min-w-0 flex-1">סכום חודשי</h3>
                        <svg className="w-6 h-6 text-purple-600 dark:text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      </div>
                      <p className="text-3xl font-bold text-purple-900 dark:text-purple-100 whitespace-nowrap">{(fundData.monthly_amount || 0).toLocaleString('he-IL')} ₪</p>
                      <p className="text-xs text-purple-600 dark:text-purple-400 mt-1 whitespace-nowrap">מתווסף אוטומטית כל חודש</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">לא ניתן לטעון את פרטי הקופה</div>
                )}
              </div>
              
              {/* Unforeseen Transactions Section */}
              <div 
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex flex-col"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
              >
                <div className="mb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 flex-shrink-0">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1 whitespace-nowrap">עסקאות לא צפויות</h2>
                    <p className="text-xs text-gray-600 dark:text-gray-400">ניהול עסקאות לא צפויות עם חישוב רווח/הפסד</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {unforeseenTransactions.length > 0 && (
                      <button 
                        onClick={onShowUnforeseenTransactionsModal} 
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                        כל העסקאות ({unforeseenTransactions.length})
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        onResetUnforeseenForm()
                        onShowCreateUnforeseenTransactionModal()
                      }} 
                      className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-xs flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      עסקה חדשה
                    </button>
                  </div>
                </div>
                {unforeseenTransactionsLoading ? (
                  <div className="text-center py-6 text-gray-500 dark:text-gray-400 flex-shrink-0 text-sm">טוען עסקאות לא צפויות...</div>
                ) : unforeseenTransactions.length > 0 ? (
                  <div 
                    ref={scrollContainerRef}
                    className="max-h-[220px] pr-2 space-y-2 overflow-y-auto"
                    style={{ 
                      overscrollBehavior: (isAtTop || isAtBottom) ? 'auto' : 'contain'
                    }}
                    onScroll={() => {
                      if (!scrollContainerRef.current) return
                      const container = scrollContainerRef.current
                      const { scrollTop, scrollHeight, clientHeight } = container
                      setIsAtTop(scrollTop <= 1)
                      setIsAtBottom(scrollTop + clientHeight >= scrollHeight - 1)
                    }}
                    onWheel={(e) => {
                      if (!scrollContainerRef.current || !needsScrolling) return
                      
                      const container = scrollContainerRef.current
                      const { scrollTop, scrollHeight, clientHeight } = container
                      const atTop = scrollTop <= 1
                      const atBottom = scrollTop + clientHeight >= scrollHeight - 1
                      
                      // If scrolling down at bottom, allow page scroll
                      if (e.deltaY > 0 && atBottom) {
                        // Don't prevent default - let it scroll the page
                        return
                      }
                      
                      // If scrolling up at top, allow page scroll
                      if (e.deltaY < 0 && atTop) {
                        // Don't prevent default - let it scroll the page
                        return
                      }
                      
                      // Otherwise, prevent default to keep scroll within container
                      e.preventDefault()
                      e.stopPropagation()
                      container.scrollTop += e.deltaY
                    }}
                  >
                    {unforeseenTransactions.map((tx) => (
                      <div 
                        key={tx.id} 
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:border-blue-400 dark:hover:border-blue-500 transition-all cursor-pointer group"
                        onClick={() => {
                          if (onViewUnforeseenTransaction) {
                            onViewUnforeseenTransaction(tx)
                          } else {
                            onShowUnforeseenTransactionsModal()
                          }
                        }}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <h3 className="font-semibold text-sm text-gray-900 dark:text-white">
                              {tx.description || `עסקה #${tx.id}`}
                            </h3>
                            <span
                              className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                                tx.status === 'executed'
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                  : tx.status === 'waiting_for_approval'
                                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {tx.status === 'draft' && 'טיוטה'}
                              {tx.status === 'waiting_for_approval' && 'מחכה לאישור'}
                              {tx.status === 'executed' && 'בוצע'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-base font-bold ${
                                tx.profit_loss >= 0
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {tx.profit_loss >= 0 ? '+' : ''}{tx.profit_loss.toLocaleString('he-IL')} ₪
                            </span>
                            <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">הכנסה: </span>
                            <span className="font-medium text-green-600 dark:text-green-400">
                              {tx.income_amount.toLocaleString('he-IL')} ₪
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">הוצאות: </span>
                            <span className="font-medium text-red-600 dark:text-red-400">
                              {tx.total_expenses.toLocaleString('he-IL')} ₪
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                    <p className="mb-2 text-sm">אין עסקאות לא צפויות</p>
                    <button
                      onClick={() => {
                        onResetUnforeseenForm()
                        onShowCreateUnforeseenTransactionModal()
                      }}
                      className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-xs"
                    >
                      צור עסקה חדשה
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </motion.div>
  )
}
