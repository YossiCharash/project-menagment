import React, { useState, useEffect } from 'react'
import { ProjectAPI } from '../lib/apiClient'
import type { Project } from '../types/api'
import { X } from 'lucide-react'

interface CreateParentProjectSimpleModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (project: Project) => void
  editingProject?: Project | null
}

const CreateParentProjectSimpleModal: React.FC<CreateParentProjectSimpleModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editingProject = null,
}) => {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      if (editingProject) {
        setName(editingProject.name || '')
        setDescription(editingProject.description || '')
      } else {
        setName('')
        setDescription('')
      }
      setError(null)
    }
  }, [isOpen, editingProject])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('נא להזין שם פרויקט')
      return
    }
    setLoading(true)
    setError(null)
    try {
      if (editingProject) {
        const updated = await ProjectAPI.updateProject(editingProject.id, {
          name: name.trim(),
          description: description.trim() || undefined,
        })
        onClose()
        onSuccess(updated)
      } else {
        const created = await ProjectAPI.createProject({
          name: name.trim(),
          description: description.trim() || undefined,
          is_parent_project: true,
          budget_monthly: 0,
          budget_annual: 0,
          show_in_quotes_tab: true,
        })
        onClose()
        onSuccess(created)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה בשמירה')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {editingProject ? 'עריכת פרויקט על' : 'פרויקט על חדש'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              שם הפרויקט *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="שם הפרויקט על"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              תיאור (אופציונלי)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg">
              {error}
            </div>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'שומר...' : editingProject ? 'עדכן' : 'צור פרויקט'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateParentProjectSimpleModal
