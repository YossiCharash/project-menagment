import React, { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Trash2 } from 'lucide-react'
import { GroupTransactionDraftAPI, GroupTransactionDraftOut } from '../lib/apiClient'
import ConfirmationModal from './ConfirmationModal'

interface GroupTransactionHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  /** Called when the user picks a draft to load into the parent modal. */
  onLoadDraft: (draft: GroupTransactionDraftOut) => void
}

type PendingDeletion =
  | { kind: 'selected'; ids: number[] }
  | { kind: 'all'; count: number }
  | null

const formatHebrewDateTime = (iso: string): string => {
  if (!iso) return '\u2014'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '\u2014'
  return d.toLocaleDateString('he-IL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const GroupTransactionHistoryModal: React.FC<GroupTransactionHistoryModalProps> = ({
  isOpen,
  onClose,
  onLoadDraft,
}) => {
  const [drafts, setDrafts] = useState<GroupTransactionDraftOut[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion>(null)
  const [deleting, setDeleting] = useState(false)

  const refreshList = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await GroupTransactionDraftAPI.list()
      setDrafts(list)
      setSelectedIds(prev => {
        const validIds = new Set(list.map(d => d.id))
        const next = new Set<number>()
        prev.forEach(id => { if (validIds.has(id)) next.add(id) })
        return next
      })
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'שגיאה בטעינת היסטוריית טיוטות')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      refreshList()
    } else {
      setSelectedIds(new Set())
      setPendingDeletion(null)
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const allSelected = drafts.length > 0 && selectedIds.size === drafts.length
  const someSelected = selectedIds.size > 0 && !allSelected

  const toggleOne = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedIds(prev => (prev.size === drafts.length ? new Set() : new Set(drafts.map(d => d.id))))
  }

  const requestDeleteSelected = () => {
    if (selectedIds.size === 0) return
    setPendingDeletion({ kind: 'selected', ids: Array.from(selectedIds) })
  }

  const requestDeleteAll = () => {
    if (drafts.length === 0) return
    setPendingDeletion({ kind: 'all', count: drafts.length })
  }

  const confirmDeletion = async () => {
    if (!pendingDeletion) return
    setDeleting(true)
    setError(null)
    try {
      if (pendingDeletion.kind === 'all') {
        await GroupTransactionDraftAPI.bulkDelete(null)
      } else {
        await GroupTransactionDraftAPI.bulkDelete(pendingDeletion.ids)
      }
      setPendingDeletion(null)
      await refreshList()
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'שגיאה במחיקת טיוטות')
    } finally {
      setDeleting(false)
    }
  }

  const confirmDialog = useMemo(() => {
    if (!pendingDeletion) return null
    if (pendingDeletion.kind === 'all') {
      return {
        title: 'מחיקת כל הטיוטות',
        message: `פעולה זו תמחק לצמיתות את כל ${pendingDeletion.count} הטיוטות שלך. לא ניתן לשחזר.`,
        confirmText: 'מחק הכל',
      }
    }
    return {
      title: 'מחיקת טיוטות נבחרות',
      message: `האם למחוק ${pendingDeletion.ids.length} טיוטות נבחרות?`,
      confirmText: 'מחק נבחרים',
    }
  }, [pendingDeletion])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        dir="rtl"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-[92vw] max-w-3xl max-h-[85vh] flex flex-col border border-gray-200 dark:border-gray-700"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-orange-500 to-red-600 dark:from-orange-600 dark:to-red-700 rounded-t-2xl shrink-0">
            <h2 className="text-xl font-bold text-white">
              היסטוריית עסקאות קבוצתיות
              <span className="ms-2 text-sm font-normal opacity-90">({drafts.length} טיוטות)</span>
            </h2>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              aria-label="סגור"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2 shrink-0">
            <div className="text-sm text-gray-600 dark:text-gray-300">
              {selectedIds.size > 0
                ? `${selectedIds.size} נבחרו`
                : 'בחר טיוטות למחיקה, או לחץ על שם הטיוטה כדי לטעון'}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={requestDeleteSelected}
                disabled={selectedIds.size === 0 || deleting}
                className="px-3 py-1.5 text-sm bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                מחק נבחרים
              </button>
              <button
                type="button"
                onClick={requestDeleteAll}
                disabled={drafts.length === 0 || deleting}
                className="px-3 py-1.5 text-sm bg-red-700 hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                מחק הכל
              </button>
            </div>
          </div>

          {error && (
            <div className="mx-5 mt-3 p-3 bg-red-50 dark:bg-red-900/20 border-r-4 border-red-500 rounded-lg text-sm text-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-auto p-3">
            {loading ? (
              <div className="text-center py-10 text-gray-500 dark:text-gray-400">טוען...</div>
            ) : drafts.length === 0 ? (
              <div className="text-center py-10 text-gray-500 dark:text-gray-400">אין טיוטות שמורות</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-center w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected }}
                        onChange={toggleAll}
                        aria-label="בחר הכל"
                        className="w-4 h-4 cursor-pointer"
                      />
                    </th>
                    <th className="px-3 py-2 text-right">שם</th>
                    <th className="px-3 py-2 text-center">שורות</th>
                    <th className="px-3 py-2 text-center">נוצר</th>
                    <th className="px-3 py-2 text-center">עודכן</th>
                    <th className="px-3 py-2 text-center w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map(d => {
                    const checked = selectedIds.has(d.id)
                    const rowsCount = Array.isArray(d.rows) ? d.rows.length : 0
                    return (
                      <tr
                        key={d.id}
                        className={`border-t border-gray-100 dark:border-gray-700 ${checked ? 'bg-orange-50 dark:bg-orange-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'}`}
                      >
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOne(d.id)}
                            aria-label={`בחר טיוטה ${d.name || d.id}`}
                            className="w-4 h-4 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => onLoadDraft(d)}
                            className="text-orange-600 dark:text-orange-400 hover:underline font-medium"
                          >
                            {d.name || `טיוטה ${d.id}`}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-center text-gray-700 dark:text-gray-300">{rowsCount}</td>
                        <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {formatHebrewDateTime(d.created_at)}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {formatHebrewDateTime(d.updated_at)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => setPendingDeletion({ kind: 'selected', ids: [d.id] })}
                            className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            title="מחק טיוטה"
                            aria-label="מחק טיוטה"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              סגור
            </button>
          </div>
        </motion.div>
      </motion.div>

      {confirmDialog && (
        <ConfirmationModal
          isOpen={!!pendingDeletion}
          onClose={() => { if (!deleting) setPendingDeletion(null) }}
          onConfirm={confirmDeletion}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText={confirmDialog.confirmText}
          cancelText="ביטול"
          variant="danger"
          loading={deleting}
        />
      )}
    </AnimatePresence>
  )
}

export default GroupTransactionHistoryModal
