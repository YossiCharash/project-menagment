import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import QuoteDetail from '../pages/QuoteDetail'

export interface QuoteViewModalCreateContext {
  projectId: number
  parentQuoteId: number | null
}

interface QuoteViewModalProps {
  quoteId: number | null
  isOpen: boolean
  onClose: () => void
  createContext: QuoteViewModalCreateContext | null
  createName: string
  createDescription: string
  createNumResidents: string
  onCreateNameChange: (v: string) => void
  onCreateDescriptionChange: (v: string) => void
  onCreateNumResidentsChange: (v: string) => void
  createError: string | null
  creating: boolean
  onCreateSubmit: (name: string, description: string, numResidents: number | null) => Promise<number | void>
}

export default function QuoteViewModal({
  quoteId,
  isOpen,
  onClose,
  createContext,
  createName,
  createDescription,
  createNumResidents,
  onCreateNameChange,
  onCreateDescriptionChange,
  onCreateNumResidentsChange,
  createError,
  creating,
  onCreateSubmit,
}: QuoteViewModalProps) {
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  const showCreate = createContext != null && quoteId == null
  const showView = quoteId != null

  const modalTitle = showCreate ? 'הצעת מחיר חדשה' : 'הצעת מחיר'
  const modalWidth = showCreate ? 'max-w-md' : 'max-w-4xl'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700 overflow-hidden ${modalWidth}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {modalTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <AnimatePresence mode="wait">
            {showCreate ? (
              <motion.div
                key="create"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-6 overflow-y-auto"
              >
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (!createName.trim()) return
                    setSubmitting(true)
                    try {
                      const num = createNumResidents.trim() === '' ? null : parseInt(createNumResidents.trim(), 10)
                      await onCreateSubmit(createName.trim(), createDescription.trim(), (num != null && !isNaN(num) && num > 0) ? num : null)
                    } finally {
                      setSubmitting(false)
                    }
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      שם ההצעה *
                    </label>
                    <input
                      type="text"
                      value={createName}
                      onChange={(e) => onCreateNameChange(e.target.value)}
                      placeholder="לדוגמה: הצעת מחיר לשיפוץ לובי"
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      תיאור (אופציונלי)
                    </label>
                    <textarea
                      value={createDescription}
                      onChange={(e) => onCreateDescriptionChange(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      מספר דיירים (אופציונלי – כל שורה בהצעה תחושב לפי מספר הדיירים)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={createNumResidents}
                      onChange={(e) => onCreateNumResidentsChange(e.target.value)}
                      placeholder="לדוגמה: 50"
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  {createError && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-100 dark:border-red-800">
                      {createError}
                    </div>
                  )}
                  <div className="flex gap-3 justify-end">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-5 py-2.5 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
                    >
                      ביטול
                    </button>
                    <button
                      type="submit"
                      disabled={creating || submitting || !createName.trim()}
                      className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {creating || submitting ? 'יוצר...' : 'צור הצעה'}
                    </button>
                  </div>
                </form>
              </motion.div>
            ) : showView && quoteId != null ? (
              <motion.div
                key={quoteId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 overflow-hidden flex flex-col min-h-0"
              >
                <QuoteDetail quoteId={quoteId} embedMode onClose={onClose} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
