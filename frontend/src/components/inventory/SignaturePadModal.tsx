import { useCallback } from 'react'
import { X } from 'lucide-react'
import SignaturePad from './SignaturePad'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SignaturePadModalProps {
  title: string
  description?: string
  onConfirm: (signatureHash: string, signatureDataUrl: string) => void
  onClose: () => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODAL_OVERLAY =
  'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4'
const MODAL_PANEL =
  'bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg'

// ─── Component ────────────────────────────────────────────────────────────────

export default function SignaturePadModal({
  title,
  description,
  onConfirm,
  onClose,
}: SignaturePadModalProps) {
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose],
  )

  return (
    <div className={MODAL_OVERLAY} onClick={handleOverlayClick}>
      <div className={MODAL_PANEL} onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div
          dir="rtl"
          className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700"
        >
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={'\u05E1\u05D2\u05D5\u05E8'}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Signature Pad Content (header handled by modal above) */}
        <SignaturePad
          title={title}
          description={description}
          showHeader={false}
          onConfirm={onConfirm}
          onCancel={onClose}
        />
      </div>
    </div>
  )
}
