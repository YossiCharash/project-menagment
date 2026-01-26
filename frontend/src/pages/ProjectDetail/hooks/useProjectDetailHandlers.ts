import api from '../../../lib/api'
import { BudgetAPI, ProjectAPI, RecurringTransactionAPI, UnforeseenTransactionAPI } from '../../../lib/apiClient'
import { parseLocalDate } from '../../../lib/utils'
import { calculateMonthlyIncomeAccrual } from '../../../utils/calculations'
import { Transaction } from '../types'
import { BudgetWithSpending, RecurringTransactionTemplate } from '../../../types/api'

export function useProjectDetailHandlers(
  id: string | undefined,
  viewingPeriodId: number | null,
  state: any, // Will be the full state object from useProjectDetailState
  dataLoaders: any, // Will be the data loading functions from useProjectDetailData
  navigate: (path: string) => void,
  dispatch: any
) {
  // Utility functions
  const isOfficeDocument = (fileUrl: string | null): boolean => {
    if (!fileUrl) return false
    return /\.docx?$/i.test(fileUrl.split('?')[0] || '')
  }

  const isInlinePreviewSupported = (fileUrl: string | null): boolean => {
    if (!fileUrl) return false
    return /\.(pdf|png|jpe?g|gif|webp)$/i.test(fileUrl.split('?')[0] || '')
  }

  const getContractViewerUrl = (): string | null => {
    if (!state.contractFileUrl) return null
    if (isInlinePreviewSupported(state.contractFileUrl)) {
      return state.contractFileUrl
    }
    if (isOfficeDocument(state.contractFileUrl)) {
      return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(state.contractFileUrl)}`
    }
    return null
  }

  const roundTo2 = (n: number) => Math.round(n * 100) / 100

  // Project handlers
  const handleEditProject = async () => {
    if (!id || isNaN(Number(id))) return
    try {
      const { data } = await api.get(`/projects/${id}`)
      state.setEditingProject(data)
      state.setShowEditProjectModal(true)
    } catch (err: any) {
      alert('שגיאה בטעינת פרטי הפרויקט: ' + (err.response?.data?.detail || err.message))
    }
  }

  const handleProjectUpdateSuccess = async () => {
    await dataLoaders.loadProjectInfo()
    state.setShowEditProjectModal(false)
    state.setEditingProject(null)
  }

  const handleArchiveDeleteClick = () => {
    state.setShowArchiveDeleteModal(true)
  }

  const handleArchive = async () => {
    if (!id || isNaN(Number(id))) return
    try {
      await dispatch(archiveProject(Number(id))).unwrap()
      state.setShowArchiveDeleteModal(false)
      navigate('/dashboard')
    } catch (err: any) {
      alert('שגיאה בארכוב הפרויקט: ' + (err || 'Unknown error'))
    }
  }

  const handleDeleteChoice = () => {
    state.setShowArchiveDeleteModal(false)
    state.setShowDeleteConfirmModal(true)
  }

  const handleDeleteConfirm = async () => {
    if (!id || isNaN(Number(id))) return
    if (!state.deletePassword) {
      state.setDeletePasswordError('נא להזין סיסמה')
      return
    }
    
    state.setIsDeleting(true)
    state.setDeletePasswordError('')
    
    try {
      await dispatch(hardDeleteProject({ id: Number(id), password: state.deletePassword })).unwrap()
      state.setShowDeleteConfirmModal(false)
      state.setDeletePassword('')
      navigate('/dashboard')
    } catch (err: any) {
      state.setDeletePasswordError(err || 'סיסמה שגויה או שגיאה במחיקה')
    } finally {
      state.setIsDeleting(false)
    }
  }

  // Unforeseen transaction handlers
  const resetUnforeseenForm = () => {
    state.setUnforeseenIncomeAmount(0)
    state.setUnforeseenDescription('')
    state.setUnforeseenNotes('')
    state.setUnforeseenTransactionDate(new Date().toISOString().split('T')[0])
    state.setUnforeseenExpenses([{ amount: 0, description: '', documentFile: null, expenseId: null, documentId: null }])
    state.setEditingUnforeseenTransaction(null)
    state.setUploadingDocumentForExpense(null)
  }

  const handleAddUnforeseenExpense = () => {
    state.setUnforeseenExpenses([...state.unforeseenExpenses, { amount: 0, description: '', documentFile: null, expenseId: null, documentId: null }])
  }

  const handleRemoveUnforeseenExpense = (index: number) => {
    state.setUnforeseenExpenses(state.unforeseenExpenses.filter((_: any, i: number) => i !== index))
  }

  const handleUnforeseenExpenseChange = (index: number, field: 'amount' | 'description', value: string | number) => {
    const newExpenses = [...state.unforeseenExpenses]
    newExpenses[index] = { ...newExpenses[index], [field]: value }
    state.setUnforeseenExpenses(newExpenses)
  }

  const handleUnforeseenExpenseDocumentChange = (index: number, file: File | null) => {
    const newExpenses = [...state.unforeseenExpenses]
    newExpenses[index] = { ...newExpenses[index], documentFile: file }
    state.setUnforeseenExpenses(newExpenses)
  }

  const calculateUnforeseenProfitLoss = () => {
    const totalExpenses = state.unforeseenExpenses.reduce((sum: number, exp: any) => sum + (parseFloat(String(exp.amount)) || 0), 0)
    const profitLoss = (parseFloat(String(state.unforeseenIncomeAmount)) || 0) - totalExpenses
    return Math.round(profitLoss * 100) / 100
  }

  const calculateUnforeseenTotalExpenses = () => {
    const total = state.unforeseenExpenses.reduce((sum: number, exp: any) => sum + (parseFloat(String(exp.amount)) || 0), 0)
    return Math.round(total * 100) / 100
  }

  const handleCreateUnforeseenTransaction = async (status: 'draft' | 'waiting_for_approval' = 'draft') => {
    if (!id) return
    state.setUnforeseenSubmitting(true)
    try {
      const expensesWithFiles = state.unforeseenExpenses.filter((exp: any) => exp.amount > 0)
      
      const expenseData = expensesWithFiles.map((exp: any) => ({
        amount: roundTo2(parseFloat(String(exp.amount)) || 0),
        description: exp.description || undefined
      }))

      const data = {
        project_id: parseInt(id),
        contract_period_id: viewingPeriodId || undefined,
        income_amount: parseFloat(String(state.unforeseenIncomeAmount)) || 0,
        description: state.unforeseenDescription || undefined,
        notes: state.unforeseenNotes || undefined,
        transaction_date: state.unforeseenTransactionDate,
        expenses: expenseData
      }

      const createdTx = await UnforeseenTransactionAPI.createUnforeseenTransaction(data)
      
      if (status !== 'draft') {
        if (status === 'waiting_for_approval') {
          await UnforeseenTransactionAPI.updateUnforeseenTransaction(createdTx.id, { status: 'waiting_for_approval' })
        }
      }

      for (let i = 0; i < expensesWithFiles.length; i++) {
        const exp = expensesWithFiles[i]
        if (exp.documentFile) {
          if (i < createdTx.expenses.length) {
            const createdExpense = createdTx.expenses[i]
            try {
              state.setUploadingDocumentForExpense(createdExpense.id)
              await UnforeseenTransactionAPI.uploadExpenseDocument(createdTx.id, createdExpense.id, exp.documentFile)
            } catch (err: any) {
              console.error('Failed to upload document for expense:', err)
              alert(`שגיאה בהעלאת מסמך להוצאה ${i + 1}: ${err.response?.data?.detail || 'שגיאה לא ידועה'}`)
            } finally {
              state.setUploadingDocumentForExpense(null)
            }
          }
        }
      }

      state.setShowCreateUnforeseenTransactionModal(false)
      resetUnforeseenForm()
      // Reload the entire page to refresh everything (like F5)
      window.location.reload()
    } catch (err: any) {
      alert(err.response?.data?.detail || 'שגיאה ביצירת העסקה')
    } finally {
      state.setUnforeseenSubmitting(false)
    }
  }


  const handleCreateAndExecuteUnforeseenTransaction = async () => {
    if (!id) return
    state.setUnforeseenSubmitting(true)
    try {
      const expensesWithFiles = state.unforeseenExpenses.filter((exp: any) => exp.amount > 0)
      
      const expenseData = expensesWithFiles.map((exp: any) => ({
        amount: roundTo2(parseFloat(String(exp.amount)) || 0),
        description: exp.description || undefined
      }))

      const data = {
        project_id: parseInt(id),
        contract_period_id: viewingPeriodId || undefined,
        income_amount: parseFloat(String(state.unforeseenIncomeAmount)) || 0,
        description: state.unforeseenDescription || undefined,
        notes: state.unforeseenNotes || undefined,
        transaction_date: state.unforeseenTransactionDate,
        expenses: expenseData
      }

      const createdTx = await UnforeseenTransactionAPI.createUnforeseenTransaction(data)

      // Upload documents first
      for (let i = 0; i < expensesWithFiles.length; i++) {
        const exp = expensesWithFiles[i]
        if (exp.documentFile) {
          if (i < createdTx.expenses.length) {
            const createdExpense = createdTx.expenses[i]
            try {
              state.setUploadingDocumentForExpense(createdExpense.id)
              await UnforeseenTransactionAPI.uploadExpenseDocument(createdTx.id, createdExpense.id, exp.documentFile)
            } catch (err: any) {
              console.error('Failed to upload document for expense:', err)
              alert(`שגיאה בהעלאת מסמך להוצאה ${i + 1}: ${err.response?.data?.detail || 'שגיאה לא ידועה'}`)
            } finally {
              state.setUploadingDocumentForExpense(null)
            }
          }
        }
      }

      // Execute the transaction immediately
      await UnforeseenTransactionAPI.executeUnforeseenTransaction(createdTx.id)

      state.setShowCreateUnforeseenTransactionModal(false)
      resetUnforeseenForm()
      
      // Reload the entire page to refresh everything (like F5)
      window.location.reload()
    } catch (err: any) {
      alert(err.response?.data?.detail || 'שגיאה ביצירת וביצוע העסקה')
    } finally {
      state.setUnforeseenSubmitting(false)
    }
  }

  const handleUpdateUnforeseenTransaction = async (status?: 'draft' | 'waiting_for_approval') => {
    if (!state.editingUnforeseenTransaction) return
    state.setUnforeseenSubmitting(true)
    try {
      const expensesWithFiles = state.unforeseenExpenses.filter((exp: any) => exp.amount > 0)
      
      const expenseData = expensesWithFiles.map((exp: any) => ({
        amount: roundTo2(parseFloat(String(exp.amount)) || 0),
        description: exp.description || undefined
      }))

      const updateData: any = {
        income_amount: parseFloat(String(state.unforeseenIncomeAmount)) || 0,
        description: state.unforeseenDescription || undefined,
        notes: state.unforeseenNotes || undefined,
        transaction_date: state.unforeseenTransactionDate,
        expenses: expenseData
      }

      if (status) {
        updateData.status = status
      }

      await UnforeseenTransactionAPI.updateUnforeseenTransaction(state.editingUnforeseenTransaction.id, updateData)
      const updatedTx = await UnforeseenTransactionAPI.getUnforeseenTransaction(state.editingUnforeseenTransaction.id)

      for (let i = 0; i < expensesWithFiles.length; i++) {
        const exp = expensesWithFiles[i]
        if (exp.documentFile) {
          let expenseIdToUse: number | null = null
          if (exp.expenseId) {
            const matchingExpense = updatedTx.expenses.find((e: any) => e.id === exp.expenseId)
            if (matchingExpense) {
              expenseIdToUse = matchingExpense.id
            }
          } else if (i < updatedTx.expenses.length) {
            expenseIdToUse = updatedTx.expenses[i].id
          }
          
          if (expenseIdToUse) {
            try {
              state.setUploadingDocumentForExpense(expenseIdToUse)
              await UnforeseenTransactionAPI.uploadExpenseDocument(state.editingUnforeseenTransaction.id, expenseIdToUse, exp.documentFile)
            } catch (err: any) {
              console.error('Failed to upload document for expense:', err)
              alert(`שגיאה בהעלאת מסמך להוצאה ${i + 1}: ${err.response?.data?.detail || 'שגיאה לא ידועה'}`)
            } finally {
              state.setUploadingDocumentForExpense(null)
            }
          }
        }
      }

      state.setShowCreateUnforeseenTransactionModal(false)
      resetUnforeseenForm()
      // Reload the entire page to refresh everything (like F5)
      window.location.reload()
    } catch (err: any) {
      alert(err.response?.data?.detail || 'שגיאה בעדכון העסקה')
    } finally {
      state.setUnforeseenSubmitting(false)
    }
  }

  // Budget handlers
  const handleDeleteBudget = async (budgetId: number) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את התקציב?')) {
      return
    }
    try {
      state.setBudgetDeleteLoading(budgetId)
      await BudgetAPI.deleteBudget(budgetId)
      await dataLoaders.reloadChartsDataOnly()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'שגיאה במחיקת התקציב')
    } finally {
      state.setBudgetDeleteLoading(null)
    }
  }

  const handleAddBudget = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!id) return
    if (!state.newBudgetForm.amount || Number(state.newBudgetForm.amount) <= 0) {
      state.setBudgetFormError('יש להזין סכום חיובי')
      return
    }
    if (!state.newBudgetForm.start_date) {
      state.setBudgetFormError('יש לבחור תאריך התחלה')
      return
    }

    const existingBudget = state.projectBudgets.find(
      (budget: BudgetWithSpending) => budget.category === state.newBudgetForm.category
    )
    if (existingBudget) {
      state.setBudgetFormError(`כבר קיים תקציב לקטגוריה "${state.newBudgetForm.category}". ניתן לערוך את התקציב הקיים או למחוק אותו לפני יצירת תקציב חדש.`)
      return
    }

    try {
      state.setBudgetSaving(true)
      state.setBudgetFormError(null)
      const effectiveBudgetPeriodId = viewingPeriodId ?? state.selectedPeriod?.period_id ?? state.currentContractPeriod?.period_id ?? null
      await BudgetAPI.createBudget({
        project_id: parseInt(id),
        category: state.newBudgetForm.category,
        amount: Number(state.newBudgetForm.amount),
        period_type: state.newBudgetForm.period_type,
        start_date: state.newBudgetForm.start_date,
        end_date: state.newBudgetForm.period_type === 'Annual' ? (state.newBudgetForm.end_date || null) : null,
        contract_period_id: effectiveBudgetPeriodId
      })
      await dataLoaders.reloadChartsDataOnly()
      state.setShowAddBudgetForm(false)
      state.setBudgetDateMode('today')
      state.setNewBudgetForm({
        category: '',
        amount: '',
        period_type: 'Annual',
        start_date: new Date().toISOString().split('T')[0],
        end_date: ''
      })
    } catch (err: any) {
      state.setBudgetFormError(err?.response?.data?.detail || 'שגיאה ביצירת התקציב')
    } finally {
      state.setBudgetSaving(false)
    }
  }

  const handleStartEditBudget = (budget: BudgetWithSpending) => {
    const normalizedStart = budget.start_date ? budget.start_date.slice(0, 10) : ''
    const normalizedEnd = budget.end_date ? budget.end_date.slice(0, 10) : ''
    state.setBudgetToEdit(budget)
    state.setEditBudgetError(null)
    state.setEditBudgetForm({
      category: budget.category,
      amount: Number(budget.base_amount ?? budget.amount).toString(),
      period_type: budget.period_type,
      start_date: normalizedStart,
      end_date: normalizedEnd,
      is_active: budget.is_active
    })
    state.setShowEditBudgetForm(true)
  }

  const handleUpdateBudget = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!state.budgetToEdit) return
    if (!state.editBudgetForm.category) {
      state.setEditBudgetError('יש לבחור קטגוריה')
      return
    }
    const parsedAmount = Number(state.editBudgetForm.amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      state.setEditBudgetError('יש להזין סכום חיובי')
      return
    }
    if (!state.editBudgetForm.start_date) {
      state.setEditBudgetError('יש לבחור תאריך התחלה')
      return
    }
    try {
      state.setEditBudgetSaving(true)
      state.setEditBudgetError(null)
      await BudgetAPI.updateBudget(state.budgetToEdit.id, {
        category: state.editBudgetForm.category,
        amount: parsedAmount,
        period_type: state.editBudgetForm.period_type,
        start_date: state.editBudgetForm.start_date,
        end_date: state.editBudgetForm.period_type === 'Annual' ? (state.editBudgetForm.end_date || null) : null,
        is_active: state.editBudgetForm.is_active
      })
      await dataLoaders.reloadChartsDataOnly()
      state.setShowEditBudgetForm(false)
      state.setBudgetToEdit(null)
    } catch (err: any) {
      state.setEditBudgetError(err?.response?.data?.detail || 'שגיאה בעדכון התקציב')
    } finally {
      state.setEditBudgetSaving(false)
    }
  }

  // Transaction handlers
  const handleEditAnyTransaction = async (transaction: Transaction) => {
    if (transaction.recurring_template_id || transaction.is_generated) {
      state.setSelectedTransactionForEdit(transaction)
      state.setShowRecurringSelectionModal(true)
      return
    }
    
    state.setSelectedTransactionForEdit(transaction)
    state.setEditTransactionModalOpen(true)
  }
  
  const handleEditRecurringSelection = async (mode: 'instance' | 'series') => {
    if (!state.selectedTransactionForEdit) {
      state.setShowRecurringSelectionModal(false)
      return
    }

    if (mode === 'instance') {
      state.setShowRecurringSelectionModal(false)
      state.setEditTransactionModalOpen(true)
    } else {
      try {
        let templateId = state.selectedTransactionForEdit.recurring_template_id
        
        if (!templateId) {
          try {
            const templates = await RecurringTransactionAPI.getProjectRecurringTemplates(parseInt(id || '0'))
            const matchingTemplate = templates.find((t: any) => 
              t.description === state.selectedTransactionForEdit.description &&
              t.amount === state.selectedTransactionForEdit.amount &&
              t.type === state.selectedTransactionForEdit.type &&
              (t.supplier_id === state.selectedTransactionForEdit.supplier_id || 
               (!t.supplier_id && !state.selectedTransactionForEdit.supplier_id))
            )
            
            if (matchingTemplate) {
              templateId = matchingTemplate.id
            }
          } catch (searchErr) {
            console.error('Failed to search for template', searchErr)
          }
        }
        
        if (!templateId) {
          alert('לא נמצא מזהה תבנית. לא ניתן לערוך את כל הסדרה.')
          state.setShowRecurringSelectionModal(false)
          return
        }
        
        state.setShowRecurringSelectionModal(false)
        state.setPendingTemplateLoad(true)
        state.setEditTemplateModalOpen(true)
        
        const templateResponse = await RecurringTransactionAPI.getTemplate(templateId)
        const { generated_transactions, ...templateData } = templateResponse as any
        state.setSelectedTemplateForEdit(templateData as RecurringTransactionTemplate)
        state.setPendingTemplateLoad(false)
      } catch (err: any) {
        console.error('Failed to fetch template', err)
        state.setPendingTemplateLoad(false)
        state.setEditTemplateModalOpen(false)
        state.setShowRecurringSelectionModal(false)
        alert('שגיאה בטעינת פרטי המחזוריות: ' + (err.response?.data?.detail || err.message))
      }
    }
  }

  const handleDeleteTransaction = async (transactionId: number, transaction?: Transaction) => {
    const fullTransaction = transaction || state.txs.find((t: Transaction) => t.id === transactionId)
    if (!fullTransaction) {
      alert('עסקה לא נמצאה')
      return
    }
    
    state.setTransactionToDelete(fullTransaction)
    state.setShowDeleteTransactionModal(true)
  }

  const confirmDeleteTransaction = async (deleteAll: boolean) => {
    if (!state.transactionToDelete) return

    state.setIsDeletingTransaction(true)
    try {
      const isRecurring = state.transactionToDelete.recurring_template_id || state.transactionToDelete.is_generated
      const isPeriod = !!(state.transactionToDelete.period_start_date && state.transactionToDelete.period_end_date)

      if (isRecurring) {
        if (deleteAll) {
          const templateId = state.transactionToDelete.recurring_template_id
          if (!templateId) {
            throw new Error('לא נמצא מזהה תבנית מחזורית')
          }
          await RecurringTransactionAPI.deleteTemplate(templateId)
        } else {
          await RecurringTransactionAPI.deleteTransactionInstance(state.transactionToDelete.id)
        }
        await dataLoaders.loadTransactionsOnly()
      } else if (isPeriod && deleteAll) {
        const periodStart = state.transactionToDelete.period_start_date
        const periodEnd = state.transactionToDelete.period_end_date

        if (!periodStart || !periodEnd) {
          await api.delete(`/transactions/${state.transactionToDelete.id}`)
        } else {
          const matchingTransactions = state.txs.filter((t: Transaction) =>
            t.period_start_date === periodStart &&
            t.period_end_date === periodEnd &&
            t.id !== state.transactionToDelete.id
          )

          const deletePromises = [
            api.delete(`/transactions/${state.transactionToDelete.id}`),
            ...matchingTransactions.map((t: Transaction) => api.delete(`/transactions/${t.id}`))
          ]

          await Promise.all(deletePromises)
        }
        await dataLoaders.loadAllProjectData(viewingPeriodId)
        await dataLoaders.loadUnforeseenTransactions()
      } else {
        await api.delete(`/transactions/${state.transactionToDelete.id}`)
        await dataLoaders.loadAllProjectData(viewingPeriodId)
        await dataLoaders.loadUnforeseenTransactions()
      }

      if (state.selectedPeriodSummary) {
        try {
          const summary = await ProjectAPI.getContractPeriodSummary(
            parseInt(id!),
            state.selectedPeriodSummary.period_id,
            state.selectedPeriodSummary.start_date,
            state.selectedPeriodSummary.end_date
          )
          state.setSelectedPeriodSummary(summary)
        } catch (err: any) {
          console.error('Failed to refresh period summary:', err)
        }
      }

      state.setShowDeleteTransactionModal(false)
      state.setTransactionToDelete(null)
    } catch (err: any) {
      alert(err.response?.data?.detail ?? 'שגיאה במחיקת העסקה')
    } finally {
      state.setIsDeletingTransaction(false)
    }
  }

  // Financial summary calculation
  const calculateFinancialSummary = () => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1 // 1-12 (Jan = 1, Dec = 12)
    
    let calculationStartDate: Date
    let calculationEndDate: Date

    if (state.globalDateFilterMode === 'current_month') {
      calculationStartDate = new Date(currentYear, currentMonth - 1, 1)
      calculationEndDate = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999)
    } else if (state.globalDateFilterMode === 'selected_month') {
      const [year, month] = state.globalSelectedMonth.split('-').map(Number)
      calculationStartDate = new Date(year, month - 1, 1)
      calculationEndDate = new Date(year, month, 0, 23, 59, 59, 999)
    } else if (state.globalDateFilterMode === 'date_range') {
      calculationStartDate = state.globalStartDate ? (parseLocalDate(state.globalStartDate) || new Date(0)) : new Date(0)
      const customEnd = state.globalEndDate ? (parseLocalDate(state.globalEndDate) || new Date()) : new Date()
      customEnd.setHours(23, 59, 59, 999)
      calculationEndDate = customEnd
    } else if (state.globalDateFilterMode === 'all_time') {
      calculationStartDate = new Date(2000, 0, 1)
      calculationEndDate = now
    } else {
      if (state.projectStartDate) {
        calculationStartDate = parseLocalDate(state.projectStartDate) || new Date(0)
      } else {
        const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
        calculationStartDate = oneYearAgo
      }
      
      calculationEndDate = now
      if (state.projectEndDate) {
        const endDateObj = parseLocalDate(state.projectEndDate) || new Date()
        const actualLastDay = new Date(endDateObj)
        actualLastDay.setDate(actualLastDay.getDate() - 1)
        actualLastDay.setHours(23, 59, 59, 999)
        calculationEndDate = actualLastDay < now ? actualLastDay : now
      }
    }
    
    const summaryTransactions = state.txs.filter((t: Transaction) => {
      const isNotFromFund = !(t.from_fund === true)
      if (!isNotFromFund) return false
      
      if (t.period_start_date && t.period_end_date) {
        const periodStart = parseLocalDate(t.period_start_date) || new Date()
        const periodEnd = parseLocalDate(t.period_end_date) || new Date()
        const overlaps = periodStart <= calculationEndDate && periodEnd >= calculationStartDate
        return overlaps
      } else {
        const txDate = parseLocalDate(t.tx_date) || new Date()
        const isInDateRange = txDate >= calculationStartDate && txDate <= calculationEndDate
        return isInDateRange
      }
    })
    
    const incomeTransactions = summaryTransactions.filter((t: Transaction) => t.type === 'Income')
    const expenseTransactions = summaryTransactions.filter((t: Transaction) => t.type === 'Expense')
    
    const monthlyIncome = Number(state.projectBudget?.budget_monthly || 0)
    
    const transactionIncome = incomeTransactions.reduce((s: number, t: Transaction) => {
      if (t.period_start_date && t.period_end_date) {
        const periodStart = parseLocalDate(t.period_start_date) || new Date()
        const periodEnd = parseLocalDate(t.period_end_date) || new Date()
        const totalDays = Math.floor((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
        
        if (totalDays > 0) {
          const overlapStart = new Date(Math.max(periodStart.getTime(), calculationStartDate.getTime()))
          const overlapEnd = new Date(Math.min(periodEnd.getTime(), calculationEndDate.getTime()))
          
          if (overlapStart <= overlapEnd) {
            const overlapDays = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
            const dailyRate = Number(t.amount) / totalDays
            return s + (dailyRate * overlapDays)
          }
        }
        return s
      } else {
        return s + Number(t.amount || 0)
      }
    }, 0)
    
    const transactionExpense = expenseTransactions.reduce((s: number, t: Transaction) => {
      if (t.period_start_date && t.period_end_date) {
        const periodStart = parseLocalDate(t.period_start_date) || new Date()
        const periodEnd = parseLocalDate(t.period_end_date) || new Date()
        const totalDays = Math.floor((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
        
        if (totalDays > 0) {
          const overlapStart = new Date(Math.max(periodStart.getTime(), calculationStartDate.getTime()))
          const overlapEnd = new Date(Math.min(periodEnd.getTime(), calculationEndDate.getTime()))
          
          if (overlapStart <= overlapEnd) {
            const overlapDays = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
            const dailyRate = Number(t.amount) / totalDays
            return s + (dailyRate * overlapDays)
          }
        }
        return s
      } else {
        return s + Number(t.amount || 0)
      }
    }, 0)
    
    let projectIncome = 0
    if (monthlyIncome > 0 && calculationStartDate) {
      const incomeCalculationStart = calculationStartDate
      const incomeCalculationEnd = calculationEndDate
      projectIncome = calculateMonthlyIncomeAccrual(monthlyIncome, incomeCalculationStart, incomeCalculationEnd)
    }
    
    const totalIncome = monthlyIncome > 0 ? Math.max(transactionIncome, projectIncome) : transactionIncome
    
    return {
      income: totalIncome,
      expense: transactionExpense
    }
  }

  // Handler for executing unforeseen transaction (used from modals)
  const handleExecuteUnforeseenTransaction = async (txId: number) => {
    try {
      // Execute the transaction
      const executeResult = await UnforeseenTransactionAPI.executeUnforeseenTransaction(txId)
      return executeResult
    } catch (err: any) {
      throw err
    }
  }

  return {
    // Utility functions
    isOfficeDocument,
    isInlinePreviewSupported,
    getContractViewerUrl,
    handleExecuteUnforeseenTransaction,
    roundTo2,
    calculateUnforeseenProfitLoss,
    calculateUnforeseenTotalExpenses,
    calculateFinancialSummary,
    
    // Project handlers
    handleEditProject,
    handleProjectUpdateSuccess,
    handleArchiveDeleteClick,
    handleArchive,
    handleDeleteChoice,
    handleDeleteConfirm,
    
    // Unforeseen transaction handlers
    resetUnforeseenForm,
    handleAddUnforeseenExpense,
    handleRemoveUnforeseenExpense,
    handleUnforeseenExpenseChange,
    handleUnforeseenExpenseDocumentChange,
    handleCreateUnforeseenTransaction,
    handleCreateAndExecuteUnforeseenTransaction,
    handleUpdateUnforeseenTransaction,
    
    // Budget handlers
    handleDeleteBudget,
    handleAddBudget,
    handleStartEditBudget,
    handleUpdateBudget,
    
    // Transaction handlers
    handleEditAnyTransaction,
    handleEditRecurringSelection,
    handleDeleteTransaction,
    confirmDeleteTransaction
  }
}
