import React, { useState, useEffect } from 'react'
import { Project, TransactionCreate } from '../types/api'
import { ProjectAPI, TransactionAPI, CategoryAPI } from '../lib/apiClient'
import api from '../lib/api'

interface AddTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  selectedProjectId?: number
}

const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  selectedProjectId
}) => {
  const [formData, setFormData] = useState<TransactionCreate>({
    project_id: selectedProjectId || 0,
    type: 'Expense',
    amount: 0,
    description: '',
    category: '',
    notes: '',
    tx_date: new Date().toISOString().split('T')[0],
    is_exceptional: false,
    from_fund: false
  })
  const [hasFund, setHasFund] = useState(false)
  const [fundBalance, setFundBalance] = useState<number | null>(null)

  const [availableProjects, setAvailableProjects] = useState<Project[]>([])
  const [availableCategories, setAvailableCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load available projects and categories
  useEffect(() => {
    if (isOpen) {
      loadProjects()
      loadCategories()
    }
  }, [isOpen])

  const loadCategories = async () => {
    try {
      const categories = await CategoryAPI.getCategories()
      const categoryNames = categories.filter(cat => cat.is_active).map(cat => cat.name)
      setAvailableCategories(categoryNames)
    } catch (err) {
      console.error('Error loading categories:', err)
      setAvailableCategories([])
    }
  }

  // Load fund info when project is selected
  useEffect(() => {
    if (formData.project_id && isOpen) {
      loadFundInfo()
    } else {
      setHasFund(false)
      setFundBalance(null)
    }
  }, [formData.project_id, isOpen])

  // Update form when selectedProjectId changes
  useEffect(() => {
    if (selectedProjectId) {
      setFormData(prev => ({ ...prev, project_id: selectedProjectId }))
    }
  }, [selectedProjectId])

  const loadProjects = async () => {
    try {
      const projects = await ProjectAPI.getProjects()
      setAvailableProjects(projects.filter(p => p.is_active))
    } catch (err) {
      // Failed to load projects
    }
  }

  const loadFundInfo = async () => {
    try {
      const project = await ProjectAPI.getProject(formData.project_id)
      const hasFundFlag = (project as any).has_fund || false
      setHasFund(hasFundFlag)
      
      if (hasFundFlag) {
        try {
          const { data } = await api.get(`/projects/${formData.project_id}/fund`)
          setFundBalance(data.current_balance)
        } catch (fundErr) {
          setFundBalance(null)
        }
      } else {
        setFundBalance(null)
      }
    } catch (err) {
      setHasFund(false)
      setFundBalance(null)
    }
  }

  const resetForm = () => {
    setFormData({
      project_id: selectedProjectId || 0,
      type: 'Expense',
      amount: 0,
      description: '',
      category: '',
      notes: '',
      tx_date: new Date().toISOString().split('T')[0],
      is_exceptional: false,
      from_fund: false
    })
    setError(null)
    setHasFund(false)
    setFundBalance(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const transactionData = {
        ...formData,
        description: formData.description || undefined,
        category: formData.category || undefined,
        notes: formData.notes || undefined
      }

      await TransactionAPI.createTransaction(transactionData)
      onSuccess()
      onClose()
      resetForm()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'שמירה נכשלה')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    onClose()
    resetForm()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            הוספת עסקה חדשה
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                פרויקט *
              </label>
              <select
                required
                value={formData.project_id}
                onChange={(e) => setFormData({ ...formData, project_id: parseInt(e.target.value) })}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">בחר פרויקט</option>
                {availableProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                סוג עסקה *
              </label>
              <select
                required
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as 'Income' | 'Expense' })}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="Income">הכנסה</option>
                <option value="Expense">הוצאה</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                סכום *
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                תאריך *
              </label>
              <input
                type="date"
                required
                value={formData.tx_date}
                onChange={(e) => setFormData({ ...formData, tx_date: e.target.value })}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              קטגוריה
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">בחר קטגוריה</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              תיאור
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="תיאור העסקה"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              הערות
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="הערות נוספות"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                id="exceptional"
                type="checkbox"
                checked={formData.is_exceptional}
                onChange={(e) => setFormData({ ...formData, is_exceptional: e.target.checked })}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="exceptional" className="text-sm text-gray-700 dark:text-gray-300">
                עסקה חריגה
              </label>
            </div>
            
            {hasFund && formData.type === 'Expense' && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    id="fromFund"
                    type="checkbox"
                    checked={formData.from_fund}
                    onChange={(e) => setFormData({ ...formData, from_fund: e.target.checked })}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="fromFund" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    הוריד מהקופה
                  </label>
                </div>
                {fundBalance !== null && (
                  <p className={`text-xs ${fundBalance < 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>
                    יתרה בקופה: {fundBalance.toLocaleString('he-IL')} ₪
                    {fundBalance < 0 && ' (מינוס!)'}
                  </p>
                )}
                {formData.from_fund && (
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    הערה: עסקה זו לא תיכלל בהוצאות הרגילות ולא תופיע בדוחות
                  </p>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'שומר...' : 'הוסף עסקה'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AddTransactionModal

