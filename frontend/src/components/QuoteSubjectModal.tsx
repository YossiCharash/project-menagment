import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { QuoteSubject } from '../lib/apiClient'
import { QuoteSubjectsAPI } from '../lib/apiClient'

interface QuoteSubjectModalProps {
  /** Pass a subject to edit it; pass null/undefined + isOpen=true to create a new one */
  subject?: QuoteSubject | null
  isOpen: boolean
  onClose: () => void
  onSuccess: (subject: QuoteSubject) => void
}

export default function QuoteSubjectModal({
  subject,
  isOpen,
  onClose,
  onSuccess,
}: QuoteSubjectModalProps) {
  const isEditMode = !!subject

  const [address, setAddress] = useState('')
  const [numApartments, setNumApartments] = useState('')
  const [numBuildings, setNumBuildings] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Populate form when editing
  useEffect(() => {
    if (subject) {
      setAddress(subject.address ?? '')
      setNumApartments(subject.num_apartments != null ? String(subject.num_apartments) : '')
      setNumBuildings(subject.num_buildings != null ? String(subject.num_buildings) : '')
      setNotes(subject.notes ?? '')
      setError(null)
    } else if (isOpen) {
      // Reset form for creation
      setAddress('')
      setNumApartments('')
      setNumBuildings('')
      setNotes('')
      setError(null)
    }
  }, [subject, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = {
        address: address.trim() || undefined,
        num_apartments: numApartments.trim() ? (isNaN(parseInt(numApartments, 10)) ? undefined : parseInt(numApartments, 10)) : undefined,
        num_buildings: numBuildings.trim() ? (isNaN(parseInt(numBuildings, 10)) ? undefined : parseInt(numBuildings, 10)) : undefined,
        notes: notes.trim() || undefined,
      }

      let result: QuoteSubject
      if (isEditMode && subject) {
        result = await QuoteSubjectsAPI.update(subject.id, payload)
      } else {
        result = await QuoteSubjectsAPI.create(payload)
      }

      onSuccess(result)
      onClose()
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
        err.message ||
        (isEditMode ? 'שגיאה בעדכון הפרויקט' : 'שגיאה ביצירת הפרויקט')
      )
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    setError(null)
    onClose()
  }

  if (!isOpen) return null

  const inputClass =
    'w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {isEditMode ? 'עריכת פרויקט' : 'הוספת פרויקט'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">כתובת</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="כתובת הפרויקט"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מספר דירות</label>
              <input
                type="number"
                min="0"
                value={numApartments}
                onChange={(e) => setNumApartments(e.target.value)}
                placeholder="—"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">כמות בניינים</label>
              <input
                type="number"
                min="0"
                value={numBuildings}
                onChange={(e) => setNumBuildings(e.target.value)}
                placeholder="—"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">הערות / מלל חופשי</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="הערות על הפרויקט"
              className={inputClass}
            />
          </div>
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-100 dark:border-red-800">
              {error}
            </div>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2.5 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving
                ? (isEditMode ? 'שומר...' : 'יוצר...')
                : (isEditMode ? 'שמור שינויים' : 'צור פרויקט')
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
