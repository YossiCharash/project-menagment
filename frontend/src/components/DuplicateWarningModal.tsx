import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface DuplicateWarningModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  isEdit?: boolean
}

const DuplicateWarningModal: React.FC<DuplicateWarningModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isEdit = false
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
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-amber-100 dark:border-amber-900/30"
          onClick={e => e.stopPropagation()}
        >
          <div className="p-6 text-center">
             <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce-slow">
              <svg className="w-8 h-8 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              זוהתה עסקה כפולה
            </h3>
            
            <p className="text-gray-600 dark:text-gray-300 mb-8 leading-relaxed">
              נראה שקיימת כבר עסקה עם נתונים זהים במערכת.<br/>
              האם ברצונך {isEdit ? 'לשמור את השינויים' : 'ליצור את העסקה'} בכל זאת?
            </p>

            <div className="flex gap-3 justify-center">
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
                className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-all shadow-lg shadow-amber-500/20 font-medium"
              >
                {isEdit ? 'שמור בכל זאת' : 'צור בכל זאת'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default DuplicateWarningModal

