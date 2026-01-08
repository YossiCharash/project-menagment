import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../lib/api'
import { ReportAPI, BudgetAPI, ProjectAPI, CategoryAPI, RecurringTransactionAPI } from '../lib/apiClient'
import { ExpenseCategory, BudgetWithSpending, RecurringTransactionTemplate } from '../types/api'
import ProjectTrendsChart from '../components/charts/ProjectTrendsChart'
import BudgetCard from '../components/charts/BudgetCard'
import EditTransactionModal from '../components/EditTransactionModal'
import CreateTransactionModal from '../components/CreateTransactionModal'
import CreateProjectModal from '../components/CreateProjectModal'
import EditRecurringTemplateModal from '../components/EditRecurringTemplateModal'
import EditRecurringSelectionModal from '../components/EditRecurringSelectionModal'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import { fetchSuppliers } from '../store/slices/suppliersSlice'
import { archiveProject, hardDeleteProject } from '../store/slices/projectsSlice'
import { fetchMe } from '../store/slices/authSlice'
import { ChevronDown, History, Download, Edit, ChevronLeft, Archive } from 'lucide-react'
import Modal from '../components/Modal'
import {
  CATEGORY_LABELS,
  normalizeCategoryForFilter,
  calculateMonthlyIncomeAccrual
} from '../utils/calculations'

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  STANDING_ORDER: 'הוראת קבע',
  'הוראת קבע': 'הוראת קבע',
  CREDIT: 'אשראי',
  'אשראי': 'אשראי',
  CHECK: 'שיק',
  'שיק': 'שיק',
  CASH: 'מזומן',
  'מזומן': 'מזומן',
  BANK_TRANSFER: 'העברה בנקאית',
  'העברה בנקאית': 'העברה בנקאית',
  CENTRALIZED_YEAR_END: 'גבייה מרוכזת סוף שנה',
  'גבייה מרוכזת סוף שנה': 'גבייה מרוכזת סוף שנה'
}

interface Transaction {
  id: number
  type: 'Income' | 'Expense'
  amount: number
  description?: string | null
  tx_date: string
  category?: string | null
  payment_method?: string | null
  notes?: string | null
  subproject_id?: number | null
  is_exceptional?: boolean
  is_generated?: boolean
  supplier_id?: number | null
  created_by_user_id?: number | null
    created_by_user?: {
        id: number
        full_name: string
        email: string
    } | null
    from_fund?: boolean
    recurring_template_id?: number | null
    file_path?: string | null
    period_start_date?: string | null
    period_end_date?: string | null
}

// Helper to safely get category name whether it's a string or an object
const getCategoryName = (category: any): string => {
  if (!category) return '';
  if (typeof category === 'object' && category.name) {
    return category.name;
  }
  return String(category);
}

// Helper function to split period transactions by month
interface SplitTransaction extends Transaction {
  monthKey: string // YYYY-MM format
  proportionalAmount: number
  fullAmount: number
  daysInMonth: number
  totalDays: number
}

const splitPeriodTransactionByMonth = (tx: Transaction): SplitTransaction[] => {
  if (!tx.period_start_date || !tx.period_end_date) {
    // Not a period transaction, return as-is
    const txDate = new Date(tx.tx_date)
    const monthKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`
    return [{
      ...tx,
      monthKey,
      proportionalAmount: tx.amount,
      fullAmount: tx.amount,
      daysInMonth: 0,
      totalDays: 0
    }]
  }

  // Normalize dates to work with date-only (no time component)
  const startDate = new Date(tx.period_start_date)
  startDate.setHours(0, 0, 0, 0)
  const endDate = new Date(tx.period_end_date)
  endDate.setHours(23, 59, 59, 999) // Set to end of day to include the full last day
  
  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
  
  if (totalDays <= 0) {
    // Invalid period, return as-is
    const txDate = new Date(tx.tx_date)
    const monthKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`
    return [{
      ...tx,
      monthKey,
      proportionalAmount: tx.amount,
      fullAmount: tx.amount,
      daysInMonth: 0,
      totalDays: 0
    }]
  }

  const dailyRate = tx.amount / totalDays
  const splits: SplitTransaction[] = []
  
  // Iterate through each month in the period
  const current = new Date(startDate)
  current.setDate(1) // Start of month
  
  // Create a date for the end of the period month to compare
  const periodEndMonth = new Date(endDate)
  periodEndMonth.setDate(1)
  periodEndMonth.setMonth(periodEndMonth.getMonth() + 1)
  periodEndMonth.setDate(0) // Last day of end date's month
  
  while (current <= periodEndMonth) {
    const year = current.getFullYear()
    const month = current.getMonth()
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
    
    // Calculate the first and last day of this month that are within the period
    const monthStart = new Date(year, month, 1)
    monthStart.setHours(0, 0, 0, 0)
    const monthEnd = new Date(year, month + 1, 0) // Last day of month
    monthEnd.setHours(23, 59, 59, 999) // Set to end of day
    
    const overlapStart = new Date(Math.max(startDate.getTime(), monthStart.getTime()))
    const overlapEnd = new Date(Math.min(endDate.getTime(), monthEnd.getTime()))
    
    if (overlapStart <= overlapEnd) {
      const daysInMonth = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
      const proportionalAmount = dailyRate * daysInMonth
      
      splits.push({
        ...tx,
        monthKey,
        proportionalAmount,
        fullAmount: tx.amount,
        daysInMonth,
        totalDays
      })
    }
    
    // Move to next month
    current.setMonth(month + 1)
  }
  
  // Normalize to ensure sum equals original amount (fix rounding errors)
  if (splits.length > 0) {
    const totalProportional = splits.reduce((sum, split) => sum + split.proportionalAmount, 0)
    const difference = tx.amount - totalProportional
    
    // Adjust the last split to account for any rounding differences
    if (Math.abs(difference) > 0.0001) {
      splits[splits.length - 1].proportionalAmount += difference
    }
  }
  
  return splits
}

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { items: suppliers } = useAppSelector(s => s.suppliers)
  const me = useAppSelector(s => s.auth.me)
  const isAdmin = me?.role === 'Admin'
  const [txs, setTxs] = useState<Transaction[]>([])
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([])
  const [projectBudgets, setProjectBudgets] = useState<BudgetWithSpending[]>([])
  const [projectName, setProjectName] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [chartsLoading, setChartsLoading] = useState(false)
  const [projectImageUrl, setProjectImageUrl] = useState<string | null>(null)
  const [contractFileUrl, setContractFileUrl] = useState<string | null>(null)
  const [showContractModal, setShowContractModal] = useState(false)
  const [projectBudget, setProjectBudget] = useState<{ budget_monthly: number; budget_annual: number }>({ budget_monthly: 0, budget_annual: 0 })
  const [projectStartDate, setProjectStartDate] = useState<string | null>(null)
  const [projectEndDate, setProjectEndDate] = useState<string | null>(null)
  const [availableCategories, setAvailableCategories] = useState<string[]>([])
  const [isParentProject, setIsParentProject] = useState<boolean>(false)
  const [relationProject, setRelationProject] = useState<number | null>(null) // Parent project ID if this is a subproject
  const [subprojects, setSubprojects] = useState<Array<{ id: number; name: string; is_active: boolean }>>([])
  const [subprojectsLoading, setSubprojectsLoading] = useState<boolean>(false)
  const [showEditProjectModal, setShowEditProjectModal] = useState(false)
  const [editingProject, setEditingProject] = useState<any | null>(null)
  const [showArchiveDeleteModal, setShowArchiveDeleteModal] = useState(false)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deletePasswordError, setDeletePasswordError] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  const [filterType, setFilterType] = useState<'all' | 'Income' | 'Expense'>('all')
  const [filterExceptional, setFilterExceptional] = useState<'all' | 'only'>('all')
  const [dateFilterMode, setDateFilterMode] = useState<'current_month' | 'selected_month' | 'date_range' | 'all_time'>('current_month')
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  
  // Financial Summary Filter State
  const [financialFilterMode, setFinancialFilterMode] = useState<'month' | 'year' | 'project' | 'custom'>('month')
  const [financialSelectedMonth, setFinancialSelectedMonth] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [financialSelectedYear, setFinancialSelectedYear] = useState<number>(new Date().getFullYear())
  const [financialCustomStart, setFinancialCustomStart] = useState<string>('')
  const [financialCustomEnd, setFinancialCustomEnd] = useState<string>('')
  
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [filterDated, setFilterDated] = useState<'all' | 'only'>('all')

  const [editTransactionModalOpen, setEditTransactionModalOpen] = useState(false)
  const [selectedTransactionForEdit, setSelectedTransactionForEdit] = useState<any | null>(null)
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<'all' | 'regular' | 'recurring'>('all')
  const [editTemplateModalOpen, setEditTemplateModalOpen] = useState(false)
  const [selectedTemplateForEdit, setSelectedTemplateForEdit] = useState<RecurringTransactionTemplate | null>(null)
  const [pendingTemplateLoad, setPendingTemplateLoad] = useState(false)
  const [recurringTemplates, setRecurringTemplates] = useState<RecurringTransactionTemplate[]>([])

  const loadRecurringTemplates = async () => {
    if (!id || isNaN(Number(id))) return
    try {
      const templates = await RecurringTransactionAPI.getProjectRecurringTemplates(parseInt(id))
      setRecurringTemplates(templates)
    } catch (err) {
      console.error('Failed to load recurring templates', err)
    }
  }

  useEffect(() => {
    if (!me) dispatch(fetchMe())
  }, [dispatch, me])

  useEffect(() => {
    if (transactionTypeFilter === 'recurring') {
      loadRecurringTemplates()
    }
  }, [transactionTypeFilter, id])

  // Ensure modal stays open when template loads
  useEffect(() => {
    if (selectedTemplateForEdit && pendingTemplateLoad && editTemplateModalOpen) {
      // Template loaded, clear pending flag
      setPendingTemplateLoad(false)
    }
  }, [selectedTemplateForEdit, pendingTemplateLoad, editTemplateModalOpen])

  // Generate recurring transactions for selected month, date range, or all_time when user changes filter
  useEffect(() => {
    if (!id || isNaN(Number(id))) return

    const generateForSelectedPeriod = async () => {
      try {
        if (dateFilterMode === 'selected_month' && selectedMonth) {
          // First, ensure all transactions up to current month are generated (optimized single API call)
          try {
            await RecurringTransactionAPI.ensureProjectTransactionsGenerated(parseInt(id))
          } catch (genErr) {
            // Silently fail - transactions might already exist
            console.log('Could not ensure recurring transactions:', genErr)
          }
          
          // Then, generate for selected month if it's in the future
          const [year, month] = selectedMonth.split('-').map(Number)
          const selectedDate = new Date(year, month - 1, 1)
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          selectedDate.setHours(0, 0, 0, 0)
          
          // If selected month is in the future, generate transactions for it
          if (selectedDate > today) {
            try {
              await RecurringTransactionAPI.generateMonthlyTransactions(year, month)
            } catch (genErr) {
              // Silently fail - transactions might already exist
              console.log('Could not generate recurring transactions for selected month:', genErr)
            }
          }
        } else if (dateFilterMode === 'date_range' && startDate && endDate) {
          // Ensure all recurring transactions are generated (only missing ones)
          // This will generate from template start_date to current month, which includes the date range
          try {
            await RecurringTransactionAPI.ensureProjectTransactionsGenerated(parseInt(id))
          } catch (genErr) {
            // Silently fail - transactions might already exist
            console.log('Could not generate recurring transactions:', genErr)
          }
        } else if (dateFilterMode === 'all_time') {
          // Ensure all recurring transactions are generated (only missing ones)
          try {
            await RecurringTransactionAPI.ensureProjectTransactionsGenerated(parseInt(id))
          } catch (genErr) {
            // Silently fail - transactions might already exist
            console.log('Could not generate recurring transactions:', genErr)
          }
        } else if (dateFilterMode === 'current_month') {
          // Ensure all recurring transactions are generated (only missing ones)
          try {
            await RecurringTransactionAPI.ensureProjectTransactionsGenerated(parseInt(id))
          } catch (genErr) {
            // Silently fail - transactions might already exist
            console.log('Could not generate recurring transactions:', genErr)
          }
        }
        
        // Reload transactions to show the newly generated ones (except for current_month which is handled by load())
        if (dateFilterMode !== 'current_month') {
          const { data } = await api.get(`/transactions/project/${id}`)
          setTxs(data || [])
        }
      } catch (err) {
        // Silently fail - transactions might already exist or there might be no active templates
        console.log('Could not generate recurring transactions:', err)
      }
    }

    generateForSelectedPeriod()
  }, [selectedMonth, dateFilterMode, startDate, endDate, id])
  const [showRecurringSelectionModal, setShowRecurringSelectionModal] = useState(false)
  const [showCreateTransactionModal, setShowCreateTransactionModal] = useState(false)
  const [showDocumentsModal, setShowDocumentsModal] = useState(false)
  const [selectedTransactionForDocuments, setSelectedTransactionForDocuments] = useState<any | null>(null)
  const [transactionDocuments, setTransactionDocuments] = useState<any[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<any | null>(null)
  const [showDescriptionModal, setShowDescriptionModal] = useState(false)
  const [uploadedDocuments, setUploadedDocuments] = useState<Array<{id: number, fileName: string, description: string}>>([])
  const [budgetDeleteLoading, setBudgetDeleteLoading] = useState<number | null>(null)
  const [showAddBudgetForm, setShowAddBudgetForm] = useState(false)
  const [budgetSaving, setBudgetSaving] = useState(false)
  const [budgetFormError, setBudgetFormError] = useState<string | null>(null)
  const [newBudgetForm, setNewBudgetForm] = useState({
    category: '',
    amount: '',
    period_type: 'Annual' as 'Annual' | 'Monthly',
    start_date: new Date().toISOString().split('T')[0],
    end_date: ''
  })
  const [showEditBudgetForm, setShowEditBudgetForm] = useState(false)
  const [budgetToEdit, setBudgetToEdit] = useState<BudgetWithSpending | null>(null)
  const [editBudgetForm, setEditBudgetForm] = useState({
    category: '',
    amount: '',
    period_type: 'Annual' as 'Annual' | 'Monthly',
    start_date: '',
    end_date: '',
    is_active: true
  })
  const [editBudgetSaving, setEditBudgetSaving] = useState(false)
  const [editBudgetError, setEditBudgetError] = useState<string | null>(null)
  // Load categories from database (only categories defined in settings)
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const categories = await CategoryAPI.getCategories()
        const categoryNames = categories.filter(cat => cat.is_active).map(cat => cat.name)
        setAvailableCategories(categoryNames)
        // Set default category for budget form if available
        if (categoryNames.length > 0 && !newBudgetForm.category) {
          setNewBudgetForm(prev => ({ ...prev, category: categoryNames[0] }))
        }
      } catch (err) {
        console.error('Error loading categories:', err)
        setAvailableCategories([])
      }
    }
    loadCategories()
  }, [])
  
  // Use only categories from database (settings) - these are the only valid options
  const allCategoryOptions = availableCategories
  
  
  // Fund state
  const [fundData, setFundData] = useState<{
    current_balance: number
    monthly_amount: number
    last_monthly_addition: string | null
    initial_balance: number
    initial_total: number
    total_additions: number
    total_deductions: number
    transactions: Array<{
      id: number
      tx_date: string
      type: string
      amount: number
      description: string | null
      category: string | null
      notes: string | null
      created_by_user: {
        id: number
        full_name: string
        email: string
      } | null
      file_path: string | null
      documents_count: number
    }>
  } | null>(null)
  const [hasFund, setHasFund] = useState(false)
  const [fundLoading, setFundLoading] = useState(false)
  const [fundCategoryFilter] = useState<string>('all')
  const [transactionsExpandedId, setTransactionsExpandedId] = useState<number | null>(null)
  const [showFundTransactionsModal, setShowFundTransactionsModal] = useState(false)
  const [showCreateFundModal, setShowCreateFundModal] = useState(false)
  const [showEditFundModal, setShowEditFundModal] = useState(false)
  const [monthlyFundAmount, setMonthlyFundAmount] = useState<number>(0)
  const [currentBalance, setCurrentBalance] = useState<number>(0)
  const [creatingFund, setCreatingFund] = useState(false)
  const [updatingFund, setUpdatingFund] = useState(false)
  
  // Contract periods state
  const [contractPeriods, setContractPeriods] = useState<{
    project_id: number
    periods_by_year: Array<{
      year: number
      periods: Array<{
        period_id: number
        start_date: string
        end_date: string
        year_index: number
        year_label: string
        total_income: number
        total_expense: number
        total_profit: number
      }>
    }>
  } | null>(null)
  const [showPreviousYearsModal, setShowPreviousYearsModal] = useState(false)
  const [selectedPeriodSummary, setSelectedPeriodSummary] = useState<any | null>(null)
  const [showPeriodSummaryModal, setShowPeriodSummaryModal] = useState(false)
  const [loadingPeriodSummary, setLoadingPeriodSummary] = useState(false)

  const load = async () => {
    if (!id || isNaN(Number(id))) return

    setLoading(true)
    try {
      // Ensure all recurring transactions are generated (only missing ones - safe to call multiple times)
      try {
        await RecurringTransactionAPI.ensureProjectTransactionsGenerated(parseInt(id))
      } catch (genErr) {
        // Silently fail - transactions might already exist or there might be no templates
        console.log('Could not generate recurring transactions on load:', genErr)
      }
      
      // Then load all transactions
      const { data } = await api.get(`/transactions/project/${id}`)
      // Debug: Check if period dates are coming through
      if (data && data.length > 0) {
        console.log('Total transactions loaded:', data.length)
        const periodicTx = data.find((tx: any) => tx.period_start_date && tx.period_end_date)
        if (periodicTx) {
          console.log('✅ Found periodic transaction:', periodicTx.id, 'Period:', periodicTx.period_start_date, '-', periodicTx.period_end_date)
        } else {
          console.log('❌ No periodic transactions found. Sample transaction:', data[0] ? {id: data[0].id, has_period_start: !!data[0].period_start_date, has_period_end: !!data[0].period_end_date} : 'none')
        }
        // Log all transactions with period dates for debugging
        const allPeriodicTxs = data.filter((tx: any) => tx.period_start_date && tx.period_end_date)
        if (allPeriodicTxs.length > 0) {
          console.log('📅 All dated transactions:', allPeriodicTxs.map((tx: any) => ({
            id: tx.id,
            period_start: tx.period_start_date,
            period_end: tx.period_end_date
          })))
        }
      }
      setTxs(data || [])
    } catch (err: any) {
      setTxs([])
    } finally {
      setLoading(false)
    }
  }

  // Helper function to reload only categories and budgets (without transactions)
  const reloadChartsDataOnly = async () => {
    if (!id || isNaN(Number(id))) return
    try {
      const [categoriesData, budgetsData] = await Promise.all([
        ReportAPI.getProjectExpenseCategories(parseInt(id)),
        BudgetAPI.getProjectBudgets(parseInt(id)).catch((err) => {
          console.error('Failed to load project budgets:', err)
          return []
        })
      ])
      setExpenseCategories(categoriesData || [])
      setProjectBudgets(budgetsData || [])
    } catch (err: any) {
      console.error('Failed to reload charts data:', err)
    }
  }

  const loadChartsData = async () => {
    if (!id || isNaN(Number(id))) return

    setChartsLoading(true)
    try {
      const [categoriesData, transactionsData, budgetsData] = await Promise.all([
        ReportAPI.getProjectExpenseCategories(parseInt(id)),
        ReportAPI.getProjectTransactions(parseInt(id)),
        BudgetAPI.getProjectBudgets(parseInt(id)).catch((err) => {
          console.error('Failed to load project budgets:', err)
          return []
        })
      ])
      
      setExpenseCategories(categoriesData || [])
      
      // Update transactions with all transactions (not just contract period) for charts
      // This is needed because Charts need all transactions, not just the filtered ones from load()
      // load() filters by contract period, but Charts need everything
      // Only update if we got valid data (not empty array) to avoid clearing transactions
      if (transactionsData && Array.isArray(transactionsData) && transactionsData.length > 0) {
        setTxs(transactionsData)
      } else if (transactionsData && Array.isArray(transactionsData)) {
        // If we got empty array but txs already has data, don't overwrite
        // This prevents clearing transactions if reports API returns empty array
        // Only update if txs is currently empty
        if (txs.length === 0) {
          setTxs([])
        }
      }
      
      setProjectBudgets(budgetsData || [])
    } catch (err: any) {
      // Error loading charts data - don't clear existing transactions if error occurs
      console.error('Error loading charts data:', err)
      // Keep existing txs - don't clear them on error
    } finally {
      setChartsLoading(false)
    }
  }

