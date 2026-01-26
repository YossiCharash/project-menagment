import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Transaction, SplitTransaction } from '../types'
import { ExpenseCategory, BudgetWithSpending, RecurringTransactionTemplate, UnforeseenTransaction } from '../../../types/api'

export function useProjectDetailState() {
  const [searchParams] = useSearchParams()
  const periodIdParam = searchParams.get('period')
  const viewingPeriodId = periodIdParam ? parseInt(periodIdParam) : null

  // Basic project state
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
  const [relationProject, setRelationProject] = useState<number | null>(null)
  const [subprojects, setSubprojects] = useState<Array<{ id: number; name: string; is_active: boolean }>>([])
  const [subprojectsLoading, setSubprojectsLoading] = useState<boolean>(false)
  const [showEditProjectModal, setShowEditProjectModal] = useState(false)
  const [editingProject, setEditingProject] = useState<any | null>(null)
  const [showArchiveDeleteModal, setShowArchiveDeleteModal] = useState(false)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deletePasswordError, setDeletePasswordError] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  // Filter state
  const [filterType, setFilterType] = useState<'all' | 'Income' | 'Expense' | 'unforeseen'>('all')
  const [filterExceptional, setFilterExceptional] = useState<'all' | 'only'>('all')
  const [globalDateFilterMode, setGlobalDateFilterMode] = useState<'current_month' | 'selected_month' | 'date_range' | 'all_time' | 'project'>('current_month')
  const [globalSelectedMonth, setGlobalSelectedMonth] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [globalSelectedYear, setGlobalSelectedYear] = useState<number>(new Date().getFullYear())
  const [globalStartDate, setGlobalStartDate] = useState<string>('')
  const [globalEndDate, setGlobalEndDate] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [filterDated, setFilterDated] = useState<'all' | 'only'>('all')

  // Legacy aliases for backward compatibility
  const dateFilterMode = globalDateFilterMode === 'project' ? 'all_time' : globalDateFilterMode
  const selectedMonth = globalSelectedMonth
  const startDate = globalStartDate
  const endDate = globalEndDate
  const setDateFilterMode = (mode: 'current_month' | 'selected_month' | 'date_range' | 'all_time') => setGlobalDateFilterMode(mode)
  const setSelectedMonth = setGlobalSelectedMonth
  const setStartDate = setGlobalStartDate
  const setEndDate = setGlobalEndDate

  // Transaction modal state
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
  const [showRecurringSelectionModal, setShowRecurringSelectionModal] = useState(false)
  const [showCreateTransactionModal, setShowCreateTransactionModal] = useState(false)

  // Documents state
  const [showDocumentsModal, setShowDocumentsModal] = useState(false)
  const [selectedTransactionForDocuments, setSelectedTransactionForDocuments] = useState<any | null>(null)
  const [transactionDocuments, setTransactionDocuments] = useState<any[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<any | null>(null)
  const [showDescriptionModal, setShowDescriptionModal] = useState(false)
  const [uploadedDocuments, setUploadedDocuments] = useState<Array<{id: number, fileName: string, description: string}>>([])

  // Budget state
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
  const [showTransactionDetailsModal, setShowTransactionDetailsModal] = useState(false)
  const [selectedTransactionForDetails, setSelectedTransactionForDetails] = useState<Transaction | null>(null)
  const [showFundTransactionsModal, setShowFundTransactionsModal] = useState(false)
  const [showCreateFundModal, setShowCreateFundModal] = useState(false)
  const [showEditFundModal, setShowEditFundModal] = useState(false)
  const [fundUpdateScope, setFundUpdateScope] = useState<'from_start' | 'from_this_month' | 'only_this_month'>('from_this_month')
  const [monthlyFundAmount, setMonthlyFundAmount] = useState<number>(0)
  const [currentBalance, setCurrentBalance] = useState<number>(0)
  const [creatingFund, setCreatingFund] = useState(false)
  const [updatingFund, setUpdatingFund] = useState(false)
  const [fundScopePreviousYear, setFundScopePreviousYear] = useState<'only_period' | 'also_current' | null>(null)

  // Unforeseen Transactions state
  const [unforeseenTransactions, setUnforeseenTransactions] = useState<UnforeseenTransaction[]>([])
  const [unforeseenTransactionsLoading, setUnforeseenTransactionsLoading] = useState(false)
  const [showUnforeseenTransactionsModal, setShowUnforeseenTransactionsModal] = useState(false)
  const [showCreateUnforeseenTransactionModal, setShowCreateUnforeseenTransactionModal] = useState(false)
  const [unforeseenTransactionsFilter, setUnforeseenTransactionsFilter] = useState<'all' | 'draft' | 'waiting_for_approval' | 'executed'>('all')
  const [unforeseenIncomeAmount, setUnforeseenIncomeAmount] = useState<number>(0)
  const [unforeseenDescription, setUnforeseenDescription] = useState<string>('')
  const [unforeseenNotes, setUnforeseenNotes] = useState<string>('')
  const [unforeseenTransactionDate, setUnforeseenTransactionDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [unforeseenExpenses, setUnforeseenExpenses] = useState<Array<{ amount: number; description: string; documentFile?: File | null; documentId?: number | null; expenseId?: number | null }>>([{ amount: 0, description: '', documentFile: null, expenseId: null, documentId: null }])
  const [unforeseenSubmitting, setUnforeseenSubmitting] = useState(false)
  const [editingUnforeseenTransaction, setEditingUnforeseenTransaction] = useState<UnforeseenTransaction | null>(null)
  const [uploadingDocumentForExpense, setUploadingDocumentForExpense] = useState<number | null>(null)
  const [showUnforeseenTransactionDetailsModal, setShowUnforeseenTransactionDetailsModal] = useState(false)
  const [selectedUnforeseenTransactionForDetails, setSelectedUnforeseenTransactionForDetails] = useState<UnforeseenTransaction | null>(null)

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

  const [showPreviousYearsModal, setShowPreviousYearsModal] = useState(false)
  const [selectedPeriodSummary, setSelectedPeriodSummary] = useState<any | null>(null)
  const [showPeriodSummaryModal, setShowPeriodSummaryModal] = useState(false)
  const [loadingPeriodSummary, setLoadingPeriodSummary] = useState(false)

  // Calculate total periods: previous periods + current period (if exists)
  const totalPeriods = useMemo(() => {
    const previousPeriodsCount = contractPeriods?.periods_by_year 
      ? contractPeriods.periods_by_year.reduce((sum, year) => sum + year.periods.length, 0)
      : 0;
    return previousPeriodsCount > 0 || (contractPeriods !== null && contractPeriods !== undefined) ? 1 : 0;
  }, [contractPeriods]);

  // First (earliest) contract start date
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

  return {
    // Basic project state
    txs, setTxs,
    expenseCategories, setExpenseCategories,
    projectBudgets, setProjectBudgets,
    projectName, setProjectName,
    loading, setLoading,
    updatingProject, setUpdatingProject,
    chartsLoading, setChartsLoading,
    error, setError,
    projectImageUrl, setProjectImageUrl,
    contractFileUrl, setContractFileUrl,
    showContractModal, setShowContractModal,
    projectBudget, setProjectBudget,
    projectStartDate, setProjectStartDate,
    projectEndDate, setProjectEndDate,
    availableCategories, setAvailableCategories,
    isParentProject, setIsParentProject,
    relationProject, setRelationProject,
    subprojects, setSubprojects,
    subprojectsLoading, setSubprojectsLoading,
    showEditProjectModal, setShowEditProjectModal,
    editingProject, setEditingProject,
    showArchiveDeleteModal, setShowArchiveDeleteModal,
    showDeleteConfirmModal, setShowDeleteConfirmModal,
    deletePassword, setDeletePassword,
    deletePasswordError, setDeletePasswordError,
    isDeleting, setIsDeleting,

    // Filter state
    filterType, setFilterType,
    filterExceptional, setFilterExceptional,
    globalDateFilterMode, setGlobalDateFilterMode,
    globalSelectedMonth, setGlobalSelectedMonth,
    globalSelectedYear, setGlobalSelectedYear,
    globalStartDate, setGlobalStartDate,
    globalEndDate, setGlobalEndDate,
    categoryFilter, setCategoryFilter,
    filterDated, setFilterDated,
    dateFilterMode, setDateFilterMode,
    selectedMonth, setSelectedMonth,
    startDate, setStartDate,
    endDate, setEndDate,

    // Transaction modal state
    editTransactionModalOpen, setEditTransactionModalOpen,
    selectedTransactionForEdit, setSelectedTransactionForEdit,
    transactionTypeFilter, setTransactionTypeFilter,
    editTemplateModalOpen, setEditTemplateModalOpen,
    selectedTemplateForEdit, setSelectedTemplateForEdit,
    pendingTemplateLoad, setPendingTemplateLoad,
    recurringTemplates, setRecurringTemplates,
    showDeleteTransactionModal, setShowDeleteTransactionModal,
    transactionToDelete, setTransactionToDelete,
    isDeletingTransaction, setIsDeletingTransaction,
    monthlyTableYear, setMonthlyTableYear,
    showRecurringSelectionModal, setShowRecurringSelectionModal,
    showCreateTransactionModal, setShowCreateTransactionModal,

    // Documents state
    showDocumentsModal, setShowDocumentsModal,
    selectedTransactionForDocuments, setSelectedTransactionForDocuments,
    transactionDocuments, setTransactionDocuments,
    documentsLoading, setDocumentsLoading,
    selectedDocument, setSelectedDocument,
    showDescriptionModal, setShowDescriptionModal,
    uploadedDocuments, setUploadedDocuments,

    // Budget state
    budgetDeleteLoading, setBudgetDeleteLoading,
    showAddBudgetForm, setShowAddBudgetForm,
    budgetSaving, setBudgetSaving,
    budgetFormError, setBudgetFormError,
    budgetDateMode, setBudgetDateMode,
    newBudgetForm, setNewBudgetForm,
    showEditBudgetForm, setShowEditBudgetForm,
    budgetToEdit, setBudgetToEdit,
    editBudgetForm, setEditBudgetForm,
    editBudgetSaving, setEditBudgetSaving,
    editBudgetError, setEditBudgetError,
    allCategoryOptions,

    // Fund state
    fundData, setFundData,
    hasFund, setHasFund,
    fundLoading, setFundLoading,
    fundCategoryFilter,
    transactionsExpandedId, setTransactionsExpandedId,
    showTransactionDetailsModal, setShowTransactionDetailsModal,
    selectedTransactionForDetails, setSelectedTransactionForDetails,
    showFundTransactionsModal, setShowFundTransactionsModal,
    showCreateFundModal, setShowCreateFundModal,
    showEditFundModal, setShowEditFundModal,
    fundUpdateScope, setFundUpdateScope,
    monthlyFundAmount, setMonthlyFundAmount,
    currentBalance, setCurrentBalance,
    creatingFund, setCreatingFund,
    updatingFund, setUpdatingFund,
    fundScopePreviousYear, setFundScopePreviousYear,

    // Unforeseen Transactions state
    unforeseenTransactions, setUnforeseenTransactions,
    unforeseenTransactionsLoading, setUnforeseenTransactionsLoading,
    showUnforeseenTransactionsModal, setShowUnforeseenTransactionsModal,
    showCreateUnforeseenTransactionModal, setShowCreateUnforeseenTransactionModal,
    unforeseenTransactionsFilter, setUnforeseenTransactionsFilter,
    unforeseenIncomeAmount, setUnforeseenIncomeAmount,
    unforeseenDescription, setUnforeseenDescription,
    unforeseenNotes, setUnforeseenNotes,
    unforeseenTransactionDate, setUnforeseenTransactionDate,
    unforeseenExpenses, setUnforeseenExpenses,
    unforeseenSubmitting, setUnforeseenSubmitting,
    editingUnforeseenTransaction, setEditingUnforeseenTransaction,
    uploadingDocumentForExpense, setUploadingDocumentForExpense,
    showUnforeseenTransactionDetailsModal, setShowUnforeseenTransactionDetailsModal,
    selectedUnforeseenTransactionForDetails, setSelectedUnforeseenTransactionForDetails,

    // Contract periods state
    contractPeriods, setContractPeriods,
    currentContractPeriod, setCurrentContractPeriod,
    selectedPeriod, setSelectedPeriod,
    showPreviousYearsModal, setShowPreviousYearsModal,
    selectedPeriodSummary, setSelectedPeriodSummary,
    showPeriodSummaryModal, setShowPeriodSummaryModal,
    loadingPeriodSummary, setLoadingPeriodSummary,
    totalPeriods,
    firstContractStartDate,
    isViewingHistoricalPeriod,
    allPeriods,
    currentViewingPeriodIndex,
    prevPeriod,
    nextPeriod,
    viewingPeriodId
  }
}
