import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, X } from 'lucide-react'

interface ConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
  loading?: boolean
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'אישור',
  cancelText = 'ביטול',
  variant = 'danger',
  loading = false
}) => {
  if (!isOpen) return null

  const variantStyles = {
    danger: {
      iconBg: 'bg-red-100 dark:bg-red-900/30',
      iconColor: 'text-red-600 dark:text-red-400',
      borderColor: 'border-red-100 dark:border-red-900/30',
      buttonBg: 'bg-red-500 hover:bg-red-600',
      buttonShadow: 'shadow-red-500/20'
    },
    warning: {
      iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
      iconColor: 'text-yellow-600 dark:text-yellow-400',
      borderColor: 'border-yellow-100 dark:border-yellow-900/30',
      buttonBg: 'bg-yellow-500 hover:bg-yellow-600',
      buttonShadow: 'shadow-yellow-500/20'
    },
    info: {
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-600 dark:text-blue-400',
      borderColor: 'border-blue-100 dark:border-blue-900/30',
      buttonBg: 'bg-blue-500 hover:bg-blue-600',
      buttonShadow: 'shadow-blue-500/20'
    }
  }

  const styles = variantStyles[variant]

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
          className={`bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border ${styles.borderColor}`}
          onClick={e => e.stopPropagation()}
        >
          <div className="p-6">
            <div className={`w-16 h-16 ${styles.iconBg} rounded-full flex items-center justify-center mx-auto mb-4`}>
              <AlertTriangle className={`w-8 h-8 ${styles.iconColor}`} />
            </div>
            
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 text-center">
              {title}
            </h3>
            
            <p className="text-gray-600 dark:text-gray-300 mb-6 text-center leading-relaxed">
              {message}
            </p>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all font-medium disabled:opacity-50"
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className={`flex-1 px-4 py-2.5 ${styles.buttonBg} text-white rounded-xl transition-all shadow-lg ${styles.buttonShadow} font-medium disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading ? 'מעבד...' : confirmText}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default ConfirmationModal
