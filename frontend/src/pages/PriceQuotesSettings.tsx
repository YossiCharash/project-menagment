import { useState, useEffect, type FormEvent } from 'react'
import { useAppSelector } from '../utils/hooks'
import { QuoteStructureAPI, QuoteStructureItem } from '../lib/apiClient'
import { Plus, Trash2, X, Check } from 'lucide-react'
import SettingsOverlay from '../components/ui/SettingsOverlay'

export default function PriceQuotesSettings() {
  const permissions = useAppSelector(s => s.permissions.permissions)
  const me = useAppSelector(s => s.auth.me)
  const isAdmin = me?.role === 'Admin' || (me?.role as string) === 'SuperAdmin'
  const canSeeQuoteStructure = isAdmin || permissions.some(p => p.resource_type === 'quote')

  const [quoteStructureItems, setQuoteStructureItems] = useState<QuoteStructureItem[]>([])
  const [showQuoteStructureForm, setShowQuoteStructureForm] = useState(false)
  const [newQuoteStructureName, setNewQuoteStructureName] = useState('')
  const [quoteStructureError, setQuoteStructureError] = useState<string | null>(null)
  const [quoteStructureLoading, setQuoteStructureLoading] = useState(false)

  const fetchQuoteStructure = async () => {
    setQuoteStructureLoading(true)
    setQuoteStructureError(null)
    try {
      const data = await QuoteStructureAPI.list(true)
      setQuoteStructureItems(data)
    } catch (err: any) {
      setQuoteStructureError(err.response?.data?.detail || err.message || 'שגיאה בטעינת חלוקת הצעת מחיר')
    } finally {
      setQuoteStructureLoading(false)
    }
  }

  useEffect(() => {
    if (canSeeQuoteStructure) {
      fetchQuoteStructure()
    }
  }, [canSeeQuoteStructure])

  const handleAddQuoteStructure = async (e: FormEvent) => {
    e.preventDefault()
    if (!newQuoteStructureName.trim()) {
      setQuoteStructureError('נא להזין שם פריט')
      return
    }
    setQuoteStructureError(null)
    setQuoteStructureLoading(true)
    try {
      await QuoteStructureAPI.create({ name: newQuoteStructureName.trim(), sort_order: quoteStructureItems.length })
      setNewQuoteStructureName('')
      setShowQuoteStructureForm(false)
      await fetchQuoteStructure()
    } catch (err: any) {
      setQuoteStructureError(err.response?.data?.detail || err.message || 'שגיאה בהוספת פריט')
    } finally {
      setQuoteStructureLoading(false)
    }
  }

  const handleDeleteQuoteStructure = async (itemId: number) => {
    if (!confirm('למחוק פריט זה מהחלוקה?')) return
    setQuoteStructureError(null)
    setQuoteStructureLoading(true)
    try {
      await QuoteStructureAPI.delete(itemId)
      await fetchQuoteStructure()
    } catch (err: any) {
      setQuoteStructureError(err.response?.data?.detail || err.message || 'שגיאה במחיקת פריט')
    } finally {
      setQuoteStructureLoading(false)
    }
  }

  if (!canSeeQuoteStructure) return null

  return (
    <SettingsOverlay title="הגדרות הצעות מחיר" subtitle="חלוקת הצעת מחיר">
      <div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">חלוקת הצעת מחיר</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">הגדר את הפריטים שיופיעו בבניית הצעות מחיר (בתווית הצעות מחיר תוכל לבחור אילו להוסיף להצעה)</p>
          </div>
          {!showQuoteStructureForm && (
            <button
              onClick={() => setShowQuoteStructureForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              הוסף פריט
            </button>
          )}
        </div>

        {quoteStructureError && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-600 dark:text-red-400 text-sm">{quoteStructureError}</p>
          </div>
        )}

        {showQuoteStructureForm && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <form onSubmit={handleAddQuoteStructure} className="space-y-3 flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <input
                  type="text"
                  value={newQuoteStructureName}
                  onChange={(e) => {
                    setNewQuoteStructureName(e.target.value)
                    setQuoteStructureError(null)
                  }}
                  placeholder="שם הפריט (למשל: ניהול, תחזוקה, ניקיון)"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={quoteStructureLoading || !newQuoteStructureName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  שמור
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowQuoteStructureForm(false)
                    setNewQuoteStructureName('')
                    setQuoteStructureError(null)
                  }}
                  className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  ביטול
                </button>
              </div>
            </form>
          </div>
        )}

        {quoteStructureLoading && quoteStructureItems.length === 0 ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">טוען פריטים...</p>
          </div>
        ) : quoteStructureItems.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400">אין פריטים עדיין. הוסף פריטים שיופיעו בבניית הצעות מחיר (למשל: ניהול, תחזוקה, ניקיון).</p>
          </div>
        ) : (
          <div className="space-y-3">
            {quoteStructureItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <span className="text-gray-900 dark:text-white font-medium">{item.name}</span>
                <div className="flex items-center gap-2">
                  {!item.is_active && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">(לא פעיל)</span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteQuoteStructure(item.id)}
                    disabled={quoteStructureLoading}
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                    title="מחק"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SettingsOverlay>
  )
}
