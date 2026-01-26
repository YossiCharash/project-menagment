import { motion } from 'framer-motion'
import api from '../../../lib/api'
import { Transaction } from '../types'
import { getCategoryName } from '../utils'
import { formatDate, parseLocalDate } from '../../../lib/utils'
import { CATEGORY_LABELS } from '../../../utils/calculations'
import { calculateMonthlyIncomeAccrual } from '../../../utils/calculations'

interface FundModalsProps {
  showEditFundModal: boolean
  showCreateFundModal: boolean
  showFundTransactionsModal: boolean
  fundData: any
  monthlyFundAmount: number
  currentBalance: number
  fundUpdateScope: 'from_start' | 'from_this_month' | 'only_this_month'
  fundScopePreviousYear: 'only_period' | 'also_current' | null
  updatingFund: boolean
  creatingFund: boolean
  fundCategoryFilter: string
  selectedPeriod: { start_date?: string; end_date?: string } | null
  isViewingHistoricalPeriod: boolean
  id: string | undefined
  onCloseEditFund: () => void
  onCloseCreateFund: () => void
  onCloseFundTransactions: () => void
  onSetMonthlyFundAmount: (amount: number) => void
  onSetCurrentBalance: (balance: number) => void
  onSetFundUpdateScope: (scope: 'from_start' | 'from_this_month' | 'only_this_month') => void
  onSetFundScopePreviousYear: (scope: 'only_period' | 'also_current' | null) => void
  onLoadFundData: () => Promise<void>
  onLoadProjectInfo: () => Promise<void>
  onShowDocumentsModal: (tx: Transaction) => Promise<void>
  onEditTransaction: (tx: Transaction) => void
  onDeleteTransaction: (id: number, tx: Transaction) => void
}

export default function FundModals({
  showEditFundModal,
  showCreateFundModal,
  showFundTransactionsModal,
  fundData,
  monthlyFundAmount,
  currentBalance,
  fundUpdateScope,
  fundScopePreviousYear,
  updatingFund,
  creatingFund,
  fundCategoryFilter,
  selectedPeriod,
  isViewingHistoricalPeriod,
  id,
  onCloseEditFund,
  onCloseCreateFund,
  onCloseFundTransactions,
  onSetMonthlyFundAmount,
  onSetCurrentBalance,
  onSetFundUpdateScope,
  onSetFundScopePreviousYear,
  onLoadFundData,
  onLoadProjectInfo,
  onShowDocumentsModal,
  onEditTransaction,
  onDeleteTransaction
}: FundModalsProps) {
  return (
    <>
      {/* Edit Fund Modal */}
      {showEditFundModal && fundData && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                ערוך קופה
              </h3>
              <button
                onClick={onCloseEditFund}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault()
                try {
                  // Build query params - always include monthly_amount (even if 0) and current_balance
                  const params = new URLSearchParams()
                  params.append('monthly_amount', (monthlyFundAmount || 0).toString())
                  if (currentBalance !== undefined && currentBalance !== null) {
                    params.append('current_balance', currentBalance.toString())
                  }
                  params.append('update_scope', fundUpdateScope)
                  
                  await api.put(`/projects/${id}/fund?${params.toString()}`)
                  // Reload fund data
                  await onLoadFundData()
                  onCloseEditFund()
                } catch (err: any) {
                  alert(err.response?.data?.detail || 'שגיאה בעדכון הקופה')
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  יתרה נוכחית (₪)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={currentBalance}
                  onChange={(e) => onSetCurrentBalance(Number(e.target.value))}
                  placeholder="הכנס יתרה נוכחית"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  יתרת הקופה הנוכחית (ניתן לערוך ידנית)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  סכום חודשי (₪)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={monthlyFundAmount}
                  onChange={(e) => onSetMonthlyFundAmount(Number(e.target.value))}
                  placeholder="הכנס סכום חודשי"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  הסכום יתווסף לקופה כל חודש באופן אוטומטי
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl space-y-3">
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                  היקף השינוי:
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="updateScope"
                      value="from_start"
                      checked={fundUpdateScope === 'from_start'}
                      onChange={() => onSetFundUpdateScope('from_start')}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">
                      מתחילת החוזה
                      <span className="block text-xs text-gray-500 dark:text-gray-400">מחשב מחדש את כל יתרת הקופה רטרואקטיבית</span>
                    </span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="updateScope"
                      value="from_this_month"
                      checked={fundUpdateScope === 'from_this_month'}
                      onChange={() => onSetFundUpdateScope('from_this_month')}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">
                      מהחודש הזה והלאה
                      <span className="block text-xs text-gray-500 dark:text-gray-400">מעדכן את הסכום החודשי החל מהחודש הנוכחי</span>
                    </span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="updateScope"
                      value="only_this_month"
                      checked={fundUpdateScope === 'only_this_month'}
                      onChange={() => onSetFundUpdateScope('only_this_month')}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">
                      רק החודש הזה (חד-פעמי)
                      <span className="block text-xs text-gray-500 dark:text-gray-400">שינוי חד-פעמי ליתרה מבלי לשנות את הסכום החודשי הקבוע</span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={updatingFund}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {updatingFund ? 'מעדכן...' : 'עדכן קופה'}
                </button>
                <button
                  type="button"
                  onClick={onCloseEditFund}
                  disabled={updatingFund}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  ביטול
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Create Fund Modal */}
      {showCreateFundModal && (() => {
        const periodEnd = selectedPeriod?.end_date ? parseLocalDate(selectedPeriod.end_date) : null
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        /** Show prompt when viewing a period that ended in the past (incl. earlier this year) */
        const isAddingFundInPreviousYear = !!(
          isViewingHistoricalPeriod &&
          selectedPeriod?.start_date &&
          selectedPeriod?.end_date &&
          periodEnd &&
          periodEnd.getTime() < today.getTime()
        )
        const canSubmit = monthlyFundAmount > 0 && (!isAddingFundInPreviousYear || fundScopePreviousYear !== null)

        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  הוסף קופה לפרויקט
                </h3>
                <button
                  onClick={onCloseCreateFund}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!canSubmit) return
                  try {
                    const params = new URLSearchParams()
                    params.append('monthly_amount', monthlyFundAmount.toString())

                    if (isAddingFundInPreviousYear && fundScopePreviousYear) {
                      const periodStart = parseLocalDate(selectedPeriod!.start_date!)
                      const periodEndDate = parseLocalDate(selectedPeriod!.end_date!)
                      if (!periodStart || !periodEndDate) {
                        alert('שגיאה: לא ניתן לחשב תאריכי תקופה')
                        return
                      }
                      const todayDate = new Date()
                      todayDate.setHours(12, 0, 0, 0)

                      if (fundScopePreviousYear === 'only_period') {
                        const initialBalance = calculateMonthlyIncomeAccrual(monthlyFundAmount, periodStart, periodEndDate)
                        params.set('monthly_amount', '0')
                        params.append('initial_balance', initialBalance.toString())
                        params.append('last_monthly_addition', selectedPeriod!.end_date!)
                      } else {
                        const initialBalance = calculateMonthlyIncomeAccrual(monthlyFundAmount, periodStart, todayDate)
                        const y = todayDate.getFullYear()
                        const m = String(todayDate.getMonth() + 1).padStart(2, '0')
                        const d = String(todayDate.getDate()).padStart(2, '0')
                        params.append('initial_balance', initialBalance.toString())
                        params.append('last_monthly_addition', `${y}-${m}-${d}`)
                      }
                    }

                    await api.post(`/projects/${id}/fund?${params.toString()}`)
                    await onLoadProjectInfo()
                    await onLoadFundData()
                    onCloseCreateFund()
                  } catch (err: any) {
                    const status = err.response?.status
                    if (status >= 200 && status < 300) {
                      await onLoadProjectInfo()
                      await onLoadFundData()
                      onCloseCreateFund()
                    } else {
                      alert(err.response?.data?.detail || 'שגיאה ביצירת הקופה')
                    }
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    סכום חודשי (₪)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={monthlyFundAmount}
                    onChange={(e) => onSetMonthlyFundAmount(Number(e.target.value))}
                    placeholder="הכנס סכום חודשי"
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  {(!isAddingFundInPreviousYear || fundScopePreviousYear === 'also_current') && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      הסכום יתווסף לקופה כל חודש באופן אוטומטי
                    </p>
                  )}
                </div>

                {isAddingFundInPreviousYear && (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                      אתה מוסיף קופה בשנה קודמת. איך ליצור את הקופה?
                    </p>
                    <div className="space-y-2">
                      <label className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 dark:border-amber-700 cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-900/30">
                        <input
                          type="radio"
                          name="fundScopePreviousYear"
                          checked={fundScopePreviousYear === 'only_period'}
                          onChange={() => onSetFundScopePreviousYear('only_period')}
                          className="mt-1 text-amber-600 dark:text-amber-400"
                        />
                        <div>
                          <span className="font-medium text-gray-900 dark:text-white">רק לתקופה ההיא</span>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                            קופה עם יתרה מחושבת מתחילת התקופה לסוף התקופה בלבד, בלי הוספה חודשית להמשך
                          </p>
                        </div>
                      </label>
                      <label className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 dark:border-amber-700 cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-900/30">
                        <input
                          type="radio"
                          name="fundScopePreviousYear"
                          checked={fundScopePreviousYear === 'also_current'}
                          onChange={() => onSetFundScopePreviousYear('also_current')}
                          className="mt-1 text-amber-600 dark:text-amber-400"
                        />
                        <div>
                          <span className="font-medium text-gray-900 dark:text-white">גם לתקופה הנוכחית</span>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                            קופה עם יתרה מתחילת התקופה עד היום, והסכום החודשי ימשיך להתווסף מדי חודש
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={creatingFund || !canSubmit}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {creatingFund ? 'יוצר...' : 'צור קופה'}
                  </button>
                  <button
                    type="button"
                    onClick={onCloseCreateFund}
                    disabled={creatingFund}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                  >
                    ביטול
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )
      })()}

      {/* Fund Transactions Modal */}
      {showFundTransactionsModal && fundData && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={onCloseFundTransactions}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  עסקאות מהקופה
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {fundData.transactions.length} עסקאות
                </p>
              </div>
              <button
                onClick={onCloseFundTransactions}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {fundData.transactions.length === 0 ? (
                <div className="text-center py-16">
                  <svg
                    className="w-24 h-24 text-gray-300 dark:text-gray-600 mx-auto mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                  <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    אין עסקאות מהקופה
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    עדיין לא בוצעו עסקאות מהקופה
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {fundData.transactions
                    .filter(tx => fundCategoryFilter === 'all' || tx.category === fundCategoryFilter)
                    .map((tx) => (
                    <div key={tx.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">
                              {formatDate(tx.tx_date, '', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {(() => {
                                const catName = getCategoryName(tx.category);
                                return catName ? (CATEGORY_LABELS[catName] || catName) : 'קופה';
                              })()}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className={`text-lg font-bold ${
                            tx.type === 'Income' 
                              ? 'text-green-600 dark:text-green-400' 
                              : 'text-red-600 dark:text-red-400'
                          }`}>
                            {tx.type === 'Income' ? '+' : '-'}{tx.amount.toLocaleString('he-IL')} ₪
                          </span>
                        </div>
                      </div>

                      {tx.description && (
                        <div className="mb-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400">תיאור: </span>
                          <span className="text-sm text-gray-700 dark:text-gray-300">{tx.description}</span>
                        </div>
                      )}

                      {tx.created_by_user && (
                        <div className="mb-2 flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            בוצע על ידי: {tx.created_by_user.full_name}
                          </span>
                        </div>
                      )}

                      {tx.notes && (
                        <div className="mb-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400">הערות: </span>
                          <span className="text-sm text-gray-700 dark:text-gray-300">{tx.notes}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                        <button
                          onClick={async () => {
                            await onShowDocumentsModal(tx)
                          }}
                          className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          מסמכים
                        </button>
                        <button
                          onClick={() => onEditTransaction({ ...tx, from_fund: true } as Transaction)}
                          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          ערוך
                        </button>
                        <button
                          onClick={() => onDeleteTransaction(tx.id, tx as Transaction)}
                          className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          מחק
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </>
  )
}
