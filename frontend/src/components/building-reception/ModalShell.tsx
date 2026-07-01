import React from 'react'
import { X } from 'lucide-react'
import ModalOverlay from '../ui/ModalOverlay'
import { ACCENT } from './constants'

interface ModalShellProps {
  isOpen: boolean
  onClose: () => void
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle: string
  children: React.ReactNode
  /** Rendered in the sticky footer (usually cancel + submit buttons). */
  footer: React.ReactNode
  maxWidth?: string
}

/**
 * Shared chrome for every Building Reception modal: the accent icon badge,
 * title/subtitle header, close button and a divider-separated footer.
 *
 * Extracting this eliminates the header/footer duplication that would
 * otherwise repeat across the three module modals (Open/Closed: new modals
 * reuse it without touching the others).
 */
export default function ModalShell({
  isOpen,
  onClose,
  icon: Icon,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'max-w-md',
}: ModalShellProps) {
  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose} maxWidth={maxWidth}>
      <div dir="rtl" className="flex flex-col max-h-[90vh]">
        <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-700">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${ACCENT}1F`, color: ACCENT }}
          >
            <Icon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-extrabold text-gray-900 dark:text-white">{title}</h2>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            aria-label="סגירה"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto">{children}</div>

        <div className="px-6 py-4 flex gap-2.5 border-t border-gray-100 dark:border-gray-700">{footer}</div>
      </div>
    </ModalOverlay>
  )
}
