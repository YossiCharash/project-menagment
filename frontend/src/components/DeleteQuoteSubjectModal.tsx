import React, { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import type { QuoteSubject } from '../lib/apiClient'
import { QuoteSubjectsAPI } from '../lib/apiClient'

interface DeleteQuoteSubjectModalProps {
  subject: QuoteSubject | null
  quotesCount: number
  onClose: () => void
  onSuccess: () => void
}

export default function DeleteQuoteSubjectModal({
  subject,
  quotesCount,
  onClose,
  onSuccess,
}: DeleteQuoteSubjectModalProps) {
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject) return
    if (!password.trim()) {
      setError('יש להזין סיסמת מנהל')
      return
    }
    setDeleting(true)
    setError(null)
    try {
      await QuoteSubjectsAPI.deleteWithPassword(subject.id, password)
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה במחיקה')
    } finally {
      setDeleting(false)
    }
  }

  if (!subject) return null

  const subjectLabel = [
    subject.address,
    subject.num_apartments != null ? subject.num_apartments + ' דירות' : null,
    subject.num_buildings != null ? subject.num_buildings + ' בניינים' : null,
  ].filter(Boolean).join(' • ') || 'פרויקט #' + subject.id

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">מחיקת פרויקט</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            אתה עומד למחוק את הפרויקט <strong className="text-gray-900 dark:text-white">"{subjectLabel}"</strong>.
          </p>
          {quotesCount > 0 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                בפרויקט זה יש <strong>{quotesCount} הצעות מחיר</strong>. המחיקה תמחק גם אותן ולא ניתן לשחזר.
              </p>
            </div>
          )}
          <p className="text-sm text-gray-600 dark:text-gray-400">
            לאישור המחיקה הזן את סיסמת מנהל המערכת:
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="סיסמת מנהל"
            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
            autoComplete="current-password"
          />
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-100 dark:border-red-800">
              {error}
            </div>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={deleting}
              className="px-4 py-2 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'מוחק...' : 'מחק פרויקט'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
