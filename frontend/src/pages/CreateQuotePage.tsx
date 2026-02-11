import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { QuoteProjectsAPI, QuoteSubjectsAPI } from '../lib/apiClient'
import type { QuoteSubject } from '../lib/apiClient'
import type { CreateSubjectInput } from '../components/QuoteViewModal'

export default function CreateQuotePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const projectIdParam = searchParams.get('projectId')
  const subjectIdParam = searchParams.get('subjectId')

  const projectId = projectIdParam ? parseInt(projectIdParam, 10) : null
  const initialSubjectId = subjectIdParam ? parseInt(subjectIdParam, 10) : null

  const subjectFromContext = initialSubjectId != null

  const [quoteSubjects, setQuoteSubjects] = useState<QuoteSubject[]>([])
  const [createSubjectMode, setCreateSubjectMode] = useState<'existing' | 'new'>('existing')
  const [createSubjectId, setCreateSubjectId] = useState<number | null>(initialSubjectId)
  const [createAddress, setCreateAddress] = useState('')
  const [createNumApartments, setCreateNumApartments] = useState('')
  const [createNumBuildings, setCreateNumBuildings] = useState('')
  const [createNotes, setCreateNotes] = useState('')
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    QuoteSubjectsAPI.list().then(setQuoteSubjects).catch(() => setQuoteSubjects([]))
  }, [])

  useEffect(() => {
    if (initialSubjectId != null) {
      setCreateSubjectId(initialSubjectId)
      setCreateSubjectMode('existing')
    }
  }, [initialSubjectId])

  const canSubmitCreate =
    newName.trim() &&
    (subjectFromContext || (createSubjectMode === 'existing' ? createSubjectId != null : true))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmitCreate) return
    setCreating(true)
    setCreateError(null)
    try {
      let quoteSubjectId: number
      const subject: CreateSubjectInput = subjectFromContext
        ? { type: 'existing', id: initialSubjectId! }
        : createSubjectMode === 'existing' && createSubjectId != null
          ? { type: 'existing', id: createSubjectId }
          : {
              type: 'new',
              address: createAddress.trim() || null,
              num_apartments: createNumApartments.trim() ? parseInt(createNumApartments.trim(), 10) || null : null,
              num_buildings: createNumBuildings.trim() ? parseInt(createNumBuildings.trim(), 10) || null : null,
              notes: createNotes.trim() || null,
            }

      if (subject.type === 'existing') {
        quoteSubjectId = subject.id
      } else {
        const sub = await QuoteSubjectsAPI.create({
          address: subject.address ?? undefined,
          num_apartments: subject.num_apartments ?? undefined,
          num_buildings: subject.num_buildings ?? undefined,
          notes: subject.notes ?? undefined,
        })
        quoteSubjectId = sub.id
      }

      const created = await QuoteProjectsAPI.create({
        quote_subject_id: quoteSubjectId,
        name: newName.trim(),
        description: newDescription.trim() || null,
        project_id: projectId ?? undefined,
      })

      navigate(`/price-quotes/${created.id}`)
    } catch (err: any) {
      setCreateError(err.response?.data?.detail || err.message || 'שגיאה ביצירת הצעת מחיר')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          type="button"
          onClick={() => navigate('/price-quotes')}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-8 transition-colors"
        >
          <ArrowRight className="w-5 h-5" />
          חזרה להצעות מחיר
        </button>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">הצעת מחיר חדשה</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            {!subjectFromContext && (
              <>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">פרויקט (נושא ההצעה) *</p>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={createSubjectMode === 'existing'}
                      onChange={() => setCreateSubjectMode('existing')}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">בחר פרויקט קיים</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={createSubjectMode === 'new'}
                      onChange={() => setCreateSubjectMode('new')}
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
                      onChange={(e) => setCreateSubjectId(e.target.value === '' ? null : parseInt(e.target.value, 10))}
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
                        onChange={(e) => setCreateAddress(e.target.value)}
                        placeholder="כתובת הפרויקט"
                        className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מספר דירות</label>
                        <input
                          type="number"
                          min="0"
                          value={createNumApartments}
                          onChange={(e) => setCreateNumApartments(e.target.value)}
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
                          onChange={(e) => setCreateNumBuildings(e.target.value)}
                          placeholder="—"
                          className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">הערות / מלל חופשי</label>
                      <textarea
                        value={createNotes}
                        onChange={(e) => setCreateNotes(e.target.value)}
                        rows={3}
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
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="לדוגמה: הצעת מחיר לשיפוץ לובי"
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תיאור (אופציונלי)</label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={4}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            {createError && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-xl border border-red-100 dark:border-red-800">
                {createError}
              </div>
            )}
            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={() => navigate('/price-quotes')}
                className="px-6 py-2.5 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
              >
                ביטול
              </button>
              <button
                type="submit"
                disabled={creating || !canSubmitCreate}
                className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {creating ? 'יוצר...' : 'צור הצעה'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
