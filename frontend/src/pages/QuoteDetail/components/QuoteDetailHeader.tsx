import React from 'react'
import { ArrowRight } from 'lucide-react'

export interface QuoteDetailHeaderProps {
  quoteName: string
  quoteStatus: 'draft' | 'approved'
  convertedProjectId: number | null
  embedMode?: boolean
  showApproveActions: boolean
  approving: boolean
  deleting: boolean
  editingQuoteName: boolean
  quoteNameInput: string
  savingQuoteName: boolean
  onGoBack: () => void
  onClose?: () => void
  onQuoteNameChange: (value: string) => void
  onQuoteNameBlur: () => void
  onQuoteNameKeyDown: (e: React.KeyboardEvent) => void
  onStartEditQuoteName: () => void
  onApproveClick: () => void
  onDeleteQuote: () => void
  onNavigateToProject: (projectId: number) => void
}

export default function QuoteDetailHeader({
  quoteName,
  quoteStatus,
  convertedProjectId,
  embedMode,
  showApproveActions,
  approving,
  deleting,
  editingQuoteName,
  quoteNameInput,
  savingQuoteName,
  onGoBack,
  onClose,
  onQuoteNameChange,
  onQuoteNameBlur,
  onQuoteNameKeyDown,
  onStartEditQuoteName,
  onApproveClick,
  onDeleteQuote,
  onNavigateToProject,
}: QuoteDetailHeaderProps) {
  return (
    <div className="p-6 border-b border-gray-200 dark:border-gray-700 shrink-0">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {!embedMode && (
            <button
              type="button"
              onClick={onGoBack}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          )}
          <div>
            {quoteStatus === 'draft' && editingQuoteName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={quoteNameInput}
                  onChange={(e) => onQuoteNameChange(e.target.value)}
                  onBlur={onQuoteNameBlur}
                  onKeyDown={onQuoteNameKeyDown}
                  className="text-2xl font-bold px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-w-[200px]"
                  autoFocus
                />
                {savingQuoteName && <span className="text-xs text-gray-500">שומר...</span>}
              </div>
            ) : (
              <h1
                className={`text-2xl font-bold text-gray-900 dark:text-white ${quoteStatus === 'draft' ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-2 py-1 -mx-2 -my-1' : ''}`}
                onClick={onStartEditQuoteName}
                title={quoteStatus === 'draft' ? 'לחץ לעריכת השם' : undefined}
              >
                {quoteName}
              </h1>
            )}
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-sm font-medium ${
                quoteStatus === 'approved'
                  ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                  : 'bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300'
              }`}
            >
              {quoteStatus === 'approved' ? 'אושרה' : 'טיוטה'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {quoteStatus === 'draft' && showApproveActions && (
            <>
              <button
                type="button"
                onClick={onApproveClick}
                disabled={approving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50"
              >
                {approving ? 'מאשר...' : 'אשר הצעת מחיר'}
              </button>
              <button
                type="button"
                onClick={onDeleteQuote}
                disabled={deleting}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'מוחק...' : 'מחק הצעת מחיר'}
              </button>
            </>
          )}
          {quoteStatus === 'approved' && convertedProjectId != null && (
            <button
              type="button"
              onClick={() => onNavigateToProject(convertedProjectId)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700"
            >
              מעבר לפרויקט
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
