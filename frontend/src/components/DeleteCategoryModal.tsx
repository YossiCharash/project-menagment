import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface DeleteCategoryModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  categoryName: string
  suppliers: Array<{ id: number; name: string; category: string | null; transaction_count: number }>
  loading?: boolean
}

const DeleteCategoryModal: React.FC<DeleteCategoryModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  categoryName,
  suppliers,
  loading = false
}) => {
  if (!isOpen) return null

  const suppliersList = suppliers || []
  const totalTransactions = suppliersList.reduce((sum, s) => sum + (s.transaction_count || 0), 0)
  const suppliersWithTransactions = suppliersList.filter(s => (s.transaction_count || 0) > 0)
  const canDelete = totalTransactions === 0

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
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-red-100 dark:border-red-900/30"
          onClick={e => e.stopPropagation()}
        >
          <div className="p-6">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 text-center">
              מחיקת קטגוריה
            </h3>
            
            <p className="text-gray-600 dark:text-gray-300 mb-4 text-center leading-relaxed">
              האם אתה בטוח שברצונך למחוק את הקטגוריה <strong>"{categoryName}"</strong>?
            </p>

            {(() => {
              if (totalTransactions > 0) {
                return (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
                    <p className="text-sm text-red-800 dark:text-red-300 font-medium mb-3">
                      ⚠️ לא ניתן למחוק את הקטגוריה כי יש {totalTransactions} עסק{totalTransactions > 1 ? 'ות' : 'ה'} הקשור{totalTransactions > 1 ? 'ות' : 'ה'} לספקים בקטגוריה זו:
                    </p>
                    <div className="max-h-48 overflow-y-auto">
                      <ul className="space-y-2">
                        {suppliersWithTransactions.map((supplier) => (
                          <li key={supplier.id} className="text-sm text-red-700 dark:text-red-400 flex items-center justify-between">
                            <span className="flex items-center">
                              <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                              {supplier.name}
                            </span>
                            <span className="text-xs text-red-600 dark:text-red-500 font-medium mr-2">
                              ({supplier.transaction_count} עסק{supplier.transaction_count > 1 ? 'ות' : 'ה'})
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-3 font-medium">
                      סך הכל: {suppliersWithTransactions.length} ספק{suppliersWithTransactions.length > 1 ? 'ים' : ''} עם {totalTransactions} עסק{totalTransactions > 1 ? 'ות' : 'ה'}
                    </p>
                  </div>
                )
              }
              
              if (suppliersList.length > 0) {
                return (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-4">
                    <p className="text-sm text-amber-800 dark:text-amber-300 font-medium mb-3">
                      ⚠️ תשומת לב: מחיקת הקטגוריה תמחק גם את כל הספקים הבאים:
                    </p>
                    <div className="max-h-48 overflow-y-auto">
                      <ul className="space-y-2">
                        {suppliersList.map((supplier) => (
                          <li key={supplier.id} className="text-sm text-amber-700 dark:text-amber-400 flex items-center">
                            <span className="w-2 h-2 bg-amber-500 rounded-full mr-2"></span>
                            {supplier.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 font-medium">
                      סך הכל: {suppliersList.length} ספק{suppliersList.length > 1 ? 'ים' : ''}
                    </p>
                  </div>
                )
              }
              
              return (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    ℹ️ אין ספקים הקשורים לקטגוריה זו
                  </p>
                </div>
              )
            })()}

            <div className="flex gap-3 justify-center mt-6">
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all font-medium disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                onClick={onConfirm}
                disabled={loading || !canDelete}
                className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all shadow-lg shadow-red-500/20 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                title={!canDelete ? 'לא ניתן למחוק קטגוריה עם עסקאות קשורות' : ''}
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

export default DeleteCategoryModal

