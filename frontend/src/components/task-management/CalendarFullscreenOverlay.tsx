import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

interface CalendarFullscreenOverlayProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

export default function CalendarFullscreenOverlay({
  open,
  onClose,
  title,
  children,
}: CalendarFullscreenOverlayProps) {
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    // Prevent background scroll while the overlay covers the viewport.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'flex flex-col bg-white dark:bg-gray-800 shadow-2xl',
          'w-full h-full rounded-none',
          'sm:m-4 sm:rounded-2xl sm:w-[calc(100%-2rem)] sm:h-[calc(100%-2rem)]',
          'mx-auto',
          'max-w-[1680px]'
        )}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="inline-flex items-center justify-center w-11 h-11 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
