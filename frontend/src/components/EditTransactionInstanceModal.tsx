import React, { useState, useEffect } from 'react'
import { CategoryAPI } from '../lib/apiClient'
import { Transaction, RecurringTransactionInstanceUpdate } from '../types/api'
import { RecurringTransactionAPI } from '../lib/apiClient'

interface EditTransactionInstanceModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  transaction: Transaction | null
}

const EditTransactionInstanceModal: React.FC<EditTransactionInstanceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  transaction
}) => {
  const [formData, setFormData] = useState<RecurringTransactionInstanceUpdate>({
    tx_date: '',
    amount: 0,
    category: '',
    notes: ''
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [availableCategories, setAvailableCategories] = useState<any[]>([])

  useEffect(() => {
    if (isOpen) {
      loadCategories()
    }
    if (transaction && isOpen) {
      setFormData({
        tx_date: transaction.tx_date,
        amount: transaction.amount,
        category: transaction.category || '',
        category_id: transaction.category_id || null,
        notes: transaction.notes || ''
      })
    }
  }, [transaction, isOpen])

  const loadCategories = async () => {
    try {
      const categories = await CategoryAPI.getCategories()
      const activeCategories = categories.filter(cat => cat.is_active)
      setAvailableCategories(activeCategories)
      
      // If we have transaction and category name but no ID, try to find it
      if (transaction && transaction.category && !transaction.category_id) {
          const cat = activeCategories.find(c => c.name === transaction.category)
          if (cat) {
              setFormData(prev => ({ ...prev, category_id: cat.id }))
          }
      }
    } catch (err) {
      console.error('Error loading categories:', err)
      setAvailableCategories([])
    }
  }

  const resetForm = () => {
    setFormData({
      tx_date: '',
      amount: 0,
      category: '',
      notes: ''
    })
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!transaction) return

    if (!formData.category) {
       setError('יש לבחור קטגוריה')
       return
    }

    setLoading(true)
    setError(null)

    try {
      const updateData = {
        ...formData,
        category: formData.category || undefined,
        category_id: formData.category_id || undefined,
        notes: formData.notes || undefined
      }

      await RecurringTransactionAPI.updateTransactionInstance(transaction.id, updateData)
      onSuccess()
      onClose()
      resetForm()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'שמירה נכשלה')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!transaction) return

    if (!confirm('האם אתה בטוח שברצונך למחוק את העסקה הזו? פעולה זו תמחק רק את העסקה הספציפית הזו ולא תשפיע על התבנית החוזרת.')) {
      return
    }

    try {
      await RecurringTransactionAPI.deleteTransactionInstance(transaction.id)
      onSuccess()
      onClose()
      resetForm()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'מחיקה נכשלה')
    }
  }

  const handleClose = () => {
    onClose()
    resetForm()
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS'
    }).format(amount)
  }

  if (!isOpen || !transaction) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-lg">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            עריכת עסקה ספציפית
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3 mb-4">
          <p className="text-blue-800 dark:text-blue-200 text-sm">
            שינויים כאן יחולו רק על העסקה הספציפית הזו ולא ישפיעו על התבנית החוזרת או עסקאות אחרות.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              תאריך
            </label>
            <input
              type="date"
              value={formData.tx_date}
              onChange={(e) => setFormData({ ...formData, tx_date: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              סכום בפועל
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              סכום מקורי: {formatCurrency(transaction.amount)}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              קטגוריה
            </label>
            <select
              value={formData.category || ''}
              onChange={(e) => {
                  const newCategoryName = e.target.value
                  const selectedCategory = availableCategories.find(c => c.name === newCategoryName)
                  setFormData({ 
                      ...formData, 
                      category: newCategoryName,
                      category_id: selectedCategory ? selectedCategory.id : null
                  })
              }}
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

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              מחק עסקה זו
            </button>
            
            <div className="flex gap-3">
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
                {loading ? 'שומר...' : 'שמור שינויים'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditTransactionInstanceModal
