import React, { useState, useEffect } from 'react'
import { CategoryAPI } from '../lib/apiClient'
import { Transaction, TransactionCreate } from '../types/api'
import { TransactionAPI } from '../lib/apiClient'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import { fetchSuppliers } from '../store/slices/suppliersSlice'
import DuplicateWarningModal from './DuplicateWarningModal'

interface EditTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  transaction: Transaction | null
  projectStartDate?: string | null // Contract start date for validation
}

const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  transaction,
  projectStartDate
}) => {
  const dispatch = useAppDispatch()
  const { items: suppliers } = useAppSelector(s => s.suppliers)
  const [formData, setFormData] = useState<Partial<TransactionCreate>>({
    tx_date: '',
    type: 'Expense',
    amount: 0,
    description: '',
    category: '',
    payment_method: '',
    notes: '',
    is_exceptional: false,
    supplier_id: undefined,
    period_start_date: undefined,
    period_end_date: undefined
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [periodStartDateError, setPeriodStartDateError] = useState<string | null>(null)
  const [periodEndDateError, setPeriodEndDateError] = useState<string | null>(null)
  const [availableCategories, setAvailableCategories] = useState<string[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [uploadingDocument, setUploadingDocument] = useState(false)
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false)
  const [pendingUpdateData, setPendingUpdateData] = useState<Partial<TransactionCreate> | null>(null)
  const [isAddDocumentButtonPressed, setIsAddDocumentButtonPressed] = useState(false)

  useEffect(() => {
    if (isOpen && transaction) {
      dispatch(fetchSuppliers())
      loadCategories()
      loadDocuments()
    }
  }, [isOpen, dispatch, transaction?.id])

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

  const loadDocuments = async () => {
    if (!transaction) return
    setDocumentsLoading(true)
    try {
      const docs = await TransactionAPI.getTransactionDocuments(transaction.id)
      console.log('Loaded documents:', docs)
      setDocuments(docs || [])
    } catch (err) {
      console.error('Error loading documents:', err)
      setDocuments([])
    } finally {
      setDocumentsLoading(false)
    }
  }

  const getFileName = (filePath: string): string => {
    if (!filePath) return 'מסמך'
    try {
      // Try to parse as URL first
      const url = new URL(filePath)
      const pathParts = url.pathname.split('/')
      const fileName = pathParts[pathParts.length - 1] || 'מסמך'
      // Remove query parameters if any
      return fileName.split('?')[0] || 'מסמך'
    } catch {
      // If not a valid URL, treat as path
      const pathParts = filePath.split('/')
      const fileName = pathParts[pathParts.length - 1] || 'מסמך'
      // Remove query parameters if any
      return fileName.split('?')[0] || 'מסמך'
    }
  }

  const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!transaction || !e.target.files || e.target.files.length === 0) {
      setIsAddDocumentButtonPressed(false)
      return
    }

    const file = e.target.files[0]
    setUploadingDocument(true)
    setError(null)

    try {
      console.log('Uploading document:', file.name, 'for transaction:', transaction.id)
      const result = await TransactionAPI.uploadTransactionDocument(transaction.id, file)
      console.log('Upload result:', result)
      // Reload documents list after successful upload
      await loadDocuments()
    } catch (err: any) {
      console.error('Upload error:', err)
      const errorMessage = err.response?.data?.detail || err.message || 'העלאת מסמך נכשלה'
      setError(errorMessage)
    } finally {
      setUploadingDocument(false)
      setIsAddDocumentButtonPressed(false)
      // Reset file input
      if (e.target) {
        e.target.value = ''
      }
    }
  }

  const handleDeleteDocument = async (docId: number) => {
    if (!transaction) return

    if (!confirm('האם אתה בטוח שברצונך למחוק את המסמך הזה?')) {
      return
    }

    try {
      await TransactionAPI.deleteTransactionDocument(transaction.id, docId)
      await loadDocuments() // Reload documents list
    } catch (err: any) {
      setError(err.response?.data?.detail || 'מחיקת מסמך נכשלה')
    }
  }

  const [isPeriodTransaction, setIsPeriodTransaction] = useState(false)

  useEffect(() => {
    if (transaction && isOpen) {
      // Note: from_fund should be set when transaction is passed to the modal
      // This is handled in ProjectDetail.tsx when editing cash register transactions
      
      setFormData({
        tx_date: transaction.tx_date,
        type: transaction.type,
        amount: transaction.amount,
        description: transaction.description || '',
        category: transaction.category || '',
        payment_method: transaction.payment_method || '',
        notes: transaction.notes || '',
        is_exceptional: transaction.is_exceptional || false,
        supplier_id: (transaction as any).supplier_id || undefined,
        period_start_date: transaction.period_start_date || undefined,
        period_end_date: transaction.period_end_date || undefined
      })
      
      // Check if it's a period transaction (has dates set)
      if (transaction.period_start_date && transaction.period_end_date) {
        setIsPeriodTransaction(true)
      } else {
        setIsPeriodTransaction(false)
      }

      // Load documents when transaction changes
      loadDocuments()
    }
  }, [transaction, isOpen])

  // Validate period start date in real-time
  useEffect(() => {
    if (!formData.period_start_date || !projectStartDate) {
      setPeriodStartDateError(null)
      return
    }

    // Parse dates - remove time component for comparison
    const contractStartDateStr = projectStartDate.split('T')[0]
    const periodStartDateStr = formData.period_start_date.split('T')[0]
    
    const contractStartDate = new Date(contractStartDateStr + 'T00:00:00')
    const periodStart = new Date(periodStartDateStr + 'T00:00:00')
    
    // Compare dates (ignore time)
    if (periodStart < contractStartDate) {
      const formattedStartDate = contractStartDate.toLocaleDateString('he-IL')
      const formattedPeriodStart = periodStart.toLocaleDateString('he-IL')
      setPeriodStartDateError(
        `לא ניתן לערוך עסקה תאריכית עם תאריך התחלה לפני תאריך תחילת החוזה. תאריך תחילת החוזה: ${formattedStartDate}, תאריך התחלה של התקופה: ${formattedPeriodStart}`
      )
    } else {
      setPeriodStartDateError(null)
    }
  }, [formData.period_start_date, projectStartDate])

  // Validate period end date in real-time
  useEffect(() => {
    if (!formData.period_end_date || !projectStartDate) {
      setPeriodEndDateError(null)
      return
    }

    // Parse dates - remove time component for comparison
    const contractStartDateStr = projectStartDate.split('T')[0]
    const periodEndDateStr = formData.period_end_date.split('T')[0]
    
    const contractStartDate = new Date(contractStartDateStr + 'T00:00:00')
    const periodEnd = new Date(periodEndDateStr + 'T00:00:00')
    
    // Compare dates (ignore time)
    if (periodEnd < contractStartDate) {
      const formattedStartDate = contractStartDate.toLocaleDateString('he-IL')
      const formattedPeriodEnd = periodEnd.toLocaleDateString('he-IL')
      setPeriodEndDateError(
        `לא ניתן לערוך עסקה תאריכית עם תאריך סיום לפני תאריך תחילת החוזה. תאריך תחילת החוזה: ${formattedStartDate}, תאריך סיום של התקופה: ${formattedPeriodEnd}`
      )
    } else {
      setPeriodEndDateError(null)
    }
  }, [formData.period_end_date, projectStartDate])

  const resetForm = () => {
    setFormData({
      tx_date: '',
      type: 'Expense',
      amount: 0,
      description: '',
      category: '',
      payment_method: '',
      notes: '',
      is_exceptional: false,
      supplier_id: undefined,
      period_start_date: undefined,
      period_end_date: undefined
    })
    setError(null)
    setPeriodStartDateError(null)
    setPeriodEndDateError(null)
    setDocuments([])
    setShowDuplicateWarning(false)
    setPendingUpdateData(null)
    setIsAddDocumentButtonPressed(false)
  }

  const handleConfirmDuplicate = async () => {
    if (!transaction || !pendingUpdateData) return
    
    setLoading(true)
    setError(null)
    
    try {
      await TransactionAPI.updateTransaction(transaction.id, { ...pendingUpdateData, allow_duplicate: true })
      setShowDuplicateWarning(false)
      setPendingUpdateData(null)
      onSuccess()
      onClose()
      resetForm()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'שמירה נכשלה')
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!transaction) return

    if (!formData.tx_date || !formData.amount || formData.amount <= 0) {
      setError('יש למלא תאריך וסכום חיובי')
      return
    }

    const isCashRegisterTransaction = transaction.from_fund === true

    if (formData.type === 'Expense' && !formData.category && !isCashRegisterTransaction) {
      setError('יש לבחור קטגוריה')
      return
    }

    if (!isCashRegisterTransaction && (!formData.supplier_id || formData.supplier_id === 0)) {
      setError('יש לבחור ספק (חובה)')
      return
    }

    // Validate period dates for period transactions
    if (isPeriodTransaction) {
        if (!formData.period_start_date || !formData.period_end_date) {
            setError('עסקה תאריכית חייבת לכלול תאריך התחלה ותאריך סיום')
            return
        }
        if (formData.period_start_date > formData.period_end_date) {
            setError('תאריך התחלה חייב להיות לפני תאריך סיום')
            return
        }
    } else if (formData.period_start_date || formData.period_end_date) {
        // If one date is filled, both must be filled
        if (!formData.period_start_date || !formData.period_end_date) {
            setError('יש למלא גם תאריך התחלה וגם תאריך סיום')
            return
        }
        if (formData.period_start_date > formData.period_end_date) {
            setError('תאריך התחלה חייב להיות לפני תאריך סיום')
            return
        }
    }

    setLoading(true)
    setError(null)

    const updateData: Partial<TransactionCreate> = {
      tx_date: formData.tx_date!,
      type: formData.type!,
      amount: formData.amount!,
      description: formData.description || undefined,
      ...(isCashRegisterTransaction ? {} : { category: formData.category || undefined }),
      payment_method: formData.payment_method || undefined,
      notes: formData.notes || undefined,
      is_exceptional: formData.is_exceptional,
      ...(isCashRegisterTransaction ? {} : { supplier_id: formData.supplier_id! }),
      period_start_date: formData.period_start_date || null,
      period_end_date: formData.period_end_date || null
    }

    try {
      await TransactionAPI.updateTransaction(transaction.id, updateData)
      onSuccess()
      onClose()
      resetForm()
    } catch (err: any) {
      if (err.response?.status === 409) {
        setPendingUpdateData(updateData)
        setShowDuplicateWarning(true)
        setLoading(false)
        return
      }
      setError(err.response?.data?.detail || 'שמירה נכשלה')
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!transaction) return

    if (!confirm('האם אתה בטוח שברצונך למחוק את העסקה הזו?')) {
      return
    }

    try {
      await TransactionAPI.deleteTransaction(transaction.id)
      onSuccess()
      onClose()
      resetForm()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'מחיקה נכשלה')
    }
  }

  const handleClose = () => {
    setIsAddDocumentButtonPressed(false)
    onClose()
    resetForm()
  }

  // Reset button pressed state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsAddDocumentButtonPressed(false)
    }
  }, [isOpen])

  if (!isOpen || !transaction) return null

  // Check if this is a cash register transaction
  // Use explicit check for true, and also check if from_fund might be set on the object
  const isCashRegisterTransaction = transaction.from_fund === true || (transaction as any).from_fund === true

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            עריכת עסקה
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                סוג *
              </label>
              <select
                required
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as 'Income' | 'Expense' })}
                disabled={isPeriodTransaction}
                className={`w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${isPeriodTransaction ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <option value="Expense">הוצאה</option>
                <option value="Income">הכנסה</option>
              </select>
              {isPeriodTransaction && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  לא ניתן לשנות סוג לעסקה תקופתית
                </p>
              )}
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

            {formData.type === 'Expense' && isPeriodTransaction && (
                <div className={`col-span-2 p-3 rounded-lg border grid grid-cols-2 gap-4 mt-2 ${isPeriodTransaction ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700' : 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800'}`}>
                     <div className="col-span-2 flex items-center gap-2 mb-2">
                        <span className={`text-sm font-medium ${isPeriodTransaction ? 'text-blue-900 dark:text-blue-200 font-bold' : 'text-blue-800 dark:text-blue-300'}`}>
                            {isPeriodTransaction ? 'תקופת תשלום (חובה לערוך)' : 'תקופת תשלום (אופציונלי)'}
                        </span>
                     </div>
                     <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">תאריך התחלה {isPeriodTransaction && '*'}</label>
                        <input
                            type="date"
                            value={formData.period_start_date || ''}
                            onChange={(e) => {
                                const newValue = e.target.value || undefined
                                // Prevent clearing date if it's a period transaction
                                if (isPeriodTransaction && !newValue) {
                                    setError('לא ניתן למחוק תאריך התחלה בעסקה תאריכית')
                                    return
                                }
                                setFormData({ ...formData, period_start_date: newValue })
                                setError(null)
                            }}
                            required={isPeriodTransaction}
                            className={`w-full px-2 py-1.5 bg-white dark:bg-gray-800 border rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 ${
                              periodStartDateError
                                ? 'border-red-500 focus:ring-red-500'
                                : 'border-gray-200 dark:border-gray-600 focus:ring-blue-500'
                            }`}
                        />
                        {periodStartDateError && (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{periodStartDateError}</p>
                        )}
                     </div>
                     <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">תאריך סיום {isPeriodTransaction && '*'}</label>
                        <input
                            type="date"
                            value={formData.period_end_date || ''}
                            onChange={(e) => {
                                const newValue = e.target.value || undefined
                                // Prevent clearing date if it's a period transaction
                                if (isPeriodTransaction && !newValue) {
                                    setError('לא ניתן למחוק תאריך סיום בעסקה תאריכית')
                                    return
                                }
                                setFormData({ ...formData, period_end_date: newValue })
                                setError(null)
                            }}
                            required={isPeriodTransaction}
                            className={`w-full px-2 py-1.5 bg-white dark:bg-gray-800 border rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 ${
                              periodEndDateError
                                ? 'border-red-500 focus:ring-red-500'
                                : 'border-gray-200 dark:border-gray-600 focus:ring-blue-500'
                            }`}
                        />
                        {periodEndDateError && (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{periodEndDateError}</p>
                        )}
                     </div>
                </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                סכום *
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

            {!isCashRegisterTransaction && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  קטגוריה
                </label>
                <select
                  value={formData.category || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      category: e.target.value || '',
                      // reset or auto-select supplier when category changes
                      supplier_id: (() => {
                        const newCategory = e.target.value || ''
                        if (!newCategory) return undefined
                        const candidates = suppliers.filter(
                          s => s.is_active && s.category === newCategory
                        )
                        return candidates.length === 1 ? candidates[0].id : undefined
                      })(),
                    })
                  }
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">בחר קטגוריה</option>
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                אמצעי תשלום
              </label>
              <select
                value={formData.payment_method || ''}
                onChange={(e) => setFormData({ ...formData, payment_method: e.target.value || '' })}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">בחר אמצעי תשלום</option>
                <option value="הוראת קבע">הוראת קבע</option>
                <option value="אשראי">אשראי</option>
                <option value="שיק">שיק</option>
                <option value="מזומן">מזומן</option>
                <option value="העברה בנקאית">העברה בנקאית</option>
                <option value="גבייה מרוכזת סוף שנה">גבייה מרוכזת סוף שנה</option>
              </select>
            </div>

            {!isCashRegisterTransaction && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  ספק * <span className="text-red-500">(חובה)</span>
                </label>
                <select
                  required
                  value={formData.supplier_id || ''}
                  onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value === '' ? undefined : Number(e.target.value) })}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">
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
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              תיאור
            </label>
            <input
              type="text"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              הערות
            </label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="exceptional"
              type="checkbox"
              checked={formData.is_exceptional || false}
              onChange={(e) => setFormData({ ...formData, is_exceptional: e.target.checked })}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="exceptional" className="text-sm text-gray-700 dark:text-gray-300">
              הוצאה חריגה
            </label>
          </div>

          {transaction.is_generated && (
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-md p-3">
              <p className="text-purple-800 dark:text-purple-200 text-sm">
                ⚠️ זו עסקה שנוצרה אוטומטית מעסקה מחזורית. שינויים כאן יחולו רק על העסקה הספציפית הזו.
              </p>
            </div>
          )}

          {/* Documents Section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                מסמכים
              </label>
              <label 
                className={`px-3 py-1.5 text-sm text-white rounded-md cursor-pointer transition-colors ${
                  isAddDocumentButtonPressed 
                    ? 'bg-green-800' 
                    : 'bg-green-600 hover:bg-green-700'
                }`}
                onClick={() => setIsAddDocumentButtonPressed(true)}
              >
                {uploadingDocument ? 'מעלה...' : 'הוסף מסמך'}
                <input
                  type="file"
                  onChange={handleUploadDocument}
                  disabled={uploadingDocument}
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                />
              </label>
            </div>

            {documentsLoading ? (
              <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
                טוען מסמכים...
              </div>
            ) : documents.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
                אין מסמכים
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {documents.map((doc) => {
                  const fileName = getFileName(doc.file_path || '')
                  const displayName = doc.description || fileName
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-md"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate" title={displayName}>
                          📄 {displayName}
                        </span>
                        {doc.file_path && (
                          <a
                            href={doc.file_path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline ml-2 whitespace-nowrap"
                          >
                            צפה
                          </a>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 ml-2 whitespace-nowrap"
                      >
                        מחק
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
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
              מחק
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
                {loading ? 'שומר...' : 'שמור'}
              </button>
            </div>
          </div>
        </form>
      </div>
      
      <DuplicateWarningModal
        isOpen={showDuplicateWarning}
        onClose={() => {
            setShowDuplicateWarning(false)
            setPendingUpdateData(null)
        }}
        onConfirm={handleConfirmDuplicate}
        isEdit={true}
      />
    </div>
  )
}

export default EditTransactionModal
