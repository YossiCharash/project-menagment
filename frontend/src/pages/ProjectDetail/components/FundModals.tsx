import { motion } from 'framer-motion'
import api from '../../../lib/api'
import { Transaction } from '../types'
import { getCategoryName } from '../utils'
import { formatDate } from '../../../lib/utils'
import { CATEGORY_LABELS } from '../../../utils/calculations'
import FundSetupModal from '../../../components/FundSetupModal'

interface FundModalsProps {
  showEditFundModal: boolean
  showCreateFundModal: boolean
  showFundTransactionsModal: boolean
  fundData: any
  monthlyFundAmount: number
  currentBalance: number
  fundUpdateScope: 'from_start' | 'from_this_month' | 'only_this_month'
  updatingFund: boolean
  fundCategoryFilter: string
  id: string | undefined
  projectStartDate: string | null
  onCloseEditFund: () => void
  onCloseCreateFund: () => void
  onCloseFundTransactions: () => void
  onSetMonthlyFundAmount: (amount: number) => void
  onSetCurrentBalance: (balance: number) => void
  onSetFundUpdateScope: (scope: 'from_start' | 'from_this_month' | 'only_this_month') => void
  onLoadFundData: () => Promise<void>
  onLoadProjectInfo: () => Promise<void>
  onShowDocumentsModal: (tx: Transaction) => Promise<void>
  onEditTransaction: (tx: Transaction) => void
  onDeleteTransaction: (id: number, tx: Transaction) => void
  showDeleteFundModal: boolean
  deleteFundPassword: string
  deleteFundPasswordError: string
  isDeletingFund: boolean
  onCloseDeleteFundModal: () => void
  onSetDeleteFundPassword: (password: string) => void
  onDeleteFund: () => Promise<void>
}

export default function FundModals({
  showEditFundModal,
  showCreateFundModal,
  showFundTransactionsModal,
  fundData,
  monthlyFundAmount,
  currentBalance,
  fundUpdateScope,
  updatingFund,
  fundCategoryFilter,
  id,
  projectStartDate,
  onCloseEditFund,
  onCloseCreateFund,
  onCloseFundTransactions,
  onSetMonthlyFundAmount,
  onSetCurrentBalance,
  onSetFundUpdateScope,
  onLoadFundData,
  onLoadProjectInfo,
  onShowDocumentsModal,
  onEditTransaction,
  onDeleteTransaction,
  showDeleteFundModal,
  deleteFundPassword,
  deleteFundPasswordError,
  isDeletingFund,
  onCloseDeleteFundModal,
  onSetDeleteFundPassword,
  onDeleteFund
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
      {showCreateFundModal && (
        <FundSetupModal
          isOpen={showCreateFundModal}
          onClose={onCloseCreateFund}
          onSuccess={async () => {
            await onLoadProjectInfo()
            await onLoadFundData()
          }}
          projectId={Number(id)}
          projectStartDate={projectStartDate}
          monthlyFundAmount={monthlyFundAmount}
          showMonthlyAmountInput={true}
        />
      )}

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
      {/* Delete Fund Modal */}
      {showDeleteFundModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-red-600 dark:text-red-400">
                מחיקת קופה
              </h3>
              <button
                onClick={onCloseDeleteFundModal}
                disabled={isDeletingFund}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              מחיקת הקופה היא פעולה בלתי הפיכה. הזן את סיסמתך לאישור.
            </p>
            {/* Warning about what will be deleted */}
            {fundData && fundData.transactions.length > 0 && (() => {
              const txCount = fundData.transactions.length
              const docCount = fundData.transactions.reduce((sum: number, tx: any) => sum + (tx.documents_count || 0), 0)
              return (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">
                    שים לב! הפעולה תמחק לצמיתות:
                  </p>
                  <ul className="text-sm text-red-600 dark:text-red-400 list-disc list-inside space-y-0.5">
                    <li>{txCount} עסקאות קופה</li>
                    {docCount > 0 && <li>{docCount} מסמכים מצורפים</li>}
                  </ul>
                </div>
              )
            })()}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                סיסמה
              </label>
              <input
                type="password"
                value={deleteFundPassword}
                onChange={(e) => onSetDeleteFundPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onDeleteFund() }}
                placeholder="הכנס סיסמה"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                disabled={isDeletingFund}
              />
              {deleteFundPasswordError && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">{deleteFundPasswordError}</p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onDeleteFund}
                disabled={isDeletingFund || !deleteFundPassword}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isDeletingFund ? 'מוחק...' : 'מחק קופה'}
              </button>
              <button
                type="button"
                onClick={onCloseDeleteFundModal}
                disabled={isDeletingFund}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                ביטול
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  )
}
