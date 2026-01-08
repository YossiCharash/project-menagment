import React, { useState, useEffect, FormEvent, ChangeEvent } from 'react'
import { motion } from 'framer-motion'
import { TransactionCreate, RecurringTransactionTemplateCreate } from '../types/api'
import { TransactionAPI, RecurringTransactionAPI, CategoryAPI, Category } from '../lib/apiClient'
import api from '../lib/api'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import { fetchSuppliers } from '../store/slices/suppliersSlice'
import DuplicateWarningModal from './DuplicateWarningModal'

interface CreateTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  projectId: number
  isSubproject?: boolean // True if the current project is a subproject
  projectName?: string
  allowSubprojectSelection?: boolean
  projectStartDate?: string | null // Contract start date for validation
}

type TransactionType = 'regular' | 'recurring'

const CreateTransactionModal: React.FC<CreateTransactionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  projectId,
  isSubproject = false,
  projectName,
  allowSubprojectSelection = false,
  projectStartDate
}) => {
  const dispatch = useAppDispatch()
  const { items: suppliers } = useAppSelector(s => s.suppliers)
  
  const [transactionMode, setTransactionMode] = useState<TransactionType>('regular')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Date validation states
  const [dateError, setDateError] = useState<string | null>(null)
  const [recurringDateError, setRecurringDateError] = useState<string | null>(null)
  const [periodStartDateError, setPeriodStartDateError] = useState<string | null>(null)
  const [periodEndDateError, setPeriodEndDateError] = useState<string | null>(null)
  
  // Regular transaction states
  const [type, setType] = useState<'Income' | 'Expense'>('Expense')
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0])
  const [amount, setAmount] = useState<number | ''>('')
  const [desc, setDesc] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [notes, setNotes] = useState('')
  const [subprojectId, setSubprojectId] = useState<number | ''>('')
  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [isExceptional, setIsExceptional] = useState(false)
  const [fromFund, setFromFund] = useState(false)
  const [hasFund, setHasFund] = useState(false)
  const [fundBalance, setFundBalance] = useState<number | null>(null)
  const [filesToUpload, setFilesToUpload] = useState<File[]>([])
  
  // Period transaction states
  const [isPeriodTransaction, setIsPeriodTransaction] = useState(false)
  const [periodStartDate, setPeriodStartDate] = useState('')
  const [periodEndDate, setPeriodEndDate] = useState('')
  
  // Recurring transaction states
  const [recurringFormData, setRecurringFormData] = useState<RecurringTransactionTemplateCreate>({
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
  
  const [subprojects, setSubprojects] = useState<Array<{id: number, name: string}>>([])
  const [showDescriptionModal, setShowDescriptionModal] = useState(false)
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false)
  const [pendingPayload, setPendingPayload] = useState<TransactionCreate | null>(null)
  const [uploadedDocuments, setUploadedDocuments] = useState<Array<{id: number, fileName: string, description: string}>>([])
  const [selectedTransactionForDocuments, setSelectedTransactionForDocuments] = useState<any | null>(null)
  const [availableCategories, setAvailableCategories] = useState<Category[]>([])

  useEffect(() => {
    if (isOpen) {
      dispatch(fetchSuppliers())
      loadSubprojects()
      loadFundInfo()
      loadCategories()
      resetForms()
    }
  }, [isOpen, projectId, dispatch])

  // Validate transaction date in real-time
  useEffect(() => {
    if (!txDate || !projectStartDate) {
      setDateError(null)
      return
    }

    // Parse dates - remove time component for comparison
    const contractStartDateStr = projectStartDate.split('T')[0]
    const transactionDateStr = txDate.split('T')[0]
    
    const contractStartDate = new Date(contractStartDateStr + 'T00:00:00')
    const transactionDate = new Date(transactionDateStr + 'T00:00:00')
    
    // Compare dates (ignore time)
    if (transactionDate < contractStartDate) {
      const formattedStartDate = contractStartDate.toLocaleDateString('he-IL')
      const formattedTxDate = transactionDate.toLocaleDateString('he-IL')
      setDateError(
        `לא ניתן ליצור עסקה לפני תאריך תחילת החוזה. תאריך תחילת החוזה: ${formattedStartDate}, תאריך העסקה: ${formattedTxDate}`
      )
    } else {
      setDateError(null)
    }
  }, [txDate, projectStartDate])

  // Validate recurring template start_date in real-time
  useEffect(() => {
    if (!recurringFormData.start_date || !projectStartDate) {
      setRecurringDateError(null)
      return
    }

    // Parse dates - remove time component for comparison
    const contractStartDateStr = projectStartDate.split('T')[0]
    const templateStartDateStr = recurringFormData.start_date.split('T')[0]
    
    const contractStartDate = new Date(contractStartDateStr + 'T00:00:00')
    const templateStartDate = new Date(templateStartDateStr + 'T00:00:00')
    
    // Compare dates (ignore time)
    if (templateStartDate < contractStartDate) {
      const formattedStartDate = contractStartDate.toLocaleDateString('he-IL')
      const formattedTemplateDate = templateStartDate.toLocaleDateString('he-IL')
      setRecurringDateError(
        `לא ניתן ליצור תבנית מחזורית עם תאריך התחלה לפני תאריך תחילת החוזה. תאריך תחילת החוזה: ${formattedStartDate}, תאריך התחלה של התבנית: ${formattedTemplateDate}`
      )
    } else {
      setRecurringDateError(null)
    }
  }, [recurringFormData.start_date, projectStartDate])

  // Validate period start date in real-time
  useEffect(() => {
    if (!periodStartDate || !projectStartDate) {
      setPeriodStartDateError(null)
      return
    }

    // Parse dates - remove time component for comparison
    const contractStartDateStr = projectStartDate.split('T')[0]
    const periodStartDateStr = periodStartDate.split('T')[0]
    
    const contractStartDate = new Date(contractStartDateStr + 'T00:00:00')
    const periodStart = new Date(periodStartDateStr + 'T00:00:00')
    
    // Compare dates (ignore time)
    if (periodStart < contractStartDate) {
      const formattedStartDate = contractStartDate.toLocaleDateString('he-IL')
      const formattedPeriodStart = periodStart.toLocaleDateString('he-IL')
      setPeriodStartDateError(
        `לא ניתן ליצור עסקה תאריכית עם תאריך התחלה לפני תאריך תחילת החוזה. תאריך תחילת החוזה: ${formattedStartDate}, תאריך התחלה של התקופה: ${formattedPeriodStart}`
      )
    } else {
      setPeriodStartDateError(null)
    }
  }, [periodStartDate, projectStartDate])

  // Validate period end date in real-time
  useEffect(() => {
    if (!periodEndDate || !projectStartDate) {
      setPeriodEndDateError(null)
      return
    }

    // Parse dates - remove time component for comparison
    const contractStartDateStr = projectStartDate.split('T')[0]
    const periodEndDateStr = periodEndDate.split('T')[0]
    
    const contractStartDate = new Date(contractStartDateStr + 'T00:00:00')
    const periodEnd = new Date(periodEndDateStr + 'T00:00:00')
    
    // Compare dates (ignore time)
    if (periodEnd < contractStartDate) {
      const formattedStartDate = contractStartDate.toLocaleDateString('he-IL')
      const formattedPeriodEnd = periodEnd.toLocaleDateString('he-IL')
      setPeriodEndDateError(
        `לא ניתן ליצור עסקה תאריכית עם תאריך סיום לפני תאריך תחילת החוזה. תאריך תחילת החוזה: ${formattedStartDate}, תאריך סיום של התקופה: ${formattedPeriodEnd}`
      )
    } else {
      setPeriodEndDateError(null)
    }
  }, [periodEndDate, projectStartDate])

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

  const loadFundInfo = async () => {
    if (!projectId) {
      setHasFund(false)
      setFundBalance(null)
      return
    }
    
    try {
      const { data } = await api.get(`/projects/${projectId}`)
      const hasFundFlag = data.has_fund || false
      setHasFund(hasFundFlag)
      
      if (hasFundFlag) {
        try {
          const { data: fundData } = await api.get(`/projects/${projectId}/fund`)
          setFundBalance(fundData.current_balance)
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

  const loadSubprojects = async () => {
    try {
      const { data } = await api.get(`/projects`)
      // Filter to get only sub-projects that belong to the current project
      const subProjects = data.filter((p: any) => p.relation_project === projectId)
      setSubprojects(subProjects.map((p: any) => ({ id: p.id, name: p.name })))
    } catch {
      setSubprojects([])
    }
  }

  const resetForms = () => {
    // Remove focus from any active element to prevent button staying "pressed"
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    
    // Reset transaction mode to regular
    setTransactionMode('regular')
    
    // Reset loading state
    setLoading(false)
    
    // Reset regular transaction form
    setType('Expense')
    setTxDate(new Date().toISOString().split('T')[0])
    setAmount('')
    setDesc('')
    setCategoryId('')
    setPaymentMethod('')
    setNotes('')
    // If this is a subproject, set subprojectId to current projectId automatically
    // If it's a parent project (allowSubprojectSelection), start with empty subprojectId
    setSubprojectId(isSubproject ? projectId : '')
    setSupplierId('')
    setIsExceptional(false)
    setFromFund(false)
    setFilesToUpload([])
    
    setIsPeriodTransaction(false)
    setPeriodStartDate('')
    setPeriodEndDate('')
    
    // Reset recurring transaction form
    setRecurringFormData({
      project_id: projectId,
      description: '',
      type: 'Expense',
      amount: 0,
      category: '', // Keep for recurring transactions compatibility
      notes: '',
      supplier_id: 0,
      frequency: 'Monthly',
      day_of_month: 1,
      start_date: new Date().toISOString().split('T')[0],
      end_type: 'No End',
      end_date: null,
      max_occurrences: null
    })
    
    setError(null)
    setDateError(null)
    setRecurringDateError(null)
    setPeriodStartDateError(null)
    setPeriodEndDateError(null)
    setShowDescriptionModal(false)
    setShowDuplicateWarning(false)
    setPendingPayload(null)
    setUploadedDocuments([])
    setSelectedTransactionForDocuments(null)
  }

  const handleTransactionSuccess = async (transactionData: any) => {
    const newTransactionId = transactionData?.id

    // If files were selected, upload them
    if (filesToUpload.length > 0 && newTransactionId) {
      try {
        let successCount = 0
        let errorCount = 0
        const uploadedDocs: Array<{id: number, fileName: string, description: string}> = []
        
        for (let i = 0; i < filesToUpload.length; i++) {
          const file = filesToUpload[i]
          try {
            const formData = new FormData()
            formData.append('file', file)
            const uploadResponse = await api.post(`/transactions/${newTransactionId}/supplier-document`, formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            })
            
            if (uploadResponse.data && uploadResponse.data.id) {
              successCount++
              uploadedDocs.push({
                id: uploadResponse.data.id,
                fileName: file.name,
                description: uploadResponse.data.description || ''
              })
            }
          } catch (err: any) {
            errorCount++
          }
        }
        
        if (successCount > 0 && uploadedDocs.length > 0) {
          setUploadedDocuments(uploadedDocs)
          setSelectedTransactionForDocuments({ id: newTransactionId })
          setShowDescriptionModal(true)
        }
        
        if (errorCount > 0) {
          if (successCount > 0) {
            alert(`הועלו ${successCount} מסמכים, ${errorCount} נכשלו`)
          } else {
            alert(`שגיאה בהעלאת המסמכים`)
          }
        }
      } catch (err: any) {
        alert('העסקה נוצרה בהצלחה אך הייתה שגיאה בהעלאת חלק מהמסמכים')
      }
    }

    if (!showDescriptionModal && !(filesToUpload.length > 0 && newTransactionId)) {
      onSuccess()
      onClose()
      resetForms()
    }
  }

  const handleCreateRegularTransaction = async (e: FormEvent) => {
    e.preventDefault()

    if (!txDate) {
      setError('תאריך חיוב נדרש')
      return
    }

    // Validate transaction date is not before contract start date
    if (projectStartDate) {
      // Parse dates - remove time component for comparison
      const contractStartDateStr = projectStartDate.split('T')[0]
      const transactionDateStr = txDate.split('T')[0]
      
      const contractStartDate = new Date(contractStartDateStr + 'T00:00:00')
      const transactionDate = new Date(transactionDateStr + 'T00:00:00')
      
      // Compare dates (ignore time)
      if (transactionDate < contractStartDate) {
        const formattedStartDate = contractStartDate.toLocaleDateString('he-IL')
        const formattedTxDate = transactionDate.toLocaleDateString('he-IL')
        setError(
          `לא ניתן ליצור עסקה לפני תאריך תחילת החוזה. תאריך תחילת החוזה: ${formattedStartDate}, תאריך העסקה: ${formattedTxDate}`
        )
        return
      }
    }

    if (amount === '' || Number(amount) <= 0) {
      setError('סכום חיובי נדרש')
      return
    }

    if (!fromFund && !categoryId) {
      setError('יש לבחור קטגוריה')
      return
    }

    // Supplier is required only if not from fund and category is not "אחר"
    const selectedCategory = categoryId ? availableCategories.find(cat => cat.id === categoryId) : null
    const isOtherCategory = selectedCategory?.name === 'אחר'
    if (!fromFund && type === 'Expense' && !isOtherCategory && (supplierId === '' || !supplierId)) {
      setError('יש לבחור ספק (חובה)')
      return
    }

    if (isPeriodTransaction) {
      if (!periodStartDate || !periodEndDate) {
        setError('יש להזין תאריכי התחלה וסיום לתקופה')
        return
      }
      if (periodStartDate > periodEndDate) {
        setError('תאריך התחלה חייב להיות לפני תאריך סיום')
        return
      }
    }

    // Allow negative fund balance - removed validation that prevented it

    setLoading(true)
    setError(null)

    try {
      const payload: TransactionCreate = {
        project_id: projectId,
        tx_date: txDate,
        type,
        amount: Number(amount),
        description: desc || undefined,
        category_id: fromFund ? undefined : (categoryId ? Number(categoryId) : undefined), // Use category_id instead of category name
        payment_method: paymentMethod || undefined,
        notes: notes || undefined,
        supplier_id: supplierId ? Number(supplierId) : undefined,
        is_exceptional: isExceptional,
        from_fund: fromFund ? true : false,
        subproject_id: subprojectId ? Number(subprojectId) : undefined,
        period_start_date: isPeriodTransaction ? periodStartDate : undefined,
        period_end_date: isPeriodTransaction ? periodEndDate : undefined
      }

      let response
      try {
        response = await api.post('/transactions/', payload)
      } catch (e: any) {
        if (e.response?.status === 409) {
          setPendingPayload(payload)
          setShowDuplicateWarning(true)
          setLoading(false)
          return
        } else {
          throw e
        }
      }

      await handleTransactionSuccess(response.data)
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'שמירה נכשלה')
      setLoading(false)
    }
  }

  const handleConfirmDuplicate = async () => {
    if (!pendingPayload) return
    
    setLoading(true)
    setError(null)
    
    try {
      const response = await api.post('/transactions/', { ...pendingPayload, allow_duplicate: true })
      setShowDuplicateWarning(false)
      setPendingPayload(null)
      await handleTransactionSuccess(response.data)
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'שמירה נכשלה')
      setLoading(false)
    }
  }

  const handleCreateRecurringTransaction = async (e: FormEvent) => {
    e.preventDefault()

    if (!recurringFormData.description || recurringFormData.amount <= 0) {
      setError('יש למלא תיאור וסכום חיובי')
      return
    }

    if (!recurringFormData.category) {
      setError('יש לבחור קטגוריה')
      return
    }

    if (recurringFormData.type === 'Expense' && recurringFormData.category !== 'אחר' && (!recurringFormData.supplier_id || recurringFormData.supplier_id === 0)) {
      setError('יש לבחור ספק (חובה)')
      return
    }

    if (recurringFormData.day_of_month < 1 || recurringFormData.day_of_month > 31) {
      setError('יום בחודש חייב להיות בין 1 ל-31')
      return
    }

    if (recurringFormData.end_type === 'On Date' && !recurringFormData.end_date) {
      setError('יש לבחור תאריך סיום')
      return
    }

    if (recurringFormData.end_type === 'After Occurrences' && (!recurringFormData.max_occurrences || recurringFormData.max_occurrences < 1)) {
      setError('יש להזין מספר הופעות תקין')
      return
    }

    // Validate recurring template start_date is not before contract start date
    if (projectStartDate && recurringFormData.start_date) {
      // Parse dates - remove time component for comparison
      const contractStartDateStr = projectStartDate.split('T')[0]
      const templateStartDateStr = recurringFormData.start_date.split('T')[0]
      
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
          ...recurringFormData,
          category: recurringFormData.category || undefined,
          notes: recurringFormData.notes || undefined,
          end_date: recurringFormData.end_type === 'On Date' ? recurringFormData.end_date : undefined,
          max_occurrences: recurringFormData.end_type === 'After Occurrences' ? recurringFormData.max_occurrences : undefined,
          subproject_id: subprojectId ? Number(subprojectId) : undefined
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
        
        if (filesToUpload.length > 0) {
          try {
            const transactions = await TransactionAPI.getProjectTransactions(projectId)
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
        // Ignore
      }

      // If files were selected and we found the generated transaction, upload them
      if (filesToUpload.length > 0 && generatedTransactionId) {
        try {
          let successCount = 0
          let errorCount = 0
          const uploadedDocs: Array<{id: number, fileName: string, description: string}> = []
          
          for (let i = 0; i < filesToUpload.length; i++) {
            const file = filesToUpload[i]
            try {
              const formData = new FormData()
              formData.append('file', file)
              const uploadResponse = await api.post(`/transactions/${generatedTransactionId}/supplier-document`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
              })
              
              if (uploadResponse.data && uploadResponse.data.id) {
                successCount++
                uploadedDocs.push({
                  id: uploadResponse.data.id,
                  fileName: file.name,
                  description: uploadResponse.data.description || ''
                })
              }
            } catch (err: any) {
              errorCount++
            }
          }
          
          if (successCount > 0 && uploadedDocs.length > 0) {
            setUploadedDocuments(uploadedDocs)
            setSelectedTransactionForDocuments({ id: generatedTransactionId })
            setShowDescriptionModal(true)
          }
          
          if (errorCount > 0) {
            if (successCount === 0) {
              alert(`העסקה המחזורית נוצרה בהצלחה, אך הייתה שגיאה בהעלאת המסמכים`)
            }
          }
        } catch (err: any) {
          alert('העסקה המחזורית נוצרה בהצלחה אך הייתה שגיאה בהעלאת חלק מהמסמכים')
        }
      }

      if (!showDescriptionModal) {
        onSuccess()
        onClose()
        resetForms()
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'שמירה נכשלה')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    // Remove focus from any active element
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    resetForms()
    onClose()
  }

  if (!isOpen) return null

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              יצירת עסקה חדשה
            </h2>
            <button
              onClick={handleClose}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Mode Selection Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setTransactionMode('regular')}
              onMouseDown={(e) => e.preventDefault()}
              className={`flex-1 px-6 py-4 text-center font-medium transition-colors ${
                transactionMode === 'regular'
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              עסקה רגילה
            </button>
            <button
              type="button"
              onClick={() => setTransactionMode('recurring')}
              onMouseDown={(e) => e.preventDefault()}
              className={`flex-1 px-6 py-4 text-center font-medium transition-colors ${
                transactionMode === 'recurring'
                  ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              עסקה מחזורית
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
            {transactionMode === 'regular' ? (
              <form onSubmit={handleCreateRegularTransaction} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סוג *</label>
                    <select
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={type}
                      onChange={e => {
                        const newType = e.target.value as 'Income' | 'Expense'
                        setType(newType)
                        // Reset supplier when switching to Income
                        if (newType === 'Income') {
                          setSupplierId('')
                        }
                      }}
                      required
                    >
                      <option value="Income">הכנסה</option>
                      <option value="Expense">הוצאה</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תאריך חיוב *</label>
                    <input
                      className={`w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 ${
                        dateError
                          ? 'border-red-500 focus:ring-red-500'
                          : 'border-gray-200 dark:border-gray-600 focus:ring-blue-500'
                      }`}
                      type="date"
                      value={txDate}
                      onChange={e => setTxDate(e.target.value)}
                      required
                    />
                    {dateError && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">{dateError}</p>
                    )}
                    {type === 'Expense' && (
                        <div className="mt-2 flex items-center gap-2">
                            <input
                                id="isPeriod"
                                type="checkbox"
                                checked={isPeriodTransaction}
                                onChange={e => setIsPeriodTransaction(e.target.checked)}
                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <label htmlFor="isPeriod" className="text-sm text-gray-600 dark:text-gray-400">הוגדר כתקופתי (חשבונות וכו')</label>
                        </div>
                    )}
                  </div>

                  {isPeriodTransaction && type === 'Expense' && (
                    <div className="md:col-span-2 grid grid-cols-2 gap-4 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תחילת תקופה *</label>
                            <input
                                className={`w-full px-3 py-2 bg-white dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 ${
                                  periodStartDateError
                                    ? 'border-red-500 focus:ring-red-500'
                                    : 'border-gray-200 dark:border-gray-600 focus:ring-blue-500'
                                }`}
                                type="date"
                                value={periodStartDate}
                                onChange={e => setPeriodStartDate(e.target.value)}
                                required={isPeriodTransaction}
                            />
                            {periodStartDateError && (
                              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{periodStartDateError}</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סיום תקופה *</label>
                            <input
                                className={`w-full px-3 py-2 bg-white dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 ${
                                  periodEndDateError
                                    ? 'border-red-500 focus:ring-red-500'
                                    : 'border-gray-200 dark:border-gray-600 focus:ring-blue-500'
                                }`}
                                type="date"
                                value={periodEndDate}
                                onChange={e => setPeriodEndDate(e.target.value)}
                                required={isPeriodTransaction}
                            />
                            {periodEndDateError && (
                              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{periodEndDateError}</p>
                            )}
                        </div>
                        <div className="col-span-2 text-xs text-blue-600 dark:text-blue-400">
                            ℹ️ ההוצאה תחולק יחסית לכל חודש בדוחות לפי מספר הימים בחודש
                        </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סכום *</label>
                    <input
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      type="number"
                      value={amount}
                      onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                      required
                      min="0"
                      step="0.01"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">קטגוריה</label>
                    <select
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={fromFund ? '__FUND__' : (categoryId === '' ? '' : String(categoryId))}
                      onChange={e => {
                        if (e.target.value === '__FUND__') {
                          setFromFund(true)
                          setCategoryId('')
                          setSupplierId('')
                        } else {
                          setFromFund(false)
                          const newCategoryId = e.target.value === '' ? '' : Number(e.target.value)
                          setCategoryId(newCategoryId)
                          // Get category name for supplier filtering
                          const selectedCategory = newCategoryId ? availableCategories.find(cat => cat.id === newCategoryId) : null
                          const categoryName = selectedCategory?.name || ''
                          // reset supplier when category changes
                          setSupplierId('')
                          // If there is exactly one active supplier in this category, select it automatically
                          const candidates = suppliers.filter(
                            s => s.is_active && s.category === categoryName
                          )
                          if (candidates.length === 1) {
                            setSupplierId(candidates[0].id)
                          }
                        }
                      }}
                    >
                      <option value="">בחר קטגוריה</option>
                      {hasFund && (
                        <option value="__FUND__" className="bg-blue-50 dark:bg-blue-900/20">
                          {type === 'Expense' ? '💰 הוריד מהקופה' : '💰 הוסף לקופה'}
                        </option>
                      )}
                      {availableCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                    {fromFund && (
                      <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                        <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-1">
                          {type === 'Expense' 
                            ? '⚠️ עסקה זו תרד מהקופה ולא תיכלל בחישובי ההוצאות הרגילות'
                            : '⚠️ עסקה זו תתווסף לקופה ולא תיכלל בחישובי ההכנסות הרגילות'}
                        </p>
                        {fundBalance !== null && (
                          <p className={`text-xs ${fundBalance < 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-blue-600 dark:text-blue-400'}`}>
                            יתרה בקופה: {fundBalance.toLocaleString('he-IL')} ₪
                            {fundBalance < 0 && ' (מינוס!)'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">אמצעי תשלום</label>
                    <select
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value)}
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

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תת־פרויקט</label>
                    {isSubproject ? (
                      <input
                        type="text"
                        value={projectName || (projectId ? `פרויקט #${projectId}` : '')}
                        disabled
                        className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-600 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 cursor-not-allowed"
                      />
                    ) : (
                      <select
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={subprojectId}
                        onChange={e => setSubprojectId(e.target.value === '' ? '' : Number(e.target.value))}
                        disabled={!allowSubprojectSelection && subprojects.length === 0}
                      >
                        <option value="">{allowSubprojectSelection ? 'בחר תת-פרויקט' : 'ללא'}</option>
                        {subprojects.map(sp => (
                          <option key={sp.id} value={sp.id}>{sp.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {!fromFund && type === 'Expense' && (() => {
                    const selectedCategory = categoryId ? availableCategories.find(cat => cat.id === categoryId) : null
                    const categoryName = selectedCategory?.name || ''
                    const isOtherCategory = categoryName === 'אחר'
                    return (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          ספק {!isOtherCategory && <span className="text-red-500">* (חובה)</span>}
                        </label>
                        <select
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={supplierId}
                          onChange={e => setSupplierId(e.target.value === '' ? '' : Number(e.target.value))}
                          required={!isOtherCategory}
                        >
                          <option value="">
                            {categoryName ? (isOtherCategory ? 'בחר ספק (אופציונלי)' : 'בחר ספק') : 'בחר קודם קטגוריה'}
                          </option>
                          {suppliers
                            .filter(s => s.is_active && !!categoryName && s.category === categoryName)
                            .map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    )
                  })()}

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תיאור</label>
                    <input
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="תיאור העסקה"
                      value={desc}
                      onChange={e => setDesc(e.target.value)}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">הערות</label>
                    <textarea
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="הערות"
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      id="exceptional"
                      type="checkbox"
                      checked={isExceptional}
                      onChange={e => setIsExceptional(e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="exceptional" className="text-sm text-gray-700 dark:text-gray-300">הוצאה חריגה</label>
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
                        className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700/50 dark:to-gray-800/50 hover:from-blue-50 hover:to-blue-100 dark:hover:from-blue-900/20 dark:hover:to-blue-800/20 transition-all duration-300 group hover:border-blue-400 dark:hover:border-blue-500"
                        onDragOver={(e) => {
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
                        <div className="flex flex-col items-center justify-center pt-4 pb-4">
                          <svg className="w-8 h-8 text-gray-400 dark:text-gray-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <p className="text-sm text-gray-600 dark:text-gray-400">לחץ להעלאה או גרור קבצים</p>
                        </div>
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e: ChangeEvent<HTMLInputElement>) => {
                            if (e.target.files) {
                              setFilesToUpload(prev => [...prev, ...Array.from(e.target.files || [])])
                            }
                          }}
                        />
                      </label>
                    </div>
                    {filesToUpload.length > 0 && (
                      <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        נבחרו {filesToUpload.length} קבצים
                      </div>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm p-3 rounded-lg">
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
                    {loading ? 'שומר...' : 'צור עסקה'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCreateRecurringTransaction} className="space-y-4">
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-md p-3 mb-4">
                  <p className="text-purple-800 dark:text-purple-200 text-sm">
                    עסקה מחזורית תיצור עסקה חדשה אוטומטית כל חודש. העסקאות יופיעו בחשבון ההוצאות וההכנסות.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סוג *</label>
                    <select
                      required
                      value={recurringFormData.type}
                      onChange={(e) => setRecurringFormData({ ...recurringFormData, type: e.target.value as 'Income' | 'Expense' })}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="Expense">הוצאה</option>
                      <option value="Income">הכנסה</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תיאור *</label>
                    <input
                      type="text"
                      required
                      value={recurringFormData.description}
                      onChange={(e) => setRecurringFormData({ ...recurringFormData, description: e.target.value })}
                      placeholder="למשל: חשמל, שכירות"
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סכום קבוע *</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={recurringFormData.amount || ''}
                      onChange={(e) => setRecurringFormData({ ...recurringFormData, amount: parseFloat(e.target.value) || 0 })}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">קטגוריה</label>
                    <select
                      value={recurringFormData.category || ''}
                      onChange={(e) =>
                        {
                          const newCategory = e.target.value || ''
                          // Find suppliers in this category
                          const candidates = suppliers.filter(
                            s => s.is_active && s.category === newCategory
                          )
                          setRecurringFormData({
                            ...recurringFormData,
                            category: newCategory,
                            // If exactly one supplier, select it; otherwise reset
                            supplier_id:
                              newCategory && candidates.length === 1
                                ? candidates[0].id
                                : 0,
                          })
                        }
                      }
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="">בחר קטגוריה</option>
                      {availableCategories.map((cat) => (
                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      ספק {recurringFormData.category !== 'אחר' && <span className="text-red-500">* (חובה)</span>}
                    </label>
                    <select
                      required={recurringFormData.category !== 'אחר'}
                      value={recurringFormData.supplier_id || 0}
                      onChange={(e) => setRecurringFormData({ ...recurringFormData, supplier_id: parseInt(e.target.value) || 0 })}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="0">
                        {recurringFormData.category ? (recurringFormData.category === 'אחר' ? 'בחר ספק (אופציונלי)' : 'בחר ספק') : 'בחר קודם קטגוריה'}
                      </option>
                      {suppliers
                        .filter(
                          s =>
                            s.is_active &&
                            !!recurringFormData.category &&
                            s.category === recurringFormData.category
                        )
                        .map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">יום בחודש *</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      required
                      value={recurringFormData.day_of_month}
                      onChange={(e) => setRecurringFormData({ ...recurringFormData, day_of_month: parseInt(e.target.value) || 1 })}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      העסקה תיווצר ביום זה בכל חודש
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תאריך התחלה *</label>
                    <input
                      type="date"
                      required
                      className={`w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 ${
                        recurringDateError
                          ? 'border-red-500 focus:ring-red-500'
                          : 'border-gray-200 dark:border-gray-600 focus:ring-blue-500'
                      }`}
                      value={recurringFormData.start_date}
                      onChange={(e) => setRecurringFormData({ ...recurringFormData, start_date: e.target.value })}
                    />
                    {recurringDateError && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">{recurringDateError}</p>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סוג סיום</label>
                    <select
                      value={recurringFormData.end_type}
                      onChange={(e) => setRecurringFormData({ ...recurringFormData, end_type: e.target.value as any })}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="No End">ללא סיום</option>
                      <option value="After Occurrences">לאחר מספר הופעות</option>
                      <option value="On Date">בתאריך מסוים</option>
                    </select>
                  </div>

                  {recurringFormData.end_type === 'After Occurrences' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מספר הופעות</label>
                      <input
                        type="number"
                        min="1"
                        value={recurringFormData.max_occurrences || ''}
                        onChange={(e) => setRecurringFormData({ ...recurringFormData, max_occurrences: parseInt(e.target.value) || null })}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  )}

                  {recurringFormData.end_type === 'On Date' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תאריך סיום</label>
                      <input
                        type="date"
                        value={recurringFormData.end_date || ''}
                        onChange={(e) => setRecurringFormData({ ...recurringFormData, end_date: e.target.value || null })}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  )}

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">הערות</label>
                    <textarea
                      value={recurringFormData.notes || ''}
                      onChange={(e) => setRecurringFormData({ ...recurringFormData, notes: e.target.value || '' })}
                      rows={3}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
                        className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700/50 dark:to-gray-800/50 hover:from-purple-50 hover:to-purple-100 dark:hover:from-purple-900/20 dark:hover:to-purple-800/20 transition-all duration-300 group hover:border-purple-400 dark:hover:border-purple-500"
                        onDragOver={(e) => {
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
                        <div className="flex flex-col items-center justify-center pt-4 pb-4">
                          <svg className="w-8 h-8 text-gray-400 dark:text-gray-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <p className="text-sm text-gray-600 dark:text-gray-400">לחץ להעלאה או גרור קבצים</p>
                        </div>
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e: ChangeEvent<HTMLInputElement>) => {
                            if (e.target.files) {
                              setFilesToUpload(prev => [...prev, ...Array.from(e.target.files || [])])
                            }
                          }}
                        />
                      </label>
                    </div>
                    {filesToUpload.length > 0 && (
                      <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        נבחרו {filesToUpload.length} קבצים
                      </div>
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
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? 'שומר...' : 'צור עסקה מחזורית'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </motion.div>
      </motion.div>

      <DuplicateWarningModal
        isOpen={showDuplicateWarning}
        onClose={() => {
          setShowDuplicateWarning(false)
          setPendingPayload(null)
        }}
        onConfirm={handleConfirmDuplicate}
        isEdit={false}
      />

      {/* Description Modal for Uploaded Documents */}
      {showDescriptionModal && selectedTransactionForDocuments && uploadedDocuments.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
          onClick={() => {
            setShowDescriptionModal(false)
            setUploadedDocuments([])
            onSuccess()
            onClose()
            resetForms()
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  הוסף תיאורים למסמכים
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  עסקה #{selectedTransactionForDocuments.id} - {uploadedDocuments.length} מסמכים
                </p>
              </div>
              <button
                onClick={() => {
                  setShowDescriptionModal(false)
                  setUploadedDocuments([])
                  onSuccess()
                  onClose()
                  resetForms()
                }}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
              <div className="space-y-4">
                {uploadedDocuments.map((doc, index) => (
                  <div key={doc.id || index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {doc.fileName}
                    </label>
                    <input
                      type="text"
                      value={doc.description}
                      onChange={(e) => {
                        const updated = [...uploadedDocuments]
                        updated[index] = { ...updated[index], description: e.target.value }
                        setUploadedDocuments(updated)
                      }}
                      placeholder="הזן תיאור למסמך (אופציונלי)"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus={index === 0}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  setShowDescriptionModal(false)
                  setUploadedDocuments([])
                  onSuccess()
                  onClose()
                  resetForms()
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                דלג
              </button>
              <button
                onClick={async () => {
                  try {
                    for (const doc of uploadedDocuments) {
                      if (doc.id > 0) {
                        try {
                          const formData = new FormData()
                          formData.append('description', doc.description || '')
                          await api.put(`/transactions/${selectedTransactionForDocuments.id}/documents/${doc.id}`, formData, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                          })
                        } catch (err: any) {
                          // Ignore
                        }
                      }
                    }
                    
                    setShowDescriptionModal(false)
                    setUploadedDocuments([])
                    onSuccess()
                    onClose()
                    resetForms()
                  } catch (err: any) {
                    alert('שגיאה בשמירת התיאורים')
                  }
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                שמור תיאורים
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </>
  )
}

export default CreateTransactionModal

