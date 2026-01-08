import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { RecurringTransactionTemplateCreate } from '../types/api'
import { RecurringTransactionAPI, CategoryAPI } from '../lib/apiClient'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import { fetchSuppliers } from '../store/slices/suppliersSlice'

interface CreateRecurringTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  projectId: number
  projectStartDate?: string | null // Contract start date for validation
}

const CreateRecurringTransactionModal: React.FC<CreateRecurringTransactionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  projectId,
  projectStartDate
}) => {
  const dispatch = useAppDispatch()
  const { items: suppliers } = useAppSelector(s => s.suppliers)
  
  const [formData, setFormData] = useState<RecurringTransactionTemplateCreate>({
    project_id: projectId,
    description: '',
    type: 'Expense',
    amount: 0,
    category: '',
    notes: '',
    supplier_id: 0,
    frequency: 'Monthly',
    day_of_month: 1,
    start_date: new Date().toISOString().split('T')[0],
    end_type: 'No End',
    end_date: null,
    max_occurrences: null
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)
  const [filesToUpload, setFilesToUpload] = useState<File[]>([])
  const [showDescriptionModal, setShowDescriptionModal] = useState(false)
  const [uploadedDocuments, setUploadedDocuments] = useState<Array<{id: number, fileName: string, description: string}>>([])
  const [selectedTransactionForDocuments, setSelectedTransactionForDocuments] = useState<any | null>(null)
  
  const [availableCategories, setAvailableCategories] = useState<any[]>([])
  const [useProjectStartDate, setUseProjectStartDate] = useState(false)
  const [project, setProject] = useState<any>(null)

  useEffect(() => {
    if (isOpen && projectId) {
      import('../lib/apiClient').then(({ ProjectAPI }) => {
        ProjectAPI.getProject(projectId).then(setProject).catch(console.error)
      })
    }
  }, [isOpen, projectId])

  // Validate recurring template start_date in real-time
  useEffect(() => {
    if (!formData.start_date || !projectStartDate) {
      setDateError(null)
      return
    }

    // Parse dates - remove time component for comparison
    const contractStartDateStr = projectStartDate.split('T')[0]
    const templateStartDateStr = formData.start_date.split('T')[0]
    
    const contractStartDate = new Date(contractStartDateStr + 'T00:00:00')
    const templateStartDate = new Date(templateStartDateStr + 'T00:00:00')
    
    // Compare dates (ignore time)
    if (templateStartDate < contractStartDate) {
      const formattedStartDate = contractStartDate.toLocaleDateString('he-IL')
      const formattedTemplateDate = templateStartDate.toLocaleDateString('he-IL')
      setDateError(
        `לא ניתן ליצור תבנית מחזורית עם תאריך התחלה לפני תאריך תחילת החוזה. תאריך תחילת החוזה: ${formattedStartDate}, תאריך התחלה של התבנית: ${formattedTemplateDate}`
      )
    } else {
      setDateError(null)
    }
  }, [formData.start_date, projectStartDate])

  useEffect(() => {
    if (isOpen) {
      dispatch(fetchSuppliers())
      loadCategories()
      // Reset form when modal opens
      setFormData({
        project_id: projectId,
        description: '',
        type: 'Expense',
        amount: 0,
        category: '',
        notes: '',
        supplier_id: 0,
        frequency: 'Monthly',
        day_of_month: 1,
        start_date: new Date().toISOString().split('T')[0],
        end_type: 'No End',
        end_date: null,
        max_occurrences: null
      })
      setUseProjectStartDate(false)
      setError(null)
      setDateError(null)
      setFilesToUpload([])
      setShowDescriptionModal(false)
      setUploadedDocuments([])
      setSelectedTransactionForDocuments(null)
    }
  }, [isOpen, projectId, dispatch])

  const loadCategories = async () => {
    try {
      const categories = await CategoryAPI.getCategories()
      const activeCategories = categories.filter(cat => cat.is_active)
      setAvailableCategories(activeCategories)
    } catch (err) {
      console.error('Error loading categories:', err)
      setAvailableCategories([])
    }
  }

  const resetForm = () => {
    setFormData({
      project_id: projectId,
      description: '',
      type: 'Expense',
      amount: 0,
      category: '',
      notes: '',
      supplier_id: 0,
      frequency: 'Monthly',
      day_of_month: 1,
      start_date: new Date().toISOString().split('T')[0],
      end_type: 'No End',
      end_date: null,
      max_occurrences: null
    })
    setUseProjectStartDate(false)
    setError(null)
    setDateError(null)
    setFilesToUpload([])
    setShowDescriptionModal(false)
    setUploadedDocuments([])
    setSelectedTransactionForDocuments(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.description || formData.amount <= 0) {
      setError('יש למלא תיאור וסכום חיובי')
      return
    }

    if (formData.type === 'Expense' && (!formData.supplier_id || formData.supplier_id === 0)) {
      setError('יש לבחור ספק (חובה לעסקאות הוצאה)')
      return
    }

    if (formData.day_of_month < 1 || formData.day_of_month > 31) {
      setError('יום בחודש חייב להיות בין 1 ל-31')
      return
    }

    if (formData.end_type === 'On Date' && !formData.end_date) {
      setError('יש לבחור תאריך סיום')
      return
    }

    if (formData.end_type === 'After Occurrences' && (!formData.max_occurrences || formData.max_occurrences < 1)) {
      setError('יש להזין מספר הופעות תקין')
      return
    }

    // Validate recurring template start_date is not before contract start date
    if (projectStartDate && formData.start_date) {
      // Parse dates - remove time component for comparison
      const contractStartDateStr = projectStartDate.split('T')[0]
      const templateStartDateStr = formData.start_date.split('T')[0]
      
      const contractStartDate = new Date(contractStartDateStr + 'T00:00:00')
      const templateStartDate = new Date(templateStartDateStr + 'T00:00:00')
      
      // Compare dates (ignore time)
      if (templateStartDate < contractStartDate) {
        const formattedStartDate = contractStartDate.toLocaleDateString('he-IL')
        const formattedTemplateDate = templateStartDate.toLocaleDateString('he-IL')
        setError(
          `לא ניתן ליצור תבנית מחזורית עם תאריך התחלה לפני תאריך תחילת החוזה. תאריך תחילת החוזה: ${formattedStartDate}, תאריך התחלה של התבנית: ${formattedTemplateDate}`
        )
        return
      }
    }

    setLoading(true)
    setError(null)

    try {
      const templateData = {
        ...formData,
        category: formData.category || undefined,
        category_id: formData.category_id || undefined,
        notes: formData.notes || undefined,
        end_date: formData.end_type === 'On Date' ? formData.end_date : undefined,
        max_occurrences: formData.end_type === 'After Occurrences' ? formData.max_occurrences : undefined
      }

      const templateResponse = await RecurringTransactionAPI.createTemplate(templateData)
      
      // Generate transactions - if start_date is in the past, generate for all months from start_date to current month
      const today = new Date()
      const currentYear = today.getFullYear()
      const currentMonth = today.getMonth() + 1
      
      // Parse the start_date from the template
      const startDate = new Date(templateData.start_date)
      const startYear = startDate.getFullYear()
      const startMonth = startDate.getMonth() + 1
      
      // Parse end_date if it exists
      let endYear: number | null = null
      let endMonth: number | null = null
      if (templateData.end_date) {
        const endDate = new Date(templateData.end_date)
        endYear = endDate.getFullYear()
        endMonth = endDate.getMonth() + 1
      }
      
      let generatedTransactionId: number | null = null
      
      try {
        // If start_date is in the past, generate transactions for all months from start_date to current month
        if (startYear < currentYear || (startYear === currentYear && startMonth < currentMonth)) {
          // Generate for all months from start_date to current month (or end_date if earlier)
          let year = startYear
          let month = startMonth
          
          // Determine the last month to generate (either current month or end_date month, whichever is earlier)
          let lastYear = currentYear
          let lastMonth = currentMonth
          if (endYear !== null && endMonth !== null) {
            if (endYear < currentYear || (endYear === currentYear && endMonth < currentMonth)) {
              lastYear = endYear
              lastMonth = endMonth
            }
          }
          
          while (year < lastYear || (year === lastYear && month <= lastMonth)) {
            await RecurringTransactionAPI.generateMonthlyTransactions(year, month)
            
            // Move to next month
            if (month === 12) {
              month = 1
              year++
            } else {
              month++
            }
          }
        } else {
          // Start_date is current or future, just generate for current month
          await RecurringTransactionAPI.generateMonthlyTransactions(currentYear, currentMonth)
        }
        
        // Always generate next month as well (if not past end_date)
        const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1
        const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear
        if (!endYear || !endMonth || nextYear < endYear || (nextYear === endYear && nextMonth <= endMonth)) {
          await RecurringTransactionAPI.generateMonthlyTransactions(nextYear, nextMonth)
        }
        
        // Try to find the generated transaction for the current month
        // We'll need to fetch transactions for the project and find the one that matches
        if (filesToUpload.length > 0) {
          try {
            const { TransactionAPI } = await import('../lib/apiClient')
            const transactions = await TransactionAPI.getProjectTransactions(projectId)
            // Find the most recent transaction that matches our template (same amount, description, supplier)
            const matchingTransaction = transactions
              .filter(t => 
                t.type === templateData.type &&
                t.amount === templateData.amount &&
                (t as any).supplier_id === templateData.supplier_id &&
                t.description === templateData.description
              )
              .sort((a, b) => new Date(b.tx_date).getTime() - new Date(a.tx_date).getTime())[0]
            
            if (matchingTransaction) {
              generatedTransactionId = matchingTransaction.id
            }
          } catch (findErr) {
            // Ignore
          }
        }
      } catch (genErr) {
        // Ignore generation errors, transactions will be generated later
        // Ignore
      }

      // If files were selected and we found the generated transaction, upload them
      if (filesToUpload.length > 0 && generatedTransactionId) {
        try {
          const api = (await import('../lib/api')).default
          let successCount = 0
          let errorCount = 0
          const uploadedDocs: Array<{id: number, fileName: string, description: string}> = []
          
          // Upload each file
          for (let i = 0; i < filesToUpload.length; i++) {
            const file = filesToUpload[i]
            try {
              const formData = new FormData()
              formData.append('file', file)
              const uploadResponse = await api.post(`/transactions/${generatedTransactionId}/supplier-document`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
              })
              
              // Get document ID from response
              if (uploadResponse.data && uploadResponse.data.id) {
                successCount++
                uploadedDocs.push({
                  id: uploadResponse.data.id,
                  fileName: file.name,
                  description: uploadResponse.data.description || ''
                })
              }
            } catch (err: any) {
              // Ignore upload error
              errorCount++
            }
          }
          
          // If some files were uploaded successfully, show description modal
          if (successCount > 0 && uploadedDocs.length > 0) {
            setUploadedDocuments(uploadedDocs)
            setSelectedTransactionForDocuments({ id: generatedTransactionId })
            setShowDescriptionModal(true)
          }
          
          // Show result message if there were errors
          if (errorCount > 0) {
            if (successCount > 0) {
              // Modal will show, but we can still show error count
              // Some files failed
            } else {
              alert(`העסקה המחזורית נוצרה בהצלחה, אך הייתה שגיאה בהעלאת המסמכים`)
            }
          }
        } catch (err: any) {
          // Error uploading files
          alert('העסקה המחזורית נוצרה בהצלחה אך הייתה שגיאה בהעלאת חלק מהמסמכים')
        }
      }

      // Only close and reset if description modal is not showing
      if (!showDescriptionModal) {
        onSuccess()
        onClose()
        resetForm()
        setFilesToUpload([])
      }
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
            הוספת עסקה מחזורית
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
              עסקה מחזורית תיצור עסקה חדשה אוטומטית כל חודש. העסקאות יופיעו בחשבון ההוצאות וההכנסות.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                סוג *
              </label>
              <select
                required
                value={formData.type}
                onChange={(e) => {
                  const newType = e.target.value as 'Income' | 'Expense'
                  setFormData({ 
                    ...formData, 
                    type: newType,
                    // Reset supplier when switching to Income
                    supplier_id: newType === 'Income' ? 0 : formData.supplier_id
                  })
                }}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="Expense">הוצאה</option>
                <option value="Income">הכנסה</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                תיאור *
              </label>
              <input
                type="text"
                required
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="למשל: חשמל, שכירות"
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
                value={formData.amount || ''}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                קטגוריה
              </label>
              <select
                value={formData.category || ''}
              onChange={(e) => {
                const newCategoryName = e.target.value || ''
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
                    newCategoryName && candidates.length === 1 ? candidates[0].id : 0,
                })
              }}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">בחר קטגוריה</option>
                {availableCategories.map(cat => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
            </div>

            {formData.type === 'Expense' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  ספק <span className="text-red-500">* (חובה)</span>
                </label>
                <select
                  required
                  value={formData.supplier_id || 0}
                  onChange={(e) => setFormData({ ...formData, supplier_id: parseInt(e.target.value) || 0 })}
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
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                יום בחודש *
              </label>
              <input
                type="number"
                min="1"
                max="31"
                required
                value={formData.day_of_month}
                onChange={(e) => setFormData({ ...formData, day_of_month: parseInt(e.target.value) || 1 })}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                העסקה תיווצר ביום זה בכל חודש
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                תאריך התחלה *
              </label>
              <input
                type="date"
                required
                value={formData.start_date}
                onChange={(e) => {
                  setFormData({ ...formData, start_date: e.target.value })
                  setUseProjectStartDate(false)
                }}
                disabled={useProjectStartDate}
                className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-600 disabled:text-gray-500 ${
                  dateError
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                }`}
              />
              {dateError && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{dateError}</p>
              )}
              <div className="flex items-center mt-2">
                <input
                  type="checkbox"
                  id="useProjectStartDate"
                  checked={useProjectStartDate}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setUseProjectStartDate(checked)
                    if (checked && project?.start_date) {
                      setFormData({
                        ...formData,
                        start_date: project.start_date.split('T')[0]
                      })
                    }
                  }}
                  disabled={!project?.start_date}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded ml-2"
                />
                <label htmlFor="useProjectStartDate" className={`text-sm ${!project?.start_date ? 'text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                  לפי תאריך חוזה הפרויקט
                  {project?.start_date && <span className="text-xs mr-1 ltr">({project.start_date.split('T')[0]})</span>}
                </label>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                סוג סיום
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
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  מספר הופעות
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.max_occurrences || ''}
                  onChange={(e) => setFormData({ ...formData, max_occurrences: parseInt(e.target.value) || null })}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            )}

            {formData.end_type === 'On Date' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  תאריך סיום
                </label>
                <input
                  type="date"
                  value={formData.end_date || ''}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value || null })}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            )}

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                הערות
              </label>
              <textarea
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value || '' })}
                rows={3}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  העלה מסמכים (אופציונלי)
                </span>
              </label>
              <div className="relative">
                <label 
                  className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700/50 dark:to-gray-800/50 hover:from-blue-50 hover:to-blue-100 dark:hover:from-blue-900/20 dark:hover:to-blue-800/20 transition-all duration-300 group hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-lg"
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const files = Array.from(e.dataTransfer.files)
                    if (files.length > 0) {
                      setFilesToUpload(prev => [...prev, ...files])
                    }
                  }}
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <div className="w-16 h-16 mb-4 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <p className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      <span className="font-bold">לחץ להעלאה</span> או גרור קבצים לכאן
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">PDF, תמונות, מסמכים (מרובה)</p>
                  </div>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      if (e.target.files) {
                        setFilesToUpload(prev => [...prev, ...Array.from(e.target.files || [])])
                      }
                    }}
                  />
                </label>
              </div>
              {filesToUpload.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      נבחרו {filesToUpload.length} קבצים
                    </div>
                    <button
                      type="button"
                      onClick={() => setFilesToUpload([])}
                      className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium"
                    >
                      נקה הכל
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                    {filesToUpload.map((file, index) => (
                      <motion.div
                        key={`${file.name}-${index}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{file.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {(file.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newFiles = filesToUpload.filter((_, i) => i !== index)
                            setFilesToUpload(newFiles)
                          }}
                          className="ml-3 p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"
                          title="הסר קובץ"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                המסמכים יועלו לעסקה הראשונה שנוצרת מהטמפלט
              </p>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm p-3 rounded-md">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'שומר...' : 'צור עסקה מחזורית'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateRecurringTransactionModal

