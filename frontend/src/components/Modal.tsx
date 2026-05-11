import { ReactNode } from 'react'

export default function Modal({ open, isOpen, onClose, title, children }: { open?: boolean; isOpen?: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const modalOpen = isOpen !== undefined ? isOpen : (open !== undefined ? open : false)
  if (!modalOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative bg-white dark:bg-gray-800 shadow-lg w-full sm:max-w-lg sm:mx-4 max-h-[92vh] sm:max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b dark:border-gray-700 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <h3 className="font-semibold text-lg truncate pr-2">{title}</h3>
          <button
            className="text-gray-600 dark:text-gray-300 w-10 h-10 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
            onClick={onClose}
            aria-label="סגור"
          >
            ✕
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  )
}
