import { ReactNode } from 'react'

export default function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded shadow-lg w-full max-w-lg mx-4">
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
