import api from '../../../lib/api'
import { ReportAPI, BudgetAPI, ProjectAPI, CategoryAPI, RecurringTransactionAPI, UnforeseenTransactionAPI } from '../../../lib/apiClient'
import { parseLocalDate } from '../../../lib/utils'
import { resolveFileUrl } from '../utils'

export function useProjectDetailData(
  id: string | undefined,
  viewingPeriodId: number | null,
  state: {
    setLoading: (loading: boolean) => void
    setChartsLoading: (loading: boolean) => void
    setError: (error: string | null) => void
    setTxs: (txs: any[]) => void
    setProjectName: (name: string) => void
    setProjectBudget: (budget: { budget_monthly: number; budget_annual: number }) => void
    setProjectStartDate: (date: string | null) => void
    setProjectEndDate: (date: string | null) => void
    setIsParentProject: (isParent: boolean) => void
    setHasFund: (hasFund: boolean) => void
    setContractFileUrl: (url: string | null) => void
    setProjectImageUrl: (url: string | null) => void
    setGlobalDateFilterMode: (mode: 'current_month' | 'selected_month' | 'date_range' | 'all_time' | 'project') => void
    setProjectBudgets: (budgets: any[]) => void
    setExpenseCategories: (categories: any[]) => void
    setFundData: (data: any) => void
    setContractPeriods: (periods: any) => void
    setCurrentContractPeriod: (period: any) => void
    setSelectedPeriod: (period: any) => void
    setSubprojects: (subprojects: any[]) => void
    setSubprojectsLoading: (loading: boolean) => void
    setRelationProject: (id: number | null) => void
    setFundLoading: (loading: boolean) => void
    setUnforeseenTransactions: (txs: any[]) => void
    setUnforeseenTransactionsLoading: (loading: boolean) => void
    setRecurringTemplates: (templates: any[]) => void
    selectedPeriod: any
    currentContractPeriod: any
    globalDateFilterMode: 'current_month' | 'selected_month' | 'date_range' | 'all_time' | 'project'
  },
  navigate: (path: string) => void
) {
  const loadAllProjectData = async (periodId?: number | null) => {
    try {
      state.setLoading(true)
      state.setChartsLoading(true)
      state.setError(null)
      
      const fullData = await ProjectAPI.getProjectFull(Number(id), periodId || undefined)
      
      // Set transactions with a fresh copy to force React to re-render
      state.setTxs([]) // Clear first to force re-render
      state.setTxs(fullData.transactions || [])

      // Set project info
      const proj = fullData.project
      state.setProjectName(proj.name || `פרויקט ${id}`)
      state.setProjectBudget({
        budget_monthly: proj.budget_monthly || 0,
        budget_annual: proj.budget_annual || 0
      })
      state.setProjectStartDate(proj.start_date || null)
      state.setProjectEndDate(proj.end_date || null)
      state.setIsParentProject(proj.is_parent_project || false)
      state.setHasFund(proj.has_fund || false)
      state.setContractFileUrl(proj.contract_file_url || null)
      state.setProjectImageUrl(proj.image_url || null)

      // Set default filter mode if viewing current month but project has already ended
      if (proj.end_date && state.globalDateFilterMode === 'current_month') {
        const endDate = parseLocalDate(proj.end_date)
        const today = new Date()
        // If project ended before this month, default to 'project' (full project view)
        if (endDate && endDate < new Date(today.getFullYear(), today.getMonth(), 1)) {
          state.setGlobalDateFilterMode('project')
        }
      }

      // Set transactions - create a completely new array with new objects to force React re-render
      const transactions = fullData.transactions || []
      // Create deep copy to ensure React detects the change
      const newTransactions = transactions.map(tx => ({ ...tx }))
      state.setTxs(newTransactions)

      // Set budgets
      state.setProjectBudgets(fullData.budgets || [])

      // Set expense categories
      state.setExpenseCategories(fullData.expense_categories || [])

      // Set fund data
      if (fullData.fund) {
        state.setFundData({
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
        state.setHasFund(true)
      } else {
        state.setFundData(null)
      }
      
      // Set contract periods and current period (New from optimized endpoint)
      if (fullData.contract_periods) {
        state.setContractPeriods(fullData.contract_periods)
      }
      if (fullData.current_period) {
        state.setCurrentContractPeriod(fullData.current_period)
        // Update project dates to reflect current contract period (only if not viewing historical period)
        if (!periodId) {
          if (fullData.current_period.start_date) {
            state.setProjectStartDate(fullData.current_period.start_date)
          }
          if (fullData.current_period.end_date) {
            state.setProjectEndDate(fullData.current_period.end_date)
            
            // Re-check filter mode with current period end date
            if (state.globalDateFilterMode === 'current_month') {
              const endDate = parseLocalDate(fullData.current_period.end_date)
              const today = new Date()
              if (endDate && endDate < new Date(today.getFullYear(), today.getMonth(), 1)) {
                state.setGlobalDateFilterMode('project')
              }
            }
          }
        }
      }
      
      // Handle selected period (for historical period viewing)
      if (fullData.selected_period) {
        state.setSelectedPeriod(fullData.selected_period)
        // When viewing historical period, default to 'project' filter to show all data for that period
        state.setGlobalDateFilterMode('project')
        // When viewing historical period, use that period's dates for display
        if (fullData.selected_period.start_date) {
          state.setProjectStartDate(fullData.selected_period.start_date)
        }
        if (fullData.selected_period.end_date) {
          state.setProjectEndDate(fullData.selected_period.end_date)
        }
      } else {
        state.setSelectedPeriod(null)
      }

    } catch (err: any) {
      console.error('Error loading project data:', err)
      const status = err?.response?.status
      const errorMessage = err?.response?.data?.detail || err?.message || 'שגיאה בטעינת נתוני הפרויקט'
      
      // If project not found (404), navigate back to dashboard
      if (status === 404) {
        console.log('Project not found (404), navigating to dashboard')
        state.setLoading(false)
        state.setChartsLoading(false)
        navigate('/dashboard')
        return
      }
      
      state.setError(errorMessage)
      // Fallback to legacy loading if new endpoint fails (only for non-404 errors)
      try {
        await Promise.all([
          loadProjectInfo(),
          load(),
          loadChartsData()
        ])
        // If fallback succeeds, clear error
        state.setError(null)
      } catch (fallbackErr: any) {
        console.error('Fallback loading also failed:', fallbackErr)
        // If fallback also returns 404, navigate to dashboard
        if (fallbackErr?.response?.status === 404) {
          state.setLoading(false)
          state.setChartsLoading(false)
          navigate('/dashboard')
          return
        }
        // Keep the error state so user can see what went wrong
        state.setError('שגיאה בטעינת נתוני הפרויקט. נא לנסות שוב.')
      }
    } finally {
      state.setLoading(false)
      state.setChartsLoading(false)
    }
  }

  // Legacy load function - kept for fallback and refresh scenarios
  const load = async () => {
    if (!id || isNaN(Number(id))) return

    state.setLoading(true)
    try {
      const { data } = await api.get(`/transactions/project/${id}`)
      state.setTxs(data || [])
    } catch (err: any) {
      state.setTxs([])
    } finally {
      state.setLoading(false)
    }
  }

  // Effective period for budgets: when viewing a specific period, use it; otherwise current
  const effectiveBudgetPeriodId = viewingPeriodId ?? state.selectedPeriod?.period_id ?? state.currentContractPeriod?.period_id ?? null

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
      state.setExpenseCategories(categoriesData || [])
      state.setProjectBudgets(budgetsData || [])
    } catch (err: any) {
      console.error('Failed to reload charts data:', err)
    }
  }

  // Legacy loadChartsData - kept for refresh scenarios
  const loadChartsData = async () => {
    if (!id || isNaN(Number(id))) return

    state.setChartsLoading(true)
    try {
      const [categoriesData, budgetsData] = await Promise.all([
        ReportAPI.getProjectExpenseCategories(parseInt(id)),
        BudgetAPI.getProjectBudgets(parseInt(id), effectiveBudgetPeriodId).catch((err) => {
          console.error('Failed to load project budgets:', err)
          return []
        })
      ])
      
      state.setExpenseCategories(categoriesData || [])
      state.setProjectBudgets(budgetsData || [])
    } catch (err: any) {
      console.error('Error loading charts data:', err)
    } finally {
      state.setChartsLoading(false)
    }
  }

  const loadProjectInfo = async () => {
    if (!id || isNaN(Number(id))) return

    try {
      // NOTE: checkAndRenewContract is called only when explicitly needed (not on every load)
      // to reduce unnecessary API calls on page refresh
      
      const { data } = await api.get(`/projects/${id}`)
      
      state.setProjectName(data.name || `פרויקט ${id}`)
      state.setProjectBudget({
        budget_monthly: data.budget_monthly || 0,
        budget_annual: data.budget_annual || 0
      })
      state.setProjectStartDate(data.start_date || null)
      state.setProjectEndDate(data.end_date || null)
      state.setIsParentProject(data.is_parent_project || false)
      state.setRelationProject(data.relation_project || null)

      // Load subprojects if this is a parent project
      if (data.is_parent_project) {
        await loadSubprojects()
      } else {
        state.setSubprojects([])
      }

      if (data.image_url) {
        // Backend now returns full S3 URL in image_url for new uploads.
        // For backward compatibility, if it's a relative path we still prefix with /uploads.
        if (data.image_url.startsWith('http')) {
          state.setProjectImageUrl(data.image_url)
        } else {
          const apiUrl = import.meta.env.VITE_API_URL || ''
          // @ts-ignore
          const baseUrl = apiUrl ? apiUrl.replace('/api/v1', '') : ''
          state.setProjectImageUrl(`${baseUrl}/uploads/${data.image_url}`)
        }
      }
      if (data.contract_file_url) {
        state.setContractFileUrl(resolveFileUrl(data.contract_file_url))
      } else {
        state.setContractFileUrl(null)
      }
      // Check if project has fund and load fund data
      const hasFundFlag = data.has_fund || false
      const monthlyFundAmount = data.monthly_fund_amount || 0
      state.setHasFund(hasFundFlag)
      
      // Always try to load fund data if has_fund is true (even if fund doesn't exist yet)
      if (hasFundFlag) {
        await loadFundData()
      } else {
        // Also try to load if monthly_fund_amount exists (backward compatibility)
        if (monthlyFundAmount > 0) {
          await loadFundData()
        } else {
          state.setFundData(null)
          state.setFundLoading(false)
        }
      }
      
      // Load contract periods and current period
      await Promise.all([
        loadContractPeriods(),
        loadCurrentContractPeriod(),
        loadUnforeseenTransactions()
      ])
    } catch (err: any) {
      state.setProjectName(`פרויקט ${id}`)
      state.setProjectBudget({ budget_monthly: 0, budget_annual: 0 })
    }
  }
  
  const loadCurrentContractPeriod = async () => {
    if (!id || isNaN(Number(id))) return
    
    try {
      const currentPeriodData = await ProjectAPI.getCurrentContractPeriod(parseInt(id))
      if (currentPeriodData.current_period) {
        state.setCurrentContractPeriod(currentPeriodData.current_period)
        // Update project dates to reflect current contract period (only if period exists)
        if (currentPeriodData.current_period.start_date) {
          state.setProjectStartDate(currentPeriodData.current_period.start_date)
        }
        if (currentPeriodData.current_period.end_date) {
          state.setProjectEndDate(currentPeriodData.current_period.end_date)
        } else {
          // If no end_date in current period, keep project end_date
          // Don't override with null
        }
      } else {
        state.setCurrentContractPeriod(null)
        // If no current period, dates remain from project data loaded above
      }
    } catch (err: any) {
      console.error('Error loading current contract period:', err)
      state.setCurrentContractPeriod(null)
      // On error, dates remain from project data loaded above
    }
  }
  
  const loadContractPeriods = async () => {
    if (!id || isNaN(Number(id))) return
    
    try {
      const periods = await ProjectAPI.getContractPeriods(parseInt(id))
      state.setContractPeriods(periods)
    } catch (err: any) {
      console.error('Error loading contract periods:', err)
      state.setContractPeriods(null)
    }
  }

  const loadSubprojects = async () => {
    if (!id || isNaN(Number(id))) return

    state.setSubprojectsLoading(true)
    try {
      const { data } = await api.get(`/projects/${id}/subprojects`)
      state.setSubprojects(data || [])
    } catch (err: any) {
      console.error('Error loading subprojects:', err)
      state.setSubprojects([])
    } finally {
      state.setSubprojectsLoading(false)
    }
  }

  const loadFundData = async () => {
    if (!id || isNaN(Number(id))) return
    
    state.setFundLoading(true)
    try {
      const { data } = await api.get(`/projects/${id}/fund`)
      if (data) {
        state.setFundData(data)
        state.setHasFund(true) // Ensure hasFund is set to true if fund data exists
      } else {
        state.setFundData(null)
      }
    } catch (err: any) {
      // If fund doesn't exist (404), that's OK - project might not have fund yet
      state.setFundData(null)
    } finally {
      state.setFundLoading(false)
    }
  }

  const loadUnforeseenTransactions = async () => {
    if (!id || isNaN(Number(id))) return
    
    state.setUnforeseenTransactionsLoading(true)
    try {
      const data = await UnforeseenTransactionAPI.getUnforeseenTransactions(
        parseInt(id),
        viewingPeriodId || undefined,
        true
      )
      state.setUnforeseenTransactions(data)
    } catch (err: any) {
      console.error('Failed to load unforeseen transactions:', err)
      state.setUnforeseenTransactions([])
    } finally {
      state.setUnforeseenTransactionsLoading(false)
    }
  }

  const loadRecurringTemplates = async () => {
    if (!id || isNaN(Number(id))) return
    try {
      const templates = await RecurringTransactionAPI.getProjectRecurringTemplates(parseInt(id))
      state.setRecurringTemplates(templates)
    } catch (err) {
      console.error('Failed to load recurring templates', err)
    }
  }

  const loadTransactionsOnly = async () => {
    // Load transactions without regenerating recurring transactions
    if (!id || isNaN(Number(id))) return
    
    try {
      const { data } = await api.get(`/transactions/project/${id}`)
      state.setTxs(data || [])
    } catch (err: any) {
      state.setTxs([])
    }
  }

  return {
    loadAllProjectData,
    load,
    loadChartsData,
    reloadChartsDataOnly,
    loadProjectInfo,
    loadCurrentContractPeriod,
    loadContractPeriods,
    loadSubprojects,
    loadFundData,
    loadUnforeseenTransactions,
    loadRecurringTemplates,
    loadTransactionsOnly
  }
}