const formatCurrency = (value: number | string | null | undefined) => {
  return Number(value || 0).toLocaleString('he-IL')
}

const formatDate = (value: string | null) => {
    try {
      return value ? new Date(value).toLocaleDateString('he-IL') : 'לא הוגדר'
    } catch {
      return 'לא הוגדר'
    }
  }

  const resolveFileUrl = (fileUrl: string | null | undefined): string | null => {
    if (!fileUrl) return null
    if (fileUrl.startsWith('http')) {
      return fileUrl
    }
    const apiUrl = import.meta.env.VITE_API_URL || ''
    // @ts-ignore
    const baseUrl = apiUrl ? apiUrl.replace('/api/v1', '') : ''
    return `${baseUrl}/uploads/${fileUrl}`
  }

  useEffect(() => {
    if (!contractFileUrl) {
      setShowContractModal(false)
    }
  }, [contractFileUrl])

  const isOfficeDocument = (fileUrl: string | null): boolean => {
    if (!fileUrl) return false
    return /\.docx?$/i.test(fileUrl.split('?')[0] || '')
  }

  const isInlinePreviewSupported = (fileUrl: string | null): boolean => {
    if (!fileUrl) return false
    return /\.(pdf|png|jpe?g|gif|webp)$/i.test(fileUrl.split('?')[0] || '')
  }

  const getContractViewerUrl = (): string | null => {
    if (!contractFileUrl) return null
    if (isInlinePreviewSupported(contractFileUrl)) {
      return contractFileUrl
    }
    if (isOfficeDocument(contractFileUrl)) {
      return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(contractFileUrl)}`
    }
    return null
  }

  const handleEditProject = async () => {
    if (!id || isNaN(Number(id))) return
    try {
      // Use the same API call that loadProjectInfo uses for consistency
      const { data } = await api.get(`/projects/${id}`)
      setEditingProject(data)
      setShowEditProjectModal(true)
    } catch (err: any) {
      alert('שגיאה בטעינת פרטי הפרויקט: ' + (err.response?.data?.detail || err.message))
    }
  }

  const handleProjectUpdateSuccess = async () => {
    await loadProjectInfo()
    setShowEditProjectModal(false)
    setEditingProject(null)
  }

  const handleArchiveDeleteClick = () => {
    setShowArchiveDeleteModal(true)
  }

  const handleArchive = async () => {
    if (!id || isNaN(Number(id))) return
    try {
      await dispatch(archiveProject(Number(id))).unwrap()
      setShowArchiveDeleteModal(false)
      navigate('/dashboard')
    } catch (err: any) {
      alert('שגיאה בארכוב הפרויקט: ' + (err || 'Unknown error'))
    }
  }

  const handleDeleteChoice = () => {
    setShowArchiveDeleteModal(false)
    setShowDeleteConfirmModal(true)
  }

  const handleDeleteConfirm = async () => {
    if (!id || isNaN(Number(id))) return
    if (!deletePassword) {
      setDeletePasswordError('נא להזין סיסמה')
      return
    }
    
    setIsDeleting(true)
    setDeletePasswordError('')
    
    try {
      await dispatch(hardDeleteProject({ id: Number(id), password: deletePassword })).unwrap()
      setShowDeleteConfirmModal(false)
      setDeletePassword('')
      navigate('/dashboard')
    } catch (err: any) {
      setDeletePasswordError(err || 'סיסמה שגויה או שגיאה במחיקה')
    } finally {
      setIsDeleting(false)
    }
  }

  const loadProjectInfo = async () => {
    if (!id || isNaN(Number(id))) return

    try {
      // First check and renew contract if needed
      try {
        await ProjectAPI.checkAndRenewContract(parseInt(id))
      } catch (err) {
        // Ignore errors in renewal check
        console.log('Contract renewal check:', err)
      }
      
      const { data } = await api.get(`/projects/${id}`)
      
      console.log('📥 DEBUG - Project data loaded:', {
        id,
        name: data.name,
        start_date: data.start_date,
        end_date: data.end_date,
        budget_monthly: data.budget_monthly,
        budget_annual: data.budget_annual
      })
      
      setProjectName(data.name || `פרויקט ${id}`)
      setProjectBudget({
        budget_monthly: data.budget_monthly || 0,
        budget_annual: data.budget_annual || 0
      })
      setProjectStartDate(data.start_date || null)
      setProjectEndDate(data.end_date || null)
      setIsParentProject(data.is_parent_project || false)
      setRelationProject(data.relation_project || null)

      console.log('📥 DEBUG - State set:', {
        projectStartDate: data.start_date || null,
        projectEndDate: data.end_date || null,
        budgetMonthly: data.budget_monthly || 0,
        isParentProject: data.is_parent_project || false
      })

      // Load subprojects if this is a parent project
      if (data.is_parent_project) {
        await loadSubprojects()
      } else {
        setSubprojects([])
      }

      if (data.image_url) {
        // Backend now returns full S3 URL in image_url for new uploads.
        // For backward compatibility, if it's a relative path we still prefix with /uploads.
        if (data.image_url.startsWith('http')) {
          setProjectImageUrl(data.image_url)
        } else {
          const apiUrl = import.meta.env.VITE_API_URL || ''
          // @ts-ignore
          const baseUrl = apiUrl ? apiUrl.replace('/api/v1', '') : ''
          setProjectImageUrl(`${baseUrl}/uploads/${data.image_url}`)
        }
      }
      if (data.contract_file_url) {
        setContractFileUrl(resolveFileUrl(data.contract_file_url))
      } else {
        setContractFileUrl(null)
      }
      // Check if project has fund and load fund data
      const hasFundFlag = data.has_fund || false
      const monthlyFundAmount = data.monthly_fund_amount || 0
      setHasFund(hasFundFlag)
      
      // Always try to load fund data if has_fund is true (even if fund doesn't exist yet)
      if (hasFundFlag) {
        await loadFundData()
      } else {
        // Also try to load if monthly_fund_amount exists (backward compatibility)
        if (monthlyFundAmount > 0) {
          await loadFundData()
        } else {
          setFundData(null)
          setFundLoading(false)
        }
      }
      
      // Load contract periods
      await loadContractPeriods()
    } catch (err: any) {
      setProjectName(`פרויקט ${id}`)
      setProjectBudget({ budget_monthly: 0, budget_annual: 0 })
    }
  }
  
  const loadContractPeriods = async () => {
    if (!id || isNaN(Number(id))) return
    
    try {
      const periods = await ProjectAPI.getContractPeriods(parseInt(id))
      setContractPeriods(periods)
    } catch (err: any) {
      console.error('Error loading contract periods:', err)
      setContractPeriods(null)
    }
  }

  const loadSubprojects = async () => {
    if (!id || isNaN(Number(id))) return

    setSubprojectsLoading(true)
    try {
      const { data } = await api.get(`/projects/${id}/subprojects`)
      setSubprojects(data || [])
    } catch (err: any) {
      console.error('Error loading subprojects:', err)
      setSubprojects([])
    } finally {
      setSubprojectsLoading(false)
    }
  }

  const loadFundData = async () => {
    if (!id || isNaN(Number(id))) return
    
    setFundLoading(true)
    try {
      const { data } = await api.get(`/projects/${id}/fund`)
      if (data) {
        setFundData(data)
        setHasFund(true) // Ensure hasFund is set to true if fund data exists
      } else {
        setFundData(null)
      }
    } catch (err: any) {
      // If fund doesn't exist (404), that's OK - project might not have fund yet
      setFundData(null)
    } finally {
      setFundLoading(false)
    }
  }

  useEffect(() => {
    if (id && !isNaN(Number(id))) {
      loadProjectInfo()
      // Load transactions list first, then charts data
      load().then(() => {
        loadChartsData()
      })
    }
  }, [id])

  useEffect(() => {
    dispatch(fetchSuppliers())
  }, [dispatch])

  // Reload project info when project is updated (e.g., after editing in modal or uploading image)
  useEffect(() => {
    const handleProjectUpdated = (event: Event) => {
      const customEvent = event as CustomEvent
      if (customEvent.detail?.projectId && id && customEvent.detail.projectId === parseInt(id)) {
        // Reload all data: project info, transactions, charts, and fund data
        loadProjectInfo().then(() => {
          load().then(() => {
            loadChartsData()
            // Reload fund data if project has fund
            if (hasFund) {
              loadFundData()
            }
          })
        })
      }
    }

    window.addEventListener('projectUpdated', handleProjectUpdated)
    return () => window.removeEventListener('projectUpdated', handleProjectUpdated)
  }, [id, hasFund])

  const handleDeleteBudget = async (budgetId: number) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את התקציב?')) {
      return
    }
    try {
      setBudgetDeleteLoading(budgetId)
      await BudgetAPI.deleteBudget(budgetId)
      await reloadChartsDataOnly() // Only reload budgets and categories, not transactions
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'שגיאה במחיקת התקציב')
    } finally {
      setBudgetDeleteLoading(null)
    }
  }

  const handleAddBudget = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!id) return
    if (!newBudgetForm.amount || Number(newBudgetForm.amount) <= 0) {
      setBudgetFormError('יש להזין סכום חיובי')
      return
    }
    if (!newBudgetForm.start_date) {
      setBudgetFormError('יש לבחור תאריך התחלה')
      return
    }

    // Check if budget already exists for this category
    const existingBudget = projectBudgets.find(
      budget => budget.category === newBudgetForm.category
    )
    if (existingBudget) {
      setBudgetFormError(`כבר קיים תקציב לקטגוריה "${newBudgetForm.category}". ניתן לערוך את התקציב הקיים או למחוק אותו לפני יצירת תקציב חדש.`)
      return
    }

    try {
      setBudgetSaving(true)
      setBudgetFormError(null)
      await BudgetAPI.createBudget({
        project_id: parseInt(id),
        category: newBudgetForm.category,
        amount: Number(newBudgetForm.amount),
        period_type: newBudgetForm.period_type,
        start_date: newBudgetForm.start_date,
        end_date: newBudgetForm.period_type === 'Annual' ? (newBudgetForm.end_date || null) : null
      })
      await reloadChartsDataOnly() // Only reload budgets and categories, not transactions
      setShowAddBudgetForm(false)
      setNewBudgetForm({
        category: '',
        amount: '',
        period_type: 'Annual',
        start_date: newBudgetForm.start_date,
        end_date: ''
      })
    } catch (err: any) {
      setBudgetFormError(err?.response?.data?.detail || 'שגיאה ביצירת התקציב')
    } finally {
      setBudgetSaving(false)
    }
  }

  const handleStartEditBudget = (budget: BudgetWithSpending) => {
    const normalizedStart = budget.start_date ? budget.start_date.slice(0, 10) : ''
    const normalizedEnd = budget.end_date ? budget.end_date.slice(0, 10) : ''
    setBudgetToEdit(budget)
    setEditBudgetError(null)
    setEditBudgetForm({
      category: budget.category,
      amount: Number(budget.base_amount ?? budget.amount).toString(),
      period_type: budget.period_type,
      start_date: normalizedStart,
      end_date: normalizedEnd,
      is_active: budget.is_active
    })
    setShowEditBudgetForm(true)
  }

  const handleUpdateBudget = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!budgetToEdit) return
    if (!editBudgetForm.category) {
      setEditBudgetError('יש לבחור קטגוריה')
      return
    }
    const parsedAmount = Number(editBudgetForm.amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setEditBudgetError('יש להזין סכום חיובי')
      return
    }
    if (!editBudgetForm.start_date) {
      setEditBudgetError('יש לבחור תאריך התחלה')
      return
    }
    try {
      setEditBudgetSaving(true)
      setEditBudgetError(null)
      await BudgetAPI.updateBudget(budgetToEdit.id, {
        category: editBudgetForm.category,
        amount: parsedAmount,
        period_type: editBudgetForm.period_type,
        start_date: editBudgetForm.start_date,
        end_date: editBudgetForm.period_type === 'Annual' ? (editBudgetForm.end_date || null) : null,
        is_active: editBudgetForm.is_active
      })
      await reloadChartsDataOnly() // Only reload budgets and categories, not transactions
      setShowEditBudgetForm(false)
      setBudgetToEdit(null)
    } catch (err: any) {
      setEditBudgetError(err?.response?.data?.detail || 'שגיאה בעדכון התקציב')
    } finally {
      setEditBudgetSaving(false)
    }
  }


  const handleEditAnyTransaction = async (transaction: Transaction) => {
    // If it's a recurring transaction (has recurring_template_id), always ask the user whether to edit the instance or the template
    // Check both is_generated and recurring_template_id to catch all recurring transactions
    if (transaction.recurring_template_id || transaction.is_generated) {
      setSelectedTransactionForEdit(transaction)
      setShowRecurringSelectionModal(true)
      return
    }
    
    setSelectedTransactionForEdit(transaction)
    setEditTransactionModalOpen(true)
  }
  
  // Selection Modal Handler
  const handleEditRecurringSelection = async (mode: 'instance' | 'series') => {
      if (!selectedTransactionForEdit) {
        setShowRecurringSelectionModal(false)
        return
      }

      if (mode === 'instance') {
           // Close selection modal and open edit transaction modal
           setShowRecurringSelectionModal(false)
           setEditTransactionModalOpen(true)
      } else {
           // Series mode - edit the entire template
           try {
             let templateId = selectedTransactionForEdit.recurring_template_id
             
             // If templateId is not found, try to find it by matching transaction details
             if (!templateId) {
               try {
                 // Load all templates for the project
                 const templates = await RecurringTransactionAPI.getProjectRecurringTemplates(parseInt(id || '0'))
                 // Find matching template by description, amount, supplier, and type
                 const matchingTemplate = templates.find(t => 
                   t.description === selectedTransactionForEdit.description &&
                   t.amount === selectedTransactionForEdit.amount &&
                   t.type === selectedTransactionForEdit.type &&
                   (t.supplier_id === selectedTransactionForEdit.supplier_id || 
                    (!t.supplier_id && !selectedTransactionForEdit.supplier_id))
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
                 setShowRecurringSelectionModal(false)
                 return
             }
             
             // Close selection modal first
             setShowRecurringSelectionModal(false)
             
             // Set pending flag and open modal (will show loading state)
             setPendingTemplateLoad(true)
             setEditTemplateModalOpen(true)
             
             // Then load the template
             const templateResponse = await RecurringTransactionAPI.getTemplate(templateId)
             // The API returns template with generated_transactions, but we only need the template part
             // Extract just the template properties (exclude generated_transactions if it exists)
             const { generated_transactions, ...templateData } = templateResponse as any
             // Set the template - this will trigger the form to load
             setSelectedTemplateForEdit(templateData as RecurringTransactionTemplate)
             setPendingTemplateLoad(false)
           } catch (err: any) {
             console.error('Failed to fetch template', err)
             setPendingTemplateLoad(false)
             setEditTemplateModalOpen(false)
             setShowRecurringSelectionModal(false)
             alert('שגיאה בטעינת פרטי המחזוריות: ' + (err.response?.data?.detail || err.message))
           }
      }
  }


  // Filter transactions based on date filter mode
  const currentDate = new Date()
  const currentMonth = currentDate.getMonth() + 1
  const currentYear = currentDate.getFullYear()

  const filtered = txs.filter(t => {
    // Filter by transaction type
    if (transactionTypeFilter === 'regular' && t.is_generated) {
      return false
    }
    if (transactionTypeFilter === 'recurring' && !t.is_generated) {
      return false
    }

    // Exclude fund transactions from the list
    if (t.from_fund === true) {
      return false
    }
    
    const txDate = new Date(t.tx_date)
    
    // Project date filtering removed to allow viewing all transactions
    // The user can filter by date using the date filter controls
    /*
    // First filter by current contract period (if project has start_date and end_date)
    let inCurrentContractPeriod = true
    if (projectStartDate && projectEndDate) {
      const contractStart = new Date(projectStartDate)
      const contractEnd = new Date(projectEndDate)
      inCurrentContractPeriod = txDate >= contractStart && txDate <= contractEnd
    }
    
    // If transaction is not in current contract period, exclude it
    if (!inCurrentContractPeriod) {
      return false
    }
    */
    
    let dateMatches = false

    // For period transactions, check if the period overlaps with the filter range
    if (t.period_start_date && t.period_end_date) {
      const periodStart = new Date(t.period_start_date)
      const periodEnd = new Date(t.period_end_date)
      
      if (dateFilterMode === 'current_month') {
        // Check if period overlaps with current month
        const monthStart = new Date(currentYear, currentMonth - 1, 1)
        const monthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999)
        dateMatches = periodStart <= monthEnd && periodEnd >= monthStart
      } else if (dateFilterMode === 'selected_month') {
        // Check if period overlaps with selected month
        const [year, month] = selectedMonth.split('-').map(Number)
        const monthStart = new Date(year, month - 1, 1)
        const monthEnd = new Date(year, month, 0, 23, 59, 59, 999)
        dateMatches = periodStart <= monthEnd && periodEnd >= monthStart
      } else if (dateFilterMode === 'date_range') {
        // Check if period overlaps with date range
        if (startDate && endDate) {
          const rangeStart = new Date(startDate)
          const rangeEnd = new Date(endDate)
          rangeEnd.setHours(23, 59, 59, 999)
          dateMatches = periodStart <= rangeEnd && periodEnd >= rangeStart
        } else {
          dateMatches = true // Show all if dates not set
        }
      } else if (dateFilterMode === 'all_time') {
        dateMatches = true
      } else {
        dateMatches = true // Show all if no date filter mode
      }
    } else {
      // Regular transaction - check tx_date
      if (dateFilterMode === 'current_month') {
        // Show only current month
        const txMonth = txDate.getMonth() + 1
        const txYear = txDate.getFullYear()
        dateMatches = txMonth === currentMonth && txYear === currentYear
      } else if (dateFilterMode === 'selected_month') {
        // Show selected month
        const [year, month] = selectedMonth.split('-').map(Number)
        const txMonth = txDate.getMonth() + 1
        const txYear = txDate.getFullYear()
        dateMatches = txMonth === month && txYear === year
      } else if (dateFilterMode === 'date_range') {
        // Show date range
        if (startDate && endDate) {
          // Use string comparison to avoid timezone issues with Date objects
          // tx_date is YYYY-MM-DD, startDate/endDate are YYYY-MM-DD
          const txDateStr = typeof t.tx_date === 'string' ? t.tx_date.split('T')[0] : new Date(t.tx_date).toISOString().split('T')[0]
          dateMatches = txDateStr >= startDate && txDateStr <= endDate
        } else {
          dateMatches = true // Show all if dates not set
        }
      } else if (dateFilterMode === 'all_time') {
        dateMatches = true
      } else {
        dateMatches = true // Show all if no date filter mode
      }
    }
    
    // Category filter: if 'all', show all transactions
    // Otherwise, match by category (handle both Hebrew and English categories)
    let categoryMatches = true
    if (categoryFilter && categoryFilter !== 'all') {
      const catName = getCategoryName(t.category)
      const txCategory = normalizeCategoryForFilter(catName)
      const filterCategory = normalizeCategoryForFilter(categoryFilter)
      // Match if normalized categories are equal, or if original categories match
      const normalizedMatch: boolean = txCategory !== null && filterCategory !== null && txCategory === filterCategory
      const directMatch: boolean = !!(catName && String(catName).trim() === String(categoryFilter).trim())
      categoryMatches = normalizedMatch || directMatch
    }
    
    // Exceptional filter: if 'all', show all; if 'only', show only exceptional
    const exceptionalMatches = filterExceptional === 'all' || 
      (filterExceptional === 'only' && t.is_exceptional === true)
    
    // Dated transactions filter: if 'all', show all; if 'only', show only dated transactions
    const datedMatches = filterDated === 'all' || 
      (filterDated === 'only' && t.period_start_date && t.period_end_date)
    
    // Type filter
    const typeMatches = filterType === 'all' || t.type === filterType
    
    const result = dateMatches && typeMatches && exceptionalMatches && categoryMatches && datedMatches
    
    return result
  })
  
  // Expand period transactions into monthly splits for display
  // When filtering by month, show each period transaction split by month with proportional amounts
  const expandedTransactions = useMemo(() => {
    const expanded: (Transaction & { monthKey?: string; proportionalAmount?: number; fullAmount?: number; daysInMonth?: number; totalDays?: number })[] = []
    
    filtered.forEach(tx => {
      // If it's a period transaction, always split it by month
      if (tx.period_start_date && tx.period_end_date) {
        const splits = splitPeriodTransactionByMonth(tx)
        
        console.log('📅 Period transaction split:', {
          txId: tx.id,
          amount: tx.amount,
          period: `${tx.period_start_date} - ${tx.period_end_date}`,
          splits: splits.map(s => ({
            month: s.monthKey,
            proportional: s.proportionalAmount,
            full: s.fullAmount,
            days: s.daysInMonth,
            totalDays: s.totalDays
          }))
        })
        
        // If filtering by month, show only the relevant month
        if (dateFilterMode === 'current_month') {
          const currentMonthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`
          const monthSplit = splits.find(s => s.monthKey === currentMonthKey)
          if (monthSplit) {
            expanded.push(monthSplit)
          }
        } else if (dateFilterMode === 'selected_month' && selectedMonth) {
          const monthSplit = splits.find(s => s.monthKey === selectedMonth)
          if (monthSplit) {
            expanded.push(monthSplit)
          }
        } else if (dateFilterMode === 'date_range' && startDate && endDate) {
          // For date range, show all splits that fall within the range
          const rangeStart = new Date(startDate)
          const rangeEnd = new Date(endDate)
          splits.forEach(split => {
            const splitMonth = new Date(split.monthKey + '-01')
            const monthStart = new Date(splitMonth.getFullYear(), splitMonth.getMonth(), 1)
            const monthEnd = new Date(splitMonth.getFullYear(), splitMonth.getMonth() + 1, 0)
            
            // Check if this month overlaps with the date range
            if (monthStart <= rangeEnd && monthEnd >= rangeStart) {
              expanded.push(split)
            }
          })
        } else {
          // For 'all_time' or no filter, show all splits
          expanded.push(...splits)
        }
      } else {
        // Regular transaction - add as-is
        expanded.push(tx)
      }
    })
    
    console.log('📊 Expanded transactions:', {
      total: expanded.length,
      withProportional: expanded.filter(t => (t as any).proportionalAmount !== undefined).length,
      periodSplits: expanded.filter(t => (t as any).proportionalAmount !== undefined).map(t => ({
        id: t.id,
        month: (t as any).monthKey,
        proportional: (t as any).proportionalAmount,
        full: (t as any).fullAmount
      }))
    })
    
    return expanded
  }, [filtered, dateFilterMode, currentMonth, currentYear, selectedMonth, startDate, endDate])
  
  // Calculate how many transactions match category (regardless of date filter)
  const transactionsMatchingCategory = categoryFilter === 'all' 
    ? txs.filter(t => !t.from_fund).length 
    : txs.filter(t => {
        // First filter out fund transactions
        if (t.from_fund === true) return false
        
        const catName = getCategoryName(t.category)
        const txCategory = normalizeCategoryForFilter(catName)
        const filterCategory = normalizeCategoryForFilter(categoryFilter)
        return (txCategory !== null && filterCategory !== null && txCategory === filterCategory) ||
               (catName && String(catName).trim() === String(categoryFilter).trim())
      }).length



  const loadTransactionsOnly = async () => {
    // Load transactions without regenerating recurring transactions
    if (!id || isNaN(Number(id))) return
    
    try {
      const { data } = await api.get(`/transactions/project/${id}`)
      setTxs(data || [])
    } catch (err: any) {
      setTxs([])
    }
  }

  const handleDeleteTransaction = async (transactionId: number, transaction?: Transaction) => {
    // Check if this is a recurring transaction instance
    const isRecurring = transaction?.recurring_template_id || transaction?.is_generated
    
    const confirmMessage = isRecurring 
      ? 'האם אתה בטוח שברצונך למחוק את העסקה הזו? פעולה זו תמחק רק את העסקה הספציפית הזו ולא תשפיע על התבנית החוזרת.'
      : 'האם אתה בטוח שברצונך למחוק את העסקה?'
    
    if (!confirm(confirmMessage)) {
      return
    }
    
    try {
      // Use the appropriate endpoint based on whether it's a recurring transaction
      if (isRecurring) {
        await RecurringTransactionAPI.deleteTransactionInstance(transactionId)
        // For recurring transactions, only reload transactions without regenerating
        // to prevent recreating the deleted instance
        await loadTransactionsOnly()
      } else {
        await api.delete(`/transactions/${transactionId}`)
        await load() // For regular transactions, use full load
      }
      // Only reload charts data (categories and budgets), not transactions (already loaded by load())
      // This avoids duplicate transaction loading
      await reloadChartsDataOnly()
      
      if (hasFund) {
        await loadFundData() // Reload fund data
      }
    } catch (err: any) {
      alert(err.response?.data?.detail ?? 'שגיאה במחיקת העסקה')
    }
  }

  // Calculate income and expense from project start_date until now (or end_date if contract has ended)
  // Only actual transactions are counted - budget is NOT included in income
  // This is separate from the filtered transactions which are used for the transactions list
  // Transactions are filtered by current contract period (start_date to end_date)
  const calculateFinancialSummary = () => {
    const now = new Date()
    
    let calculationStartDate: Date
    let calculationEndDate: Date

    if (financialFilterMode === 'month') {
        const [year, month] = financialSelectedMonth.split('-').map(Number)
        calculationStartDate = new Date(year, month - 1, 1)
        calculationEndDate = new Date(year, month, 0, 23, 59, 59, 999)
    } else if (financialFilterMode === 'year') {
        calculationStartDate = new Date(financialSelectedYear, 0, 1)
        calculationEndDate = new Date(financialSelectedYear, 11, 31, 23, 59, 59, 999)
    } else if (financialFilterMode === 'custom') {
         calculationStartDate = financialCustomStart ? new Date(financialCustomStart) : new Date(0)
         const customEnd = financialCustomEnd ? new Date(financialCustomEnd) : new Date()
         customEnd.setHours(23, 59, 59, 999)
         calculationEndDate = customEnd
    } else {
        // 'project' / default behavior
        if (projectStartDate) {
          calculationStartDate = new Date(projectStartDate)
        } else {
          // Fallback: use 1 year ago if no project start date
          const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
          calculationStartDate = oneYearAgo
        }
        
        // Calculate end date: use project.end_date if available and in the past, otherwise use now
        // This ensures we only count transactions from the current contract period
        calculationEndDate = now
        if (projectEndDate) {
          const endDate = new Date(projectEndDate)
          // If contract has ended, use end_date; otherwise use now
          calculationEndDate = endDate < now ? endDate : now
        }
    }
    
    // Debug: Check all transactions
    console.log('🔍 DEBUG - All transactions:', {
      totalTxs: txs.length,
      incomeTxs: txs.filter(t => t.type === 'Income').length,
      expenseTxs: txs.filter(t => t.type === 'Expense').length,
      incomeTxsList: txs.filter(t => t.type === 'Income').map(t => ({ id: t.id, amount: t.amount, date: t.tx_date, from_fund: t.from_fund })),
      projectStartDate,
      projectEndDate,
      calculationStartDate: calculationStartDate.toISOString(),
      calculationEndDate: calculationEndDate.toISOString()
    })
    
    // Filter transactions from calculationStartDate to calculationEndDate (current contract period only)
    // Exclude fund transactions (from_fund == true) - only include regular transactions
    // For period transactions, check if the period overlaps with the calculation range
    const summaryTransactions = txs.filter(t => {
      const isNotFromFund = !(t.from_fund === true)  // Exclude fund transactions
      if (!isNotFromFund) return false
      
      // For period transactions, check if period overlaps with calculation range
      if (t.period_start_date && t.period_end_date) {
        const periodStart = new Date(t.period_start_date)
        const periodEnd = new Date(t.period_end_date)
        // Check if periods overlap: (StartA <= EndB) and (EndA >= StartB)
        const overlaps = periodStart <= calculationEndDate && periodEnd >= calculationStartDate
        return overlaps
      } else {
        // Regular transaction - check if tx_date is in range
        const txDate = new Date(t.tx_date)
        const isInDateRange = txDate >= calculationStartDate && txDate <= calculationEndDate
        return isInDateRange
      }
    })
    
    // Calculate actual transaction income and expense (excluding fund transactions)
    // Only actual transactions are counted - budget is NOT included
    // For period transactions, use proportional amounts based on overlap with calculation period
    const incomeTransactions = summaryTransactions.filter(t => t.type === 'Income')
    const expenseTransactions = summaryTransactions.filter(t => t.type === 'Expense')
    
    console.log('🔍 DEBUG - Filtered transactions:', {
      summaryTransactionsCount: summaryTransactions.length,
      incomeTransactionsCount: incomeTransactions.length,
      expenseTransactionsCount: expenseTransactions.length,
      incomeTransactions: incomeTransactions.map(t => ({ id: t.id, amount: t.amount }))
    })
    
    const monthlyIncome = Number(projectBudget?.budget_monthly || 0)
    
    // Calculate income: regular transactions use full amount, period transactions use proportional
    const transactionIncome = incomeTransactions.reduce((s, t) => {
      if (t.period_start_date && t.period_end_date) {
        // Period transaction - calculate proportional amount
        const periodStart = new Date(t.period_start_date)
        const periodEnd = new Date(t.period_end_date)
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
        // Regular transaction - use full amount
        return s + Number(t.amount || 0)
      }
    }, 0)
    
    // Calculate expense: regular transactions use full amount, period transactions use proportional
    const transactionExpense = expenseTransactions.reduce((s, t) => {
      if (t.period_start_date && t.period_end_date) {
        // Period transaction - calculate proportional amount
        const periodStart = new Date(t.period_start_date)
        const periodEnd = new Date(t.period_end_date)
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
        // Regular transaction - use full amount
        return s + Number(t.amount || 0)
      }
    }, 0)
    
    // Calculate income from project monthly budget (treated as expected monthly income)
    // Calculate only for the current year, from project start date (or start of year if project started earlier)
    
    console.log('🔍 DEBUG - Checking project income conditions:', {
      monthlyIncome,
      calculationStartDate: calculationStartDate?.toISOString(),
      hasMonthlyIncome: monthlyIncome > 0,
      hasStartDate: !!calculationStartDate,
      allConditionsMet: !!(monthlyIncome > 0 && calculationStartDate)
    })
    
    let projectIncome = 0
    if (monthlyIncome > 0 && calculationStartDate) {
      // Use project start_date (or created_at if start_date not available) directly
      // Use calculationEndDate (which respects contract end_date if contract has ended)
      const incomeCalculationStart = calculationStartDate
      const incomeCalculationEnd = calculationEndDate  // Use calculationEndDate which respects contract period
      projectIncome = calculateMonthlyIncomeAccrual(monthlyIncome, incomeCalculationStart, incomeCalculationEnd)
      
      console.log('✅ DEBUG - Project income calculation:', {
        monthlyIncome,
        calculationStartDate: calculationStartDate.toISOString(),
        incomeCalculationStart: incomeCalculationStart.toISOString(),
        incomeCalculationEnd: incomeCalculationEnd.toISOString(),
        monthlyOccurrences: monthlyIncome > 0 ? projectIncome / monthlyIncome : 0,
        projectIncome
      })
    } else {
      console.log('❌ DEBUG - Project income NOT calculated because:', {
        missingMonthlyIncome: !(monthlyIncome > 0),
        missingStartDate: !calculationStartDate
      })
    }
    
    // Total income logic:
    // If we have a monthly budget (projectIncome > 0), we normally show the accrued income.
    // However, if we also have actual transactions, we want to make sure we don't double count,
    // but also don't hide actual income if it exceeds the budget or if budget calculation returns 0.
    // If projectIncome is 0 (e.g. no start date), we show transactionIncome.
    // If both exist, we show the larger of the two (Accrued vs Actual) to reflect value.
    const totalIncome = monthlyIncome > 0 ? Math.max(transactionIncome, projectIncome) : transactionIncome
    
    console.log('🔍 DEBUG - Final calculation:', {
      transactionIncome,
      projectIncome,
      totalIncome,
      transactionExpense
    })
    
    return {
      income: totalIncome,
      expense: transactionExpense
    }
  }
  
  // Use useMemo to recalculate only when txs, projectStartDate, projectEndDate, or projectBudget change
  const financialSummary = useMemo(() => {
    console.log('🔄 useMemo triggered - recalculating financial summary', {
      txsCount: txs.length,
      projectStartDate,
      projectEndDate,
      projectBudget,
      financialFilterMode,
      financialSelectedMonth,
      financialSelectedYear,
      financialCustomStart,
      financialCustomEnd
    })
    return calculateFinancialSummary()
  }, [txs, projectStartDate, projectEndDate, projectBudget, financialFilterMode, financialSelectedMonth, financialSelectedYear, financialCustomStart, financialCustomEnd])
  
  const income = financialSummary.income
  const expense = financialSummary.expense
  const contractViewerUrl = getContractViewerUrl()
  
  console.log('💰 Final values displayed:', { income, expense, txsCount: txs.length })

  if (!id) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded">
          מזהה פרויקט לא תקין
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          className="bg-gray-900 text-white px-4 py-2 rounded"
        >
          חזור לדשבורד
        </button>
      </div>
    )
  }


  return (
    <div className="space-y-8 relative">
      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              טוען עסקאות...
            </p>
          </div>
        </div>
      )}
      
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
      >
        <div className="flex-1">
          <div className="flex items-center gap-4 mb-4">
            {projectImageUrl && (
              <div className="rounded-lg overflow-hidden flex-shrink-0">
                <img
                  src={projectImageUrl}
                  alt={projectName || `פרויקט #${id}`}
                  className="w-32 h-32 object-cover"
                />
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {projectName || `פרויקט #${id}`}
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                ניהול פיננסי מפורט
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="text-gray-400 dark:text-gray-500">📅</span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">תאריך התחלה:</span>
                  {formatDate(projectStartDate)}
                </span>
                <span className="hidden sm:block text-gray-300 dark:text-gray-600">|</span>
                <span className="flex items-center gap-1">
                  <span className="text-gray-400 dark:text-gray-500">🏁</span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">תאריך סיום:</span>
                  {projectEndDate ? formatDate(projectEndDate) : 'לא הוגדר'}
                </span>
                {contractFileUrl && (
                  <>
                    <span className="hidden sm:block text-gray-300 dark:text-gray-600">|</span>
                    <button
                      type="button"
                      onClick={() => setShowContractModal(true)}
                      className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <span className="text-gray-400 dark:text-gray-500">📄</span>
                      <span className="font-medium">חוזה הפרויקט</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 justify-end">
          {contractPeriods && contractPeriods.periods_by_year && contractPeriods.periods_by_year.length > 0 && (
            <button
              onClick={() => setShowPreviousYearsModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg hover:from-gray-700 hover:to-gray-800 transition-all shadow-md flex items-center gap-2 text-sm"
            >
              <History className="w-4 h-4" />
              שנים קודמות
            </button>
          )}
          <button
            onClick={() => setShowCreateTransactionModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-md flex items-center gap-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            צור עסקה חדשה
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAddBudgetForm(true)
              setBudgetFormError(null)
            }}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            + הוסף תקציב
          </button>
          {!hasFund && !fundData && (
            <button
              onClick={() => setShowCreateFundModal(true)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              הוסף קופה
            </button>
          )}
          <button
            onClick={handleEditProject}
            className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors flex items-center gap-2 text-sm"
          >
            <Edit className="w-4 h-4" />
            ערוך פרויקט
          </button>
          {isAdmin && (
            <button
              onClick={handleArchiveDeleteClick}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2 text-sm"
            >
              <Archive className="w-4 h-4" />
              ארכב / מחק
            </button>
          )}
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
          >
            ← חזור לדשבורד
          </button>
        </div>
      </motion.div>

      {/* Subprojects List */}
      {isParentProject && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            תתי-פרויקטים
          </h3>
          {subprojectsLoading ? (
            <div className="text-center py-4 text-sm text-gray-600 dark:text-gray-400">
              טוען תתי-פרויקטים...
            </div>
          ) : subprojects.length > 0 ? (
            <div className="space-y-1.5">
              {subprojects.map((subproject) => (
                <div
                  key={subproject.id}
                  onClick={() => navigate(`/projects/${subproject.id}`)}
                  className="border border-gray-200 dark:border-gray-700 rounded-md p-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-600 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                      {subproject.name}
                    </span>
                    <ChevronLeft className="w-4 h-4 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
              אין תתי-פרויקטים תחת פרויקט זה
            </div>
          )}
        </motion.div>
      )}

      {/* Financial Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.03 }}
        className="bg-blue-50 dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">סיכום פיננסי</h3>
          
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={financialFilterMode}
              onChange={(e) => setFinancialFilterMode(e.target.value as any)}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="month">חודש ספציפי</option>
              <option value="year">שנה ספציפית</option>
              <option value="project">מתחילת הפרויקט</option>
              <option value="custom">טווח תאריכים</option>
            </select>

            {financialFilterMode === 'month' && (
              <input
                type="month"
                value={financialSelectedMonth}
                onChange={(e) => setFinancialSelectedMonth(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500"
              />
            )}

            {financialFilterMode === 'year' && (
              <select
                value={financialSelectedYear}
                onChange={(e) => setFinancialSelectedYear(Number(e.target.value))}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500"
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            )}

            {financialFilterMode === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={financialCustomStart}
                  onChange={(e) => setFinancialCustomStart(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                  placeholder="מתאריך"
                />
                <span className="text-gray-500">-</span>
                <input
                  type="date"
                  value={financialCustomEnd}
                  onChange={(e) => setFinancialCustomEnd(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                  placeholder="עד תאריך"
                />
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-blue-900/20 p-4 rounded-lg text-center">
            <div className="text-blue-600 dark:text-blue-400 font-semibold mb-1">
              הכנסות
            </div>
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
              {formatCurrency(income)} ₪
            </div>
          </div>
          <div className="bg-white dark:bg-red-900/20 p-4 rounded-lg text-center">
            <div className="text-red-600 dark:text-red-400 font-semibold mb-1">הוצאות</div>
            <div className="text-2xl font-bold text-red-700 dark:text-red-300">
              {expense.toFixed(2)} ₪
            </div>
          </div>
          <div className={`p-4 rounded-lg text-center ${
            income - expense < 0 
              ? 'bg-white dark:bg-red-900/20' 
              : 'bg-white dark:bg-green-900/20'
          }`}>
            <div className={`font-semibold mb-1 ${
              income - expense < 0 
                ? 'text-red-600 dark:text-red-400' 
                : 'text-green-600 dark:text-green-400'
            }`}>
              רווח נטו
            </div>
            <div className={`text-2xl font-bold ${
              income - expense < 0 
                ? 'text-red-700 dark:text-red-300' 
                : 'text-green-700 dark:text-green-300'
            }`}>
              {(income - expense).toFixed(2)} ₪
            </div>
          </div>
        </div>
      </motion.div>

      {/* Fund and Transactions Section */}
      <div className="max-w-6xl mx-auto w-full space-y-6 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
          {/* Fund Section */}
          {/* Trends Section (Moved from bottom) */}
          <div className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 overflow-hidden">
             <ProjectTrendsChart
                projectId={parseInt(id || '0')}
                projectName={projectName}
                transactions={txs}
                expenseCategories={expenseCategories}
                compact={true}
                projectIncome={projectBudget?.budget_monthly || 0}
             />
          </div>

          {/* Transactions List */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex flex-col max-h-[80vh] overflow-hidden"
          >
            <div className="mb-4 flex-shrink-0">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                רשימת עסקאות
              </h2>
            </div>
            <div className="flex flex-col flex-1 min-h-0">
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col flex-1 min-h-0">
                  <div className="bg-gray-50 dark:bg-gray-700 px-6 py-4 border-b border-gray-200 dark:border-gray-600 flex-shrink-0">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4">
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                        רשימת עסקאות
                      </h3>
                      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                          <select
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-nowrap"
                            value={filterType}
                            onChange={e => setFilterType(e.target.value as any)}
                          >
                            <option value="all">הכל</option>
                            <option value="Income">הכנסות</option>
                            <option value="Expense">הוצאות</option>
                          </select>
                          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={filterExceptional === 'only'}
                              onChange={e => setFilterExceptional(e.target.checked ? 'only' : 'all')}
                              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
                            />
                            רק חריגות
                          </label>
                          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={filterDated === 'only'}
                              onChange={e => setFilterDated(e.target.checked ? 'only' : 'all')}
                              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
                            />
                            רק תאריכיות
                          </label>
                        </div>
                        <div>
                          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                            <span>קטגוריה:</span>
                            <select
                              className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={categoryFilter}
                              onChange={(e) => setCategoryFilter(e.target.value)}
                            >
                              <option value="all">כל הקטגוריות</option>
                              {allCategoryOptions.map(option => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Date Filter Options */}
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-4 flex-shrink-0">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          סינון לפי תאריך
                        </label>
                        <div className="flex flex-wrap gap-3 sm:gap-4">
                          <label className="flex items-center gap-2 whitespace-nowrap">
                            <input
                              type="radio"
                              name="dateFilter"
                              value="current_month"
                              checked={dateFilterMode === 'current_month'}
                              onChange={() => setDateFilterMode('current_month')}
                              className="w-4 h-4 text-blue-600 flex-shrink-0"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">חודש נוכחי</span>
                          </label>
                          <label className="flex items-center gap-2 whitespace-nowrap">
                            <input
                              type="radio"
                              name="dateFilter"
                              value="selected_month"
                              checked={dateFilterMode === 'selected_month'}
                              onChange={() => setDateFilterMode('selected_month')}
                              className="w-4 h-4 text-blue-600 flex-shrink-0"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">חודש מסוים</span>
                          </label>
                          <label className="flex items-center gap-2 whitespace-nowrap">
                            <input
                              type="radio"
                              name="dateFilter"
                              value="all_time"
                              checked={dateFilterMode === 'all_time'}
                              onChange={() => setDateFilterMode('all_time')}
                              className="w-4 h-4 text-blue-600 flex-shrink-0"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">כל הזמן</span>
                          </label>
                          <label className="flex items-center gap-2 whitespace-nowrap">
                            <input
                              type="radio"
                              name="dateFilter"
                              value="date_range"
                              checked={dateFilterMode === 'date_range'}
                              onChange={() => setDateFilterMode('date_range')}
                              className="w-4 h-4 text-blue-600 flex-shrink-0"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">טווח תאריכים</span>
                          </label>
                        </div>
                      </div>

                      {dateFilterMode === 'selected_month' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            בחר חודש
                          </label>
                          <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      )}

                      {dateFilterMode === 'date_range' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              מתאריך
                            </label>
                            <input
                              type="date"
                              value={startDate}
                              onChange={(e) => setStartDate(e.target.value)}
                              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              עד תאריך
                            </label>
                            <input
                              type="date"
                              value={endDate}
                              onChange={(e) => setEndDate(e.target.value)}
                              min={startDate}
                              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {loading ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400 flex-shrink-0">טוען...</div>
                  ) : expandedTransactions.length === 0 ? (
                    <div className="text-center py-8 space-y-3 flex-shrink-0">
                      <div className="text-gray-500 dark:text-gray-400 font-medium">אין עסקאות להצגה</div>
                      {txs.length > 0 && (
                        <div className="text-sm text-gray-400 dark:text-gray-500 space-y-2">
                          {categoryFilter !== 'all' && (
                            <>
                              <div>הסינון לפי קטגוריה "{categoryFilter}" לא מצא תוצאות</div>
                              {transactionsMatchingCategory > 0 && dateFilterMode === 'current_month' && (
                                <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                  <div className="font-medium text-blue-800 dark:text-blue-200 mb-1">
                                    נמצאו {transactionsMatchingCategory} עסקאות עם הקטגוריה "{categoryFilter}"
                                  </div>
                                  <div className="text-blue-700 dark:text-blue-300 text-xs mb-2">
                                    אבל הן לא בחודש הנוכחי. שנה את סינון התאריך לראות אותן.
                                  </div>
                                  <button
                                    onClick={() => setDateFilterMode('date_range')}
                                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                                  >
                                    הצג את כל העסקאות עם הקטגוריה הזו
                                  </button>
                                </div>
                              )}
                              {transactionsMatchingCategory === 0 && (
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  אין עסקאות עם הקטגוריה "{categoryFilter}" במערכת
                                </div>
                              )}
                            </>
                          )}
                          {categoryFilter === 'all' && dateFilterMode === 'current_month' && (
                            <div className="mt-1">התצוגה מוגבלת לחודש הנוכחי - נסה לשנות את סינון התאריך לראות עסקאות מחודשים קודמים</div>
                          )}
                          <div className="mt-2 text-xs">
                            סך הכל {txs.filter(t => !t.from_fund).length} עסקאות במערכת
                            {categoryFilter !== 'all' && transactionsMatchingCategory > 0 && (
                              <span> • {transactionsMatchingCategory} עם הקטגוריה "{categoryFilter}"</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div id="transactions-list" className="space-y-3 p-4">
                      {expandedTransactions.map(tx => {
                        const expanded = transactionsExpandedId === tx.id
                        // Use monthKey for period transactions to ensure unique keys
                        const uniqueKey = (tx as any).monthKey ? `${tx.id}-${(tx as any).monthKey}` : tx.id
                        return (
                          <div key={uniqueKey} className="border border-gray-200 dark:border-gray-700 rounded-xl">
                            <button
                              className="w-full px-4 py-3 text-right flex items-center gap-2 sm:gap-4 justify-between min-w-0"
                              onClick={() => setTransactionsExpandedId(expanded ? null : tx.id)}
                            >
                              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                                <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 ${tx.type === 'Income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {tx.type === 'Income' ? 'הכנסה' : 'הוצאה'}
                                </span>
                                {tx.is_generated && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800 whitespace-nowrap flex-shrink-0">
                                    מחזורי
                                  </span>
                                )}
                                {tx.period_start_date && tx.period_end_date ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800 whitespace-nowrap flex-shrink-0" key={`dated-${tx.id}`}>
                                    תאריכית
                                  </span>
                                ) : null}
                                <span className="text-sm text-gray-600 dark:text-gray-300 truncate min-w-0">
                              {(() => {
                                const catName = getCategoryName(tx.category);
                                return catName ? (CATEGORY_LABELS[catName] || catName) : '-';
                              })()}
                            </span>
                              </div>
                              <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                                <div className="text-right">
                                    <div className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{new Date(tx.tx_date).toLocaleDateString('he-IL')}</div>
                                    {tx.period_start_date && tx.period_end_date ? (
                                        <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-0.5 whitespace-nowrap" key={`dates-${tx.id}`}>
                                            {new Date(tx.period_start_date).toLocaleDateString('he-IL', {day: '2-digit', month: '2-digit'})} - {new Date(tx.period_end_date).toLocaleDateString('he-IL', {day: '2-digit', month: '2-digit'})}
                                        </div>
                                    ) : null}
                                </div>
                                <div className="text-right">
                                  <span className={`text-lg font-semibold whitespace-nowrap ${tx.type === 'Income' ? 'text-green-600' : 'text-red-600'}`}>
                                    {formatCurrency((tx as any).proportionalAmount !== undefined ? (tx as any).proportionalAmount : tx.amount)} ₪
                                  </span>
                                  {(tx as any).proportionalAmount !== undefined && (tx as any).proportionalAmount !== (tx as any).fullAmount && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                      מתוך {formatCurrency((tx as any).fullAmount)} ₪
                                    </div>
                                  )}
                                </div>
                                <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} />
                              </div>
                            </button>
                            {expanded && (
                              <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 space-y-3">
                                {tx.period_start_date && tx.period_end_date ? (
                                  <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border-2 border-blue-200 dark:border-blue-700 mt-2" key={`period-details-${tx.id}`}>
                                    <div className="text-sm text-blue-800 dark:text-blue-300 font-bold mb-2">עסקה תאריכית</div>
                                    <div className="text-xs text-blue-700 dark:text-blue-400 mb-1">תקופת תשלום:</div>
                                    <div className="text-base text-blue-900 dark:text-blue-200 font-semibold mb-2">
                                      {new Date(tx.period_start_date).toLocaleDateString('he-IL')} - {new Date(tx.period_end_date).toLocaleDateString('he-IL')}
                                    </div>
                                    {(tx as any).proportionalAmount !== undefined && (tx as any).daysInMonth !== undefined && (tx as any).totalDays !== undefined ? (
                                      <div className="text-xs text-blue-700 dark:text-blue-400 space-y-1 mt-2 pt-2 border-t border-blue-200 dark:border-blue-700">
                                        <div>סכום מלא: {formatCurrency((tx as any).fullAmount)} ₪</div>
                                        <div>סכום בחודש זה: {formatCurrency((tx as any).proportionalAmount)} ₪</div>
                                        <div>ימים בחודש זה: {(tx as any).daysInMonth} מתוך {(tx as any).totalDays} ימים</div>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">אמצעי תשלום</div>
                                    <div>{tx.payment_method ? PAYMENT_METHOD_LABELS[tx.payment_method] || tx.payment_method : '-'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">ספק</div>
                                    <div>{tx.supplier_id ? (suppliers.find(s => s.id === tx.supplier_id)?.name || `[ספק ${tx.supplier_id}]`) : '-'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">נוצר על ידי</div>
                                    <div>{tx.created_by_user?.full_name || '-'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">חריגה</div>
                                    <div>{tx.is_exceptional ? 'כן' : 'לא'}</div>
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 gap-3">
                                  <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">תיאור</div>
                                    <div>{tx.description || 'ללא'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">הערות</div>
                                    <div>{tx.notes || 'ללא'}</div>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                                  <button
                                    onClick={async () => {
                                      setSelectedTransactionForDocuments(tx)
                                      setShowDocumentsModal(true)
                                      setDocumentsLoading(true)
                                      try {
                                        const { data } = await api.get(`/transactions/${tx.id}/documents`)
                                        setTransactionDocuments(data || [])
                                      } catch (err) {
                                        setTransactionDocuments([])
                                      } finally {
                                        setDocumentsLoading(false)
                                      }
                                    }}
                                    className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-1"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    מסמכים
                                  </button>
                                  <button
                                    onClick={() => handleEditAnyTransaction(tx)}
                                    className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                                  >
                                    ערוך
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTransaction(tx.id, tx)}
                                    className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                  >
                                    מחק
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  </div>
              </div>
            </div>
          </motion.div>

      {/* Edit Fund Modal */}
      {showEditFundModal && fundData && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                ערוך קופה
              </h3>
              <button
                onClick={() => {
                  setShowEditFundModal(false)
                  setMonthlyFundAmount(0)
                  setCurrentBalance(0)
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault()
                setUpdatingFund(true)
                try {
                  // Build query params - always include monthly_amount (even if 0) and current_balance
                  const params = new URLSearchParams()
                  params.append('monthly_amount', (monthlyFundAmount || 0).toString())
                  if (currentBalance !== undefined && currentBalance !== null) {
                    params.append('current_balance', currentBalance.toString())
                  }
                  await api.put(`/projects/${id}/fund?${params.toString()}`)
                  // Reload fund data
                  await loadFundData()
                  setShowEditFundModal(false)
                  setMonthlyFundAmount(0)
                  setCurrentBalance(0)
                } catch (err: any) {
                  alert(err.response?.data?.detail || 'שגיאה בעדכון הקופה')
                } finally {
                  setUpdatingFund(false)
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  יתרה נוכחית (₪)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={currentBalance}
                  onChange={(e) => setCurrentBalance(Number(e.target.value))}
                  placeholder="הכנס יתרה נוכחית"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  יתרת הקופה הנוכחית (ניתן לערוך ידנית)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  סכום חודשי (₪)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={monthlyFundAmount}
                  onChange={(e) => setMonthlyFundAmount(Number(e.target.value))}
                  placeholder="הכנס סכום חודשי"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  הסכום יתווסף לקופה כל חודש באופן אוטומטי
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={updatingFund}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {updatingFund ? 'מעדכן...' : 'עדכן קופה'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditFundModal(false)
                    setMonthlyFundAmount(0)
                    setCurrentBalance(0)
                  }}
                  disabled={updatingFund}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  ביטול
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Create Fund Modal */}
      {showCreateFundModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                הוסף קופה לפרויקט
              </h3>
              <button
                onClick={() => {
                  setShowCreateFundModal(false)
                  setMonthlyFundAmount(0)
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault()
                setCreatingFund(true)
                try {
                  await api.post(`/projects/${id}/fund?monthly_amount=${monthlyFundAmount}`)
                  // Success - reload data
                  await loadProjectInfo()
                  await loadFundData()
                  setShowCreateFundModal(false)
                  setMonthlyFundAmount(0)
                } catch (err: any) {
                  // If status is 2xx, it's actually a success
                  const status = err.response?.status
                  if (status >= 200 && status < 300) {
                    // Success - reload data
                    await loadProjectInfo()
                    await loadFundData()
                    setShowCreateFundModal(false)
                    setMonthlyFundAmount(0)
                  } else {
                    alert(err.response?.data?.detail || 'שגיאה ביצירת הקופה')
                  }
                } finally {
                  setCreatingFund(false)
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  סכום חודשי (₪)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={monthlyFundAmount}
                  onChange={(e) => setMonthlyFundAmount(Number(e.target.value))}
                  placeholder="הכנס סכום חודשי"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  הסכום יתווסף לקופה כל חודש באופן אוטומטי
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={creatingFund}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {creatingFund ? 'יוצר...' : 'צור קופה'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateFundModal(false)
                    setMonthlyFundAmount(0)
                  }}
                  disabled={creatingFund}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  ביטול
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Fund Transactions Modal */}
      {showFundTransactionsModal && fundData && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowFundTransactionsModal(false)}
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
              <div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  עסקאות מהקופה
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {fundData.transactions.length} עסקאות
                </p>
              </div>
              <button
                onClick={() => setShowFundTransactionsModal(false)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {fundData.transactions.length === 0 ? (
                <div className="text-center py-16">
                  <svg
                    className="w-24 h-24 text-gray-300 dark:text-gray-600 mx-auto mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                  <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    אין עסקאות מהקופה
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    עדיין לא בוצעו עסקאות מהקופה
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {fundData.transactions
                    .filter(tx => fundCategoryFilter === 'all' || tx.category === fundCategoryFilter)
                    .map((tx) => (
                    <div key={tx.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">
                              {new Date(tx.tx_date).toLocaleDateString('he-IL', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {(() => {
                                const catName = getCategoryName(tx.category);
                                return catName ? (CATEGORY_LABELS[catName] || catName) : 'קופה';
                              })()}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className={`text-lg font-bold ${
                            tx.type === 'Income' 
                              ? 'text-green-600 dark:text-green-400' 
                              : 'text-red-600 dark:text-red-400'
                          }`}>
                            {tx.type === 'Income' ? '+' : '-'}{tx.amount.toLocaleString('he-IL')} ₪
                          </span>
                        </div>
                      </div>

                      {tx.description && (
                        <div className="mb-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400">תיאור: </span>
                          <span className="text-sm text-gray-700 dark:text-gray-300">{tx.description}</span>
                        </div>
                      )}

                      {tx.created_by_user && (
                        <div className="mb-2 flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            בוצע על ידי: {tx.created_by_user.full_name}
                          </span>
                        </div>
                      )}

                      {tx.notes && (
                        <div className="mb-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400">הערות: </span>
                          <span className="text-sm text-gray-700 dark:text-gray-300">{tx.notes}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                        <button
                          onClick={async () => {
                            setSelectedTransactionForDocuments(tx)
                            setShowDocumentsModal(true)
                            setDocumentsLoading(true)
                            try {
                              const { data } = await api.get(`/transactions/${tx.id}/documents`)
                              setTransactionDocuments(data || [])
                            } catch (err) {
                              setTransactionDocuments([])
                            } finally {
                              setDocumentsLoading(false)
                            }
                          }}
                          className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          מסמכים
                        </button>
                        <button
                          onClick={() => handleEditAnyTransaction({ ...tx, from_fund: true } as Transaction)}
                          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          ערוך
                        </button>
                        <button
                          onClick={() => handleDeleteTransaction(tx.id, tx as Transaction)}
                          className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          מחק
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
        </div>

      {/* Budget Cards and Charts */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1 md:mb-0">
              תקציבים לקטגוריות ומגמות פיננסיות
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              מעקב אחר התקציבים וההוצאות בכל קטגוריה ומגמות פיננסיות
            </p>
          </div>
        </div>


        {chartsLoading ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-96 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
              ))}
            </div>
            <div className="mt-6 h-96 bg-gray-100 dark:bg-gray-700 rounded-2xl animate-pulse" />
          </>
        ) : (
          <>
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Budgets Section - Left Side */}
              <div className="flex flex-col gap-6">
                  {projectBudgets && projectBudgets.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {projectBudgets.map((budget) => (
                        <BudgetCard
                          key={budget.id}
                          budget={budget}
                          onDelete={() => handleDeleteBudget(budget.id)}
                          onEdit={() => handleStartEditBudget(budget)}
                          deleting={budgetDeleteLoading === budget.id}
                        />
                      ))}
                    </div>
                  ) : (
                     !chartsLoading && (
                        <div className="mt-6 text-center py-8 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600">
                          <p className="text-gray-500 dark:text-gray-400">
                            אין תקציבים לקטגוריות לפרויקט זה
                          </p>
                          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2 mb-4">
                            הוסף תקציבים לקטגוריות כדי לעקוב אחר הוצאות מול תכנון
                          </p>
                        </div>
                     )
                  )}
              </div>

              {/* Fund Section - Right Side */}
              <div>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 h-full">
                        <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 whitespace-nowrap">פרטי הקופה</h2>
                                <p className="text-sm text-gray-600 dark:text-gray-400">מעקב אחר יתרת הקופה ועסקאות מהקופה</p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                {fundData && fundData.transactions && fundData.transactions.length > 0 && (
                                    <button onClick={() => setShowFundTransactionsModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center gap-2 whitespace-nowrap">
                                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                        עסקאות קופה ({fundData.transactions.length})
                                    </button>
                                )}
                                {fundData && (
                                    <button onClick={() => { setMonthlyFundAmount(fundData.monthly_amount); setCurrentBalance(fundData.current_balance); setShowEditFundModal(true) }} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm flex items-center gap-2 whitespace-nowrap">
                                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                        ערוך קופה
                                    </button>
                                )}
                            </div>
                        </div>
                        {fundLoading ? (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">טוען פרטי קופה...</div>
                        ) : fundData ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 overflow-hidden min-w-0">
                                    <div className="flex items-center justify-between mb-2 min-w-0 gap-2">
                                        <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300 whitespace-nowrap min-w-0 flex-1">יתרה נוכחית</h3>
                                        <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                    </div>
                                    <p className="text-3xl font-bold text-blue-900 dark:text-blue-100 whitespace-nowrap">{fundData.current_balance.toLocaleString('he-IL')} ₪</p>
                                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 whitespace-nowrap">יתרה זמינה כעת</p>
                                </div>
                                <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border border-green-200 dark:border-green-800 rounded-xl p-6 overflow-hidden min-w-0">
                                    <div className="flex items-center justify-between mb-2 min-w-0 gap-2">
                                        <h3 className="text-sm font-medium text-green-700 dark:text-green-300 whitespace-nowrap min-w-0 flex-1">כמה היה מתחילה</h3>
                                        <svg className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </div>
                                    <p className="text-3xl font-bold text-green-900 dark:text-green-100 whitespace-nowrap">{fundData.initial_total.toLocaleString('he-IL')} ₪</p>
                                    <p className="text-xs text-green-600 dark:text-green-400 mt-1 whitespace-nowrap">סכום כולל שנכנס לקופה</p>
                                </div>
                                <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border border-red-200 dark:border-red-800 rounded-xl p-6 overflow-hidden min-w-0">
                                    <div className="flex items-center justify-between mb-2 min-w-0 gap-2">
                                        <h3 className="text-sm font-medium text-red-700 dark:text-red-300 whitespace-nowrap min-w-0 flex-1">כמה יצא</h3>
                                        <svg className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                    </div>
                                    <p className="text-3xl font-bold text-red-900 dark:text-red-100 whitespace-nowrap">{fundData.total_deductions.toLocaleString('he-IL')} ₪</p>
                                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 whitespace-nowrap">סה"כ סכום שירד מהקופה</p>
                                </div>
                                <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border border-purple-200 dark:border-purple-800 rounded-xl p-6 overflow-hidden min-w-0">
                                    <div className="flex items-center justify-between mb-2 min-w-0 gap-2">
                                        <h3 className="text-sm font-medium text-purple-700 dark:text-purple-300 whitespace-nowrap min-w-0 flex-1">סכום חודשי</h3>
                                        <svg className="w-6 h-6 text-purple-600 dark:text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    </div>
                                    <p className="text-3xl font-bold text-purple-900 dark:text-purple-100 whitespace-nowrap">{(fundData.monthly_amount || 0).toLocaleString('he-IL')} ₪</p>
                                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-1 whitespace-nowrap">מתווסף אוטומטית כל חודש</p>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">לא ניתן לטעון את פרטי הקופה</div>
                        )}
                    </div>
              </div>
            </div>
          </>
          </>
        )}
      </motion.div>


      {/* Legacy Transactions Block (disabled) */}
      {false && (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
      >
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              רשימת עסקאות
            </h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <select
                  className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={filterType}
                  onChange={e => setFilterType(e.target.value as any)}
                >
                  <option value="all">הכל</option>
                  <option value="Income">הכנסות</option>
                  <option value="Expense">הוצאות</option>
                </select>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={filterExceptional === 'only'}
                    onChange={e => setFilterExceptional(e.target.checked ? 'only' : 'all')}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  רק חריגות
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={filterDated === 'only'}
                    onChange={e => setFilterDated(e.target.checked ? 'only' : 'all')}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  רק תאריכיות
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span>קטגוריה:</span>
                  <select
                    className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  >
                    <option value="all">כל הקטגוריות</option>
                    {allCategoryOptions.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>

          {/* Date Filter Options */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                סינון לפי תאריך
              </label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="dateFilter"
                    value="current_month"
                    checked={dateFilterMode === 'current_month'}
                    onChange={() => setDateFilterMode('current_month')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">חודש נוכחי</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="dateFilter"
                    value="selected_month"
                    checked={dateFilterMode === 'selected_month'}
                    onChange={() => setDateFilterMode('selected_month')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">חודש מסוים</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="dateFilter"
                    value="date_range"
                    checked={dateFilterMode === 'date_range'}
                    onChange={() => setDateFilterMode('date_range')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">טווח תאריכים</span>
                </label>
              </div>
            </div>

            {dateFilterMode === 'selected_month' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  בחר חודש
                </label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {dateFilterMode === 'date_range' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    מתאריך
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    עד תאריך
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Transaction Type Filter */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                סוג עסקה
              </label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="transactionType"
                    value="all"
                    checked={transactionTypeFilter === 'all'}
                    onChange={() => setTransactionTypeFilter('all')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">הכל</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="transactionType"
                    value="regular"
                    checked={transactionTypeFilter === 'regular'}
                    onChange={() => setTransactionTypeFilter('regular')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">רגיל</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="transactionType"
                    value="recurring"
                    checked={transactionTypeFilter === 'recurring'}
                    onChange={() => setTransactionTypeFilter('recurring')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">מחזורי</span>
                </label>
              </div>
            </div>
          </div>

          {/* Transaction Type Filter */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                סוג עסקה
              </label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="transactionType"
                    value="all"
                    checked={transactionTypeFilter === 'all'}
                    onChange={() => setTransactionTypeFilter('all')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">הכל</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="transactionType"
                    value="regular"
                    checked={transactionTypeFilter === 'regular'}
                    onChange={() => setTransactionTypeFilter('regular')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">רגיל</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="transactionType"
                    value="recurring"
                    checked={transactionTypeFilter === 'recurring'}
                    onChange={() => setTransactionTypeFilter('recurring')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">מחזורי</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">טוען...</div>
        ) : (transactionTypeFilter === 'recurring' ? recurringTemplates.length === 0 : filtered.length === 0) ? (
          <div className="text-center py-8 space-y-3">
            <div className="text-gray-500 dark:text-gray-400 font-medium">אין עסקאות להצגה</div>
            {txs.length > 0 && (
              <div className="text-sm text-gray-400 dark:text-gray-500 space-y-2">
                {categoryFilter !== 'all' && (
                  <>
                    <div>הסינון לפי קטגוריה "{categoryFilter}" לא מצא תוצאות</div>
                    {transactionsMatchingCategory > 0 && dateFilterMode === 'current_month' && (
                      <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <div className="font-medium text-blue-800 dark:text-blue-200 mb-1">
                          נמצאו {transactionsMatchingCategory} עסקאות עם הקטגוריה "{categoryFilter}"
                        </div>
                        <div className="text-blue-700 dark:text-blue-300 text-xs mb-2">
                          אבל הן לא בחודש הנוכחי. שנה את סינון התאריך לראות אותן.
                        </div>
                        <button
                          onClick={() => setDateFilterMode('date_range')}
                          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                        >
                          הצג את כל העסקאות עם הקטגוריה הזו
                        </button>
                      </div>
                    )}
                    {transactionsMatchingCategory === 0 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        אין עסקאות עם הקטגוריה "{categoryFilter}" במערכת
                      </div>
                    )}
                  </>
                )}
                {categoryFilter === 'all' && dateFilterMode === 'current_month' && (
                  <div className="mt-1">התצוגה מוגבלת לחודש הנוכחי - נסה לשנות את סינון התאריך לראות עסקאות מחודשים קודמים</div>
                )}
                          {categoryFilter === 'all' && dateFilterMode === 'date_range' && (
                            <div className="mt-1">לא נמצאו עסקאות בטווח התאריכים שנבחר. נסה להרחיב את הטווח או לנקות את הסינון.</div>
                          )}
                          {categoryFilter === 'all' && dateFilterMode === 'all_time' && (
                            <div className="mt-1">לא נמצאו עסקאות כלל במערכת.</div>
                          )}
                <div className="mt-2 text-xs">
                  סך הכל {txs.filter(t => !t.from_fund).length} עסקאות במערכת
                  {categoryFilter !== 'all' && transactionsMatchingCategory > 0 && (
                    <span> • {transactionsMatchingCategory} עם הקטגוריה "{categoryFilter}"</span>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                  <th className="p-3 font-medium text-gray-700 dark:text-gray-300">סוג</th>
                  <th className="p-3 font-medium text-gray-700 dark:text-gray-300">
                    {transactionTypeFilter === 'recurring' ? 'תדירות' : 'תאריך'}
                  </th>
                  <th className="p-3 font-medium text-gray-700 dark:text-gray-300">סכום</th>
                  <th className="p-3 font-medium text-gray-700 dark:text-gray-300">קטגוריה</th>
                  <th className="p-3 font-medium text-gray-700 dark:text-gray-300">אמצעי תשלום</th>
                  <th className="p-3 font-medium text-gray-700 dark:text-gray-300">ספק</th>
                  <th className="p-3 font-medium text-gray-700 dark:text-gray-300">נוצר על ידי</th>
                  <th className="p-3 font-medium text-gray-700 dark:text-gray-300">תיאור</th>
                  <th className="p-3 font-medium text-gray-700 dark:text-gray-300">הערות</th>
                  <th className="p-3 font-medium text-gray-700 dark:text-gray-300">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {transactionTypeFilter === 'recurring' ? (
                  recurringTemplates.map(template => (
                    <tr key={template.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          template.type === 'Income' 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' 
                            : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                        }`}>
                          {template.type === 'Income' ? 'הכנסה' : 'הוצאה'}
                        </span>
                      </td>
                      <td className="p-3 text-gray-700 dark:text-gray-300">
                        כל {template.day_of_month} בחודש
                      </td>
                      <td className={`p-3 font-semibold ${template.type === 'Income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {Number(template.amount || 0).toFixed(2)} ₪
                      </td>
                      <td className="p-3 text-gray-700 dark:text-gray-300">
                        {template.category ? (CATEGORY_LABELS[template.category] || template.category) : '-'}
                      </td>
                      <td className="p-3 text-gray-700 dark:text-gray-300">
                        -
                      </td>
                      <td className="p-3 text-gray-700 dark:text-gray-300">
                        {(() => {
                          const supplierId = template.supplier_id
                          if (!supplierId) {
                            return '-'
                          }
                          const supplier = suppliers.find(s => s.id === supplierId)
                          return supplier?.name ?? `[ספק ${supplierId}]`
                        })()}
                      </td>
                      <td className="p-3 text-gray-700 dark:text-gray-300">
                        מערכת (תבנית)
                      </td>
                      <td className="p-3 text-gray-700 dark:text-gray-300">{template.description}</td>
                      <td className="p-3 text-gray-700 dark:text-gray-300">{template.notes || '-'}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedTemplateForEdit(template)
                              setEditTemplateModalOpen(true)
                            }}
                            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            ערוך
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : expandedTransactions.map((t: Transaction) => {
                  return (
                  <tr key={t.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          t.type === 'Income' 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' 
                            : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                        }`}>
                          {t.type === 'Income' ? 'הכנסה' : 'הוצאה'}
                          {t.is_exceptional ? ' (חריגה)' : ''}
                        </span>
                        {t.is_generated && (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300" title="נוצר אוטומטית מעסקה מחזורית">
                            🔄 מחזורי
                          </span>
                        )}
                        {t.period_start_date && t.period_end_date && (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300" title="עסקה תאריכית (לפי תאריכים)">
                            📅 תאריכית
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-gray-700 dark:text-gray-300">
                      <div>{t.tx_date}</div>
                      {t.period_start_date && t.period_end_date && (
                        <div className="text-sm text-blue-700 dark:text-blue-400 font-semibold mt-1 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded" key={`dated-dates-${t.id}`}>
                          תאריכית: {new Date(t.period_start_date).toLocaleDateString('he-IL')} - {new Date(t.period_end_date).toLocaleDateString('he-IL')}
                        </div>
                      )}
                    </td>
                    <td className={`p-3 font-semibold ${t.type === 'Income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      <div>
                        {Number((t as any).proportionalAmount !== undefined ? (t as any).proportionalAmount : t.amount || 0).toFixed(2)} ₪
                        {(t as any).proportionalAmount !== undefined && (t as any).proportionalAmount !== (t as any).fullAmount && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            מתוך {Number((t as any).fullAmount || 0).toFixed(2)} ₪
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-gray-700 dark:text-gray-300">
                      {t.category ? (CATEGORY_LABELS[t.category] || t.category) : '-'}
                    </td>
                    <td className="p-3 text-gray-700 dark:text-gray-300">
                      {t.payment_method ? (PAYMENT_METHOD_LABELS[t.payment_method] || t.payment_method) : '-'}
                    </td>
                    <td className="p-3 text-gray-700 dark:text-gray-300">
                      {(() => {
                        const supplierId = t.supplier_id
                        if (!supplierId) {
                          return '-'
                        }
                        const supplier = suppliers.find(s => s.id === supplierId)
                        return supplier?.name ?? `[ספק ${supplierId}]`
                      })()}
                    </td>
                    <td className="p-3 text-gray-700 dark:text-gray-300">
                      {t.created_by_user ? (
                        <div className="flex flex-col">
                          <span className="font-medium">{t.created_by_user.full_name}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{t.created_by_user.email}</span>
                        </div>
                      ) : t.is_generated ? (
                        <span className="text-gray-400 dark:text-gray-500">מערכת (מחזורי)</span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">מערכת</span>
                      )}
                    </td>
                    <td className="p-3 text-gray-700 dark:text-gray-300">{t.description ?? '-'}</td>
                    <td className="p-3 text-gray-700 dark:text-gray-300">{t.notes ?? '-'}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditAnyTransaction(t)}
                          className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          ערוך
                        </button>
                        <button
                          onClick={() => handleDeleteTransaction(t.id, t)}
                          className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          מחק
                        </button>
                        <button
                          onClick={async () => {
                            setSelectedTransactionForDocuments(t)
                            setShowDocumentsModal(true)
                            setDocumentsLoading(true)
                            try {
                              const { data } = await api.get(`/transactions/${t.id}/documents`)
                              setTransactionDocuments(data || [])
                            } catch (err: any) {
                              setTransactionDocuments([])
                            } finally {
                              setDocumentsLoading(false)
                            }
                          }}
                          className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
                        >
                          מסמכים
                        </button>
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
      )}


      {/* Modals */}
      <CreateTransactionModal
        isOpen={showCreateTransactionModal}
        onClose={() => setShowCreateTransactionModal(false)}
        onSuccess={async () => {
          setShowCreateTransactionModal(false)
          await load() // Reload transactions list to get updated data with created_by_user
          // Reload only categories and budgets (not transactions - already loaded by load())
          await reloadChartsDataOnly()
          if (hasFund) {
            await loadFundData() // Reload fund data
          }
        }}
        projectId={parseInt(id || '0')}
        isSubproject={!!relationProject}
        projectName={projectName}
        projectStartDate={projectStartDate}
      />

      <EditTransactionModal
        isOpen={editTransactionModalOpen}
        onClose={() => {
          setEditTransactionModalOpen(false)
          setSelectedTransactionForEdit(null)
        }}
        onSuccess={async () => {
          setEditTransactionModalOpen(false)
          setSelectedTransactionForEdit(null)
          await load() // Reload transactions list to get updated data
          // Reload only categories and budgets (not transactions - already loaded by load())
          await reloadChartsDataOnly()
          if (hasFund) {
            await loadFundData() // Reload fund data
          }
        }}
        transaction={selectedTransactionForEdit}
        projectStartDate={projectStartDate}
      />

      <EditRecurringSelectionModal 
        isOpen={showRecurringSelectionModal}
        onClose={() => {
            setShowRecurringSelectionModal(false)
            setSelectedTransactionForEdit(null)
        }}
        onEditInstance={() => handleEditRecurringSelection('instance')}
        onEditSeries={() => handleEditRecurringSelection('series')}
      />

      <EditRecurringTemplateModal
        isOpen={editTemplateModalOpen}
        onClose={() => {
          setEditTemplateModalOpen(false)
          setSelectedTemplateForEdit(null)
          setPendingTemplateLoad(false)
        }}
        onSuccess={async () => {
          setEditTemplateModalOpen(false)
          setSelectedTemplateForEdit(null)
          await load()
          await reloadChartsDataOnly() // Only reload budgets and categories, not transactions (already loaded by load())
          if (transactionTypeFilter === 'recurring') {
            await loadRecurringTemplates()
          }
        }}
        template={selectedTemplateForEdit}
      />

      <CreateProjectModal
        isOpen={showEditProjectModal}
        onClose={() => {
          setShowEditProjectModal(false)
          setEditingProject(null)
        }}
        onSuccess={handleProjectUpdateSuccess}
        editingProject={editingProject}
      />

      {/* Documents Modal */}
      {showDocumentsModal && selectedTransactionForDocuments && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowDocumentsModal(false)
            setSelectedTransactionForDocuments(null)
            setSelectedDocument(null)
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  מסמכי עסקה #{selectedTransactionForDocuments.id}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {selectedTransactionForDocuments.description || 'ללא תיאור'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowDocumentsModal(false)
                  setSelectedTransactionForDocuments(null)
                  setSelectedDocument(null)
                }}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {documentsLoading ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  טוען מסמכים...
                </div>
              ) : transactionDocuments.length === 0 ? (
                <div className="text-center py-16">
                  <svg
                    className="w-24 h-24 text-gray-300 dark:text-gray-600 mx-auto mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    אין מסמכים לעסקה זו
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    העלה מסמך באמצעות כפתור "העלה מסמך" בטבלת העסקאות
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {transactionDocuments.map((doc) => {
                    const getFileExtension = (filePath: string): string => {
                      return filePath.split('.').pop()?.toLowerCase() || ''
                    }
                    const getFileName = (filePath: string): string => {
                      const parts = filePath.split('/')
                      return parts[parts.length - 1] || 'קובץ'
                    }
                    const isImage = (filePath: string): boolean => {
                      const ext = getFileExtension(filePath)
                      return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)
                    }
                    const isPdf = (filePath: string): boolean => {
                      return getFileExtension(filePath) === 'pdf'
                    }
                    const getFileUrl = (filePath: string): string => {
                      if (filePath.startsWith('http')) return filePath
                      const apiUrl = import.meta.env.VITE_API_URL || ''
                      // @ts-ignore
                      const baseUrl = apiUrl ? apiUrl.replace('/api/v1', '') : ''
                      let normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`
                      normalizedPath = normalizedPath.replace(/([^:]\/)\/+/g, '$1')
                      return `${baseUrl}${normalizedPath}`
                    }

                    return (
                      <motion.div
                        key={doc.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileHover={{ scale: 1.02 }}
                        className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden hover:shadow-xl transition-all cursor-pointer bg-white dark:bg-gray-800"
                        onClick={() => setSelectedDocument(doc)}
                      >
                        {isImage(doc.file_path) ? (
                          <div className="relative aspect-[4/3] bg-gray-100 dark:bg-gray-700 overflow-hidden group">
                            <img
                              src={getFileUrl(doc.file_path)}
                              alt={doc.description || 'מסמך'}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              loading="lazy"
                            />
                            <div className="absolute top-2 right-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm">
                              📷 תמונה
                            </div>
                          </div>
                        ) : isPdf(doc.file_path) ? (
                          <div className="aspect-[4/3] bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 flex flex-col items-center justify-center group hover:from-red-100 hover:to-red-200 dark:hover:from-red-800/30 dark:hover:to-red-700/30 transition-colors">
                            <svg
                              className="w-20 h-20 text-red-600 dark:text-red-400 mb-3 group-hover:scale-110 transition-transform"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M4 18h12V6h-4V2H4v16zm-2 1V0h12l4 4v16H2v-1z" />
                            </svg>
                            <span className="text-red-700 dark:text-red-300 font-bold text-lg">PDF</span>
                          </div>
                        ) : (
                          <div className="aspect-[4/3] bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 flex flex-col items-center justify-center group">
                            <svg
                              className="w-20 h-20 text-gray-400 dark:text-gray-500 mb-3 group-hover:scale-110 transition-transform"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                            <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">
                              {getFileExtension(doc.file_path).toUpperCase() || 'קובץ'}
                            </span>
                          </div>
                        )}
                        <div className="p-4 bg-white dark:bg-gray-800">
                          <p className="text-sm text-gray-900 dark:text-white truncate font-semibold mb-1">
                            {doc.description || getFileName(doc.file_path)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            📅 {new Date(doc.uploaded_at).toLocaleDateString('he-IL', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </p>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Document Viewer Modal */}
      {selectedDocument && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
          onClick={() => setSelectedDocument(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-white dark:bg-gray-800 rounded-2xl max-w-7xl max-h-[95vh] w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-900">
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                  {selectedDocument.description || selectedDocument.file_path.split('/').pop()}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {new Date(selectedDocument.uploaded_at).toLocaleDateString('he-IL', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
              <button
                onClick={() => setSelectedDocument(null)}
                className="ml-4 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                aria-label="סגור"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              {(() => {
                const getFileExtension = (filePath: string): string => {
                  return filePath.split('.').pop()?.toLowerCase() || ''
                }
                const getFileName = (filePath: string): string => {
                  const parts = filePath.split('/')
                  return parts[parts.length - 1] || 'קובץ'
                }
                const isImage = (filePath: string): boolean => {
                  const ext = getFileExtension(filePath)
                  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)
                }
                const isPdf = (filePath: string): boolean => {
                  return getFileExtension(filePath) === 'pdf'
                }
                const getFileUrl = (filePath: string): string => {
                  if (filePath.startsWith('http')) return filePath
                  const apiUrl = import.meta.env.VITE_API_URL || ''
                  // @ts-ignore
                  const baseUrl = apiUrl ? apiUrl.replace('/api/v1', '') : ''
                  let normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`
                  normalizedPath = normalizedPath.replace(/([^:]\/)\/+/g, '$1')
                  return `${baseUrl}${normalizedPath}`
                }

                if (isImage(selectedDocument.file_path)) {
                  return (
                    <div className="flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-lg p-4 min-h-[400px]">
                      <img
                        src={getFileUrl(selectedDocument.file_path)}
                        alt={selectedDocument.description || getFileName(selectedDocument.file_path)}
                        className="max-w-full max-h-[75vh] h-auto mx-auto rounded-lg shadow-xl object-contain"
                      />
                    </div>
                  )
                } else if (isPdf(selectedDocument.file_path)) {
                  return (
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden">
                      <div className="flex flex-col h-[80vh]">
                        <div className="flex-1 relative">
                          <iframe
                            src={`${getFileUrl(selectedDocument.file_path)}#toolbar=1&navpanes=1&scrollbar=1`}
                            className="w-full h-full border-0"
                            title={selectedDocument.description || getFileName(selectedDocument.file_path)}
                          />
                          <div className="absolute top-4 right-4 flex gap-2">
                            <a
                              href={getFileUrl(selectedDocument.file_path)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span>🔗</span>
                              פתח בחלון חדש
                            </a>
                            <a
                              href={getFileUrl(selectedDocument.file_path)}
                              download
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span>📥</span>
                              הורד
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                } else {
                  return (
                    <div className="text-center py-16">
                      <div className="mb-6">
                        <svg
                          className="w-24 h-24 text-gray-400 dark:text-gray-500 mx-auto mb-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">
                          לא ניתן להציג את הקובץ ישירות
                        </p>
                        <p className="text-gray-500 dark:text-gray-500 text-sm mb-6">
                          סוג קובץ: {getFileExtension(selectedDocument.file_path).toUpperCase() || 'לא ידוע'}
                        </p>
                      </div>
                      <a
                        href={getFileUrl(selectedDocument.file_path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                      >
                        <span>📥</span>
                        פתח קישור חדש להורדה
                      </a>
                    </div>
                  )
                }
              })()}
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Create Budget Modal */}
      {showAddBudgetForm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowAddBudgetForm(false)
            setBudgetFormError(null)
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                יצירת תקציב חדש
              </h2>
              <button
                onClick={() => {
                  setShowAddBudgetForm(false)
                  setBudgetFormError(null)
                }}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              <form
                onSubmit={handleAddBudget}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      קטגוריה *
                    </label>
                    <select
                      value={newBudgetForm.category}
                      onChange={(e) => setNewBudgetForm(prev => ({ ...prev, category: e.target.value }))}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      {availableCategories
                        .filter(option => {
                          // Filter out categories that already have a budget
                          const hasBudget = projectBudgets.some(budget => budget.category === option)
                          return !hasBudget
                        })
                        .map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                    </select>
                    {availableCategories.filter(option => {
                      const hasBudget = projectBudgets.some(budget => budget.category === option)
                      return !hasBudget
                    }).length === 0 && (
                      <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                        כל הקטגוריות כבר יש להן תקציב
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      סכום (₪) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newBudgetForm.amount}
                      onChange={(e) => setNewBudgetForm(prev => ({ ...prev, amount: e.target.value }))}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      סוג תקופה *
                    </label>
                    <select
                      value={newBudgetForm.period_type}
                      onChange={(e) => setNewBudgetForm(prev => ({ ...prev, period_type: e.target.value as 'Annual' | 'Monthly' }))}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="Annual">שנתי</option>
                      <option value="Monthly">חודשי</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      תאריך התחלה *
                    </label>
                    <input
                      type="date"
                      value={newBudgetForm.start_date}
                      onChange={(e) => setNewBudgetForm(prev => ({ ...prev, start_date: e.target.value }))}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                      required
                    />
                  </div>

                  {newBudgetForm.period_type === 'Annual' && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        תאריך סיום (אופציונלי)
                      </label>
                      <input
                        type="date"
                        value={newBudgetForm.end_date}
                        onChange={(e) => setNewBudgetForm(prev => ({ ...prev, end_date: e.target.value }))}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  )}
                </div>

                {budgetFormError && (
                  <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                    {budgetFormError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddBudgetForm(false)
                      setBudgetFormError(null)
                    }}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    ביטול
                  </button>
                  <button
                    type="submit"
                    disabled={budgetSaving}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {budgetSaving ? 'שומר...' : 'שמור תקציב'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Edit Budget Modal */}
      {showEditBudgetForm && budgetToEdit && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => {
            if (!editBudgetSaving) {
              setShowEditBudgetForm(false)
              setBudgetToEdit(null)
              setEditBudgetError(null)
            }
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
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  עריכת תקציב לקטגוריה
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {budgetToEdit.category}
                </p>
              </div>
              <button
                onClick={() => {
                  if (!editBudgetSaving) {
                    setShowEditBudgetForm(false)
                    setBudgetToEdit(null)
                    setEditBudgetError(null)
                  }
                }}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              <form onSubmit={handleUpdateBudget} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      קטגוריה *
                    </label>
                    {(() => {
                      const forbiddenCategories = new Set(
                        projectBudgets
                          .filter(b => b.id !== budgetToEdit.id)
                          .map(b => b.category)
                      )
                      const selectableCategories = availableCategories.filter(cat => !forbiddenCategories.has(cat) || cat === budgetToEdit.category)
                      return (
                        <select
                          value={editBudgetForm.category}
                          onChange={(e) => setEditBudgetForm(prev => ({ ...prev, category: e.target.value }))}
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {selectableCategories.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      )
                    })()}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      סכום (₪) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editBudgetForm.amount}
                      onChange={(e) => setEditBudgetForm(prev => ({ ...prev, amount: e.target.value }))}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      סוג תקופה *
                    </label>
                    <select
                      value={editBudgetForm.period_type}
                      onChange={(e) => {
                        const nextPeriod = e.target.value as 'Annual' | 'Monthly'
                        setEditBudgetForm(prev => ({
                          ...prev,
                          period_type: nextPeriod,
                          end_date: nextPeriod === 'Annual' ? prev.end_date : ''
                        }))
                      }}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Annual">שנתי</option>
                      <option value="Monthly">חודשי</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      תאריך התחלה *
                    </label>
                    <input
                      type="date"
                      value={editBudgetForm.start_date}
                      onChange={(e) => setEditBudgetForm(prev => ({ ...prev, start_date: e.target.value }))}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {editBudgetForm.period_type === 'Annual' && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        תאריך סיום (אופציונלי)
                      </label>
                      <input
                        type="date"
                        value={editBudgetForm.end_date}
                        onChange={(e) => setEditBudgetForm(prev => ({ ...prev, end_date: e.target.value }))}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={editBudgetForm.is_active}
                    onChange={(e) => setEditBudgetForm(prev => ({ ...prev, is_active: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  תקציב פעיל
                </label>
                {editBudgetError && (
                  <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                    {editBudgetError}
                  </div>
                )}
                <div className="flex items-center justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (!editBudgetSaving) {
                        setShowEditBudgetForm(false)
                        setBudgetToEdit(null)
                        setEditBudgetError(null)
                      }
                    }}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    ביטול
                  </button>
                  <button
                    type="submit"
                    disabled={editBudgetSaving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {editBudgetSaving ? 'שומר...' : 'שמור שינויים'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Description Modal for Uploaded Documents */}
      {showDescriptionModal && selectedTransactionForDocuments && uploadedDocuments.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowDescriptionModal(false)
            setUploadedDocuments([])
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
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
                }}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
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

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  setShowDescriptionModal(false)
                  setUploadedDocuments([])
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                דלג
              </button>
              <button
                onClick={async () => {
                  try {
                    let updateCount = 0
                    for (const doc of uploadedDocuments) {
                      if (doc.id > 0) {
                        try {
                          const formData = new FormData()
                          formData.append('description', doc.description || '')
                          await api.put(`/transactions/${selectedTransactionForDocuments.id}/documents/${doc.id}`, formData, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                          })
                          updateCount++
                        } catch (err: any) {
                          // Ignore errors
                        }
                      }
                    }
                    
                    setShowDescriptionModal(false)
                    setUploadedDocuments([])
                    
                    // Reload only budgets and categories (not transactions - documents don't affect transaction list)
                    await reloadChartsDataOnly()
                    if (showDocumentsModal && selectedTransactionForDocuments?.id === selectedTransactionForDocuments.id) {
                      const { data } = await api.get(`/transactions/${selectedTransactionForDocuments.id}/documents`)
                      setTransactionDocuments(data || [])
                    }
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

      {/* Previous Years Modal */}
      {showPreviousYearsModal && contractPeriods && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowPreviousYearsModal(false)}
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
                שנים קודמות
              </h2>
              <button
                onClick={() => setShowPreviousYearsModal(false)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {loadingPeriodSummary ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  טוען...
                </div>
              ) : contractPeriods.periods_by_year.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  אין תקופות חוזה קודמות
                </div>
              ) : (
                <div className="space-y-6">
                  {contractPeriods.periods_by_year.map((yearGroup) => (
                    <div key={yearGroup.year} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        שנת {yearGroup.year}
                      </h3>
                      <div className="space-y-3">
                        {yearGroup.periods.map((period) => (
                          <div
                            key={period.period_id}
                            className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div 
                                className="flex-1 cursor-pointer"
                                onClick={async () => {
                                  setLoadingPeriodSummary(true)
                                  try {
                                    const summary = await ProjectAPI.getContractPeriodSummary(
                                      parseInt(id!),
                                      period.period_id
                                    )
                                    setSelectedPeriodSummary(summary)
                                    setShowPeriodSummaryModal(true)
                                    setShowPreviousYearsModal(false)
                                  } catch (err: any) {
                                    alert(err?.response?.data?.detail || 'שגיאה בטעינת סיכום תקופת החוזה')
                                  } finally {
                                    setLoadingPeriodSummary(false)
                                  }
                                }}
                              >
                                <div className="font-semibold text-gray-900 dark:text-white mb-1">
                                  {period.year_label}
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                  {formatDate(period.start_date)} - {formatDate(period.end_date)}
                                </div>
                              </div>
                              <div className="text-left ml-4">
                                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">סיכום כלכלי:</div>
                                <div className="text-green-600 dark:text-green-400 font-semibold">
                                  הכנסות: {formatCurrency(period.total_income)} ₪
                                </div>
                                <div className="text-red-600 dark:text-red-400 font-semibold">
                                  הוצאות: {formatCurrency(period.total_expense)} ₪
                                </div>
                                <div className={`font-semibold ${
                                  period.total_profit >= 0
                                    ? 'text-green-600 dark:text-green-400'
                                    : 'text-red-600 dark:text-red-400'
                                }`}>
                                  רווח: {formatCurrency(period.total_profit)} ₪
                                </div>
                              </div>
                              <div className="ml-4 flex items-center gap-2">
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    try {
                                      const response = await api.get(
                                        `/projects/${id}/contract-periods/${period.period_id}/export-csv`,
                                        { responseType: 'blob' }
                                      )
                                      const url = window.URL.createObjectURL(new Blob([response.data]))
                                      const link = document.createElement('a')
                                      link.href = url
                                      const safeProjectName = projectName.replace(/[^a-zA-Z0-9_\-]/g, '_')
                                      const safeYearLabel = period.year_label.replace(/[^a-zA-Z0-9_\-א-ת]/g, '_')
                                      link.setAttribute('download', `contract_period_${safeYearLabel}_${safeProjectName}.xlsx`)
                                      document.body.appendChild(link)
                                      link.click()
                                      link.remove()
                                      window.URL.revokeObjectURL(url)
                                    } catch (err) {
                                      console.error('Error exporting CSV:', err)
                                      alert('שגיאה בייצוא CSV')
                                    }
                                  }}
                                  className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1 text-sm"
                                  title="הורד CSV"
                                >
                                  <Download className="w-4 h-4" />
                                  CSV
                                </button>
                                <div 
                                  className="cursor-pointer"
                                  onClick={async () => {
                                    setLoadingPeriodSummary(true)
                                    try {
                                      const summary = await ProjectAPI.getContractPeriodSummary(
                                        parseInt(id!),
                                        period.period_id
                                      )
                                      setSelectedPeriodSummary(summary)
                                      setShowPeriodSummaryModal(true)
                                      setShowPreviousYearsModal(false)
                                    } catch (err: any) {
                                      alert(err?.response?.data?.detail || 'שגיאה בטעינת סיכום תקופת החוזה')
                                    } finally {
                                      setLoadingPeriodSummary(false)
                                    }
                                  }}
                                >
                                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Contract Period Summary Modal */}
      {showPeriodSummaryModal && selectedPeriodSummary && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowPeriodSummaryModal(false)
            setSelectedPeriodSummary(null)
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  סיכום תקופת חוזה - {selectedPeriodSummary.year_label}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {formatDate(selectedPeriodSummary.start_date)} - {formatDate(selectedPeriodSummary.end_date)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    try {
                      const blob = await ProjectAPI.exportContractPeriodCSV(
                        parseInt(id!),
                        selectedPeriodSummary.period_id
                      )
                      const url = window.URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `contract_period_${selectedPeriodSummary.year_label}_${projectName}.csv`
                      document.body.appendChild(a)
                      a.click()
                      window.URL.revokeObjectURL(url)
                      document.body.removeChild(a)
                    } catch (err: any) {
                      alert(err?.response?.data?.detail || 'שגיאה בייצוא CSV')
                    }
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  הורד CSV
                </button>
                <button
                  onClick={() => {
                    setShowPeriodSummaryModal(false)
                    setSelectedPeriodSummary(null)
                    setShowPreviousYearsModal(true)
                  }}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {/* Financial Summary */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 mb-6">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">סיכום כלכלי</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center">
                    <div className="text-green-600 dark:text-green-400 font-semibold mb-1">הכנסות</div>
                    <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                      {formatCurrency(selectedPeriodSummary.total_income)} ₪
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center">
                    <div className="text-red-600 dark:text-red-400 font-semibold mb-1">הוצאות</div>
                    <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                      {formatCurrency(selectedPeriodSummary.total_expense)} ₪
                    </div>
                  </div>
                  <div className={`bg-white dark:bg-gray-800 rounded-lg p-4 text-center ${
                    selectedPeriodSummary.total_profit < 0 
                      ? 'border-2 border-red-300 dark:border-red-700' 
                      : 'border-2 border-green-300 dark:border-green-700'
                  }`}>
                    <div className={`font-semibold mb-1 ${
                      selectedPeriodSummary.total_profit < 0 
                        ? 'text-red-600 dark:text-red-400' 
                        : 'text-green-600 dark:text-green-400'
                    }`}>
                      רווח נטו
                    </div>
                    <div className={`text-2xl font-bold ${
                      selectedPeriodSummary.total_profit < 0 
                        ? 'text-red-700 dark:text-red-300' 
                        : 'text-green-700 dark:text-green-300'
                    }`}>
                      {formatCurrency(selectedPeriodSummary.total_profit)} ₪
                    </div>
                  </div>
                </div>
              </div>

              {/* Budgets */}
              {selectedPeriodSummary.budgets && selectedPeriodSummary.budgets.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">תקציבים</h3>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">קטגוריה</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">סכום</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">סוג תקופה</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">תאריך התחלה</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">תאריך סיום</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">פעיל</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {selectedPeriodSummary.budgets.map((budget: any, index: number) => (
                          <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{budget.category}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{formatCurrency(budget.amount)} ₪</td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {budget.period_type === 'Annual' ? 'שנתי' : 'חודשי'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {budget.start_date ? formatDate(budget.start_date) : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {budget.end_date ? formatDate(budget.end_date) : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {budget.is_active ? 'כן' : 'לא'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Transactions */}
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                  עסקאות ({selectedPeriodSummary.transactions.length})
                </h3>
                {selectedPeriodSummary.transactions.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    אין עסקאות בתקופה זו
                  </div>
                ) : (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
                      <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0 z-10">
                          <tr>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">תאריך</th>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">סוג</th>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">סכום</th>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">תיאור</th>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">קטגוריה</th>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">אמצעי תשלום</th>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">הערות</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {selectedPeriodSummary.transactions.map((tx: any) => (
                            <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                              <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                {formatDate(tx.tx_date)}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                  tx.type === 'Income'
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                }`}>
                                  {tx.type === 'Income' ? 'הכנסה' : 'הוצאה'}
                                </span>
                              </td>
                              <td className={`px-4 py-3 text-sm font-semibold ${
                                tx.type === 'Income'
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-red-600 dark:text-red-400'
                              }`}>
                                {tx.type === 'Income' ? '+' : '-'}{formatCurrency(tx.amount)} ₪
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                {tx.description || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                {getCategoryName(tx.category) || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                {tx.payment_method ? PAYMENT_METHOD_LABELS[tx.payment_method] || tx.payment_method : '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                {tx.notes || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Period Summary Modal */}
      {showPeriodSummaryModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                {selectedPeriodSummary ? `סיכום תקופת חוזה ${selectedPeriodSummary.year_label}` : 'סיכום תקופת חוזה'}
              </h3>
              <div className="flex items-center gap-3">
                {selectedPeriodSummary && (
                  <button
                    onClick={async () => {
                      try {
                        const response = await api.get(
                          `/projects/${id}/contract-periods/${selectedPeriodSummary.period_id}/export-csv`,
                          { responseType: 'blob' }
                        )
                        const url = window.URL.createObjectURL(new Blob([response.data]))
                        const link = document.createElement('a')
                        link.href = url
                        link.setAttribute('download', `contract_period_${selectedPeriodSummary.year_label}_${projectName}.csv`)
                        document.body.appendChild(link)
                        link.click()
                        link.remove()
                        window.URL.revokeObjectURL(url)
                      } catch (err) {
                        console.error('Error exporting CSV:', err)
                        alert('שגיאה בייצוא CSV')
                      }
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    הורד CSV
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowPeriodSummaryModal(false)
                    setSelectedPeriodSummary(null)
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {loadingPeriodSummary ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
                  <p className="mt-4 text-gray-600 dark:text-gray-400">טוען סיכום...</p>
                </div>
              ) : selectedPeriodSummary ? (
                <div className="space-y-6">
                  {/* Financial Summary */}
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-6">
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">סיכום כלכלי</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">הכנסות</div>
                        <div className="text-2xl font-bold text-green-600">
                          {formatCurrency(selectedPeriodSummary.total_income)} ₪
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">הוצאות</div>
                        <div className="text-2xl font-bold text-red-600">
                          {formatCurrency(selectedPeriodSummary.total_expense)} ₪
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">רווח</div>
                        <div className={`text-2xl font-bold ${selectedPeriodSummary.total_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(selectedPeriodSummary.total_profit)} ₪
                        </div>
                      </div>
                    </div>
                  </div>


                  {/* Fund Chart (if fund data exists) */}
                  {selectedPeriodSummary.fund_data && (
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">קופה</h4>
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                        <div className="grid grid-cols-2 gap-6">
                          <div className="text-center">
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">יתרה בסוף התקופה</div>
                            <div className="text-3xl font-bold text-purple-600">
                              {formatCurrency(selectedPeriodSummary.fund_data.final_balance || 0)} ₪
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">יתרה בתחילת התקופה</div>
                            <div className="text-3xl font-bold text-blue-600">
                              {formatCurrency(selectedPeriodSummary.fund_data.initial_balance || 0)} ₪
                            </div>
                          </div>
                        </div>
                        {selectedPeriodSummary.fund_data.monthly_amount > 0 && (
                          <div className="mt-4 text-center">
                            <div className="text-sm text-gray-600 dark:text-gray-400">סכום חודשי</div>
                            <div className="text-xl font-semibold text-gray-900 dark:text-white">
                              {formatCurrency(selectedPeriodSummary.fund_data.monthly_amount)} ₪
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Transactions */}
                  {selectedPeriodSummary.transactions && selectedPeriodSummary.transactions.length > 0 && (
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">עסקאות ({selectedPeriodSummary.transactions.length})</h4>
                      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                        <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
                          <table className="w-full text-right">
                            <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-700/50">
                              <tr className="border-b border-gray-200 dark:border-gray-600">
                                <th className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">תאריך</th>
                                <th className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">סוג</th>
                                <th className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">סכום</th>
                                <th className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">תיאור</th>
                                <th className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">קטגוריה</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedPeriodSummary.transactions.map((tx: any) => (
                                <tr key={tx.id} className="border-b border-gray-100 dark:border-gray-700">
                                  <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{formatDate(tx.tx_date)}</td>
                                  <td className="px-4 py-2 text-sm">
                                    <span className={`px-2 py-1 rounded text-xs ${tx.type === 'Income' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
                                      {tx.type === 'Income' ? 'הכנסה' : 'הוצאה'}
                                    </span>
                                  </td>
                                  <td className={`px-4 py-2 text-sm font-semibold ${tx.type === 'Income' ? 'text-green-600' : 'text-red-600'}`}>
                                    {tx.type === 'Income' ? '+' : '-'}{formatCurrency(tx.amount)} ₪
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{tx.description || '-'}</td>
                                  <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{tx.category || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                  אין מידע להצגה
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {showContractModal && contractFileUrl && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">חוזה הפרויקט</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">נפתח בתוך האתר לצפייה מהירה</p>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={contractFileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  פתח בחלון חדש
                </a>
                <button
                  type="button"
                  onClick={() => setShowContractModal(false)}
                  className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 w-full bg-gray-50 dark:bg-gray-800">
              {contractViewerUrl ? (
                <iframe
                  src={contractViewerUrl}
                  title="תצוגת חוזה"
                  className="w-full h-[70vh] border-0"
                  allowFullScreen
                 />
              ) : (
                <div className="p-6 text-center text-sm text-gray-600 dark:text-gray-300 space-y-3">
                  <p>לא ניתן להציג תצוגה מקדימה לסוג קובץ זה.</p>
                  <p>
                    ניתן להוריד את הקובץ ולצפות בו במחשב:
                    <br />
                    <a
                      href={contractFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 underline"
                    >
                      הורד את החוזה
                    </a>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Monthly Expense Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4"
      >
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 text-right">
          דוח הוצאות חודשי
        </h2>
        
        {(() => {
          // Get current date
          const now = new Date()
          const currentYear = now.getFullYear()
          const currentMonth = now.getMonth() // 0-11 (Jan = 0, Dec = 11)
          
          // Determine Hebrew year start (July of current year, or previous year if we're before July)
          const hebrewYearStart = currentMonth >= 6 ? currentYear : currentYear - 1 // July = month 6 (0-indexed)
          const hebrewYearStartDate = new Date(hebrewYearStart, 6, 1) // July 1st
          
          // Get project start date if available
          let projectStartMonthDate: Date | null = null
          if (projectStartDate) {
            try {
              const projectDate = new Date(projectStartDate)
              projectStartMonthDate = new Date(projectDate.getFullYear(), projectDate.getMonth(), 1) // Start of month
            } catch (e) {
              // Invalid date, ignore
            }
          }
          
          // Choose the start date
          let tableStartDate: Date = hebrewYearStartDate
          
          if (projectStartMonthDate) {
            // Check if project start is later than hebrew year start (e.g. started in August)
            if (projectStartMonthDate > hebrewYearStartDate) {
              tableStartDate = projectStartMonthDate
            } else {
              // If project started before hebrew year start (e.g. May),
              // check if we are still within the first year of the project relative to now.
              // If the project started recently (within the last ~year) and using its start date
              // covers the current date, we prefer the project start date.
              const oneYearAfterProjectStart = new Date(projectStartMonthDate)
              oneYearAfterProjectStart.setMonth(oneYearAfterProjectStart.getMonth() + 12)
              
              // If current date is within the first year of the project
              if (now < oneYearAfterProjectStart) {
                tableStartDate = projectStartMonthDate
              }
            }
          }
          
          const startYear = tableStartDate.getFullYear()
          const startMonth = tableStartDate.getMonth() // 0-11
          
          // Create 12 month periods starting from the chosen start date
          const months: Array<{ year: number; month: number; monthIndex: number; monthKey: string; label: string }> = []
          
          // Hebrew month names by calendar month (0=Jan, 11=Dec)
          const monthNamesByCalendarMonth = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
          
          for (let i = 0; i < 12; i++) {
            const monthIndex = (startMonth + i) % 12
            const year = startYear + Math.floor((startMonth + i) / 12)
            const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`
            months.push({
              year,
              month: monthIndex,
              monthIndex: i,
              monthKey,
              label: monthNamesByCalendarMonth[monthIndex]
            })
          }
          
          // Split all transactions by month (including period transactions)
          const allSplits: SplitTransaction[] = []
          txs.forEach(tx => {
            const splits = splitPeriodTransactionByMonth(tx)
            allSplits.push(...splits)
          })
          
          // Filter out fund transactions
          const regularSplits = allSplits.filter(s => !s.from_fund)
          
          // Group by month and category
          const monthlyData: Record<string, {
            income: number
            expenses: Record<string, number>
            totalExpenses: number
          }> = {}
          
          // Initialize all months
          months.forEach(m => {
            monthlyData[m.monthKey] = {
              income: 0,
              expenses: {},
              totalExpenses: 0
            }
          })
          
          // Process transactions
          regularSplits.forEach(split => {
            const monthKey = split.monthKey
            if (monthlyData[monthKey]) {
              if (split.type === 'Income') {
                monthlyData[monthKey].income += split.proportionalAmount
              } else if (split.type === 'Expense') {
                const category = split.category || 'אחר'
                monthlyData[monthKey].expenses[category] = (monthlyData[monthKey].expenses[category] || 0) + split.proportionalAmount
                monthlyData[monthKey].totalExpenses += split.proportionalAmount
              }
            }
          })
          
          // Get all unique categories
          const allCategories = new Set<string>()
          Object.values(monthlyData).forEach(month => {
            Object.keys(month.expenses).forEach(cat => allCategories.add(cat))
          })
          const categories = Array.from(allCategories).sort()
          
          // Helper function to check if we've reached a month (month has started or passed)
          const hasReachedMonth = (year: number, month: number): boolean => {
            const now = new Date()
            const currentYear = now.getFullYear()
            const currentMonth = now.getMonth() // 0-11
            const monthDate = new Date(year, month, 1)
            const currentDate = new Date(currentYear, currentMonth, 1)
            return monthDate <= currentDate
          }
          
          // Helper function to check if a month has any transactions (past, present, or future)
          const hasMonthTransactions = (monthKey: string): boolean => {
            const monthData = monthlyData[monthKey]
            if (!monthData) return false
            // Check if there are any transactions (income or expenses) for this month
            return monthData.income > 0 || monthData.totalExpenses > 0
          }
          
          // Get monthly budget amount (the fixed amount collected from tenants each month)
          const monthlyBudgetAmount = Number(projectBudget?.budget_monthly || 0)
          
          // Calculate monthly income - combine actual transactions with monthly budget
          // For months that have been reached, add the monthly budget amount
          const monthlyIncome = months.map(m => {
            const transactionIncome = monthlyData[m.monthKey].income
            // Add monthly budget if we've reached this month and there's a budget
            if (hasReachedMonth(m.year, m.month) && monthlyBudgetAmount > 0) {
              return transactionIncome + monthlyBudgetAmount
            }
            return transactionIncome
          })
          
          // Calculate total expenses per month
          const monthlyTotals = months.map(m => monthlyData[m.monthKey].totalExpenses)
          
          // Calculate running totals (cumulative) - accumulates month by month
          // Include future months if they have transactions
          let runningTotal = 0
          const runningTotals: number[] = []
          months.forEach(m => {
            const monthData = monthlyData[m.monthKey]
            const monthIndex = months.indexOf(m)
            const hasReached = hasReachedMonth(m.year, m.month)
            const hasTransactions = hasMonthTransactions(m.monthKey)
            // Accumulate if we've reached this month OR if there are transactions for this month
            if (hasReached || hasTransactions) {
              const monthBalance = monthlyIncome[monthIndex] - monthData.totalExpenses
              runningTotal += monthBalance
            }
            runningTotals.push(runningTotal)
          })
          
          return (
            <div className="overflow-x-auto" dir="rtl">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-2 py-1 text-right font-semibold text-gray-900 dark:text-white sticky left-0 z-10 min-w-[120px]">
                      קטגוריה
                    </th>
                    {months.map((m, idx) => (
                      <th key={idx} className="border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-1 py-1 text-center font-semibold text-gray-900 dark:text-white min-w-[60px]">
                        {m.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Expense category rows */}
                  {categories.map((category, catIdx) => (
                    <tr key={catIdx}>
                      <td className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-right text-gray-900 dark:text-white sticky left-0 z-10">
                        {category}
                      </td>
                      {months.map((m, monthIdx) => {
                        const hasReached = hasReachedMonth(m.year, m.month)
                        const hasTransactions = hasMonthTransactions(m.monthKey)
                        // Show if month has been reached OR if there are transactions for this month
                        const shouldShow = hasReached || hasTransactions
                        return (
                          <td key={monthIdx} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-2 text-center text-gray-900 dark:text-white">
                            {shouldShow && monthlyData[m.monthKey].expenses[category] 
                              ? formatCurrency(monthlyData[m.monthKey].expenses[category])
                              : shouldShow ? '0' : ''}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  
                  {/* Empty rows for spacing (if needed) */}
                  {categories.length === 0 && (
                    <tr>
                      <td colSpan={13} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-center text-gray-500 dark:text-gray-400">
                        אין הוצאות להצגה
                      </td>
                    </tr>
                  )}
                  
                  {/* סה"כ בקופה החודשית (Total in monthly fund) - Pink */}
                  <tr>
                    <td className="border border-gray-300 dark:border-gray-600 bg-pink-200 dark:bg-pink-900 px-2 py-1 text-right font-semibold text-gray-900 dark:text-white sticky left-0 z-10">
                      סה"כ בקופה החודשית
                    </td>
                    {months.map((m, monthIdx) => {
                      const hasReached = hasReachedMonth(m.year, m.month)
                      const hasTransactions = hasMonthTransactions(m.monthKey)
                      // Show if month has been reached OR if there are transactions for this month
                      const shouldShow = hasReached || hasTransactions
                      return (
                        <td key={monthIdx} className="border border-gray-300 dark:border-gray-600 bg-pink-200 dark:bg-pink-900 px-1 py-1 text-center font-semibold text-gray-900 dark:text-white">
                          {shouldShow ? formatCurrency(monthlyIncome[monthIdx]) : ''}
                        </td>
                      )
                    })}
                  </tr>
                  
                  {/* הוצאות (Expenses) - Yellow */}
                  <tr>
                    <td className="border border-gray-300 dark:border-gray-600 bg-yellow-200 dark:bg-yellow-900 px-2 py-1 text-right font-semibold text-gray-900 dark:text-white sticky left-0 z-10">
                      הוצאות
                    </td>
                    {months.map((m, monthIdx) => {
                      const hasReached = hasReachedMonth(m.year, m.month)
                      const hasTransactions = hasMonthTransactions(m.monthKey)
                      // Show if month has been reached OR if there are transactions for this month
                      const shouldShow = hasReached || hasTransactions
                      return (
                        <td key={monthIdx} className="border border-gray-300 dark:border-gray-600 bg-yellow-200 dark:bg-yellow-900 px-1 py-1 text-center font-semibold text-gray-900 dark:text-white">
                          {shouldShow ? formatCurrency(monthlyTotals[monthIdx]) : ''}
                        </td>
                      )
                    })}
                  </tr>
                  
                  {/* עודף (Surplus/Balance) - Light Blue */}
                  <tr>
                    <td className="border border-gray-300 dark:border-gray-600 bg-blue-200 dark:bg-blue-900 px-2 py-1 text-right font-semibold text-gray-900 dark:text-white sticky left-0 z-10">
                      עודף
                    </td>
                    {months.map((m, monthIdx) => {
                      const hasReached = hasReachedMonth(m.year, m.month)
                      const hasTransactions = hasMonthTransactions(m.monthKey)
                      // Show if month has been reached OR if there are transactions for this month
                      const shouldShow = hasReached || hasTransactions
                      const balance = monthlyIncome[monthIdx] - monthlyTotals[monthIdx]
                      return (
                        <td key={monthIdx} className="border border-gray-300 dark:border-gray-600 bg-blue-200 dark:bg-blue-900 px-1 py-1 text-center font-semibold text-gray-900 dark:text-white">
                          {shouldShow ? formatCurrency(balance) : ''}
                        </td>
                      )
                    })}
                  </tr>
                  
                  {/* סה"כ בקופה השנתית (Total in annual fund) - Light Green */}
                  <tr>
                    <td className="border border-gray-300 dark:border-gray-600 bg-green-200 dark:bg-green-900 px-2 py-1 text-right font-semibold text-gray-900 dark:text-white sticky left-0 z-10">
                      סה"כ בקופה השנתית
                    </td>
                    {months.map((m, monthIdx) => {
                      const hasReached = hasReachedMonth(m.year, m.month)
                      const hasTransactions = hasMonthTransactions(m.monthKey)
                      // Show if month has been reached OR if there are transactions for this month
                      const shouldShow = hasReached || hasTransactions
                      return (
                        <td key={monthIdx} className="border border-gray-300 dark:border-gray-600 bg-green-200 dark:bg-green-900 px-1 py-1 text-center font-semibold text-gray-900 dark:text-white">
                          {shouldShow ? formatCurrency(runningTotals[monthIdx]) : ''}
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )
        })()}
      </motion.div>

      {/* Archive/Delete Choice Modal */}
      <Modal
        open={showArchiveDeleteModal}
        onClose={() => setShowArchiveDeleteModal(false)}
        title="מה תרצה לעשות?"
      >
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            בחר פעולה עבור הפרויקט "{projectName}":
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleArchive}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              ארכב
            </button>
            <button
              onClick={handleDeleteChoice}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              מחק לצמיתות
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal with Password */}
      <Modal
        open={showDeleteConfirmModal}
        onClose={() => {
          setShowDeleteConfirmModal(false)
          setDeletePassword('')
          setDeletePasswordError('')
        }}
        title="מחיקת פרויקט לצמיתות"
      >
        <div className="space-y-4">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-800 dark:text-red-200 font-semibold mb-2">
              אזהרה: פעולה זו אינה הפיכה!
            </p>
            <p className="text-red-700 dark:text-red-300 text-sm">
              הפרויקט "{projectName}" ימחק לצמיתות יחד עם כל העסקאות והקבצים שלו.
              לא ניתן לשחזר את המידע לאחר המחיקה.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              הזן סיסמה לאימות:
            </label>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => {
                setDeletePassword(e.target.value)
                setDeletePasswordError('')
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              placeholder="סיסמה"
              autoFocus
            />
            {deletePasswordError && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{deletePasswordError}</p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowDeleteConfirmModal(false)
                setDeletePassword('')
                setDeletePasswordError('')
              }}
              className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              disabled={isDeleting}
            >
              ביטול
            </button>
            <button
              onClick={handleDeleteConfirm}
              disabled={isDeleting || !deletePassword}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? 'מוחק...' : 'מחק לצמיתות'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}