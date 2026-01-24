import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../lib/api'
import { ReportAPI, BudgetAPI, ProjectAPI, CategoryAPI, RecurringTransactionAPI } from '../lib/apiClient'
import { ExpenseCategory, BudgetWithSpending, RecurringTransactionTemplate, Transaction as ApiTransaction } from '../types/api'
import ProjectTrendsChart from '../components/charts/ProjectTrendsChart'
import BudgetCard from '../components/charts/BudgetCard'
import EditTransactionModal from '../components/EditTransactionModal'
import CreateTransactionModal from '../components/CreateTransactionModal'
import CreateProjectModal from '../components/CreateProjectModal'
import EditRecurringTemplateModal from '../components/EditRecurringTemplateModal'
import EditRecurringSelectionModal from '../components/EditRecurringSelectionModal'
import DeleteTransactionModal from '../components/DeleteTransactionModal'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import { fetchSuppliers } from '../store/slices/suppliersSlice'
import { archiveProject, hardDeleteProject } from '../store/slices/projectsSlice'
import { fetchMe } from '../store/slices/authSlice'
import { ChevronDown, History, Download, Edit, ChevronLeft, Archive, ChevronRight, Eye } from 'lucide-react'
import Modal from '../components/Modal'
import {
  CATEGORY_LABELS,
  normalizeCategoryForFilter,
  calculateMonthlyIncomeAccrual
} from '../utils/calculations'
import { formatDate, parseLocalDate, dateToLocalString } from '../lib/utils'

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

interface Transaction extends ApiTransaction {
  subproject_id?: number | null
  created_by_user_id?: number | null
  created_by_user?: {
    id: number
    full_name: string
    email: string
  } | null
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
    const txDate = parseLocalDate(tx.tx_date) || new Date()
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
  const startDate = parseLocalDate(tx.period_start_date) || new Date()
  startDate.setHours(0, 0, 0, 0)
  const endDate = parseLocalDate(tx.period_end_date) || new Date()
  endDate.setHours(23, 59, 59, 999) // Set to end of day to include the full last day
  
  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
  
