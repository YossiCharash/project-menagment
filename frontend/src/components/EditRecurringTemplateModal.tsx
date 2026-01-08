import React, { useState, useEffect } from 'react'
import { RecurringTransactionTemplate, RecurringTransactionTemplateUpdate } from '../types/api'
import { RecurringTransactionAPI, CategoryAPI } from '../lib/apiClient'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import { fetchSuppliers } from '../store/slices/suppliersSlice'

interface EditRecurringTemplateModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  template: RecurringTransactionTemplate | null
}

const EditRecurringTemplateModal: React.FC<EditRecurringTemplateModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  template
}) => {
  const dispatch = useAppDispatch()
  const { items: suppliers } = useAppSelector(s => s.suppliers)
  
  const [formData, setFormData] = useState<RecurringTransactionTemplateUpdate>({
    description: '',
    amount: 0,
    category: '',
    notes: '',
    supplier_id: null,
    day_of_month: 1,
    start_date: '',
    end_type: 'No End',
    end_date: null,
    max_occurrences: null
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [availableCategories, setAvailableCategories] = useState<any[]>([])
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [changesSummary, setChangesSummary] = useState<string[]>([])
  const [templateLoading, setTemplateLoading] = useState(false)

  useEffect(() => {
    if (isOpen && template) {
      dispatch(fetchSuppliers())
      loadCategories()
      // Reset form data when modal opens and template is available
      setFormData({
        description: template.description,
        amount: template.amount,
        category: template.category || '',
        category_id: template.category_id || null,
        notes: template.notes || '',
        supplier_id: template.supplier_id || null,
        day_of_month: template.day_of_month,
        start_date: template.start_date,
        end_type: template.end_type,
        end_date: template.end_date || null,
        max_occurrences: template.max_occurrences || null
      })
    }
  }, [template, isOpen, dispatch])

  const loadCategories = async () => {
    try {
      const categories = await CategoryAPI.getCategories()
      const activeCategories = categories.filter(cat => cat.is_active)
      setAvailableCategories(activeCategories)
      
      // If we have template and category name but no ID, try to find it
      if (template && template.category && !template.category_id) {
          const cat = activeCategories.find(c => c.name === template.category)
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
      description: '',
      amount: 0,
      category: '',
      notes: '',
      supplier_id: null,
      day_of_month: 1,
      start_date: '',
      end_type: 'No End',
      end_date: null,
      max_occurrences: null
    })
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!template) return

    // Calculate changes for summary
    const changes: string[] = []
    if (formData.description !== template.description) changes.push(`תיאור: ${template.description} -> ${formData.description}`)
    if (formData.amount !== template.amount) changes.push(`סכום: ${template.amount} -> ${formData.amount}`)
    if (formData.category !== template.category) changes.push(`קטגוריה: ${template.category || 'ללא'} -> ${formData.category || 'ללא'}`)
    
    if (!formData.category && formData.amount > 0) {
       setError('יש לבחור קטגוריה')
       return
    }

    if (formData.supplier_id !== template.supplier_id) {
       const oldSupplier = suppliers.find(s => s.id === template.supplier_id)?.name || 'ללא'
       const newSupplier = suppliers.find(s => s.id === formData.supplier_id)?.name || 'ללא'
       changes.push(`ספק: ${oldSupplier} -> ${newSupplier}`)
    }
    if (formData.day_of_month !== template.day_of_month) changes.push(`יום בחודש: ${template.day_of_month} -> ${formData.day_of_month}`)
    
    // Add other relevant changes...
    
    if (changes.length === 0) {
        // No changes detected, but maybe they just clicked save. 
        // We can either save anyway or show "No changes".
        // Let's proceed to confirmation even if "no changes" just to be consistent with "save".
        // Or actually, if no changes, we can just close?
        // Let's assume there might be subtle changes or just show a generic message.
    }
    
    setChangesSummary(changes)
    setShowConfirmation(true)
  }

  const handleConfirmSave = async () => {
    if (!template) return
    
    setLoading(true)
    setError(null)

    try {
      const updateData = {
        ...formData,
        description: formData.description || undefined,
        category: formData.category || undefined,
        notes: formData.notes || undefined,
        end_date: formData.end_type === 'On Date' ? formData.end_date : null,
        max_occurrences: formData.end_type === 'After Occurrences' ? formData.max_occurrences : null
      }

      await RecurringTransactionAPI.updateTemplate(template.id, updateData)
      onSuccess()
      onClose()
      resetForm()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'שמירה נכשלה')
      setShowConfirmation(false) // Go back to form on error
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    onClose()
    resetForm()
    setShowConfirmation(false)
  }

  if (!isOpen) return null
  
  // Show loading state if template is not loaded yet
  if (!template) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="text-gray-700 dark:text-gray-300">טוען פרטי תבנית...</span>
          </div>
        </div>
      </div>
    )
  }

  if (showConfirmation) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            אישור שמירת שינויים
          </h2>
          
          <div className="mb-6">
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              האם אתה בטוח שברצונך לשמור את השינויים הבאים בתבנית העסקה המחזורית?
            </p>
            
            {changesSummary.length > 0 ? (
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg text-sm space-y-2">
                {changesSummary.map((change, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-blue-500">•</span>
                    <span className="text-gray-700 dark:text-gray-300">{change}</span>
                  </div>
                ))}
              </div>
            ) : (
               <p className="text-gray-500 italic text-sm">לא זוהו שינויים (ייתכן ששינית שדות לא במעקב או ללא שינוי ערך)</p>
            )}
            
            <p className="mt-4 text-sm text-red-600 dark:text-red-400 font-medium">
              שים לב: שינויים אלו יחולו על כל העסקאות העתידיות שייווצרו מתבנית זו.
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowConfirmation(false)}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500"
              disabled={loading}
            >
              חזור לעריכה
            </button>
            <button
              onClick={handleConfirmSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'שומר...' : 'אשר ושמור'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            עריכת תבנית עסקה חוזרת
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3 mb-4">
            <p className="text-blue-800 dark:text-blue-200 text-sm">
              שינויים יוחלו על עסקאות עתידיות שייווצרו מתבנית זו. עסקאות שכבר נוצרו לא ישתנו.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                תיאור *
              </label>
              <input
                type="text"
                required
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                סכום קבוע *
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
                
                const candidates = suppliers.filter(
                  s => s.is_active && s.category === newCategoryName
                )
                setFormData({
                  ...formData,
                  category: newCategoryName,
                  category_id: selectedCategory ? selectedCategory.id : null,
                  // auto-select only supplier if exactly one exists
                  supplier_id:
                    newCategoryName && candidates.length === 1 ? candidates[0].id : null,
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
              ספק *
            </label>
            <select
              required
              value={formData.supplier_id || 0}
              onChange={(e) => setFormData({ ...formData, supplier_id: parseInt(e.target.value) || null })}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="0">
                {formData.category ? 'בחר ספק' : 'בחר קודם קטגוריה'}
              </option>
              {suppliers
                .filter(
                  s =>
                    s.is_active &&
                    !!formData.category &&
                    s.category === formData.category
                )
                .map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
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

          <div className="border-t pt-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              הגדרות חוזרות
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  יום בחודש לביצוע *
                </label>
                <select
                  required
                  value={formData.day_of_month}
                  onChange={(e) => setFormData({ ...formData, day_of_month: parseInt(e.target.value) })}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  תאריך התחלה חדש (תאריך אפקטיבי) *
                </label>
                <input
                  type="date"
                  required
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                סיום
              </label>
              <select
                value={formData.end_type}
                onChange={(e) => setFormData({ ...formData, end_type: e.target.value as any })}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="No End">ללא סיום</option>
                <option value="After Occurrences">לאחר מספר הופעות</option>
                <option value="On Date">בתאריך מסוים</option>
              </select>
            </div>

            {formData.end_type === 'After Occurrences' && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  מספר הופעות
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.max_occurrences || ''}
                  onChange={(e) => setFormData({ ...formData, max_occurrences: parseInt(e.target.value) })}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            )}

            {formData.end_type === 'On Date' && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  תאריך סיום
                </label>
                <input
                  type="date"
                  value={formData.end_date || ''}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
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
              {loading ? 'שומר...' : 'שמור שינויים'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditRecurringTemplateModal
