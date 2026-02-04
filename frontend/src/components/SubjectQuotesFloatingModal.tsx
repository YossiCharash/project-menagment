import React from 'react'
import { motion } from 'framer-motion'
import { X, Plus, Eye, Edit, CheckCircle, Trash2, Pencil } from 'lucide-react'
import type { QuoteProject, QuoteSubject } from '../lib/apiClient'

const QuoteCard = ({
  q,
  onEdit,
  onApprove,
  onDelete,
  onView,
}: {
  q: QuoteProject
  onEdit?: (q: QuoteProject) => void
  onApprove?: (q: QuoteProject) => void
  onDelete?: (q: QuoteProject) => void
  onView: (q: QuoteProject) => void
}) => (
  <motion.div
    role="button"
    tabIndex={0}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    onClick={() => onView(q)}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onView(q) } }}
    className="bg-white/95 dark:bg-gray-800/95 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm hover:shadow-md transition-all backdrop-blur cursor-pointer text-right"
  >
    <div className="flex items-start justify-between gap-2 mb-2">
      <h4 className="font-medium text-gray-900 dark:text-white line-clamp-1">{q.name}</h4>
      <span
        className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${
          q.status === 'approved'
            ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300'
            : 'bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300'
        }`}
      >
        {q.status === 'approved' ? 'אושרה' : 'טיוטה'}
      </span>
    </div>
    {q.description && (
      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-3">{q.description}</p>
    )}
    <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
      <span className="text-[10px] text-gray-500">{q.quote_lines?.length ?? 0} פריטים</span>
      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => onView(q)} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md" title="צפה"><Eye className="w-4 h-4" /></button>
        {q.status === 'draft' && (
          <>
            <button type="button" onClick={() => onEdit?.(q)} className="p-1.5 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md" title="ערוך"><Edit className="w-4 h-4" /></button>
            <button type="button" onClick={() => onApprove?.(q)} className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md" title="אשר"><CheckCircle className="w-4 h-4" /></button>
            <button type="button" onClick={() => onDelete?.(q)} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md" title="מחק"><Trash2 className="w-4 h-4" /></button>
          </>
        )}
      </div>
    </div>
  </motion.div>
)

export interface SubjectWithQuotes {
  subject: QuoteSubject
  quotes: QuoteProject[]
}

interface SubjectQuotesFloatingModalProps {
  subjectWithQuotes: SubjectWithQuotes | null
  onClose: () => void
  onViewQuote: (q: QuoteProject) => void
  onEditQuote: (q: QuoteProject) => void
  onApproveQuote: (q: QuoteProject) => void
  onDeleteQuote: (q: QuoteProject) => void
  onAddQuote: (subjectId: number) => void
  onEditSubject: (subject: QuoteSubject) => void
  onDeleteSubject: (subject: QuoteSubject, quotesCount: number) => void
}

export default function SubjectQuotesFloatingModal({
  subjectWithQuotes,
  onClose,
  onViewQuote,
  onEditQuote,
  onApproveQuote,
  onDeleteQuote,
  onAddQuote,
  onEditSubject,
  onDeleteSubject,
}: SubjectQuotesFloatingModalProps) {
  if (!subjectWithQuotes) return null

  const { subject, quotes } = subjectWithQuotes
  const subjectLabel = [
    subject.address,
    subject.num_apartments != null ? subject.num_apartments + ' דירות' : null,
    subject.num_buildings != null ? subject.num_buildings + ' בניינים' : null,
  ].filter(Boolean).join(' • ') || 'פרויקט #' + subject.id

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.96 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-white/90 dark:bg-gray-800/90 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[70vh] flex flex-col border border-gray-200/80 dark:border-gray-700/80 overflow-hidden backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 dark:text-white truncate">{subjectLabel}</h2>
            {subject.notes && <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{subject.notes}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onDeleteSubject(subject, quotes.length)}
              className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              title="מחק פרויקט"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => { onEditSubject(subject); onClose() }}
              className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="ערוך פרויקט"
            >
              <Pencil className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
          {quotes.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">אין הצעות בפרויקט זה</p>
          ) : (
            <div className="grid gap-3">
              {quotes.map((q) => (
                <QuoteCard
                  key={q.id}
                  q={q}
                  onView={onViewQuote}
                  onEdit={onEditQuote}
                  onApprove={onApproveQuote}
                  onDelete={onDeleteQuote}
                />
              ))}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-gray-200 dark:border-gray-700 shrink-0 flex justify-between gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => { onAddQuote(subject.id); onClose() }}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            הוסף הצעת מחיר
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
          >
            סגור
          </button>
        </div>
      </motion.div>
    </div>
  )
}
