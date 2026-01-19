import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Transaction } from '../types/api'

interface DeleteTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (deleteAll: boolean) => void
  transaction: Transaction | null
  loading?: boolean
}

const DeleteTransactionModal: React.FC<DeleteTransactionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  transaction,
  loading = false
}) => {
  const [deleteMode, setDeleteMode] = useState<'current' | 'all'>('current')

  if (!isOpen || !transaction) return null

  const isRecurring = transaction.recurring_template_id || transaction.is_generated
  const isPeriod = !!(transaction.period_start_date && transaction.period_end_date)

  const handleConfirm = () => {
    onConfirm(deleteMode === 'all')
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-red-100 dark:border-red-900/30"
          onClick={e => e.stopPropagation()}
        >
          <div className="p-6">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 text-center">
              מחיקת עסקה
            </h3>
            
            <p className="text-gray-600 dark:text-gray-300 mb-4 text-center leading-relaxed">
              האם אתה בטוח שברצונך למחוק את העסקה?
            </p>

            {(isRecurring || isPeriod) && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-800 dark:text-blue-300 font-medium mb-3">
                  {isRecurring ? '📅 זו עסקה מחזורית' : '📅 זו עסקה תאריכית'}
                </p>
                
                <div className="space-y-2">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="deleteMode"
                      value="current"
                      checked={deleteMode === 'current'}
                      onChange={() => setDeleteMode('current')}
                      className="mt-1 w-4 h-4 text-red-600 focus:ring-red-500"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-white block">
                        מחק רק את העסקה בחודש הנוכחי
                      </span>
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {isRecurring 
                          ? 'העסקה הספציפית הזו תימחק, אך העסקאות בחודשים אחרים יישארו'
                          : 'העסקה הספציפית הזו תימחק'}
                      </span>
                    </div>
                  </label>
                  
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="deleteMode"
                      value="all"
                      checked={deleteMode === 'all'}
                      onChange={() => setDeleteMode('all')}
                      className="mt-1 w-4 h-4 text-red-600 focus:ring-red-500"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-white block">
                        מחק את כל העסקאות בכל החודשים
                      </span>
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {isRecurring
                          ? 'כל העסקאות המחזוריות יימחקו, כולל התבנית'
                          : 'כל העסקאות עם אותם תאריכי תקופה יימחקו'}
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-center mt-6">
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all font-medium disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all shadow-lg shadow-red-500/20 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'מוחק...' : 'מחק'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default DeleteTransactionModal
