import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { UnforeseenTransactionAPI, ProjectAPI } from '../lib/apiClient'
import { UnforeseenTransaction, UnforeseenTransactionCreate, UnforeseenTransactionExpenseCreate, Project } from '../types/api'
import { Plus, Edit, Trash2, Check, X, FileText, Upload, Download, ArrowLeft } from 'lucide-react'
import { formatDate } from '../lib/utils'
import Modal from '../components/Modal'
import ConfirmationModal from '../components/ConfirmationModal'
import ToastNotification, { useToast } from '../components/ToastNotification'

export default function UnforeseenTransactions() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [transactions, setTransactions] = useState<UnforeseenTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<UnforeseenTransaction | null>(null)
  const [contractPeriodId, setContractPeriodId] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'waiting_for_approval' | 'executed'>('all')
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    isOpen: boolean
    transaction: UnforeseenTransaction | null
  }>({
    isOpen: false,
    transaction: null
  })
  const [executeConfirmState, setExecuteConfirmState] = useState<{
    isOpen: boolean
    transaction: UnforeseenTransaction | null
  }>({
    isOpen: false,
    transaction: null
  })
  const { toast, showToast, hideToast } = useToast()

  // Form state
  const [incomeAmount, setIncomeAmount] = useState<number>(0)
  const [description, setDescription] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [transactionDate, setTransactionDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [expenses, setExpenses] = useState<Array<{ id: string; amount: number; description: string }>>([{ id: '1', amount: 0, description: '' }])
  const [submitting, setSubmitting] = useState(false)

  const loadData = useCallback(async (showLoading = true, cacheBust = false) => {
    if (!projectId) return
    if (showLoading) setLoading(true)
    setError(null)
    try {
      const [projectData, transactionsData] = await Promise.all([
        ProjectAPI.getProject(parseInt(projectId)),
        UnforeseenTransactionAPI.getUnforeseenTransactions(
          parseInt(projectId),
          contractPeriodId || undefined,
          true,
          cacheBust
        )
      ])
      setProject(projectData)
      setTransactions(transactionsData)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'שגיאה בטעינת הנתונים')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [projectId, contractPeriodId])

  useEffect(() => {
    if (projectId) {
      loadData(true, true)
    }
  }, [projectId, contractPeriodId, loadData])

  const handleAddExpense = useCallback(() => {
    const newId = String(Date.now() + Math.random())
    setExpenses([...expenses, { id: newId, amount: 0, description: '' }])
  }, [expenses])

  const handleRemoveExpense = (index: number) => {
    setExpenses(expenses.filter((_, i) => i !== index))
  }

  const handleExpenseChange = useCallback((index: number, field: 'amount' | 'description', value: string | number) => {
    setExpenses(prevExpenses => {
      const newExpenses = [...prevExpenses]
      newExpenses[index] = { ...newExpenses[index], [field]: value }
      return newExpenses
    })
  }, [])

  const roundTo2 = (n: number) => {
    // Use toFixed to avoid floating point precision issues
    return parseFloat(Number(n).toFixed(2))
  }

  const calculateProfitLoss = () => {
    const totalExpenses = expenses.reduce((sum, exp) => sum + (parseFloat(String(exp.amount)) || 0), 0)
    const profitLoss = (parseFloat(String(incomeAmount)) || 0) - totalExpenses
    return roundTo2(profitLoss)
  }

  const calculateTotalExpenses = () => {
    const total = expenses.reduce((sum, exp) => sum + (parseFloat(String(exp.amount)) || 0), 0)
    return roundTo2(total)
  }

  const resetForm = useCallback(() => {
    setIncomeAmount(0)
    setDescription('')
    setNotes('')
    setTransactionDate(new Date().toISOString().split('T')[0])
    setExpenses([{ id: '1', amount: 0, description: '' }])
    setEditingTransaction(null)
  }, [])

  const handleCreate = async () => {
    if (!projectId) return
    setSubmitting(true)
    setError(null)
    try {
      const expenseData: UnforeseenTransactionExpenseCreate[] = expenses
        .filter(exp => exp.amount > 0)
        .map(exp => ({
          amount: Number(exp.amount) || 0,
          description: exp.description || undefined
        }))

      const data: UnforeseenTransactionCreate = {
        project_id: parseInt(projectId),
        contract_period_id: contractPeriodId || undefined,
        income_amount: Number(incomeAmount) || 0,
        description: description || undefined,
        notes: notes || undefined,
        transaction_date: transactionDate,
        expenses: expenseData
      }

      await UnforeseenTransactionAPI.createUnforeseenTransaction(data)
      setShowCreateModal(false)
      resetForm()
      await loadData(false, true)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'שגיאה ביצירת העסקה')
      setSubmitting(false)
      return
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdateStatus = async (tx: UnforeseenTransaction, newStatus: 'draft' | 'waiting_for_approval' | 'executed') => {
    try {
      // If moving to executed, use the execute endpoint instead
      if (newStatus === 'executed') {
        await handleExecute(tx)
        return
      }
      await UnforeseenTransactionAPI.updateUnforeseenTransaction(tx.id, { status: newStatus })
      await loadData(false, true)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'שגיאה בעדכון הסטטוס')
      return
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft':
        return 'טיוטה'
      case 'waiting_for_approval':
        return 'מחכה לאישור'
      case 'executed':
        return 'בוצע'
      default:
        return status
    }
  }

  const handleExecute = async (tx: UnforeseenTransaction) => {
    setExecuteConfirmState({ isOpen: true, transaction: tx })
  }

  const confirmExecute = async () => {
    if (!executeConfirmState.transaction) return
    try {
      await UnforeseenTransactionAPI.executeUnforeseenTransaction(executeConfirmState.transaction.id)
      setExecuteConfirmState({ isOpen: false, transaction: null })
      await loadData(false, true)
      showToast('העסקה בוצעה בהצלחה', 'success')
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'שגיאה בביצוע העסקה', 'error')
      setExecuteConfirmState({ isOpen: false, transaction: null })
    }
  }

  const handleDelete = (tx: UnforeseenTransaction) => {
    setDeleteConfirmState({
      isOpen: true,
      transaction: tx
    })
  }

  const confirmDelete = async () => {
    if (!deleteConfirmState.transaction) return
    try {
      await UnforeseenTransactionAPI.deleteUnforeseenTransaction(deleteConfirmState.transaction.id)
      setDeleteConfirmState({ isOpen: false, transaction: null })
      await loadData(false, true)
      showToast('העסקה נמחקה בהצלחה', 'success')
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'שגיאה במחיקת העסקה', 'error')
      setDeleteConfirmState({ isOpen: false, transaction: null })
    }
  }

  const handleEdit = (tx: UnforeseenTransaction) => {
    setEditingTransaction(tx)
    setIncomeAmount(tx.income_amount)
    setDescription(tx.description || '')
    setNotes(tx.notes || '')
    setTransactionDate(tx.transaction_date)
    setExpenses(
      tx.expenses.length > 0
        ? tx.expenses.map((exp, idx) => ({ id: String(exp.id || idx), amount: exp.amount, description: exp.description || '' }))
        : [{ id: '1', amount: 0, description: '' }]
    )
    setShowCreateModal(true)
  }

  const handleUpdate = async () => {
    if (!editingTransaction) return
    setSubmitting(true)
    setError(null)
    try {
      const expenseData: UnforeseenTransactionExpenseCreate[] = expenses
        .filter(exp => exp.amount > 0)
        .map(exp => ({
          amount: Number(exp.amount) || 0,
          description: exp.description || undefined
        }))

      await UnforeseenTransactionAPI.updateUnforeseenTransaction(editingTransaction.id, {
        income_amount: Number(incomeAmount) || 0,
        description: description || undefined,
        notes: notes || undefined,
        transaction_date: transactionDate,
        expenses: expenseData
      })
      setShowCreateModal(false)
      resetForm()
      await loadData(false, true)
      navigate(`/projects/${projectId}`)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'שגיאה בעדכון העסקה')
      setSubmitting(false)
      return
    } finally {
      setSubmitting(false)
    }
  }

  const handleUploadDocument = async (txId: number, expenseId: number, file: File) => {
    try {
      await UnforeseenTransactionAPI.uploadExpenseDocument(txId, expenseId, file)
      await loadData(false, true)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'שגיאה בהעלאת המסמך')
    }
  }

  const profitLoss = useMemo(() => calculateProfitLoss(), [incomeAmount, expenses])
  const totalExpenses = useMemo(() => calculateTotalExpenses(), [expenses])

  // Filter transactions by status
  const filteredTransactions = useMemo(() => {
    if (statusFilter === 'all') return transactions
    return transactions.filter(tx => tx.status === statusFilter)
  }, [transactions, statusFilter])

  // Count transactions by status
  const statusCounts = useMemo(() => {
    return {
      all: transactions.length,
      draft: transactions.filter(tx => tx.status === 'draft').length,
      waiting_for_approval: transactions.filter(tx => tx.status === 'waiting_for_approval').length,
      executed: transactions.filter(tx => tx.status === 'executed').length
    }
  }, [transactions])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {loading && (
        <div className="fixed inset-0 bg-black/20 z-40 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-lg">
            <div className="text-center">טוען...</div>
          </div>
        </div>
      )}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/projects/${projectId}`)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              עסקאות לא צפויות
            </h1>
            {project && (
              <p className="text-gray-600 dark:text-gray-400 mt-1">{project.name}</p>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {filteredTransactions.length} עסקאות
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            resetForm()
            setShowCreateModal(true)
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          עסקה חדשה
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg">
          {error}
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteConfirmState.isOpen}
        onClose={() => setDeleteConfirmState({ isOpen: false, transaction: null })}
        onConfirm={confirmDelete}
        title="מחיקת עסקה"
        message={
          deleteConfirmState.transaction?.status === 'executed'
            ? 'האם אתה בטוח שברצונך למחוק עסקה זו? זה ימחק גם את העסקה הרגילה שנוצרה בפרויקט כתוצאה מביצוע העסקה.'
            : 'האם אתה בטוח שברצונך למחוק עסקה זו?'
        }
        variant="danger"
        confirmText="מחק"
        cancelText="ביטול"
      />

      <ConfirmationModal
        isOpen={executeConfirmState.isOpen}
        onClose={() => setExecuteConfirmState({ isOpen: false, transaction: null })}
        onConfirm={confirmExecute}
        title="ביצוע עסקה"
        message="האם אתה בטוח שברצונך לבצע את העסקה?"
        variant="warning"
        confirmText="בצע"
        cancelText="ביטול"
      />

      {/* Toast Notification */}
      <ToastNotification toast={toast} onClose={hideToast} />

      {/* Status filter tabs */}
      <div className="mb-6">
        <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === 'all'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            הכל ({statusCounts.all})
          </button>
          <button
            onClick={() => setStatusFilter('draft')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === 'draft'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            טיוטות ({statusCounts.draft})
          </button>
          <button
            onClick={() => setStatusFilter('waiting_for_approval')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === 'waiting_for_approval'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            מחכות לאישור ({statusCounts.waiting_for_approval})
          </button>
          <button
            onClick={() => setStatusFilter('executed')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === 'executed'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            בוצעו ({statusCounts.executed})
          </button>
        </div>
      </div>

      {/* Filter by contract period */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          סינון לפי תקופת חוזה:
        </label>
        <select
          value={contractPeriodId || ''}
          onChange={(e) => setContractPeriodId(e.target.value ? parseInt(e.target.value) : null)}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
        >
          <option value="">כל התקופות</option>
          {/* Contract periods would be loaded from project data */}
        </select>
      </div>

      {/* Transactions List – scrollable container */}
      <div className="h-[420px] overflow-y-scroll overflow-x-auto overscroll-contain rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 p-4">
        <div className="space-y-4">
        {filteredTransactions.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            {transactions.length === 0 ? 'אין עסקאות לא צפויות' : 'אין עסקאות בקטגוריה זו'}
          </div>
        ) : (
          filteredTransactions.map((tx) => {
            const isDraft = tx.status === 'draft'
            console.log('Rendering transaction:', tx.id, 'status:', tx.status)
            return (
              <div
                key={tx.id}
                onClick={() => handleEdit(tx)}
                className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-lg hover:border-blue-400 dark:hover:border-blue-500 transition-all relative"
                style={{ overflow: 'visible' }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                        {tx.description || `עסקה #${tx.id}`}
                      </h3>
                      <span
                        className={`px-3 py-1 rounded-full text-sm flex-shrink-0 ${
                          tx.status === 'executed'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                            : tx.status === 'waiting_for_approval'
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {isDraft && 'טיוטה'}
                        {tx.status === 'waiting_for_approval' && 'מחכה לאישור'}
                        {tx.status === 'executed' && 'בוצע'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      תאריך: {formatDate(tx.transaction_date)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">הכנסה</p>
                    <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                      ₪{tx.income_amount.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">הוצאות</p>
                    <p className="text-lg font-semibold text-red-600 dark:text-red-400">
                      ₪{tx.total_expenses.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">רווח/הפסד</p>
                    <p
                      className={`text-lg font-semibold ${
                        tx.profit_loss >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {tx.profit_loss >= 0 ? '+' : ''}₪{tx.profit_loss.toLocaleString()}
                    </p>
                  </div>
                </div>

                {tx.expenses.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-semibold mb-2 text-gray-900 dark:text-white">הוצאות:</h4>
                    <div className="space-y-2">
                      {tx.expenses.map((exp) => (
                        <div
                          key={exp.id}
                          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                        >
                          <div className="flex-1">
                            <p className="font-medium text-gray-900 dark:text-white">
                              ₪{exp.amount.toLocaleString()}
                            </p>
                            {exp.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {exp.description}
                              </p>
                            )}
                          </div>
                          {exp.document && (
                            <a
                              href={exp.document.file_path}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="ml-4 p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"
                            >
                              <FileText className="w-5 h-5" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {tx.notes && (
                  <div className="mb-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">{tx.notes}</p>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-2" style={{ minHeight: '50px', display: 'flex', width: '100%' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEdit(tx)
                    }}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                    style={{ display: 'inline-flex' }}
                  >
                    <Edit className="w-4 h-4" />
                    צפה/ערוך
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (tx.status === 'draft') {
                        handleUpdateStatus(tx, 'waiting_for_approval')
                      }
                    }}
                    disabled={tx.status !== 'draft'}
                    className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                      tx.status === 'draft'
                        ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                        : 'bg-gray-400 text-white cursor-not-allowed opacity-50'
                    }`}
                    style={{ display: 'inline-flex' }}
                  >
                    <Check className="w-4 h-4" />
                    תעביר לממתין לאישור
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(tx)
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                    style={{ display: 'inline-flex' }}
                  >
                    <Trash2 className="w-4 h-4" />
                    מחק
                  </button>

                  {tx.status === 'waiting_for_approval' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleExecute(tx)
                      }}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                      style={{ display: 'inline-flex' }}
                    >
                      <Check className="w-4 h-4" />
                      בצע
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          resetForm()
        }}
        title={editingTransaction ? 'ערוך עסקה לא צפויה' : 'עסקה לא צפויה חדשה'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              תאריך עסקה
            </label>
            <input
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              הכנסה (מה שגובה מהפרויקט)
            </label>
            <input
              type="number"
              step="any"
              value={incomeAmount}
              onChange={(e) => {
                const inputValue = e.target.value
                if (inputValue === '' || inputValue === '-') {
                  setIncomeAmount(0)
                } else {
                  // Parse as number to preserve precision
                  const numValue = Number(inputValue)
                  setIncomeAmount(isNaN(numValue) ? 0 : numValue)
                }
              }}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              תיאור
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              הערות
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                הוצאות
              </label>
              <button
                onClick={handleAddExpense}
                className="text-blue-600 hover:text-blue-700 text-sm"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                הוסף הוצאה
              </button>
            </div>
            <div className="space-y-2">
              {expenses.map((exp, index) => (
                <div key={exp.id} className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="סכום"
                    value={exp.amount}
                    onChange={(e) => {
                      const inputValue = e.target.value
                      if (inputValue === '' || inputValue === '-') {
                        handleExpenseChange(index, 'amount', 0)
                      } else {
                        const numValue = Number(inputValue)
                        handleExpenseChange(index, 'amount', isNaN(numValue) ? 0 : numValue)
                      }
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                  />
                  <input
                    type="text"
                    placeholder="תיאור"
                    value={exp.description}
                    onChange={(e) => handleExpenseChange(index, 'description', e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                  />
                  {expenses.length > 1 && (
                    <button
                      onClick={() => handleRemoveExpense(index)}
                      className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900 rounded-lg"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">סה"כ הוצאות:</span>
              <span className="font-semibold text-red-600 dark:text-red-400">
                ₪{totalExpenses.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">רווח/הפסד:</span>
              <span
                className={`font-semibold ${
                  profitLoss >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                ₪{profitLoss.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowCreateModal(false)
                resetForm()
              }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              ביטול
            </button>
            <button
              onClick={editingTransaction ? handleUpdate : handleCreate}
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'שומר...' : editingTransaction ? 'עדכן' : 'שמור'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
