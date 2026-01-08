import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SupplierAPI, Supplier } from '../lib/apiClient'

interface DeleteSupplierModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (transferToSupplierId?: number) => void
  supplier: Supplier | null
  allSuppliers: Supplier[]
  transactionCount: number
}

const DeleteSupplierModal: React.FC<DeleteSupplierModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  supplier,
  allSuppliers,
  transactionCount
}) => {
  const [selectedTransferSupplierId, setSelectedTransferSupplierId] = useState<number | ''>('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setSelectedTransferSupplierId('')
    }
  }, [isOpen])

  if (!isOpen || !supplier) return null

  // Filter out the supplier being deleted and only show suppliers with the same category
  const transferOptions = allSuppliers.filter(s => 
    s.id !== supplier.id && 
    s.category === supplier.category &&
    supplier.category && 
    supplier.category.trim() !== ''
  )

  const handleConfirm = async () => {
    setLoading(true)
    try {
      const transferId = selectedTransferSupplierId === '' ? undefined : Number(selectedTransferSupplierId)
      onConfirm(transferId)
    } finally {
      setLoading(false)
    }
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
              מחיקת ספק
            </h3>
            
            <p className="text-gray-600 dark:text-gray-300 mb-4 text-center leading-relaxed">
              האם אתה בטוח שברצונך למחוק את הספק <strong>"{supplier.name}"</strong>?
            </p>

            {transactionCount > 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-4">
                <p className="text-sm text-amber-800 dark:text-amber-300 font-medium mb-2">
                  ⚠️ לספק זה יש {transactionCount} עסקאות
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  יש לבחור ספק אליו להעביר את כל העסקאות לפני המחיקה:
                </p>
                <select
                  value={selectedTransferSupplierId}
                  onChange={(e) => setSelectedTransferSupplierId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full mt-3 px-3 py-2 border border-amber-300 dark:border-amber-700 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">בחר ספק להעברת העסקאות</option>
                  {transferOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {selectedTransferSupplierId === '' && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                    חובה לבחור ספק להעברת העסקאות
                  </p>
                )}
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
                disabled={loading || (transactionCount > 0 && transferOptions.length === 0) || (transactionCount > 0 && selectedTransferSupplierId === '')}
                className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all shadow-lg shadow-red-500/20 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                title={transactionCount > 0 && transferOptions.length === 0 ? 'לא ניתן למחוק כי אין ספק אחר מאותה קטגוריה להעביר אליו את העסקאות' : ''}
              >
                {loading ? 'מוחק...' : 'מחק'}
              </button>
            </div>
            {transactionCount > 0 && transferOptions.length === 0 && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-2 text-center">
                ⚠️ לא ניתן למחוק את הספק כי אין ספק אחר בקטגוריה "{supplier.category || 'ללא קטגוריה'}" להעביר אליו את העסקאות
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default DeleteSupplierModal