  if (totalDays <= 0) {
    // Invalid period, return as-is
    const txDate = parseLocalDate(tx.tx_date) || new Date()
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
  // Start from the first day of the start date's month
  const startYear = startDate.getFullYear()
  const startMonth = startDate.getMonth()
  const current = new Date(startYear, startMonth, 1)
  current.setHours(0, 0, 0, 0)
  
  // Create a date for the end of the period month to compare
  const endYear = endDate.getFullYear()
  const endMonth = endDate.getMonth()
  const periodEndMonth = new Date(endYear, endMonth + 1, 0) // Last day of end date's month
  periodEndMonth.setHours(23, 59, 59, 999)
  
  while (current <= periodEndMonth) {
    const year = current.getFullYear()
    const month = current.getMonth()
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
    
    // Calculate the first and last day of this month that are within the period
    const monthStart = new Date(year, month, 1)
    monthStart.setHours(0, 0, 0, 0)
    const monthEnd = new Date(year, month + 1, 0) // Last day of month
    monthEnd.setHours(23, 59, 59, 999) // Set to end of day
    
    // Calculate overlap between transaction period and this month
    // Use getTime() for accurate comparison
    const overlapStartTime = Math.max(startDate.getTime(), monthStart.getTime())
    const overlapEndTime = Math.min(endDate.getTime(), monthEnd.getTime())
    
    // Check if there's any overlap at all (even if it's just one day)
    if (overlapStartTime <= overlapEndTime) {
      // Calculate days including both start and end dates
      // The difference in milliseconds divided by milliseconds per day, plus 1 to include both days
      let daysInMonth = Math.floor((overlapEndTime - overlapStartTime) / (1000 * 60 * 60 * 24)) + 1
      
      // Ensure we have at least 1 day if there's any overlap
      // This handles edge cases where the period starts and ends on the same day of the month
      if (daysInMonth <= 0) {
        daysInMonth = 1
      }
      
      // Additional check: if startDate is exactly on the first day of the month, ensure we count it
      if (startDate.getTime() === monthStart.getTime() && daysInMonth === 0) {
        daysInMonth = 1
      }
      
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
    
    // Move to next month - use setMonth to handle year overflow correctly
    if (month === 11) {
      // December -> January of next year
      current.setFullYear(year + 1)
      current.setMonth(0)
    } else {
      current.setMonth(month + 1)
    }
    current.setDate(1)
    current.setHours(0, 0, 0, 0)
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
  const [searchParams, setSearchParams] = useSearchParams()
  const periodIdParam = searchParams.get('period')
  const viewingPeriodId = periodIdParam ? parseInt(periodIdParam) : null
  const dispatch = useAppDispatch()
  const { items: suppliers } = useAppSelector(s => s.suppliers)
  const me = useAppSelector(s => s.auth.me)
  const isAdmin = me?.role === 'Admin'
  const [txs, setTxs] = useState<Transaction[]>([])
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([])
  const [projectBudgets, setProjectBudgets] = useState<BudgetWithSpending[]>([])
  const [projectName, setProjectName] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [updatingProject, setUpdatingProject] = useState(false)
  const [chartsLoading, setChartsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
  
  // Global Date Filter State - Used across all sections (financial summary, transactions, charts)
  const [globalDateFilterMode, setGlobalDateFilterMode] = useState<'current_month' | 'selected_month' | 'date_range' | 'all_time' | 'project'>('current_month')
  const [globalSelectedMonth, setGlobalSelectedMonth] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [globalSelectedYear, setGlobalSelectedYear] = useState<number>(new Date().getFullYear())
  const [globalStartDate, setGlobalStartDate] = useState<string>('')
  const [globalEndDate, setGlobalEndDate] = useState<string>('')

  // Legacy aliases for backward compatibility
  const dateFilterMode = globalDateFilterMode === 'project' ? 'all_time' : globalDateFilterMode
  const selectedMonth = globalSelectedMonth
  const startDate = globalStartDate
  const endDate = globalEndDate
  const setDateFilterMode = (mode: 'current_month' | 'selected_month' | 'date_range' | 'all_time') => setGlobalDateFilterMode(mode)
  const setSelectedMonth = setGlobalSelectedMonth
  const setStartDate = setGlobalStartDate
  const setEndDate = setGlobalEndDate
  
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [filterDated, setFilterDated] = useState<'all' | 'only'>('all')

  const [editTransactionModalOpen, setEditTransactionModalOpen] = useState(false)
  const [selectedTransactionForEdit, setSelectedTransactionForEdit] = useState<any | null>(null)
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<'all' | 'regular' | 'recurring'>('all')
  const [editTemplateModalOpen, setEditTemplateModalOpen] = useState(false)
  const [selectedTemplateForEdit, setSelectedTemplateForEdit] = useState<RecurringTransactionTemplate | null>(null)
  const [pendingTemplateLoad, setPendingTemplateLoad] = useState(false)
  const [recurringTemplates, setRecurringTemplates] = useState<RecurringTransactionTemplate[]>([])
  const [showDeleteTransactionModal, setShowDeleteTransactionModal] = useState(false)
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null)
  const [isDeletingTransaction, setIsDeletingTransaction] = useState(false)
  const [monthlyTableYear, setMonthlyTableYear] = useState(() => new Date().getFullYear())

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
        if (viewingPeriodId) {
          try {
            await RecurringTransactionAPI.ensureProjectTransactionsGenerated(parseInt(id))
          } catch (genErr) {
            console.log('Could not ensure recurring transactions for historical period:', genErr)
          }
          await loadAllProjectData(viewingPeriodId)
          return
        }

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
        
        if (dateFilterMode !== 'current_month') {
          const { data } = await api.get(`/transactions/project/${id}`)
          setTxs(data || [])
        }
      } catch (err) {
        console.log('Could not generate recurring transactions:', err)
      }
    }

    generateForSelectedPeriod()
  }, [selectedMonth, dateFilterMode, startDate, endDate, id, viewingPeriodId])
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
  const [budgetDateMode, setBudgetDateMode] = useState<'project_start' | 'today' | 'custom'>('today')
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

  // Update budget start date based on date mode
  useEffect(() => {
    if (budgetDateMode === 'project_start' && projectStartDate) {
      const dateStr = projectStartDate.includes('T') ? projectStartDate.split('T')[0] : projectStartDate
      setNewBudgetForm(prev => ({ ...prev, start_date: dateStr }))
    } else if (budgetDateMode === 'today') {
      setNewBudgetForm(prev => ({ ...prev, start_date: new Date().toISOString().split('T')[0] }))
    }
    // For 'custom' mode, user will manually select the date
  }, [budgetDateMode, projectStartDate])
  
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
  const [fundUpdateScope, setFundUpdateScope] = useState<'from_start' | 'from_this_month' | 'only_this_month'>('from_this_month')
  const [monthlyFundAmount, setMonthlyFundAmount] = useState<number>(0)
  const [currentBalance, setCurrentBalance] = useState<number>(0)
  const [creatingFund, setCreatingFund] = useState(false)
  const [updatingFund, setUpdatingFund] = useState(false)
  /** When adding fund in a previous year: 'only_period' = only that period, 'also_current' = also through current period */
  const [fundScopePreviousYear, setFundScopePreviousYear] = useState<'only_period' | 'also_current' | null>(null)
  
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

  // Calculate total periods: previous periods + current period (if exists)
  // Show button if there are any periods at all
  const totalPeriods = useMemo(() => {
    // Count previous periods (excluding current)
    const previousPeriodsCount = contractPeriods?.periods_by_year 
      ? contractPeriods.periods_by_year.reduce((sum, year) => sum + year.periods.length, 0)
      : 0;
    // Show button if there are previous periods OR if we have contractPeriods data (indicating periods system is active)
    // This ensures button shows even if only current period exists
    return previousPeriodsCount > 0 || (contractPeriods !== null && contractPeriods !== undefined) ? 1 : 0;
  }, [contractPeriods]);

  const [currentContractPeriod, setCurrentContractPeriod] = useState<{
    period_id: number | null
    start_date: string
    end_date: string | null
    contract_year: number
    year_index: number
    year_label: string
    total_income: number
    total_expense: number
    total_profit: number
  } | null>(null)

  /** First (earliest) contract start date. Used for validation: allow transactions in any contract (including old ones), block only before the first. */
  const firstContractStartDate = useMemo(() => {
    let min: string | null = null;
    if (currentContractPeriod?.start_date) {
      min = currentContractPeriod.start_date;
    }
    if (contractPeriods?.periods_by_year?.length) {
      for (const yearGroup of contractPeriods.periods_by_year) {
        for (const p of yearGroup.periods || []) {
          if (p.start_date) {
            if (!min || p.start_date < min) min = p.start_date;
          }
        }
      }
    }
    return min;
  }, [contractPeriods, currentContractPeriod?.start_date]);
  
  // Selected period state - for viewing historical periods
  const [selectedPeriod, setSelectedPeriod] = useState<{
    period_id: number
    start_date: string
    end_date: string | null
    contract_year: number
    year_index: number
    year_label: string
    total_income: number
    total_expense: number
    total_profit: number
  } | null>(null)
  
  // Determine if we're viewing a historical period
  const isViewingHistoricalPeriod = viewingPeriodId !== null && selectedPeriod !== null

  // Flattened list of all periods sorted by date
  const allPeriods = useMemo(() => {
    if (!contractPeriods?.periods_by_year) return [];
    return contractPeriods.periods_by_year
      .flatMap(yearGroup => yearGroup.periods)
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  }, [contractPeriods]);

  // Find the index of the currently viewed period
  const currentViewingPeriodIndex = useMemo(() => {
    if (!selectedPeriod || allPeriods.length === 0) return -1;
    return allPeriods.findIndex(p => p.period_id === selectedPeriod.period_id);
  }, [selectedPeriod, allPeriods]);

  // Previous and next periods for navigation
  const prevPeriod = currentViewingPeriodIndex > 0 ? allPeriods[currentViewingPeriodIndex - 1] : null;
  const nextPeriod = currentViewingPeriodIndex !== -1 && currentViewingPeriodIndex < allPeriods.length - 1 
    ? allPeriods[currentViewingPeriodIndex + 1] 
    : null;
  
  const [showPreviousYearsModal, setShowPreviousYearsModal] = useState(false)
  const [selectedPeriodSummary, setSelectedPeriodSummary] = useState<any | null>(null)
  const [showPeriodSummaryModal, setShowPeriodSummaryModal] = useState(false)
  const [loadingPeriodSummary, setLoadingPeriodSummary] = useState(false)
  
  // OPTIMIZED: Load all project data in a SINGLE API call
  // Replaces 5+ separate API calls with ONE for much faster page load
  // Optional periodId parameter for viewing historical periods
  const loadAllProjectData = async (periodId?: number | null) => {
    if (!id || isNaN(Number(id))) return

    setLoading(true)
    setChartsLoading(true)
    setError(null)
    try {
      const fullData = await ProjectAPI.getProjectFull(parseInt(id), periodId || undefined)

      // Set project info
      const proj = fullData.project
      setProjectName(proj.name || `פרויקט ${id}`)
      setProjectBudget({
        budget_monthly: proj.budget_monthly || 0,
        budget_annual: proj.budget_annual || 0
      })
      setProjectStartDate(proj.start_date || null)
      setProjectEndDate(proj.end_date || null)
      setIsParentProject(proj.is_parent_project || false)
      setHasFund(proj.has_fund || false)
      setContractFileUrl(proj.contract_file_url || null)
      setProjectImageUrl(proj.image_url || null)

      // Set default filter mode if viewing current month but project has already ended
      if (proj.end_date && globalDateFilterMode === 'current_month') {
        const endDate = parseLocalDate(proj.end_date)
        const today = new Date()
        // If project ended before this month, default to 'project' (full project view)
        if (endDate && endDate < new Date(today.getFullYear(), today.getMonth(), 1)) {
          setGlobalDateFilterMode('project')
        }
      }

      // Set transactions
      setTxs(fullData.transactions || [])

      // Set budgets
      setProjectBudgets(fullData.budgets || [])

      // Set expense categories
      setExpenseCategories(fullData.expense_categories || [])

      // Set fund data
      if (fullData.fund) {
        setFundData({
          current_balance: fullData.fund.current_balance,
          monthly_amount: fullData.fund.monthly_amount,
          last_monthly_addition: null, // Will be fetched if needed
          initial_balance: 0,
          initial_total: fullData.fund.initial_total || 0, // Use initial_total from API if available
          total_additions: 0,
          total_deductions: fullData.fund.total_deductions,
          transactions: fullData.fund.transactions.map(tx => ({
            id: tx.id,
            tx_date: tx.tx_date,
            type: tx.type as string,
            amount: tx.amount,
            description: tx.description || null,
            category: tx.category || null,
            notes: null,
            created_by_user: null,
            file_path: null,
            documents_count: 0
          }))
        })
        setHasFund(true)
      } else {
        setFundData(null)
      }
      
      // Set contract periods and current period (New from optimized endpoint)
      if (fullData.contract_periods) {
        setContractPeriods(fullData.contract_periods)
      }
      if (fullData.current_period) {
        setCurrentContractPeriod(fullData.current_period)
        // Update project dates to reflect current contract period (only if not viewing historical period)
        if (!periodId) {
          if (fullData.current_period.start_date) {
            setProjectStartDate(fullData.current_period.start_date)
          }
          if (fullData.current_period.end_date) {
            setProjectEndDate(fullData.current_period.end_date)
            
            // Re-check filter mode with current period end date
            if (globalDateFilterMode === 'current_month') {
              const endDate = parseLocalDate(fullData.current_period.end_date)
              const today = new Date()
              if (endDate && endDate < new Date(today.getFullYear(), today.getMonth(), 1)) {
                setGlobalDateFilterMode('project')
              }
            }
          }
        }
      }
      
      // Handle selected period (for historical period viewing)
      if (fullData.selected_period) {
        setSelectedPeriod(fullData.selected_period)
        // When viewing historical period, default to 'project' filter to show all data for that period
        setGlobalDateFilterMode('project')
        // When viewing historical period, use that period's dates for display
        if (fullData.selected_period.start_date) {
          setProjectStartDate(fullData.selected_period.start_date)
        }
        if (fullData.selected_period.end_date) {
          setProjectEndDate(fullData.selected_period.end_date)
        }
      } else {
        setSelectedPeriod(null)
      }

    } catch (err: any) {
      console.error('Error loading project data:', err)
      const status = err?.response?.status
      const errorMessage = err?.response?.data?.detail || err?.message || 'שגיאה בטעינת נתוני הפרויקט'
      
      // If project not found (404), navigate back to dashboard
      if (status === 404) {
        console.log('Project not found (404), navigating to dashboard')
        setLoading(false)
        setChartsLoading(false)
        navigate('/dashboard')
        return
      }
      
      setError(errorMessage)
      // Fallback to legacy loading if new endpoint fails (only for non-404 errors)
      try {
        await Promise.all([
          loadProjectInfo(),
          load(),
          loadChartsData()
        ])
        // If fallback succeeds, clear error
        setError(null)
      } catch (fallbackErr: any) {
        console.error('Fallback loading also failed:', fallbackErr)
        // If fallback also returns 404, navigate to dashboard
        if (fallbackErr?.response?.status === 404) {
          setLoading(false)
          setChartsLoading(false)
          navigate('/dashboard')
          return
        }
        // Keep the error state so user can see what went wrong
        if (!error) {
          setError('שגיאה בטעינת נתוני הפרויקט. נא לנסות שוב.')
        }
      }
    } finally {
      setLoading(false)
      setChartsLoading(false)
    }
  }

  // Legacy load function - kept for fallback and refresh scenarios
  const load = async () => {
    if (!id || isNaN(Number(id))) return

    setLoading(true)
    try {
      const { data } = await api.get(`/transactions/project/${id}`)
      setTxs(data || [])
    } catch (err: any) {
      setTxs([])
    } finally {
      setLoading(false)
    }
  }

  // Effective period for budgets: when viewing a specific period, use it; otherwise current
  const effectiveBudgetPeriodId = viewingPeriodId ?? selectedPeriod?.period_id ?? currentContractPeriod?.period_id ?? null

  // Helper function to reload only categories and budgets (without transactions)
  const reloadChartsDataOnly = async () => {
    if (!id || isNaN(Number(id))) return
    try {
      const [categoriesData, budgetsData] = await Promise.all([
        ReportAPI.getProjectExpenseCategories(parseInt(id)),
        BudgetAPI.getProjectBudgets(parseInt(id), effectiveBudgetPeriodId).catch((err) => {
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

  // Legacy loadChartsData - kept for refresh scenarios
  const loadChartsData = async () => {
    if (!id || isNaN(Number(id))) return

    setChartsLoading(true)
    try {
      const [categoriesData, budgetsData] = await Promise.all([
        ReportAPI.getProjectExpenseCategories(parseInt(id)),
        BudgetAPI.getProjectBudgets(parseInt(id), effectiveBudgetPeriodId).catch((err) => {
          console.error('Failed to load project budgets:', err)
          return []
        })
      ])
      
      setExpenseCategories(categoriesData || [])
      setProjectBudgets(budgetsData || [])
    } catch (err: any) {
      console.error('Error loading charts data:', err)
    } finally {
      setChartsLoading(false)
    }
  }

const formatCurrency = (value: number | string | null | undefined) => {
  return Number(value || 0).toLocaleString('he-IL')
}

// formatDate is now imported from utils.ts

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
      // NOTE: checkAndRenewContract is called only when explicitly needed (not on every load)
      // to reduce unnecessary API calls on page refresh
      
      const { data } = await api.get(`/projects/${id}`)
      
      setProjectName(data.name || `פרויקט ${id}`)
      setProjectBudget({
        budget_monthly: data.budget_monthly || 0,
        budget_annual: data.budget_annual || 0
      })
      setProjectStartDate(data.start_date || null)
      setProjectEndDate(data.end_date || null)
      setIsParentProject(data.is_parent_project || false)
      setRelationProject(data.relation_project || null)

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
      
      // Load contract periods and current period
      await Promise.all([
        loadContractPeriods(),
        loadCurrentContractPeriod()
      ])
    } catch (err: any) {
      setProjectName(`פרויקט ${id}`)
      setProjectBudget({ budget_monthly: 0, budget_annual: 0 })
    }
  }
  
  const loadCurrentContractPeriod = async () => {
    if (!id || isNaN(Number(id))) return
    
    try {
      const currentPeriodData = await ProjectAPI.getCurrentContractPeriod(parseInt(id))
      if (currentPeriodData.current_period) {
        setCurrentContractPeriod(currentPeriodData.current_period)
        // Update project dates to reflect current contract period (only if period exists)
        if (currentPeriodData.current_period.start_date) {
          setProjectStartDate(currentPeriodData.current_period.start_date)
        }
        if (currentPeriodData.current_period.end_date) {
          setProjectEndDate(currentPeriodData.current_period.end_date)
        } else {
          // If no end_date in current period, keep project end_date
          // Don't override with null
        }
      } else {
        setCurrentContractPeriod(null)
        // If no current period, dates remain from project data loaded above
      }
    } catch (err: any) {
      console.error('Error loading current contract period:', err)
      setCurrentContractPeriod(null)
      // On error, dates remain from project data loaded above
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
      // OPTIMIZED: Load ALL project data in a SINGLE API call
      // Before: 5+ separate API calls (project, transactions, budgets, categories, fund)
      // After: 1 API call that returns everything
      // Pass viewingPeriodId for historical period viewing
      loadAllProjectData(viewingPeriodId)
    }
  }, [id, viewingPeriodId])

  // Redirect to parent project route if this is a parent project
  useEffect(() => {
    if (isParentProject && id && !isNaN(Number(id)) && !loading) {
      // Use setTimeout to ensure the navigation happens after the component has rendered
      const timer = setTimeout(() => {
        navigate(`/projects/${id}/parent`, { replace: true })
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isParentProject, id, navigate, loading])

  useEffect(() => {
    dispatch(fetchSuppliers())
  }, [dispatch])

  // Reload project info when project is updated (e.g., after editing in modal or uploading image)
  useEffect(() => {
    const handleProjectUpdated = async (event: Event) => {
      const customEvent = event as CustomEvent
      if (customEvent.detail?.projectId && id && customEvent.detail.projectId === parseInt(id)) {
        setUpdatingProject(true)
        try {
          // Use loadAllProjectData with viewingPeriodId to maintain historical period filtering
          await loadAllProjectData(viewingPeriodId)
        } catch (err) {
          console.error('Error reloading project data after update:', err)
        } finally {
          setUpdatingProject(false)
        }
      }
    }

    window.addEventListener('projectUpdated', handleProjectUpdated)
    return () => window.removeEventListener('projectUpdated', handleProjectUpdated)
  }, [id, hasFund, viewingPeriodId])

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
        end_date: newBudgetForm.period_type === 'Annual' ? (newBudgetForm.end_date || null) : null,
        contract_period_id: effectiveBudgetPeriodId
      })
      await reloadChartsDataOnly() // Only reload budgets and categories, not transactions
      setShowAddBudgetForm(false)
      setBudgetDateMode('today')
      setNewBudgetForm({
        category: '',
        amount: '',
        period_type: 'Annual',
        start_date: new Date().toISOString().split('T')[0],
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
    
    const txDate = parseLocalDate(t.tx_date) || new Date()
    
    // Project date filtering removed to allow viewing all transactions
    // The user can filter by date using the date filter controls
    /*
    // First filter by current contract period (if project has start_date and end_date)
    let inCurrentContractPeriod = true
    if (projectStartDate && projectEndDate) {
      const contractStart = parseLocalDate(projectStartDate) || new Date(0)
      const contractEnd = parseLocalDate(projectEndDate) || new Date()
      inCurrentContractPeriod = txDate >= contractStart && txDate <= contractEnd
    }
    
    // If transaction is not in current contract period, exclude it
    if (!inCurrentContractPeriod) {
      return false
    }
    */
    
    let dateMatches = false

    // When viewing historical period, skip date filtering - data is already filtered by backend
    if (viewingPeriodId) {
      dateMatches = true
    }
    // For period transactions, check if the period overlaps with the filter range
    else if (t.period_start_date && t.period_end_date) {
      const periodStart = parseLocalDate(t.period_start_date) || new Date()
      const periodEnd = parseLocalDate(t.period_end_date) || new Date()
      
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
          const rangeStart = parseLocalDate(startDate) || new Date(0)
          const rangeEnd = parseLocalDate(endDate) || new Date()
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
          const txDateStr = typeof t.tx_date === 'string' ? t.tx_date.split('T')[0] : (parseLocalDate(t.tx_date as string)?.toISOString().split('T')[0] || '')
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
    // Find the full transaction object if not provided
    const fullTransaction = transaction || txs.find(t => t.id === transactionId)
    if (!fullTransaction) {
      alert('עסקה לא נמצאה')
      return
    }
    
    // Set the transaction to delete and open the modal
    setTransactionToDelete(fullTransaction)
    setShowDeleteTransactionModal(true)
  }

  const confirmDeleteTransaction = async (deleteAll: boolean) => {
    if (!transactionToDelete) return

    setIsDeletingTransaction(true)
    try {
      const isRecurring = transactionToDelete.recurring_template_id || transactionToDelete.is_generated
      const isPeriod = !!(transactionToDelete.period_start_date && transactionToDelete.period_end_date)

      if (isRecurring) {
        // For recurring transactions
        if (deleteAll) {
          // Delete the entire template (which will delete all instances)
          const templateId = transactionToDelete.recurring_template_id
          if (!templateId) {
            throw new Error('לא נמצא מזהה תבנית מחזורית')
          }
          await RecurringTransactionAPI.deleteTemplate(templateId)
        } else {
          // Delete only this instance
          await RecurringTransactionAPI.deleteTransactionInstance(transactionToDelete.id)
        }
        // For recurring transactions, only reload transactions without regenerating
        // to prevent recreating the deleted instance
        await loadTransactionsOnly()
      } else if (isPeriod && deleteAll) {
        // For period transactions, delete all transactions with the same period dates
        const periodStart = transactionToDelete.period_start_date
        const periodEnd = transactionToDelete.period_end_date

        if (!periodStart || !periodEnd) {
          // Fallback to single deletion if dates are missing
          await api.delete(`/transactions/${transactionToDelete.id}`)
        } else {
          // Find all transactions with the same period dates
          const matchingTransactions = txs.filter(t =>
            t.period_start_date === periodStart &&
            t.period_end_date === periodEnd &&
            t.id !== transactionToDelete.id // Don't delete the same transaction twice
          )

          // Delete all matching transactions
          const deletePromises = [
            api.delete(`/transactions/${transactionToDelete.id}`),
            ...matchingTransactions.map(t => api.delete(`/transactions/${t.id}`))
          ]

          await Promise.all(deletePromises)
        }
        // Use loadAllProjectData with viewingPeriodId to maintain historical period filtering
        await loadAllProjectData(viewingPeriodId)
      } else {
        // Regular transaction or single period transaction deletion
        await api.delete(`/transactions/${transactionToDelete.id}`)
        // Use loadAllProjectData with viewingPeriodId to maintain historical period filtering
        await loadAllProjectData(viewingPeriodId)
      }

      // If period summary modal is open, refresh the summary to reflect deleted transaction
      if (selectedPeriodSummary) {
        try {
          const summary = await ProjectAPI.getContractPeriodSummary(
            parseInt(id!),
            selectedPeriodSummary.period_id,
            selectedPeriodSummary.start_date,
            selectedPeriodSummary.end_date
          )
          setSelectedPeriodSummary(summary)
        } catch (err: any) {
          // Silently fail - summary will be refreshed when user reopens modal
          console.error('Failed to refresh period summary:', err)
        }
      }

      // Close modal and reset state
      setShowDeleteTransactionModal(false)
      setTransactionToDelete(null)
    } catch (err: any) {
      alert(err.response?.data?.detail ?? 'שגיאה במחיקת העסקה')
    } finally {
      setIsDeletingTransaction(false)
    }
  }

  // Calculate income and expense based on the global date filter
  // Only actual transactions are counted - budget is NOT included in income
  // This uses the same global filter as transactions list for consistency
  const calculateFinancialSummary = () => {
    const now = new Date()
    
    let calculationStartDate: Date
    let calculationEndDate: Date

    if (globalDateFilterMode === 'current_month') {
        // Current month
        calculationStartDate = new Date(currentYear, currentMonth - 1, 1)
        calculationEndDate = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999)
    } else if (globalDateFilterMode === 'selected_month') {
        const [year, month] = globalSelectedMonth.split('-').map(Number)
        calculationStartDate = new Date(year, month - 1, 1)
        calculationEndDate = new Date(year, month, 0, 23, 59, 59, 999)
    } else if (globalDateFilterMode === 'date_range') {
         calculationStartDate = globalStartDate ? (parseLocalDate(globalStartDate) || new Date(0)) : new Date(0)
         const customEnd = globalEndDate ? (parseLocalDate(globalEndDate) || new Date()) : new Date()
         customEnd.setHours(23, 59, 59, 999)
         calculationEndDate = customEnd
    } else if (globalDateFilterMode === 'all_time') {
        // All time - use very old start date
        calculationStartDate = new Date(2000, 0, 1)
        calculationEndDate = now
    } else {
        // 'project' / default behavior
        if (projectStartDate) {
          calculationStartDate = parseLocalDate(projectStartDate) || new Date(0)
        } else {
          // Fallback: use 1 year ago if no project start date
          const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
          calculationStartDate = oneYearAgo
        }
        
        // Calculate end date: use project.end_date if available and in the past, otherwise use now
        // IMPORTANT: end_date is EXCLUSIVE - the actual last day of the contract is end_date - 1
        // Example: if end_date is 1.1.2027, the contract covers until 31.12.2026
        calculationEndDate = now
        if (projectEndDate) {
          const endDateObj = parseLocalDate(projectEndDate) || new Date()
          // Subtract 1 day to get the actual last day of the contract (exclusive end_date)
          const actualLastDay = new Date(endDateObj)
          actualLastDay.setDate(actualLastDay.getDate() - 1)
          actualLastDay.setHours(23, 59, 59, 999)
          // If contract has ended (actualLastDay is in the past), use actualLastDay; otherwise use now
          calculationEndDate = actualLastDay < now ? actualLastDay : now
        }
    }
    
    // Filter transactions from calculationStartDate to calculationEndDate (current contract period only)
    // Exclude fund transactions (from_fund == true) - only include regular transactions
    // For period transactions, check if the period overlaps with the calculation range
    const summaryTransactions = txs.filter(t => {
      const isNotFromFund = !(t.from_fund === true)  // Exclude fund transactions
      if (!isNotFromFund) return false
      
      // For period transactions, check if period overlaps with calculation range
      if (t.period_start_date && t.period_end_date) {
        const periodStart = parseLocalDate(t.period_start_date) || new Date()
        const periodEnd = parseLocalDate(t.period_end_date) || new Date()
        // Check if periods overlap: (StartA <= EndB) and (EndA >= StartB)
        const overlaps = periodStart <= calculationEndDate && periodEnd >= calculationStartDate
        return overlaps
      } else {
        // Regular transaction - check if tx_date is in range
        const txDate = parseLocalDate(t.tx_date) || new Date()
        const isInDateRange = txDate >= calculationStartDate && txDate <= calculationEndDate
        return isInDateRange
      }
    })
    
    // Calculate actual transaction income and expense (excluding fund transactions)
    // Only actual transactions are counted - budget is NOT included
    // For period transactions, use proportional amounts based on overlap with calculation period
    const incomeTransactions = summaryTransactions.filter(t => t.type === 'Income')
    const expenseTransactions = summaryTransactions.filter(t => t.type === 'Expense')
    
    const monthlyIncome = Number(projectBudget?.budget_monthly || 0)
    
    // Calculate income: regular transactions use full amount, period transactions use proportional
    const transactionIncome = incomeTransactions.reduce((s, t) => {
      if (t.period_start_date && t.period_end_date) {
        // Period transaction - calculate proportional amount
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
        // Regular transaction - use full amount
        return s + Number(t.amount || 0)
      }
    }, 0)
    
    // Calculate expense: regular transactions use full amount, period transactions use proportional
    const transactionExpense = expenseTransactions.reduce((s, t) => {
      if (t.period_start_date && t.period_end_date) {
        // Period transaction - calculate proportional amount
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
        // Regular transaction - use full amount
        return s + Number(t.amount || 0)
      }
    }, 0)
    
    // Calculate income from project monthly budget (treated as expected monthly income)
    // Calculate only for the current year, from project start date (or start of year if project started earlier)
    
    let projectIncome = 0
    if (monthlyIncome > 0 && calculationStartDate) {
      // Use project start_date (or created_at if start_date not available) directly
      // Use calculationEndDate (which respects contract end_date if contract has ended)
      const incomeCalculationStart = calculationStartDate
      const incomeCalculationEnd = calculationEndDate  // Use calculationEndDate which respects contract period
      projectIncome = calculateMonthlyIncomeAccrual(monthlyIncome, incomeCalculationStart, incomeCalculationEnd)
    }
    
    // Total income logic:
    // If we have a monthly budget (projectIncome > 0), we normally show the accrued income.
    // However, if we also have actual transactions, we want to make sure we don't double count,
    // but also don't hide actual income if it exceeds the budget or if budget calculation returns 0.
    // If projectIncome is 0 (e.g. no start date), we show transactionIncome.
    // If both exist, we show the larger of the two (Accrued vs Actual) to reflect value.
    const totalIncome = monthlyIncome > 0 ? Math.max(transactionIncome, projectIncome) : transactionIncome
    
    return {
      income: totalIncome,
      expense: transactionExpense
    }
  }
  
  // Use useMemo to recalculate only when txs, projectStartDate, projectEndDate, projectBudget, or global filter changes
  const financialSummary = useMemo(() => {
    return calculateFinancialSummary()
  }, [txs, projectStartDate, projectEndDate, projectBudget, globalDateFilterMode, globalSelectedMonth, globalSelectedYear, globalStartDate, globalEndDate])
  
  const income = financialSummary.income
  const expense = financialSummary.expense
  const contractViewerUrl = getContractViewerUrl()

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

  // Don't render main content if redirecting to parent project route
  if (isParentProject && id && !isNaN(Number(id))) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              מעביר לדף פרויקט אב...
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Show error message if there was an error loading data
  if (error && !loading) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-2">שגיאה בטעינת הפרויקט</h2>
          <p className="mb-4">{error}</p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setError(null)
                if (id && !isNaN(Number(id))) {
                  loadAllProjectData(viewingPeriodId)
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              נסה שוב
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              חזור לדשבורד
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 relative">
      {/* Loading Overlay */}
      {(loading || updatingProject) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {updatingProject ? 'מעדכן פרויקט...' : 'טוען עסקאות...'}
            </p>
          </div>
        </div>
      )}

      {/* Historical Period Banner */}
      {isViewingHistoricalPeriod && selectedPeriod && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl shadow-lg p-4"
        >
          <div className="flex items-center justify-between gap-3">
            {/* Left side: Next period arrow or return to current */}
            <div className="flex items-center gap-2">
              {nextPeriod ? (
                <button
                  onClick={() => setSearchParams({ period: nextPeriod.period_id.toString() })}
                  className="p-2 bg-white text-orange-600 rounded-lg hover:bg-orange-50 transition-all shadow-md flex items-center gap-1 group"
                  title="לתקופה הבאה"
                >
                  <ChevronLeft className="w-6 h-6 group-hover:-translate-x-0.5 transition-transform" />
                  <span className="hidden sm:inline font-medium px-1">לתקופה הבאה</span>
                </button>
              ) : (
                <button
                  onClick={() => setSearchParams({})}
                  className="px-4 py-2 bg-white text-orange-600 font-medium rounded-lg hover:bg-orange-50 transition-all flex items-center shadow-md"
                >
                  חזור לתקופה נוכחית
                </button>
              )}
            </div>

            {/* Middle/Right: Info and Previous arrow */}
            <div className="flex items-center gap-4">
              <div className="text-right flex flex-col items-end">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-lg leading-tight">
                    צפייה בתקופה היסטורית
                  </p>
                  <div className="p-1 bg-white/20 rounded-md">
                    <History className="w-5 h-5" />
                  </div>
                </div>
                <p className="text-white/90 text-sm">
                  {selectedPeriod.year_label ? `שנת ${selectedPeriod.contract_year} - ${selectedPeriod.year_label}` : `שנת ${selectedPeriod.contract_year}`}
                  {' | '}
                  {formatDate(selectedPeriod.start_date)} - {formatDate(selectedPeriod.end_date)}
                </p>
              </div>

              {prevPeriod && (
                <button
                  onClick={() => setSearchParams({ period: prevPeriod.period_id.toString() })}
                  className="p-2 bg-white text-orange-600 rounded-lg hover:bg-orange-50 transition-all shadow-md flex items-center gap-1 group"
                  title="לתקופה הקודמת"
                >
                  <span className="hidden sm:inline font-medium px-1">לתקופה הקודמת</span>
                  <ChevronRight className="w-6 h-6 group-hover:translate-x-0.5 transition-transform" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
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
              {/* Show dates only for regular projects and subprojects, not for parent projects */}
              {!isParentProject && (
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
                    {formatDate(projectEndDate)}
                  </span>
                </div>
              )}
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
        <div className="flex flex-col gap-3 w-full md:w-auto">
          {/* שורה ראשונה */}
          <div className="flex flex-wrap gap-3 justify-end">
            {totalPeriods > 0 && (
              <button
                onClick={() => setShowPreviousYearsModal(true)}
                className="px-4 py-2 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg hover:from-gray-700 hover:to-gray-800 transition-all shadow-md flex items-center gap-2 text-sm flex-1 sm:flex-none"
              >
                <History className="w-4 h-4" />
                תקופות ושנים
              </button>
            )}
            <button
              onClick={() => setShowCreateTransactionModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-md flex items-center gap-2 text-sm flex-1 sm:flex-none"
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
                setBudgetDateMode(isViewingHistoricalPeriod ? 'project_start' : 'today')
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm flex-1 sm:flex-none"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              + הוסף תקציב
            </button>
            {!hasFund && !fundData && (
              <button
                onClick={() => {
                  setFundScopePreviousYear(null)
                  setShowCreateFundModal(true)
                }}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2 text-sm flex-1 sm:flex-none"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                הוסף קופה
              </button>
            )}
          </div>
          {/* שורה שנייה */}
          <div className="flex flex-wrap gap-3 justify-end">
            <button
              onClick={handleEditProject}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors flex items-center gap-2 text-sm flex-1 sm:flex-none"
            >
              <Edit className="w-4 h-4" />
              ערוך פרויקט
            </button>
            {isAdmin && (
              <button
                onClick={handleArchiveDeleteClick}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2 text-sm flex-1 sm:flex-none"
              >
                <Archive className="w-4 h-4" />
                ארכב / מחק
              </button>
            )}
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm flex-1 sm:flex-none"
            >
              ← חזור לדשבורד
            </button>
          </div>
        </div>
      </motion.div>

      {/* Global Date Filter - Affects all sections */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.02 }}
        className={`rounded-2xl shadow-sm border p-4 ${
          isViewingHistoricalPeriod 
            ? 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-gray-800 dark:to-gray-800 border-amber-200 dark:border-gray-700' 
            : 'bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-gray-800 dark:to-gray-800 border-indigo-200 dark:border-gray-700'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <svg className={`w-5 h-5 ${isViewingHistoricalPeriod ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h3 className={`text-lg font-semibold ${isViewingHistoricalPeriod ? 'text-amber-900 dark:text-white' : 'text-indigo-900 dark:text-white'}`}>
              {isViewingHistoricalPeriod ? 'צפייה בתקופה היסטורית' : 'סינון לפי תאריך'}
            </h3>
          </div>

          {/* Hide filter controls when viewing historical period - data is already filtered by period */}
          {!isViewingHistoricalPeriod && (
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={globalDateFilterMode}
                onChange={(e) => setGlobalDateFilterMode(e.target.value as any)}
                className="px-4 py-2 border border-indigo-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500 font-medium"
              >
                <option value="current_month">חודש נוכחי</option>
                <option value="selected_month">חודש ספציפי</option>
                <option value="date_range">טווח תאריכים</option>
                <option value="project">מתחילת הפרויקט</option>
                <option value="all_time">כל הזמן</option>
              </select>

              {globalDateFilterMode === 'selected_month' && (
                <input
                  type="month"
                  value={globalSelectedMonth}
                  onChange={(e) => setGlobalSelectedMonth(e.target.value)}
                  className="px-4 py-2 border border-indigo-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              )}

              {globalDateFilterMode === 'date_range' && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={globalStartDate}
                    onChange={(e) => setGlobalStartDate(e.target.value)}
                    className="px-3 py-2 border border-indigo-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500"
                    placeholder="מתאריך"
                  />
                  <span className="text-gray-500 font-medium">עד</span>
                  <input
                    type="date"
                    value={globalEndDate}
                    onChange={(e) => setGlobalEndDate(e.target.value)}
                    min={globalStartDate}
                    className="px-3 py-2 border border-indigo-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500"
                    placeholder="עד תאריך"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Filter description */}
        <div className={`mt-2 text-sm ${isViewingHistoricalPeriod ? 'text-amber-700 dark:text-amber-300' : 'text-indigo-700 dark:text-indigo-300'}`}>
          {isViewingHistoricalPeriod && selectedPeriod ? (
            <span>
              מציג נתונים מתקופה: {selectedPeriod.year_label ? `שנת ${selectedPeriod.contract_year} - ${selectedPeriod.year_label}` : `שנת ${selectedPeriod.contract_year}`}
              {' '}({formatDate(selectedPeriod.start_date)} - {formatDate(selectedPeriod.end_date)})
            </span>
          ) : (
            <>
              {globalDateFilterMode === 'current_month' && (
                <span>מציג נתונים מהחודש הנוכחי ({new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })})</span>
              )}
              {globalDateFilterMode === 'selected_month' && globalSelectedMonth && (
                <span>מציג נתונים מחודש {new Date(globalSelectedMonth + '-01').toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}</span>
              )}
              {globalDateFilterMode === 'date_range' && globalStartDate && globalEndDate && (
                <span>מציג נתונים מ-{parseLocalDate(globalStartDate)?.toLocaleDateString('he-IL')} עד {parseLocalDate(globalEndDate)?.toLocaleDateString('he-IL')}</span>
              )}
              {globalDateFilterMode === 'project' && (
                <span>מציג נתונים מתחילת הפרויקט {projectStartDate ? `(${parseLocalDate(projectStartDate)?.toLocaleDateString('he-IL')})` : ''}</span>
              )}
              {globalDateFilterMode === 'all_time' && (
                <span>מציג את כל הנתונים ללא הגבלת תאריך</span>
              )}
            </>
          )}
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
                globalFilterType={globalDateFilterMode}
                globalSelectedMonth={globalSelectedMonth}
                globalStartDate={globalStartDate}
                globalEndDate={globalEndDate}
                hideFilterControls={true}
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
                                    <div className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDate(tx.tx_date)}</div>
                                    {tx.period_start_date && tx.period_end_date ? (
                                        <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-0.5 whitespace-nowrap" key={`dates-${tx.id}`}>
                                            \u200E{formatDate(tx.period_start_date, '', {day: '2-digit', month: '2-digit'})} - {formatDate(tx.period_end_date, '', {day: '2-digit', month: '2-digit'})}
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
                                      \u200E{formatDate(tx.period_start_date)} - {formatDate(tx.period_end_date)}
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
                  params.append('update_scope', fundUpdateScope)
                  
                  await api.put(`/projects/${id}/fund?${params.toString()}`)
                  // Reload fund data
                  await loadFundData()
                  setShowEditFundModal(false)
                  setMonthlyFundAmount(0)
                  setCurrentBalance(0)
                  setFundUpdateScope('from_this_month')
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

              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl space-y-3">
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                  היקף השינוי:
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="updateScope"
                      value="from_start"
                      checked={fundUpdateScope === 'from_start'}
                      onChange={() => setFundUpdateScope('from_start')}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">
                      מתחילת החוזה
                      <span className="block text-xs text-gray-500 dark:text-gray-400">מחשב מחדש את כל יתרת הקופה רטרואקטיבית</span>
                    </span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="updateScope"
                      value="from_this_month"
                      checked={fundUpdateScope === 'from_this_month'}
                      onChange={() => setFundUpdateScope('from_this_month')}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">
                      מהחודש הזה והלאה
                      <span className="block text-xs text-gray-500 dark:text-gray-400">מעדכן את הסכום החודשי החל מהחודש הנוכחי</span>
                    </span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="updateScope"
                      value="only_this_month"
                      checked={fundUpdateScope === 'only_this_month'}
                      onChange={() => setFundUpdateScope('only_this_month')}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">
                      רק החודש הזה (חד-פעמי)
                      <span className="block text-xs text-gray-500 dark:text-gray-400">שינוי חד-פעמי ליתרה מבלי לשנות את הסכום החודשי הקבוע</span>
                    </span>
                  </label>
                </div>
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
      {showCreateFundModal && (() => {
        const periodEnd = selectedPeriod?.end_date ? parseLocalDate(selectedPeriod.end_date) : null
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        /** Show prompt when viewing a period that ended in the past (incl. earlier this year) */
        const isAddingFundInPreviousYear = !!(
          isViewingHistoricalPeriod &&
          selectedPeriod?.start_date &&
          selectedPeriod?.end_date &&
          periodEnd &&
          periodEnd.getTime() < today.getTime()
        )
        const canSubmit = monthlyFundAmount > 0 && (!isAddingFundInPreviousYear || fundScopePreviousYear !== null)

        return (
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
                    setFundScopePreviousYear(null)
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
                  if (!canSubmit) return
                  setCreatingFund(true)
                  try {
                    const params = new URLSearchParams()
                    params.append('monthly_amount', monthlyFundAmount.toString())

                    if (isAddingFundInPreviousYear && fundScopePreviousYear) {
                      const periodStart = parseLocalDate(selectedPeriod!.start_date!)
                      const periodEndDate = parseLocalDate(selectedPeriod!.end_date!)
                      if (!periodStart || !periodEndDate) {
                        alert('שגיאה: לא ניתן לחשב תאריכי תקופה')
                        return
                      }
                      const todayDate = new Date()
                      todayDate.setHours(12, 0, 0, 0)

                      if (fundScopePreviousYear === 'only_period') {
                        const initialBalance = calculateMonthlyIncomeAccrual(monthlyFundAmount, periodStart, periodEndDate)
                        params.set('monthly_amount', '0')
                        params.append('initial_balance', initialBalance.toString())
                        params.append('last_monthly_addition', selectedPeriod!.end_date!)
                      } else {
                        const initialBalance = calculateMonthlyIncomeAccrual(monthlyFundAmount, periodStart, todayDate)
                        const y = todayDate.getFullYear()
                        const m = String(todayDate.getMonth() + 1).padStart(2, '0')
                        const d = String(todayDate.getDate()).padStart(2, '0')
                        params.append('initial_balance', initialBalance.toString())
                        params.append('last_monthly_addition', `${y}-${m}-${d}`)
                      }
                    }

                    await api.post(`/projects/${id}/fund?${params.toString()}`)
                    await loadProjectInfo()
                    await loadFundData()
                    setShowCreateFundModal(false)
                    setMonthlyFundAmount(0)
                    setFundScopePreviousYear(null)
                  } catch (err: any) {
                    const status = err.response?.status
                    if (status >= 200 && status < 300) {
                      await loadProjectInfo()
                      await loadFundData()
                      setShowCreateFundModal(false)
                      setMonthlyFundAmount(0)
                      setFundScopePreviousYear(null)
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
                  {(!isAddingFundInPreviousYear || fundScopePreviousYear === 'also_current') && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      הסכום יתווסף לקופה כל חודש באופן אוטומטי
                    </p>
                  )}
                </div>

                {isAddingFundInPreviousYear && (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                      אתה מוסיף קופה בשנה קודמת. איך ליצור את הקופה?
                    </p>
                    <div className="space-y-2">
                      <label className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 dark:border-amber-700 cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-900/30">
                        <input
                          type="radio"
                          name="fundScopePreviousYear"
                          checked={fundScopePreviousYear === 'only_period'}
                          onChange={() => setFundScopePreviousYear('only_period')}
                          className="mt-1 text-amber-600 dark:text-amber-400"
                        />
                        <div>
                          <span className="font-medium text-gray-900 dark:text-white">רק לתקופה ההיא</span>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                            קופה עם יתרה מחושבת מתחילת התקופה לסוף התקופה בלבד, בלי הוספה חודשית להמשך
                          </p>
                        </div>
                      </label>
                      <label className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 dark:border-amber-700 cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-900/30">
                        <input
                          type="radio"
                          name="fundScopePreviousYear"
                          checked={fundScopePreviousYear === 'also_current'}
                          onChange={() => setFundScopePreviousYear('also_current')}
                          className="mt-1 text-amber-600 dark:text-amber-400"
                        />
                        <div>
                          <span className="font-medium text-gray-900 dark:text-white">גם לתקופה הנוכחית</span>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                            קופה עם יתרה מתחילת התקופה עד היום, והסכום החודשי ימשיך להתווסף מדי חודש
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={creatingFund || !canSubmit}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {creatingFund ? 'יוצר...' : 'צור קופה'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateFundModal(false)
                      setMonthlyFundAmount(0)
                      setFundScopePreviousYear(null)
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
        )
      })()}

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
                              {formatDate(tx.tx_date, '', {
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
                <tr className="bg-gray-50 dark:bg-gray-700 text-right">
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
                          תאריכית: \u200E{formatDate(t.period_start_date)} - {formatDate(t.period_end_date)}
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
          // Use loadAllProjectData with viewingPeriodId to maintain historical period filtering
          await loadAllProjectData(viewingPeriodId)
        }}
        projectId={parseInt(id || '0')}
        isSubproject={!!relationProject}
        projectName={projectName}
        projectStartDate={firstContractStartDate || projectStartDate}
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
          // Use loadAllProjectData with viewingPeriodId to maintain historical period filtering
          await loadAllProjectData(viewingPeriodId)
        }}
        transaction={selectedTransactionForEdit}
        projectStartDate={firstContractStartDate || projectStartDate}
        getAllTransactions={async (): Promise<ApiTransaction[]> => {
          // Return all transactions for the project (used for deleteAll functionality)
          return txs as ApiTransaction[]
        }}
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
          // Use loadAllProjectData with viewingPeriodId to maintain historical period filtering
          await loadAllProjectData(viewingPeriodId)
          if (transactionTypeFilter === 'recurring') {
            await loadRecurringTemplates()
          }
        }}
        template={selectedTemplateForEdit}
      />

      <DeleteTransactionModal
        isOpen={showDeleteTransactionModal}
        onClose={() => {
          setShowDeleteTransactionModal(false)
          setTransactionToDelete(null)
        }}
        onConfirm={confirmDeleteTransaction}
        transaction={transactionToDelete as ApiTransaction | null}
        loading={isDeletingTransaction}
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
            setBudgetDateMode('today')
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
                  setBudgetDateMode('today')
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

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      מתי להחיל את התקציב? *
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="budgetDateMode"
                          value="project_start"
                          checked={budgetDateMode === 'project_start'}
                          onChange={() => {
                            setBudgetDateMode('project_start')
                          }}
                          className="w-4 h-4 text-green-600 focus:ring-green-500"
                          disabled={!projectStartDate}
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {isViewingHistoricalPeriod ? 'מתחילת התקופה' : 'מתחילת הפרויקט'} {projectStartDate && `(${new Date(projectStartDate).toLocaleDateString('he-IL')})`}
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="budgetDateMode"
                          value="today"
                          checked={budgetDateMode === 'today'}
                          onChange={() => {
                            setBudgetDateMode('today')
                          }}
                          className="w-4 h-4 text-green-600 focus:ring-green-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          מהיום ({new Date().toLocaleDateString('he-IL')})
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="budgetDateMode"
                          value="custom"
                          checked={budgetDateMode === 'custom'}
                          onChange={() => {
                            setBudgetDateMode('custom')
                          }}
                          className="w-4 h-4 text-green-600 focus:ring-green-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          מתאריך מותאם אישית
                        </span>
                      </label>
                    </div>
                    {budgetDateMode === 'custom' && (
                      <div className="mt-3">
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
                    )}
                    {budgetDateMode !== 'custom' && (
                      <div className="mt-3">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          תאריך התחלה: {newBudgetForm.start_date ? new Date(newBudgetForm.start_date).toLocaleDateString('he-IL') : '-'}
                        </p>
                      </div>
                    )}
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
                      setBudgetDateMode('today')
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
      {showPreviousYearsModal && (
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
              ) : !contractPeriods ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  טוען תקופות חוזה...
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Show previous periods only (not the current period) */}
                  {contractPeriods.periods_by_year && contractPeriods.periods_by_year.length > 0 && (
                    <>
                      {contractPeriods.periods_by_year.map((yearGroup) => (
                    <div key={yearGroup.year} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 shadow-sm">
                      <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                          <span className="text-blue-600 dark:text-blue-400">📅</span>
                          שנת {yearGroup.year}
                        </h3>
                        <button
                          onClick={async () => {
                            try {
                              const blob = await ProjectAPI.exportContractYearCSV(parseInt(id!), yearGroup.year)
                              const url = window.URL.createObjectURL(blob)
                              const link = document.createElement('a')
                              link.href = url
                              const safeProjectName = (projectName || 'project').replace(/[^a-zA-Z0-9_\-]/g, '_')
                              link.setAttribute('download', `${safeProjectName}_year_${yearGroup.year}.xlsx`)
                              document.body.appendChild(link)
                              link.click()
                              link.remove()
                              window.URL.revokeObjectURL(url)
                            } catch (err) {
                              console.error('Error exporting year CSV:', err)
                              alert('שגיאה בייצוא קובץ שנה')
                            }
                          }}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium shadow-sm"
                          title={`הורד סיכום שנתי לשנת ${yearGroup.year}`}
                        >
                          <Download className="w-4 h-4" />
                          הורד סיכום שנתי
                        </button>
                      </div>
                      <div className="space-y-3">
                        {yearGroup.periods.map((period) => (
                          <div
                            key={period.period_id || `${period.start_date}-${period.end_date}`}
                            className="bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600 rounded-xl p-4 hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-200 group"
                          >
                            <div className="flex items-center justify-between">
                              <div 
                                className="flex-1 cursor-pointer"
                                onClick={() => {
                                  // Navigate to the same page with period parameter
                                  if (period.period_id) {
                                    setShowPreviousYearsModal(false)
                                    setSearchParams({ period: period.period_id.toString() })
                                  }
                                }}
                              >
                                <div className="font-bold text-gray-900 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                  {period.year_label || `תקופה ${period.year_index || ''}`}
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                                  <span>📅</span>
                                  {period.start_date && period.end_date ? (
                                    (() => {
                                      // Parse dates as local dates to avoid timezone issues
                                      const start = parseLocalDate(period.start_date);
                                      const end = parseLocalDate(period.end_date);
                                      if (!start || !end) {
                                        return `\u200E${formatDate(period.start_date)} - ${formatDate(period.end_date)}`;
                                      }
                                      // Ensure start is before end
                                      const displayStart = start <= end ? start : end;
                                      const displayEnd = start <= end ? end : start;
                                      // Use dateToLocalString instead of toISOString to avoid timezone shift
                                      return `\u200E${formatDate(dateToLocalString(displayStart))} - ${formatDate(dateToLocalString(displayEnd))}`;
                                    })()
                                  ) : period.start_date ? formatDate(period.start_date) : ''}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    try {
                                      const blob = await ProjectAPI.exportContractPeriodCSV(
                                        parseInt(id!),
                                        period.period_id,
                                        period.start_date,
                                        period.end_date
                                      )
                                      const url = window.URL.createObjectURL(blob)
                                      const link = document.createElement('a')
                                      link.href = url
                                      const safeProjectName = (projectName || 'project').replace(/[^a-zA-Z0-9_\-]/g, '_')
                                      const yearLabel = period.year_label || `period_${period.period_id}`
                                      const safeYearLabel = yearLabel.replace(/[^a-zA-Z0-9_\-א-ת]/g, '_')
                                      link.setAttribute('download', `${safeProjectName}_${safeYearLabel}.xlsx`)
                                      document.body.appendChild(link)
                                      link.click()
                                      link.remove()
                                      window.URL.revokeObjectURL(url)
                                    } catch (err) {
                                      console.error('Error exporting CSV:', err)
                                      alert('שגיאה בייצוא קובץ תקופה')
                                    }
                                  }}
                                  className="px-3 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors flex items-center gap-2 text-sm font-medium"
                                  title="הורד פירוט תקופתי"
                                >
                                  <Download className="w-4 h-4" />
                                  <span className="hidden sm:inline">הורדה</span>
                                </button>
                                <button 
                                  onClick={() => {
                                    // Navigate to the same page with period parameter
                                    if (period.period_id) {
                                      setShowPreviousYearsModal(false)
                                      setSearchParams({ period: period.period_id.toString() })
                                    }
                                  }}
                                  className="px-3 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-2 text-sm font-medium"
                                  title="צפה בתקופה"
                                >
                                  <Eye className="w-4 h-4" />
                                  <span className="hidden sm:inline">צפייה</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                    </>
                  )}
                  
                  {/* Show message if no previous periods */}
                  {(!contractPeriods.periods_by_year || contractPeriods.periods_by_year.length === 0) && (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <p className="text-lg mb-2">אין חוזים קודמים</p>
                      <p className="text-sm">חוזים קודמים יופיעו כאן לאחר חידוש החוזה</p>
                    </div>
                  )}
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
                  {selectedPeriodSummary.contract_year ? (selectedPeriodSummary.year_label ? `שנת ${selectedPeriodSummary.contract_year} - ${selectedPeriodSummary.year_label}` : `שנת ${selectedPeriodSummary.contract_year}`) : 'סיכום תקופת חוזה'}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {selectedPeriodSummary.start_date && selectedPeriodSummary.end_date ? (
                    (() => {
                      // Use parseLocalDate to avoid timezone issues
                      const start = parseLocalDate(selectedPeriodSummary.start_date);
                      const end = parseLocalDate(selectedPeriodSummary.end_date);
                      if (!start || !end) {
                        return `\u200E${formatDate(selectedPeriodSummary.start_date)} - ${formatDate(selectedPeriodSummary.end_date)}`;
                      }
                      // Ensure start_date is before end_date for display
                      const displayStart = start <= end ? start : end;
                      const displayEnd = start <= end ? end : start;
                      // Use dateToLocalString instead of toISOString to avoid timezone shift
                      return `\u200E${formatDate(dateToLocalString(displayStart))} - ${formatDate(dateToLocalString(displayEnd))}`;
                    })()
                  ) : selectedPeriodSummary.start_date ? formatDate(selectedPeriodSummary.start_date) : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    try {
                      const blob = await ProjectAPI.exportContractPeriodCSV(
                        parseInt(id!),
                        selectedPeriodSummary.period_id,
                        selectedPeriodSummary.start_date,
                        selectedPeriodSummary.end_date
                      )
                      const url = window.URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `contract_period_${selectedPeriodSummary.year_label || `שנת_${selectedPeriodSummary.contract_year}`}_${projectName}.csv`
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
              <div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {selectedPeriodSummary ? (selectedPeriodSummary.contract_year ? (selectedPeriodSummary.year_label ? `שנת ${selectedPeriodSummary.contract_year} - ${selectedPeriodSummary.year_label}` : `שנת ${selectedPeriodSummary.contract_year}`) : (selectedPeriodSummary.year_label ? `סיכום תקופת חוזה - ${selectedPeriodSummary.year_label}` : 'סיכום תקופת חוזה')) : 'סיכום תקופת חוזה'}
                </h3>
                {selectedPeriodSummary && selectedPeriodSummary.start_date && selectedPeriodSummary.end_date && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {(() => {
                      // Use parseLocalDate to avoid timezone issues
                      const start = parseLocalDate(selectedPeriodSummary.start_date);
                      const end = parseLocalDate(selectedPeriodSummary.end_date);
                      if (!start || !end) {
                        return `\u200E${formatDate(selectedPeriodSummary.start_date)} - ${formatDate(selectedPeriodSummary.end_date)}`;
                      }
                      // Ensure start_date is before end_date for display
                      const displayStart = start <= end ? start : end;
                      const displayEnd = start <= end ? end : start;
                      // Use dateToLocalString instead of toISOString to avoid timezone shift
                      return `\u200E${formatDate(dateToLocalString(displayStart))} - ${formatDate(dateToLocalString(displayEnd))}`;
                    })()}
                  </p>
                )}
              </div>
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
                        link.setAttribute('download', `contract_period_${selectedPeriodSummary.year_label || `שנת_${selectedPeriodSummary.contract_year}`}_${projectName}.csv`)
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
              const projectDate = parseLocalDate(projectStartDate)
              if (projectDate) {
                projectStartMonthDate = new Date(projectDate.getFullYear(), projectDate.getMonth(), 1) // Start of month
              }
            } catch (e) {
              // Invalid date, ignore
            }
          }
          
          // Hebrew month names by calendar month (0=Jan, 11=Dec)
          const monthNamesByCalendarMonth = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
          
          // Create months array - use historical period dates if viewing one, otherwise use default logic
          const months: Array<{ year: number; month: number; monthIndex: number; monthKey: string; label: string }> = []
          
          if (isViewingHistoricalPeriod && selectedPeriod?.start_date && selectedPeriod?.end_date) {
            // When viewing historical period, show months from that period's date range
            const periodStart = parseLocalDate(selectedPeriod.start_date)
            const periodEnd = parseLocalDate(selectedPeriod.end_date)
            
            if (periodStart && periodEnd && periodEnd >= periodStart) {
              // Start from first day of start month
              let current = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1)
              const endYear = periodEnd.getFullYear()
              const endMonth = periodEnd.getMonth()
              let i = 0
              
              // Iterate through all months from period start to period end (inclusive)
              while (current.getFullYear() < endYear || (current.getFullYear() === endYear && current.getMonth() <= endMonth)) {
                const year = current.getFullYear()
                const month = current.getMonth()
                const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
                months.push({
                  year,
                  month,
                  monthIndex: i,
                  monthKey,
                  label: monthNamesByCalendarMonth[month]
                })
                i++
                // Move to next month
                current = new Date(year, month + 1, 1)
              }
            }
          }
          
          // If no months were created (not viewing historical period or invalid dates), use default logic
          if (months.length === 0) {
            // Choose the start date
            let tableStartDate: Date = hebrewYearStartDate
            
            if (projectStartMonthDate) {
              const projectStartMonth = projectStartMonthDate.getMonth() // 0=Jan, 11=Dec
              
              // Contract starts January: use calendar year (Jan–Dec) so table starts in January
              if (projectStartMonth === 0) {
                tableStartDate = new Date(monthlyTableYear, 0, 1)
              } else if (projectStartMonthDate > hebrewYearStartDate) {
                // Project start is later than Hebrew year start (e.g. August)
                tableStartDate = projectStartMonthDate
              } else {
                // Project started before Hebrew year start (e.g. May)
                const oneYearAfterProjectStart = new Date(projectStartMonthDate)
                oneYearAfterProjectStart.setMonth(oneYearAfterProjectStart.getMonth() + 12)
                if (now < oneYearAfterProjectStart) {
                  tableStartDate = projectStartMonthDate
                }
              }
            }
            
            const startYear = tableStartDate.getFullYear()
            const startMonth = tableStartDate.getMonth() // 0-11
            
            // Create 12 month periods starting from the chosen start date
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
          }
          
          // Split all transactions by month (including period transactions)
          const allSplits: SplitTransaction[] = []
          txs.forEach(tx => {
            const splits = splitPeriodTransactionByMonth(tx)
            allSplits.push(...splits)
          })
          
          // Filter out fund transactions
          const regularSplits = allSplits.filter(s => !s.from_fund)
          
          // Group by month, category, and supplier
          const monthlyData: Record<string, {
            income: number
            expenses: Record<string, Record<string, number>> // category -> supplier -> amount
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
                const supplierId = split.supplier_id
                const supplierName = supplierId ? (suppliers.find(s => s.id === supplierId)?.name || `[ספק ${supplierId}]`) : 'ללא ספק'

                if (!monthlyData[monthKey].expenses[category]) {
                  monthlyData[monthKey].expenses[category] = {}
                }
                monthlyData[monthKey].expenses[category][supplierName] = (monthlyData[monthKey].expenses[category][supplierName] || 0) + split.proportionalAmount
                monthlyData[monthKey].totalExpenses += split.proportionalAmount
              }
            }
          })
          
          // Get all unique category-supplier combinations
          const categorySupplierPairs = new Set<string>()
          Object.values(monthlyData).forEach(month => {
            Object.keys(month.expenses).forEach(category => {
              Object.keys(month.expenses[category]).forEach(supplier => {
                categorySupplierPairs.add(`${category}|||${supplier}`)
              })
            })
          })

          // Convert to array and sort
          const categorySupplierList = Array.from(categorySupplierPairs)
            .map(pair => {
              const [category, supplier] = pair.split('|||')
              return { category, supplier }
            })
            .sort((a, b) => {
              // Sort by category first, then by supplier
              if (a.category !== b.category) {
                return a.category.localeCompare(b.category)
              }
              return a.supplier.localeCompare(b.supplier)
            })
          
          // Calculate main supplier for each category (by total amount)
          const categorySuppliers: Record<string, number | null> = {}
          // Get unique categories from categorySupplierList
          const uniqueCategories = Array.from(new Set(categorySupplierList.map(item => item.category)))
          uniqueCategories.forEach(category => {
            const supplierAmounts: Record<number, number> = {}
            regularSplits.forEach(split => {
              if (split.type === 'Expense' && (split.category || 'אחר') === category && split.supplier_id) {
                supplierAmounts[split.supplier_id] = (supplierAmounts[split.supplier_id] || 0) + split.proportionalAmount
              }
            })
            // Find supplier with highest amount
            let mainSupplierId: number | null = null
            let maxAmount = 0
            Object.entries(supplierAmounts).forEach(([supplierId, amount]) => {
              if (amount > maxAmount) {
                maxAmount = amount
                mainSupplierId = parseInt(supplierId)
              }
            })
            categorySuppliers[category] = mainSupplierId
          })

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
          // Always include the first month (monthIndex === 0) even if it hasn't been reached yet
          const monthlyIncome = months.map((m, monthIndex) => {
            const transactionIncome = monthlyData[m.monthKey].income
            const hasReached = hasReachedMonth(m.year, m.month)
            // Add monthly budget if we've reached this month and there's a budget
            // Always include budget for the first month if there's a budget
            if ((monthIndex === 0 || hasReached) && monthlyBudgetAmount > 0) {
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
          months.forEach((m, monthIndex) => {
            const monthData = monthlyData[m.monthKey]
            const hasReached = hasReachedMonth(m.year, m.month)
            const hasTransactions = hasMonthTransactions(m.monthKey)
            // Accumulate if we've reached this month OR if there are transactions for this month
            // Always include the first month (monthIndex === 0) even if it hasn't been reached yet
            if (monthIndex === 0 || hasReached || hasTransactions) {
              const monthBalance = monthlyIncome[monthIndex] - monthData.totalExpenses
              runningTotal += monthBalance
            }
            runningTotals.push(runningTotal)
          })
          
          const projectStartsInJanuary = projectStartMonthDate !== null && projectStartMonthDate.getMonth() === 0
          const projectStartYear = projectStartMonthDate ? projectStartMonthDate.getFullYear() : currentYear
          const yearOptions = Array.from({ length: currentYear - projectStartYear + 1 }, (_, i) => projectStartYear + i)
          
          return (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white text-right">
                  דוח הוצאות חודשי
                </h2>
                {projectStartsInJanuary && !isViewingHistoricalPeriod && (
                  <label className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">שנה:</span>
                    <select
                      value={monthlyTableYear}
                      onChange={(e) => setMonthlyTableYear(parseInt(e.target.value, 10))}
                      className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {yearOptions.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <div className="overflow-x-auto" dir="rtl">
                <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-2 py-1 text-right font-semibold text-gray-900 dark:text-white sticky left-0 z-10 min-w-[120px]">
                      קטגוריה
                    </th>
                    <th className="border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-2 py-1 text-right font-semibold text-gray-900 dark:text-white sticky left-[120px] z-10 min-w-[120px]">
                      ספק
                    </th>
                    {months.map((m, idx) => (
                      <th key={idx} className="border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-1 py-1 text-center font-semibold text-gray-900 dark:text-white min-w-[60px]">
                        {m.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Expense category-supplier rows */}
                  {categorySupplierList.map((item, idx) => (
                    <tr key={idx}>
                      <td className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-right text-gray-900 dark:text-white sticky left-0 z-10">
                        {item.category}
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-right text-gray-900 dark:text-white sticky left-[120px] z-10">
                        {item.supplier}
                      </td>
                      {months.map((m, monthIdx) => {
                        const hasReached = hasReachedMonth(m.year, m.month)
                        const hasTransactions = hasMonthTransactions(m.monthKey)
                        // Show if month has been reached OR if there are transactions for this month
                        // Always show the first month (monthIdx === 0) even if it hasn't been reached yet
                        const shouldShow = monthIdx === 0 || hasReached || hasTransactions
                        const amount = monthlyData[m.monthKey].expenses[item.category]?.[item.supplier] || 0
                        return (
                          <td key={monthIdx} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-2 text-center text-gray-900 dark:text-white">
                            {shouldShow && amount > 0
                              ? formatCurrency(amount)
                              : shouldShow ? '0' : ''}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  
                  {/* Empty rows for spacing (if needed) */}
                  {categorySupplierList.length === 0 && (
                    <tr>
                      <td colSpan={14} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-center text-gray-500 dark:text-gray-400">
                        אין הוצאות להצגה
                      </td>
                    </tr>
                  )}
                  
                  {/* סה"כ בקופה החודשית (Total in monthly fund) - Pink */}
                  <tr>
                    <td colSpan={2} className="border border-gray-300 dark:border-gray-600 bg-pink-200 dark:bg-pink-900 px-2 py-1 text-right font-semibold text-gray-900 dark:text-white sticky left-0 z-10">
                      סה"כ בקופה החודשית
                    </td>
                    {months.map((m, monthIdx) => {
                      const hasReached = hasReachedMonth(m.year, m.month)
                      const hasTransactions = hasMonthTransactions(m.monthKey)
                      // Show if month has been reached OR if there are transactions for this month
                      // Always show the first month (monthIdx === 0) even if it hasn't been reached yet
                      const shouldShow = monthIdx === 0 || hasReached || hasTransactions
                      return (
                        <td key={monthIdx} className="border border-gray-300 dark:border-gray-600 bg-pink-200 dark:bg-pink-900 px-1 py-1 text-center font-semibold text-gray-900 dark:text-white">
                          {shouldShow ? formatCurrency(monthlyIncome[monthIdx]) : ''}
                        </td>
                      )
                    })}
                  </tr>
                  
                  {/* הוצאות (Expenses) - Yellow */}
                  <tr>
                    <td colSpan={2} className="border border-gray-300 dark:border-gray-600 bg-yellow-200 dark:bg-yellow-900 px-2 py-1 text-right font-semibold text-gray-900 dark:text-white sticky left-0 z-10">
                      הוצאות
                    </td>
                    {months.map((m, monthIdx) => {
                      const hasReached = hasReachedMonth(m.year, m.month)
                      const hasTransactions = hasMonthTransactions(m.monthKey)
                      // Show if month has been reached OR if there are transactions for this month
                      // Always show the first month (monthIdx === 0) even if it hasn't been reached yet
                      const shouldShow = monthIdx === 0 || hasReached || hasTransactions
                      return (
                        <td key={monthIdx} className="border border-gray-300 dark:border-gray-600 bg-yellow-200 dark:bg-yellow-900 px-1 py-1 text-center font-semibold text-gray-900 dark:text-white">
                          {shouldShow ? formatCurrency(monthlyTotals[monthIdx]) : ''}
                        </td>
                      )
                    })}
                  </tr>
                  
                  {/* עודף (Surplus/Balance) - Light Blue */}
                  <tr>
                    <td colSpan={2} className="border border-gray-300 dark:border-gray-600 bg-blue-200 dark:bg-blue-900 px-2 py-1 text-right font-semibold text-gray-900 dark:text-white sticky left-0 z-10">
                      עודף
                    </td>
                    {months.map((m, monthIdx) => {
                      const hasReached = hasReachedMonth(m.year, m.month)
                      const hasTransactions = hasMonthTransactions(m.monthKey)
                      // Show if month has been reached OR if there are transactions for this month
                      // Always show the first month (monthIdx === 0) even if it hasn't been reached yet
                      const shouldShow = monthIdx === 0 || hasReached || hasTransactions
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
                    <td colSpan={2} className="border border-gray-300 dark:border-gray-600 bg-green-200 dark:bg-green-900 px-2 py-1 text-right font-semibold text-gray-900 dark:text-white sticky left-0 z-10">
                      סה"כ בקופה השנתית
                    </td>
                    {months.map((m, monthIdx) => {
                      const hasReached = hasReachedMonth(m.year, m.month)
                      const hasTransactions = hasMonthTransactions(m.monthKey)
                      // Show if month has been reached OR if there are transactions for this month
                      // Always show the first month (monthIdx === 0) even if it hasn't been reached yet
                      const shouldShow = monthIdx === 0 || hasReached || hasTransactions
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
            </>
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