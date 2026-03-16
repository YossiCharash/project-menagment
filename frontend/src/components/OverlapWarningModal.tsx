import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface OverlapWarningModalProps {
  isOpen: boolean
  message: string
  onClose: () => void
  onConfirm: () => void
}

const OverlapWarningModal: React.FC<OverlapWarningModalProps> = ({
  isOpen,
  message,
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null

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
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-orange-100 dark:border-orange-900/30"
          onClick={e => e.stopPropagation()}
        >
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                חפיפת תקופות
              </h3>
            </div>

            <pre className="text-sm text-gray-700 dark:text-gray-300 bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 whitespace-pre-wrap leading-relaxed mb-6 max-h-64 overflow-y-auto font-sans">
              {message}
            </pre>

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              האם ברצונך ליצור את העסקה בכל זאת?
            </p>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all font-medium"
              >
                ביטול
              </button>
              <button
                onClick={() => {
                  onConfirm()
                  onClose()
                }}
                className="flex-1 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-all shadow-lg shadow-orange-500/20 font-medium"
              >
                צור בכל זאת
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default OverlapWarningModal
