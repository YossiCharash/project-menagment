import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import QuoteDetail from '../pages/QuoteDetail'
import type { QuoteSubject } from '../lib/apiClient'

export interface QuoteViewModalCreateContext {
  projectId?: number | null
  parentQuoteId: number | null
  /** When set, open create-quote form with this subject pre-selected (add quote to project) */
  subjectId?: number
}

export type CreateSubjectInput =
  | { type: 'existing'; id: number }
  | { type: 'new'; address?: string | null; num_apartments?: number | null; num_buildings?: number | null; notes?: string | null }

interface QuoteViewModalProps {
  quoteId: number | null
  isOpen: boolean
  onClose: () => void
  createContext: QuoteViewModalCreateContext | null
  quoteSubjects: QuoteSubject[]
  createSubjectMode: 'existing' | 'new'
  createSubjectId: number | null
  createAddress: string
  createNumApartments: string
  createNumBuildings: string
  createNotes: string
  createName: string
  createDescription: string
  onCreateSubjectModeChange: (v: 'existing' | 'new') => void
  onCreateSubjectIdChange: (v: number | null) => void
  onCreateAddressChange: (v: string) => void
  onCreateNumApartmentsChange: (v: string) => void
  onCreateNumBuildingsChange: (v: string) => void
  onCreateNotesChange: (v: string) => void
  onCreateNameChange: (v: string) => void
  onCreateDescriptionChange: (v: string) => void
  createError: string | null
  creating: boolean
  onCreateSubmit: (subject: CreateSubjectInput, name: string, description: string) => Promise<number | void>
}

export default function QuoteViewModal({
  quoteId,
  isOpen,
  onClose,
  createContext,
  quoteSubjects,
  createSubjectMode,
  createSubjectId,
  createAddress,
  createNumApartments,
  createNumBuildings,
  createNotes,
  createName,
  createDescription,
  onCreateSubjectModeChange,
  onCreateSubjectIdChange,
  onCreateAddressChange,
  onCreateNumApartmentsChange,
  onCreateNumBuildingsChange,
  onCreateNotesChange,
  onCreateNameChange,
  onCreateDescriptionChange,
  createError,
  creating,
  onCreateSubmit,
}: QuoteViewModalProps) {
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  const showCreate = createContext != null && quoteId == null && (createContext.projectId != null || createContext.subjectId != null)
  const showView = quoteId != null

  const modalTitle = showCreate ? 'הצעת מחיר חדשה' : 'הצעת מחיר'
  const modalWidth = showCreate ? 'max-w-md' : 'max-w-4xl'

  const subjectFromContext = createContext?.subjectId != null
  const canSubmitCreate =
    createName.trim() &&
    (subjectFromContext || (createSubjectMode === 'existing' ? createSubjectId != null : true))

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
                    if (!canSubmitCreate) return
                    setSubmitting(true)
                    try {
                      const subject: CreateSubjectInput = subjectFromContext
                        ? { type: 'existing', id: createContext!.subjectId! }
                        : createSubjectMode === 'existing' && createSubjectId != null
                          ? { type: 'existing', id: createSubjectId }
                          : {
                              type: 'new',
                              address: createAddress.trim() || null,
                              num_apartments: createNumApartments.trim() ? parseInt(createNumApartments.trim(), 10) || null : null,
                              num_buildings: createNumBuildings.trim() ? parseInt(createNumBuildings.trim(), 10) || null : null,
                              notes: createNotes.trim() || null,
                            }
                      await onCreateSubmit(subject, createName.trim(), createDescription.trim())
                    } finally {
                      setSubmitting(false)
                    }
                  }}
                  className="space-y-4"
                >
                  {!subjectFromContext && (
                    <>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">פרויקט (נושא ההצעה) *</p>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={createSubjectMode === 'existing'}
                        onChange={() => onCreateSubjectModeChange('existing')}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">בחר פרויקט קיים</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={createSubjectMode === 'new'}
                        onChange={() => onCreateSubjectModeChange('new')}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">פרויקט חדש</span>
                    </label>
                  </div>
                  {createSubjectMode === 'existing' ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">פרויקט *</label>
                      <select
                        value={createSubjectId ?? ''}
                        onChange={(e) => onCreateSubjectIdChange(e.target.value === '' ? null : parseInt(e.target.value, 10))}
                        className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="">בחר פרויקט...</option>
                        {quoteSubjects.map((s) => {
                          const parts = [
                            s.address,
                            s.num_apartments != null ? s.num_apartments + ' דירות' : null,
                            s.num_buildings != null ? s.num_buildings + ' בניינים' : null,
                          ].filter(Boolean) as string[]
                          const label = parts.length > 0 ? parts.join(' • ') : 'פרויקט #' + s.id
                          return (
                            <option key={s.id} value={s.id}>
                              {label}
                            </option>
                          )
                        })}
                      </select>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">כתובת</label>
                        <input
                          type="text"
                          value={createAddress}
                          onChange={(e) => onCreateAddressChange(e.target.value)}
                          placeholder="כתובת הפרויקט"
                          className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מספר דירות</label>
                          <input
                            type="number"
                            min="0"
                            value={createNumApartments}
                            onChange={(e) => onCreateNumApartmentsChange(e.target.value)}
                            placeholder="—"
                            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">כמות בניינים</label>
                          <input
                            type="number"
                            min="0"
                            value={createNumBuildings}
                            onChange={(e) => onCreateNumBuildingsChange(e.target.value)}
                            placeholder="—"
                            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">הערות / מלל חופשי</label>
                        <textarea
                          value={createNotes}
                          onChange={(e) => onCreateNotesChange(e.target.value)}
                          rows={2}
                          placeholder="הערות על הפרויקט"
                          className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </>
                  )}
                    </>
                  )}
                  {subjectFromContext && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">הצעת המחיר תתווסף לפרויקט שנבחר.</p>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">שם ההצעה *</label>
                    <input
                      type="text"
                      value={createName}
                      onChange={(e) => onCreateNameChange(e.target.value)}
                      placeholder="לדוגמה: הצעת מחיר לשיפוץ לובי"
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תיאור (אופציונלי)</label>
                    <textarea
                      value={createDescription}
                      onChange={(e) => onCreateDescriptionChange(e.target.value)}
                      rows={3}
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
                      disabled={creating || submitting || !canSubmitCreate}
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
