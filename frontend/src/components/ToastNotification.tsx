import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
}

interface ToastNotificationProps {
  toast: Toast | null
  onClose: () => void
}

const ToastNotification: React.FC<ToastNotificationProps> = ({ toast, onClose }) => {
  useEffect(() => {
    if (toast) {
      const duration = toast.duration || 5000
      const timer = setTimeout(() => {
        onClose()
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [toast, onClose])

  if (!toast) return null

  const typeStyles = {
    success: {
      bg: 'bg-green-50 dark:bg-green-900/20',
      border: 'border-green-200 dark:border-green-800',
      text: 'text-green-800 dark:text-green-200',
      icon: CheckCircle,
      iconColor: 'text-green-600 dark:text-green-400'
    },
    error: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-200 dark:border-red-800',
      text: 'text-red-800 dark:text-red-200',
      icon: XCircle,
      iconColor: 'text-red-600 dark:text-red-400'
    },
    warning: {
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      border: 'border-yellow-200 dark:border-yellow-800',
      text: 'text-yellow-800 dark:text-yellow-200',
      icon: AlertCircle,
      iconColor: 'text-yellow-600 dark:text-yellow-400'
    },
    info: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-200 dark:border-blue-800',
      text: 'text-blue-800 dark:text-blue-200',
      icon: Info,
      iconColor: 'text-blue-600 dark:text-blue-400'
    }
  }

  const styles = typeStyles[toast.type]
  const Icon = styles.icon

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -50, x: '-50%' }}
        animate={{ opacity: 1, y: 0, x: '-50%' }}
        exit={{ opacity: 0, y: -20, x: '-50%' }}
        className={`fixed top-4 left-1/2 z-[100] ${styles.bg} ${styles.border} border rounded-xl shadow-lg p-4 min-w-[300px] max-w-[500px]`}
      >
        <div className="flex items-start gap-3">
          <Icon className={`w-5 h-5 ${styles.iconColor} flex-shrink-0 mt-0.5`} />
          <p className={`flex-1 ${styles.text} text-sm font-medium`}>
            {toast.message}
          </p>
          <button
            onClick={onClose}
            className={`${styles.text} hover:opacity-70 transition-opacity flex-shrink-0`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

// Hook for using toast notifications
export const useToast = () => {
  const [toast, setToast] = React.useState<Toast | null>(null)

  const showToast = (message: string, type: ToastType = 'info', duration?: number) => {
    setToast({
      id: Date.now().toString(),
      message,
      type,
      duration
    })
  }

  const hideToast = () => {
    setToast(null)
  }

  return { toast, showToast, hideToast }
}

export default ToastNotification
