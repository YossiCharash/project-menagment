import { ReactNode } from 'react'

export default function Modal({ open, isOpen, onClose, title, children }: { open?: boolean; isOpen?: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const modalOpen = isOpen !== undefined ? isOpen : (open !== undefined ? open : false)
  if (!modalOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded shadow-lg w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="border-b px-4 py-2 flex items-center justify-between">
          <h3 className="font-semibold text-lg">{title}</h3>
          <button className="text-gray-600" onClick={onClose}>✕</button>
        </div>
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  )
}
