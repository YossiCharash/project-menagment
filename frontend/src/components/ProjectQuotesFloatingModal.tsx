import React from 'react'
import { motion } from 'framer-motion'
import { X, Plus, Eye, Edit, CheckCircle, Trash2, FolderOpen, ExternalLink } from 'lucide-react'
import type { QuoteProject } from '../lib/apiClient'
import type { ProjectWithQuotes } from '../pages/PriceQuotes'

const QuoteCard = ({
  q,
  onEdit,
  onApprove,
  onDelete,
  onView,
  onAddChild,
  showAddChild = false,
  canApprove = true,
}: {
  q: QuoteProject
  onEdit?: (q: QuoteProject) => void
  onApprove?: (q: QuoteProject) => void
  onDelete?: (q: QuoteProject) => void
  onView: (q: QuoteProject) => void
  onAddChild?: (q: QuoteProject) => void
  showAddChild?: boolean
  canApprove?: boolean
}) => (
  <motion.div
    key={q.id}
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm hover:shadow-md transition-all"
  >
    <div className="flex items-start justify-between gap-2 mb-2">
      <h4 className="font-medium text-gray-900 dark:text-white line-clamp-1">{q.name}</h4>
      <span
        className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${
          q.status === 'approved'
            ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800'
            : 'bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
        }`}
      >
        {q.status === 'approved' ? 'אושרה' : 'טיוטה'}
      </span>
    </div>
    {q.description && (
      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-3 h-8">
        {q.description}
      </p>
    )}
    <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100 dark:border-gray-700">
      <div className="text-[10px] text-gray-500">
        {q.quote_lines?.length ?? 0} פריטים
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => onView(q)}
          className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
          title="צפה"
        >
          <Eye className="w-4 h-4" />
        </button>
        {showAddChild && q.status === 'draft' && (
          <button
            onClick={() => onAddChild?.(q)}
            className="p-1.5 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-md transition-colors"
            title="הוסף תת-הצעה"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
        {q.status === 'draft' && (
          <>
            <button
              onClick={() => onEdit?.(q)}
              className="p-1.5 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              title="ערוך"
            >
              <Edit className="w-4 h-4" />
            </button>
            {canApprove && (
              <button
                onClick={() => onApprove?.(q)}
                className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md transition-colors"
                title="אשר"
              >
                <CheckCircle className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => onDelete?.(q)}
              className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
              title="מחק"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  </motion.div>
)

interface ProjectQuotesFloatingModalProps {
  project: ProjectWithQuotes | null
  onClose: () => void
  filterQuotes: (quotes: QuoteProject[]) => QuoteProject[]
  onViewQuote: (q: QuoteProject) => void
  onEditQuote: (q: QuoteProject) => void
  onApproveQuote: (q: QuoteProject) => void
  onDeleteQuote: (q: QuoteProject) => void
  onAddQuote: (projectId: number) => void
  onNavigateToParent?: (projectId: number) => void
  onNavigateToProject?: (projectId: number) => void
}

export default function ProjectQuotesFloatingModal({
  project,
  onClose,
  filterQuotes,
  onViewQuote,
  onEditQuote,
  onApproveQuote,
  onDeleteQuote,
  onAddQuote,
  onNavigateToParent,
  onNavigateToProject,
}: ProjectQuotesFloatingModalProps) {
  if (!project) return null

  const approvedQuotes: QuoteProject[] = []
  const otherQuotes: QuoteProject[] = []

  const addFromProject = (quotes: QuoteProject[] | undefined, hasApproved: boolean) => {
    if (!quotes) return
    const filtered = filterQuotes(quotes)
    filtered.forEach((q) => {
      if (q.status === 'approved') approvedQuotes.push(q)
      else otherQuotes.push(q)
    })
  }

  addFromProject(project.quotes, (project.quotes ?? []).some((q) => q.status === 'approved'))
  ;(project.subprojects ?? []).forEach((sub) => {
    addFromProject(sub.quotes, (sub.quotes ?? []).some((q) => q.status === 'approved'))
  })

  const hasSubprojects = (project.subprojects?.length ?? 0) > 0
  const convertedProjectId = approvedQuotes.find((q) => q.converted_project_id)?.converted_project_id ?? null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">
            {project.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
          {convertedProjectId && onNavigateToProject && (
            <button
              type="button"
              onClick={() => {
                onNavigateToProject(convertedProjectId)
                onClose()
              }}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-green-700 dark:text-green-300 font-medium hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
            >
              <ExternalLink className="w-4 h-4 shrink-0" />
              צפה בפרויקט שנוצר מההצעה שאושרה
            </button>
          )}

          {/* הצעות שאושרו */}
          <section>
            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              הצעות שאושרו ({approvedQuotes.length})
            </h3>
            {approvedQuotes.length > 0 ? (
              <div className="grid gap-3">
                {approvedQuotes.map((q) => (
                  <QuoteCard
                    key={q.id}
                    q={q}
                    onView={onViewQuote}
                    onEdit={onEditQuote}
                    onDelete={onDeleteQuote}
                    canApprove={false}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-2">אין הצעות שאושרו</p>
            )}
          </section>

          {/* הצעות אחרות */}
          <section>
            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              הצעות אחרות ({otherQuotes.length})
            </h3>
            {otherQuotes.length > 0 ? (
              <div className="grid gap-3">
                {otherQuotes.map((q) => {
                  const isFromSub = q.project_id && (project.subprojects ?? []).some((s) => s.id === q.project_id)
                  const hasApproved = isFromSub
                    ? ((project.subprojects ?? []).find((s) => s.id === q.project_id)?.quotes ?? []).some((oq) => oq.status === 'approved')
                    : (project.quotes ?? []).some((oq) => oq.status === 'approved')
                  const canApprove = q.status === 'draft' && !hasApproved
                  return (
                    <QuoteCard
                      key={q.id}
                      q={q}
                      onView={onViewQuote}
                      onEdit={onEditQuote}
                      onApprove={onApproveQuote}
                      onDelete={onDeleteQuote}
                      canApprove={canApprove}
                    />
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-2">אין הצעות אחרות</p>
            )}
          </section>

          {/* תתי-פרויקטים עם הוסף הצעה */}
          {hasSubprojects && (
            <section>
              <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-amber-500" />
                תתי-פרויקטים
              </h3>
              <div className="space-y-2">
                {(project.subprojects ?? []).map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                  >
                    <span className="font-medium text-gray-900 dark:text-white truncate">{sub.name}</span>
                    <button
                      onClick={() => {
                        onAddQuote(sub.id)
                        onClose()
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-medium transition-colors shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      הוסף הצעה
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 shrink-0 flex justify-between gap-3 flex-wrap">
          {!hasSubprojects ? (
            <button
              onClick={() => {
                onAddQuote(project.id)
                onClose()
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              הוסף הצעה
            </button>
          ) : (
            onNavigateToParent && (
              <button
                type="button"
                onClick={() => {
                  onNavigateToParent(project.id)
                  onClose()
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-xl transition-colors"
              >
                מעבר לדף הפרויקט המלא
              </button>
            )
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all"
          >
            סגור
          </button>
        </div>
      </motion.div>
    </div>
  )
}
