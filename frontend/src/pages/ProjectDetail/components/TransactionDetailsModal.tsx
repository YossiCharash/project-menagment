import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { Transaction } from '../types'
import { getCategoryName, formatCurrency } from '../utils'
import { PAYMENT_METHOD_LABELS } from '../constants'
import { formatDate } from '../../../lib/utils'
import { CATEGORY_LABELS } from '../../../utils/calculations'

interface TransactionDetailsModalProps {
  isOpen: boolean
  transaction: Transaction | null
  suppliers: Array<{ id: number; name: string }>
  onClose: () => void
  onShowDocumentsModal: (tx: Transaction) => Promise<void>
  onEditTransaction: (tx: Transaction) => void
  onDeleteTransaction: (id: number, tx: Transaction) => void
}

export default function TransactionDetailsModal({
  isOpen,
  transaction,
  suppliers,
  onClose,
  onShowDocumentsModal,
  onEditTransaction,
  onDeleteTransaction
}: TransactionDetailsModalProps) {
  if (!isOpen || !transaction) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex-1">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
              פרטי עסקה
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {transaction.description || `עסקה #${transaction.id}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          <div className="space-y-6">
            {/* Transaction Type and Amount */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <span className={`px-4 py-2 rounded-full text-sm font-semibold ${transaction.type === 'Income' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                  {transaction.type === 'Income' ? 'הכנסה' : 'הוצאה'}
                </span>
                {transaction.is_generated && (
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800">
                    מחזורי
                  </span>
                )}
                {transaction.is_unforeseen && (
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800">
                    לא צפויה
                  </span>
                )}
                {transaction.period_start_date && transaction.period_end_date && (
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
                    תאריכית
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className={`text-3xl font-bold ${transaction.type === 'Income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatCurrency((transaction as any).proportionalAmount !== undefined ? (transaction as any).proportionalAmount : transaction.amount)} ₪
                </span>
                {(transaction as any).proportionalAmount !== undefined && (transaction as any).proportionalAmount !== (transaction as any).fullAmount && (
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    מתוך {formatCurrency((transaction as any).fullAmount)} ₪
                  </div>
                )}
              </div>
            </div>

                {/* Period Transaction Details */}
                {transaction.period_start_date && transaction.period_end_date && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border-2 border-blue-200 dark:border-blue-700">
                    <div className="text-sm text-blue-800 dark:text-blue-300 font-bold mb-2">עסקה תאריכית</div>
                    <div className="text-xs text-blue-700 dark:text-blue-400 mb-1">תקופת תשלום:</div>
                    <div className="text-base text-blue-900 dark:text-blue-200 font-semibold mb-2">
                      {formatDate(transaction.period_start_date)} - {formatDate(transaction.period_end_date)}
                    </div>
                    {(transaction as any).proportionalAmount !== undefined && (transaction as any).daysInMonth !== undefined && (transaction as any).totalDays !== undefined && (
                      <div className="text-xs text-blue-700 dark:text-blue-400 space-y-1 mt-2 pt-2 border-t border-blue-200 dark:border-blue-700">
                        <div>סכום מלא: {formatCurrency((transaction as any).fullAmount)} ₪</div>
                        <div>סכום בחודש זה: {formatCurrency((transaction as any).proportionalAmount)} ₪</div>
                        <div>ימים בחודש זה: {(transaction as any).daysInMonth} מתוך {(transaction as any).totalDays} ימים</div>
                      </div>
                    )}
                  </div>
                )}

            {/* Transaction Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">קטגוריה</p>
                <p className="text-base font-medium text-gray-900 dark:text-white">
                  {(() => {
                    const catName = getCategoryName(transaction.category);
                    return catName ? (CATEGORY_LABELS[catName] || catName) : '-';
                  })()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">תאריך</p>
                <p className="text-base font-medium text-gray-900 dark:text-white">
                  {formatDate(transaction.tx_date)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">אמצעי תשלום</p>
                <p className="text-base font-medium text-gray-900 dark:text-white">
                  {transaction.payment_method ? PAYMENT_METHOD_LABELS[transaction.payment_method] || transaction.payment_method : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">ספק</p>
                <p className="text-base font-medium text-gray-900 dark:text-white">
                  {transaction.supplier_id ? (suppliers.find(s => s.id === transaction.supplier_id)?.name || `[ספק ${transaction.supplier_id}]`) : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">נוצר על ידי</p>
                <p className="text-base font-medium text-gray-900 dark:text-white">
                  {transaction.created_by_user?.full_name || '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">חריגה</p>
                <p className="text-base font-medium text-gray-900 dark:text-white">
                  {transaction.is_exceptional ? 'כן' : 'לא'}
                </p>
              </div>
            </div>

            {/* Description */}
            {transaction.description && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">תיאור:</h4>
                <p className="text-gray-900 dark:text-white">{transaction.description}</p>
              </div>
            )}

            {/* Notes */}
            {transaction.notes && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">הערות:</h4>
                <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{transaction.notes}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700 flex-wrap">
              <button
                onClick={async () => {
                  await onShowDocumentsModal(transaction)
                  onClose()
                }}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                מסמכים
              </button>
              {!transaction.is_unforeseen && (
                <>
                  <button
                    onClick={() => {
                      onEditTransaction(transaction)
                      onClose()
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    ערוך
                  </button>
                  <button
                    onClick={() => {
                      onDeleteTransaction(transaction.id, transaction)
                      onClose()
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    מחק
                  </button>
                </>
              )}
              {transaction.is_unforeseen && (
                <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                  עסקאות לא צפויות ניתנות לעריכה ומחיקה רק דרך רשימת העסקאות הלא צפויות
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
