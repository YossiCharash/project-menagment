import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Plus, Trash2, Upload, File } from 'lucide-react'
import { TransactionCreate, ProjectWithFinance } from '../types/api'
import { TransactionAPI, ProjectAPI, CategoryAPI, Category } from '../lib/apiClient'
import api from '../lib/api'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import { fetchSuppliers } from '../store/slices/suppliersSlice'

interface GroupTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface TransactionRow {
  id: string
  projectId: number | ''
  subprojectId: number | ''
  type: 'Income' | 'Expense'
  txDate: string
  amount: number | ''
  description: string
  categoryId: number | ''
  supplierId: number | ''
  paymentMethod: string
  notes: string
  isExceptional: boolean
  fromFund: boolean
  files: File[]
  dateError: string | null
}

const GroupTransactionModal: React.FC<GroupTransactionModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const dispatch = useAppDispatch()
  const { items: suppliers } = useAppSelector(s => s.suppliers)
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<ProjectWithFinance[]>([])
  const [subprojectsMap, setSubprojectsMap] = useState<Record<number, ProjectWithFinance[]>>({})
  const [availableCategories, setAvailableCategories] = useState<Category[]>([])
  const [textEditorOpen, setTextEditorOpen] = useState(false)
  const [editingField, setEditingField] = useState<'description' | 'notes' | null>(null)
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [editorValue, setEditorValue] = useState('')
  const [rows, setRows] = useState<TransactionRow[]>([
    {
      id: '1',
      projectId: '',
      subprojectId: '',
      type: 'Expense',
      txDate: new Date().toISOString().split('T')[0],
      amount: '',
      description: '',
      categoryId: '',
      supplierId: '',
      paymentMethod: '',
      notes: '',
      isExceptional: false,
      fromFund: false,
      files: [],
      dateError: null
    }
  ])

  useEffect(() => {
    if (isOpen) {
      dispatch(fetchSuppliers())
      loadProjects()
      loadCategories()
    }
  }, [isOpen, dispatch])

  const loadProjects = async () => {
    try {
      const data = await ProjectAPI.getProjects()
      // Filter to show only regular projects (not subprojects) or parent projects
      const filtered = data.filter((p: ProjectWithFinance) => 
        p.is_active && (!p.relation_project || p.is_parent_project)
      )
      setProjects(filtered)
    } catch (err) {
      console.error('Error loading projects:', err)
    }
  }

  const loadCategories = async () => {
    try {
      const categories = await CategoryAPI.getCategories()
      setAvailableCategories(categories.filter(cat => cat.is_active))
    } catch (err) {
      console.error('Error loading categories:', err)
    }
  }

  const loadSubprojects = async (parentProjectId: number) => {
    if (subprojectsMap[parentProjectId]) {
      return // Already loaded
    }
    try {
      const { data } = await api.get(`/projects/${parentProjectId}/subprojects`)
      setSubprojectsMap(prev => ({
        ...prev,
        [parentProjectId]: data || []
      }))
    } catch (err) {
      console.error('Error loading subprojects:', err)
    }
  }

  const handleProjectChange = (rowId: string, projectId: number | '') => {
    setRows(prevRows => {
      const newRows = prevRows.map(row => {
        if (row.id === rowId) {
          const project = projects.find(p => p.id === projectId)
          const updatedRow = {
            ...row,
            projectId: projectId as number,
            subprojectId: '' as number | ''
          }
          
          if (project?.is_parent_project && projectId) {
            loadSubprojects(projectId as number)
          }
          
          // Validate date after project change
          setTimeout(() => validateRowDate(updatedRow), 0)
          
          return updatedRow
        }
        return row
      })
      return newRows
    })
  }

  const addRow = () => {
    const newRow: TransactionRow = {
      id: Date.now().toString(),
      projectId: '',
      subprojectId: '',
      type: 'Expense',
      txDate: new Date().toISOString().split('T')[0],
      amount: '',
      description: '',
      categoryId: '',
      supplierId: '',
      paymentMethod: '',
      notes: '',
      isExceptional: false,
      fromFund: false,
      files: [],
      dateError: null
    }
    setRows([...rows, newRow])
  }

  const removeRow = (rowId: string) => {
    if (rows.length > 1) {
      setRows(rows.filter(row => row.id !== rowId))
    }
  }

  const updateRow = (rowId: string, field: keyof TransactionRow, value: any) => {
    setRows(prevRows =>
      prevRows.map(row => {
        if (row.id === rowId) {
          const updatedRow = { ...row, [field]: value }
          
          // If category changed, reset supplier if it doesn't match the new category
          if (field === 'categoryId') {
            const selectedCategoryId = value ? Number(value) : null
            const selectedCategory = selectedCategoryId ? availableCategories.find(c => c.id === selectedCategoryId) : null
            
            if (selectedCategoryId && row.supplierId) {
              // Check if current supplier belongs to the new category
              const currentSupplier = suppliers.find(s => s.id === row.supplierId)
              if (currentSupplier) {
                // Filter by category name (as suppliers have category as string)
                const supplierCategoryName = currentSupplier.category
                if (supplierCategoryName !== selectedCategory?.name) {
                  updatedRow.supplierId = ''
                }
              }
            } else if (!selectedCategoryId) {
              // If no category selected, clear supplier
              updatedRow.supplierId = ''
            }
          }
          
          // Validate date when project or date changes
          if (field === 'txDate' || field === 'projectId' || field === 'subprojectId') {
            validateRowDate(updatedRow)
          }
          
          return updatedRow
        }
        return row
      })
    )
  }

  const validateRowDate = (row: TransactionRow) => {
    if (!row.txDate || !row.projectId) {
      setRows(prevRows =>
        prevRows.map(r =>
          r.id === row.id ? { ...r, dateError: null } : r
        )
      )
      return
    }

    const project = getSelectedProject(row)
    const subproject = row.subprojectId ? getSelectedSubproject(row) : null
    const selectedProject = subproject || project
    
    if (!selectedProject?.start_date) {
      setRows(prevRows =>
        prevRows.map(r =>
          r.id === row.id ? { ...r, dateError: null } : r
        )
      )
      return
    }

    const contractStartDateStr = selectedProject.start_date.split('T')[0]
    const transactionDateStr = row.txDate.split('T')[0]
    
    const contractStartDate = new Date(contractStartDateStr + 'T00:00:00')
    const transactionDate = new Date(transactionDateStr + 'T00:00:00')
    
    if (transactionDate < contractStartDate) {
      const formattedStartDate = contractStartDate.toLocaleDateString('he-IL')
      const formattedTxDate = transactionDate.toLocaleDateString('he-IL')
      setRows(prevRows =>
        prevRows.map(r =>
          r.id === row.id
            ? {
                ...r,
                dateError: `לא ניתן ליצור עסקה לפני תאריך תחילת החוזה. תאריך תחילת החוזה: ${formattedStartDate}, תאריך העסקה: ${formattedTxDate}`
              }
            : r
        )
      )
    } else {
      setRows(prevRows =>
        prevRows.map(r =>
          r.id === row.id ? { ...r, dateError: null } : r
        )
      )
    }
  }

  const handleFileUpload = (rowId: string, files: FileList | null) => {
    if (!files || files.length === 0) return
    
    setRows(prevRows =>
      prevRows.map(row =>
        row.id === rowId
          ? { ...row, files: [...row.files, ...Array.from(files)] }
          : row
      )
    )
  }

  const removeFile = (rowId: string, fileIndex: number) => {
    setRows(prevRows =>
      prevRows.map(row =>
        row.id === rowId
          ? { ...row, files: row.files.filter((_, i) => i !== fileIndex) }
          : row
      )
    )
  }

  const getSelectedProject = (row: TransactionRow): ProjectWithFinance | null => {
    if (!row.projectId) return null
    return projects.find(p => p.id === row.projectId) || null
  }

  const getSelectedSubproject = (row: TransactionRow): ProjectWithFinance | null => {
    if (!row.subprojectId || !row.projectId) return null
    const subprojects = getSubprojectsForProject(row.projectId as number)
    return subprojects.find(sp => sp.id === row.subprojectId) || null
  }

  const hasFundForRow = (row: TransactionRow): boolean => {
    // Need a project selected first
    if (!row.projectId) {
      return false
    }
    
    // If subproject is selected, check subproject's fund
    if (row.subprojectId) {
      const subproject = getSelectedSubproject(row)
      return subproject?.has_fund === true
    }
    // Otherwise check main project's fund
    const project = getSelectedProject(row)
    return project?.has_fund === true
  }

  const getSubprojectsForProject = (projectId: number): ProjectWithFinance[] => {
    return subprojectsMap[projectId] || []
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Validate all rows
    const errors: string[] = []
    rows.forEach((row, index) => {
      if (!row.projectId) {
        errors.push(`שורה ${index + 1}: יש לבחור פרויקט`)
      }
      if (row.projectId) {
        const project = getSelectedProject(row)
        if (project?.is_parent_project && !row.subprojectId) {
          errors.push(`שורה ${index + 1}: יש לבחור תת-פרויקט`)
        }
      }
      if (!row.amount || Number(row.amount) <= 0) {
        errors.push(`שורה ${index + 1}: יש להזין סכום תקין`)
      }
      if (!row.txDate) {
        errors.push(`שורה ${index + 1}: יש להזין תאריך`)
      }
      if (row.dateError) {
        errors.push(`שורה ${index + 1}: ${row.dateError}`)
      }
      if (row.type === 'Expense' && !row.fromFund && !row.supplierId) {
        // Check if category is "אחר" (Other) - if so, supplier is not required
        const category = row.categoryId ? availableCategories.find(c => c.id === row.categoryId) : null
        if (!category || category.name !== 'אחר') {
          errors.push(`שורה ${index + 1}: יש לבחור ספק לעסקת הוצאה`)
        }
      }
    })

    if (errors.length > 0) {
      setError(errors.join('\n'))
      setLoading(false)
      return
    }

    // Create all transactions
    const results: { success: number; failed: number; errors: string[] } = {
      success: 0,
      failed: 0,
      errors: []
    }

    const transactionIds: number[] = []
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        // Subprojects are actually projects with relation_project set
        // So we use the subproject's ID directly as project_id
        const projectId = row.subprojectId || row.projectId as number
        const transactionData: TransactionCreate = {
          project_id: projectId,
          tx_date: row.txDate,
          type: row.type,
          amount: Number(row.amount),
          description: row.description || undefined,
          category_id: row.categoryId ? Number(row.categoryId) : undefined,
          supplier_id: row.supplierId ? Number(row.supplierId) : undefined,
          payment_method: row.paymentMethod || undefined,
          notes: row.notes || undefined,
          is_exceptional: row.isExceptional,
          from_fund: row.fromFund
        }

        console.log('🔄 [GROUP TX] Creating transaction for row', i + 1, ':', transactionData)
        const transaction = await TransactionAPI.createTransaction(transactionData)
        console.log('✅ [GROUP TX] Transaction created successfully:', {
          id: transaction.id,
          project_id: transaction.project_id,
          type: transaction.type,
          amount: transaction.amount,
          tx_date: transaction.tx_date
        })
        
        if (!transaction || !transaction.id) {
          console.error('❌ [GROUP TX] Transaction created but no ID returned:', transaction)
          throw new Error('Transaction was created but did not return an ID')
        }
        
        // Ensure transaction ID is a number
        const transactionId = typeof transaction.id === 'number' ? transaction.id : parseInt(String(transaction.id), 10)
        if (isNaN(transactionId)) {
          console.error('❌ [GROUP TX] Invalid transaction ID:', transaction.id)
          throw new Error(`Invalid transaction ID: ${transaction.id}`)
        }
        
        transactionIds.push(transactionId)
        results.success++
        console.log('✅ [GROUP TX] Transaction added to results. Total success:', results.success)
        
        // Upload files for this transaction if any
        if (row.files.length > 0) {
          console.log(`📎 [GROUP TX] Starting upload of ${row.files.length} files for transaction ${transactionId}`)
          console.log('📎 [GROUP TX] Files to upload:', row.files.map(f => ({
            name: f.name,
            size: f.size,
            type: f.type
          })))
          
          // Add a small delay to ensure transaction is committed to database
          // This helps avoid race conditions where the transaction might not be immediately available
          await new Promise(resolve => setTimeout(resolve, 100))
          
          let fileSuccessCount = 0
          let fileErrorCount = 0
          const fileErrors: string[] = []
          
          for (let fileIndex = 0; fileIndex < row.files.length; fileIndex++) {
            const file = row.files[fileIndex]
            try {
              const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2)
              console.log(`📎 [GROUP TX] [${fileIndex + 1}/${row.files.length}] Uploading file: ${file.name} (${fileSizeMB} MB) for transaction ${transactionId}`)
              
              // Check file size (max 50MB)
              if (file.size > 50 * 1024 * 1024) {
                console.error(`❌ [GROUP TX] File ${file.name} is too large: ${fileSizeMB} MB (max 50MB)`)
                fileErrorCount++
                fileErrors.push(`${file.name}: הקובץ גדול מדי (מקסימום 50MB)`)
                continue
              }
              
              console.log(`📎 [GROUP TX] Calling uploadTransactionDocument for transaction ${transactionId}...`)
              const uploadStartTime = Date.now()
              
              // Retry upload if we get a 404 (transaction not found) - might be a race condition
              let uploadResult = null
              let uploadAttempts = 0
              const maxUploadAttempts = 3
              
              while (uploadAttempts < maxUploadAttempts) {
                try {
                  uploadResult = await TransactionAPI.uploadTransactionDocument(transactionId, file)
                  break // Success, exit retry loop
                } catch (uploadErr: any) {
                  uploadAttempts++
                  // If 404 and not last attempt, wait and retry
                  if (uploadErr.response?.status === 404 && uploadAttempts < maxUploadAttempts) {
                    console.warn(`⚠️ [GROUP TX] Transaction ${transactionId} not found (attempt ${uploadAttempts}/${maxUploadAttempts}), waiting 200ms before retry...`)
                    await new Promise(resolve => setTimeout(resolve, 200))
                    continue
                  }
                  // Otherwise, rethrow the error to be caught by outer catch
                  throw uploadErr
                }
              }
              
              const uploadDuration = Date.now() - uploadStartTime
              console.log(`✅ [GROUP TX] File upload completed in ${uploadDuration}ms. Result:`, uploadResult)
              
              // Verify the upload was successful and document was created
              if (uploadResult && uploadResult.id && uploadResult.transaction_id) {
                // Verify transaction_id matches
                if (uploadResult.transaction_id !== transactionId) {
                  console.error(`❌ [GROUP TX] Transaction ID mismatch! Expected ${transactionId}, got ${uploadResult.transaction_id}`)
                  fileErrorCount++
                  fileErrors.push(`${file.name}: שגיאה בקישור המסמך לעסקה (Transaction ID mismatch)`)
                } else {
                  fileSuccessCount++
                  console.log(`✅ [GROUP TX] File ${file.name} uploaded successfully with document ID: ${uploadResult.id} for transaction ${uploadResult.transaction_id}`)
                }
              } else {
                console.warn(`⚠️ [GROUP TX] File ${file.name} uploaded but invalid response:`, uploadResult)
                fileErrorCount++
                fileErrors.push(`${file.name}: לא קיבלנו תשובה תקינה מהשרת`)
              }
            } catch (fileErr: any) {
              console.error(`❌ [GROUP TX] Error uploading file ${file.name} to transaction ${transactionId}:`, {
                error: fileErr,
                message: fileErr.message,
                code: fileErr.code,
                response: fileErr.response ? {
                  status: fileErr.response.status,
                  data: fileErr.response.data
                } : null,
                stack: fileErr.stack
              })
              
              fileErrorCount++
              
              // Better error messages
              let errorMsg = 'שגיאה לא ידועה'
              if (fileErr.code === 'ECONNABORTED' || fileErr.message?.includes('timeout')) {
                errorMsg = 'העלאה נכשלה - זמן ההמתנה פג (הקובץ גדול מדי או חיבור איטי)'
              } else if (!fileErr.response && (fileErr.message?.includes('Network Error') || fileErr.code === 'ERR_NETWORK')) {
                errorMsg = 'שגיאת רשת - בדוק את החיבור לאינטרנט'
              } else if (fileErr.response?.status === 404) {
                errorMsg = `העסקה לא נמצאה (Transaction ${transactionId} not found) - ייתכן שהעסקה לא נשמרה נכון`
              } else if (fileErr.response?.status === 413) {
                errorMsg = 'הקובץ גדול מדי'
              } else if (fileErr.response?.status === 400) {
                errorMsg = fileErr.response?.data?.detail || 'פורמט קובץ לא נתמך'
              } else if (fileErr.response?.data?.detail) {
                errorMsg = fileErr.response.data.detail
              } else if (fileErr.message) {
                errorMsg = fileErr.message
              }
              
              console.error(`❌ [GROUP TX] Error message for user: ${errorMsg}`)
              fileErrors.push(`${file.name}: ${errorMsg}`)
            }
          }
          
          console.log(`📎 [GROUP TX] Upload summary for transaction ${transactionId}:`, {
            total: row.files.length,
            success: fileSuccessCount,
            failed: fileErrorCount,
            errors: fileErrors
          })
          
          if (fileErrorCount > 0) {
            if (fileSuccessCount > 0) {
              results.errors.push(`שורה ${i + 1}: הועלו ${fileSuccessCount} מסמכים, ${fileErrorCount} נכשלו: ${fileErrors.join('; ')}`)
            } else {
              results.errors.push(`שורה ${i + 1}: כל המסמכים נכשלו בהעלאה: ${fileErrors.join('; ')}`)
            }
          } else {
            console.log(`All ${fileSuccessCount} files uploaded successfully for transaction ${transactionId}`)
          }
        }
      } catch (err: any) {
        results.failed++
        results.errors.push(`שורה ${i + 1}: ${err.response?.data?.detail || err.message || 'שגיאה ביצירת העסקה'}`)
      }
    }

    // Count file uploads
    const totalFiles = rows.reduce((sum, row) => sum + row.files.length, 0)
    const fileUploadErrors = results.errors.filter(err => err.includes('מסמכים') || err.includes('קובץ'))
    
    if (results.failed > 0 || fileUploadErrors.length > 0) {
      const errorMessages = [
        `נוצרו ${results.success} עסקאות בהצלחה`,
        results.failed > 0 ? `${results.failed} עסקאות נכשלו` : '',
        fileUploadErrors.length > 0 ? `${fileUploadErrors.length} שגיאות בהעלאת מסמכים` : ''
      ].filter(Boolean).join(', ')
      
      setError(
        `${errorMessages}:\n${results.errors.join('\n')}`
      )
      if (results.success > 0) {
        // Some succeeded, refresh data
        onSuccess()
      }
    } else {
      // All succeeded - calculate totals
      const incomeRows = rows.filter(r => r.type === 'Income')
      const expenseRows = rows.filter(r => r.type === 'Expense')
      const totalIncome = incomeRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
      const totalExpense = expenseRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
      
      const successMessage = totalFiles > 0 
        ? `נוצרו ${results.success} עסקאות בהצלחה!\n\nסיכום:\n• ${incomeRows.length} עסקאות הכנסה: ${totalIncome.toLocaleString('he-IL')} ₪\n• ${expenseRows.length} עסקאות הוצאה: ${totalExpense.toLocaleString('he-IL')} ₪\n• הועלו ${totalFiles} מסמכים`
        : `נוצרו ${results.success} עסקאות בהצלחה!\n\nסיכום:\n• ${incomeRows.length} עסקאות הכנסה: ${totalIncome.toLocaleString('he-IL')} ₪\n• ${expenseRows.length} עסקאות הוצאה: ${totalExpense.toLocaleString('he-IL')} ₪`
      
      // Show success message briefly before closing
      setError(null)
      alert(successMessage)
      onSuccess()
      onClose()
      resetForm()
    }

    setLoading(false)
  }

  const resetForm = () => {
    setRows([
      {
        id: '1',
        projectId: '',
        subprojectId: '',
        type: 'Expense',
        txDate: new Date().toISOString().split('T')[0],
        amount: '',
        description: '',
        categoryId: '',
        supplierId: '',
        paymentMethod: '',
        notes: '',
        isExceptional: false,
        fromFund: false,
        files: [],
        dateError: null
      }
    ])
    setError(null)
  }

  const handleClose = () => {
    onClose()
    resetForm()
  }

  const openTextEditor = (rowId: string, field: 'description' | 'notes', currentValue: string) => {
    setEditingRowId(rowId)
    setEditingField(field)
    setEditorValue(currentValue)
    setTextEditorOpen(true)
  }

  const closeTextEditor = () => {
    if (editingRowId && editingField) {
      updateRow(editingRowId, editingField, editorValue)
    }
    setTextEditorOpen(false)
    setEditingRowId(null)
    setEditingField(null)
    setEditorValue('')
  }

  const saveAndCloseTextEditor = () => {
    if (editingRowId && editingField) {
      updateRow(editingRowId, editingField, editorValue)
    }
    setTextEditorOpen(false)
    setEditingRowId(null)
    setEditingField(null)
    setEditorValue('')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 bg-gradient-to-r from-orange-500 to-red-600 dark:from-orange-600 dark:to-red-700 rounded-t-2xl">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <span>עסקה קבוצתית</span>
            <span className="text-lg font-normal opacity-90">({rows.length} עסקאות)</span>
          </h2>
          <button
            onClick={handleClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900/50">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded-lg shadow-sm"
            >
              <pre className="text-sm text-red-800 dark:text-red-200 whitespace-pre-wrap font-medium">{error}</pre>
            </motion.div>
          )}

          {/* Summary Card */}
          {(() => {
            const incomeRows = rows.filter(r => r.type === 'Income')
            const expenseRows = rows.filter(r => r.type === 'Expense')
            const totalIncome = incomeRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
            const totalExpense = expenseRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
            const netAmount = totalIncome - totalExpense
            
            return (
              <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-md">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">סיכום עסקאות</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-300 dark:border-green-700 rounded-lg p-3">
                    <div className="text-sm text-green-700 dark:text-green-300 font-medium mb-1">הכנסות</div>
                    <div className="text-2xl font-bold text-green-800 dark:text-green-200">
                      {totalIncome.toLocaleString('he-IL')} ₪
                    </div>
                    <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                      {incomeRows.length} עסקאות
                    </div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-lg p-3">
                    <div className="text-sm text-red-700 dark:text-red-300 font-medium mb-1">הוצאות</div>
                    <div className="text-2xl font-bold text-red-800 dark:text-red-200">
                      {totalExpense.toLocaleString('he-IL')} ₪
                    </div>
                    <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {expenseRows.length} עסקאות
                    </div>
                  </div>
                  <div className={`border-2 rounded-lg p-3 ${
                    netAmount >= 0 
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700' 
                      : 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700'
                  }`}>
                    <div className={`text-sm font-medium mb-1 ${
                      netAmount >= 0 
                        ? 'text-blue-700 dark:text-blue-300' 
                        : 'text-orange-700 dark:text-orange-300'
                    }`}>
                      יתרה
                    </div>
                    <div className={`text-2xl font-bold ${
                      netAmount >= 0 
                        ? 'text-blue-800 dark:text-blue-200' 
                        : 'text-orange-800 dark:text-orange-200'
                    }`}>
                      {netAmount.toLocaleString('he-IL')} ₪
                    </div>
                    <div className={`text-xs mt-1 ${
                      netAmount >= 0 
                        ? 'text-blue-600 dark:text-blue-400' 
                        : 'text-orange-600 dark:text-orange-400'
                    }`}>
                      {netAmount >= 0 ? 'רווח' : 'הפסד'}
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-700 dark:to-gray-800">
                    <th className="border-b border-gray-300 dark:border-gray-600 px-4 py-3 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                      פרויקט *
                    </th>
                    <th className="border-b border-gray-300 dark:border-gray-600 px-4 py-3 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                      תת-פרויקט
                    </th>
                    <th className="border-b border-gray-300 dark:border-gray-600 px-4 py-3 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                      סוג *
                    </th>
                    <th className="border-b border-gray-300 dark:border-gray-600 px-4 py-3 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                      תאריך *
                    </th>
                    <th className="border-b border-gray-300 dark:border-gray-600 px-4 py-3 text-right text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                      סכום *
                    </th>
                  </tr>
                  <tr className="bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-700 dark:to-gray-800">
                    <th className="border-b border-gray-300 dark:border-gray-600 px-4 py-3 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                      תיאור
                    </th>
                    <th className="border-b border-gray-300 dark:border-gray-600 px-4 py-3 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                      קטגוריה
                    </th>
                    <th className="border-b border-gray-300 dark:border-gray-600 px-4 py-3 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                      ספק
                    </th>
                    <th className="border-b border-gray-300 dark:border-gray-600 px-4 py-3 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                      אמצעי תשלום
                    </th>
                    <th className="border-b border-gray-300 dark:border-gray-600 px-4 py-3 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                      הערות
                    </th>
                    <th className="border-b border-gray-300 dark:border-gray-600 px-4 py-3 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                      פעולות
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const selectedProject = getSelectedProject(row)
                    const isParentProject = selectedProject?.is_parent_project
                    const subprojects = isParentProject && row.projectId
                      ? getSubprojectsForProject(row.projectId as number)
                      : []

                    const rowBgClass = index % 2 === 0 
                      ? 'bg-white dark:bg-gray-800' 
                      : 'bg-gray-50/50 dark:bg-gray-800/50'

                    return (
                      <React.Fragment key={row.id}>
                        {/* שורה ראשונה */}
                        <tr 
                          className={`transition-colors ${rowBgClass} hover:bg-blue-50 dark:hover:bg-gray-700/70 ${index === 0 ? 'border-t-2' : 'border-t-4'} border-gray-400 dark:border-gray-500`}
                        >
                          <td className="px-4 py-4">
                            <select
                              value={row.projectId}
                              onChange={(e) => handleProjectChange(row.id, e.target.value ? Number(e.target.value) : '')}
                              className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm hover:shadow"
                              required
                            >
                              <option value="">בחר פרויקט</option>
                              {projects.map((project) => (
                                <option key={project.id} value={project.id}>
                                  {project.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-4">
                            {isParentProject ? (
                              <select
                                value={row.subprojectId}
                                onChange={(e) => updateRow(row.id, 'subprojectId', e.target.value ? Number(e.target.value) : '')}
                                className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm hover:shadow"
                                required
                              >
                                <option value="">בחר תת-פרויקט</option>
                                {subprojects.map((subproject) => (
                                  <option key={subproject.id} value={subproject.id}>
                                    {subproject.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-sm text-gray-400 dark:text-gray-500 flex items-center justify-center h-10">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <select
                              value={row.type}
                              onChange={(e) => {
                                const newType = e.target.value as 'Income' | 'Expense'
                                updateRow(row.id, 'type', newType)
                                if (newType === 'Income') {
                                  updateRow(row.id, 'supplierId', '')
                                }
                              }}
                              className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm hover:shadow font-medium ${
                                row.type === 'Income' 
                                  ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300' 
                                  : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
                              }`}
                              required
                            >
                              <option value="Income">הכנסה</option>
                              <option value="Expense">הוצאה</option>
                            </select>
                          </td>
                          <td className="px-4 py-4">
                            <div className="space-y-1">
                              <input
                                type="date"
                                value={row.txDate}
                                onChange={(e) => updateRow(row.id, 'txDate', e.target.value)}
                                className={`w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-700 border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 transition-all shadow-sm hover:shadow ${
                                  row.dateError
                                    ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                                    : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500'
                                }`}
                                required
                              />
                              {row.dateError && (
                                <p className="text-xs text-red-600 dark:text-red-400">{row.dateError}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.amount}
                              onChange={(e) => updateRow(row.id, 'amount', e.target.value ? Number(e.target.value) : '')}
                              className="w-full px-4 py-3 text-base bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm hover:shadow font-bold text-lg"
                              placeholder="0.00"
                              required
                            />
                          </td>
                        </tr>
                        {/* שורה שנייה */}
                        <tr 
                          className={`transition-colors ${rowBgClass} hover:bg-blue-50 dark:hover:bg-gray-700/70 border-b-4 border-gray-400 dark:border-gray-500`}
                        >
                          <td className="px-4 py-4">
                            <input
                              type="text"
                              readOnly
                              onClick={() => openTextEditor(row.id, 'description', row.description)}
                              value={row.description}
                              className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm hover:shadow cursor-pointer"
                              placeholder="תיאור העסקה"
                            />
                          </td>
                          <td className="px-4 py-4">
                            <select
                              value={row.categoryId}
                              onChange={(e) => updateRow(row.id, 'categoryId', e.target.value ? Number(e.target.value) : '')}
                              className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm hover:shadow"
                            >
                              <option value="">בחר קטגוריה</option>
                              {availableCategories.map((category) => (
                                <option key={category.id} value={category.id}>
                                  {category.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-4">
                            {row.type === 'Expense' && !row.fromFund ? (
                              <select
                                value={row.supplierId}
                                onChange={(e) => updateRow(row.id, 'supplierId', e.target.value ? Number(e.target.value) : '')}
                                className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={!row.categoryId}
                              >
                                <option value="">
                                  {row.categoryId ? 'בחר ספק' : 'בחר קודם קטגוריה'}
                                </option>
                                {(() => {
                                  // Filter suppliers by selected category name
                                  const selectedCategory = availableCategories.find(c => c.id === row.categoryId)
                                  if (!selectedCategory) {
                                    return <option value="" disabled>בחר קודם קטגוריה</option>
                                  }
                                  
                                  const categoryName = selectedCategory.name
                                  const filteredSuppliers = suppliers.filter(s => {
                                    if (!s.is_active) return false
                                    // Match by category name (suppliers have category as string)
                                    return s.category === categoryName
                                  })
                                  
                                  if (filteredSuppliers.length === 0) {
                                    return <option value="" disabled>אין ספקים בקטגוריה זו</option>
                                  }
                                  
                                  return filteredSuppliers.map((supplier) => (
                                    <option key={supplier.id} value={supplier.id}>
                                      {supplier.name}
                                    </option>
                                  ))
                                })()}
                              </select>
                            ) : (
                              <span className="text-sm text-gray-400 dark:text-gray-500 flex items-center justify-center h-10">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <select
                              value={row.paymentMethod}
                              onChange={(e) => updateRow(row.id, 'paymentMethod', e.target.value)}
                              className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm hover:shadow"
                            >
                              <option value="">בחר אמצעי תשלום</option>
                              <option value="הוראת קבע">הוראת קבע</option>
                              <option value="אשראי">אשראי</option>
                              <option value="שיק">שיק</option>
                              <option value="מזומן">מזומן</option>
                              <option value="העברה בנקאית">העברה בנקאית</option>
                              <option value="גבייה מרוכזת סוף שנה">גבייה מרוכזת סוף שנה</option>
                            </select>
                          </td>
                          <td className="px-4 py-4">
                            <input
                              type="text"
                              readOnly
                              onClick={() => openTextEditor(row.id, 'notes', row.notes)}
                              value={row.notes}
                              className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm hover:shadow cursor-pointer"
                              placeholder="הערות"
                            />
                          </td>
                          <td className="px-4 py-4">
                            <div className="space-y-2">
                              <div className="flex items-center gap-3 flex-wrap">
                                {row.type === 'Expense' && hasFundForRow(row) && (
                                  <label className="flex items-center gap-2 text-sm cursor-pointer group whitespace-nowrap">
                                    <input
                                      type="checkbox"
                                      checked={row.fromFund}
                                      onChange={(e) => {
                                        const fromFund = e.target.checked
                                        updateRow(row.id, 'fromFund', fromFund)
                                        if (fromFund) {
                                          updateRow(row.id, 'supplierId', '')
                                        }
                                      }}
                                      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer flex-shrink-0"
                                    />
                                    <span className="text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors font-medium whitespace-nowrap">
                                      להוריד מקופה
                                    </span>
                                  </label>
                                )}
                                {row.type === 'Expense' && !hasFundForRow(row) && (
                                  <span className="text-sm text-gray-400 dark:text-gray-500 whitespace-nowrap">-</span>
                                )}
                                {row.type === 'Income' && (
                                  <span className="text-sm text-gray-400 dark:text-gray-500 whitespace-nowrap">-</span>
                                )}
                                <label className="cursor-pointer">
                                  <input
                                    type="file"
                                    multiple
                                    onChange={(e) => handleFileUpload(row.id, e.target.files)}
                                    className="hidden"
                                    id={`file-upload-${row.id}`}
                                  />
                                  <motion.button
                                    type="button"
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => document.getElementById(`file-upload-${row.id}`)?.click()}
                                    className="p-1.5 text-blue-500 hover:text-white hover:bg-blue-500 rounded-lg transition-all flex-shrink-0"
                                    title="הוסף מסמכים"
                                  >
                                    <Upload className="w-4 h-4" />
                                  </motion.button>
                                </label>
                                {row.files.length > 0 && (
                                  <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                    {row.files.length}
                                  </span>
                                )}
                                {rows.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeRow(row.id)}
                                    className="p-1.5 text-red-500 hover:text-white hover:bg-red-500 rounded-lg transition-all flex-shrink-0"
                                    title="מחק שורה"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                              {row.files.length > 0 && (
                                <div className="space-y-1">
                                  {row.files.map((file, index) => (
                                    <div key={index} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                                      <File className="w-3 h-3 flex-shrink-0" />
                                      <span className="truncate flex-1">{file.name}</span>
                                      <button
                                        type="button"
                                        onClick={() => removeFile(row.id, index)}
                                        className="text-red-500 hover:text-red-700 flex-shrink-0"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                        {/* רווח בין עסקאות */}
                        {index < rows.length - 1 && (
                          <tr>
                            <td colSpan={6} className="h-4 bg-gray-100 dark:bg-gray-900 border-0 p-0"></td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-4">
              <motion.button
                type="button"
                onClick={addRow}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-md hover:shadow-lg font-medium"
              >
                <Plus className="w-5 h-5" />
                הוסף שורה
              </motion.button>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                סה"כ {rows.length} {rows.length === 1 ? 'עסקה' : 'עסקאות'}
              </div>
            </div>
          </form>
        </div>

        {/* Text Editor Modal for Description/Notes */}
        {textEditorOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 border border-gray-200 dark:border-gray-700"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  {editingField === 'description' ? 'תיאור העסקה' : 'הערות'}
                </h3>
                <button
                  onClick={closeTextEditor}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-4">
                <textarea
                  value={editorValue}
                  onChange={(e) => setEditorValue(e.target.value)}
                  className="w-full px-4 py-3 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm resize-none"
                  rows={8}
                  placeholder={editingField === 'description' ? 'הזן תיאור מפורט של העסקה...' : 'הזן הערות...'}
                  autoFocus
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={closeTextEditor}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-all shadow-sm hover:shadow font-medium"
                >
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={saveAndCloseTextEditor}
                  className="px-6 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-md hover:shadow-lg font-medium"
                >
                  שמור
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-b-2xl">
          <motion.button
            type="button"
            onClick={handleClose}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-6 py-2.5 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-all shadow-sm hover:shadow font-medium"
          >
            ביטול
          </motion.button>
          <motion.button
            type="submit"
            onClick={handleSubmit}
            disabled={loading}
            whileHover={!loading ? { scale: 1.05 } : {}}
            whileTap={!loading ? { scale: 0.95 } : {}}
            className="px-8 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg hover:from-orange-600 hover:to-red-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-medium disabled:hover:shadow-md"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                />
                יוצר עסקאות...
              </span>
            ) : (
              `צור ${rows.length} עסקאות`
            )}
          </motion.button>
        </div>
      </motion.div>
    </div>
  )
}

export default GroupTransactionModal
