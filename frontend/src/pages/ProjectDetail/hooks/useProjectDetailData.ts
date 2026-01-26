import { ProjectAPI, UnforeseenTransactionAPI, RecurringTransactionAPI } from '../../../lib/apiClient'
import { Transaction } from '../types'
import { BudgetWithSpending, RecurringTransactionTemplate, UnforeseenTransaction } from '../../../types/api'

export function useProjectDetailData(
  id: string | undefined,
  viewingPeriodId: number | null,
  state: any, // Full state object from useProjectDetailState
  navigate: (path: string) => void
) {
  // Load all project data in a single optimized API call
  const loadAllProjectData = async (periodId?: number | null) => {
    if (!id || isNaN(Number(id))) return

    try {
      state.setLoading(true)
      state.setError(null)

      // Use the optimized endpoint that returns everything in one call
      const data = await ProjectAPI.getProjectFull(Number(id), periodId || undefined)

      // Update project info
      state.setProjectName(data.project.name || '')
      state.setProjectBudget({
        budget_monthly: data.project.budget_monthly || 0,
        budget_annual: data.project.budget_annual || 0
      })
      state.setProjectStartDate(data.project.start_date || null)
      state.setProjectEndDate(data.project.end_date || null)
      state.setProjectImageUrl(data.project.image_url || null)
      state.setContractFileUrl(data.project.contract_file_url || null)
      state.setIsParentProject(data.project.is_parent_project || false)
      state.setRelationProject(data.project.relation_project || null)

      // Update transactions
      state.setTxs((data.transactions || []) as Transaction[])

      // Update budgets
      state.setProjectBudgets((data.budgets || []) as BudgetWithSpending[])

      // Update expense categories
      state.setExpenseCategories(data.expense_categories || [])

      // Update fund data
      if (data.fund) {
        state.setFundData({
          current_balance: data.fund.current_balance || 0,
          monthly_amount: data.fund.monthly_amount || 0,
          last_monthly_addition: null, // Not provided by API
          initial_balance: data.fund.initial_total || 0,
          initial_total: data.fund.initial_total || 0,
          total_additions: 0, // Not provided by API
          total_deductions: data.fund.total_deductions || 0,
          transactions: (data.fund.transactions || []) as any[]
        })
        state.setHasFund(true)
      } else {
        state.setHasFund(false)
        state.setFundData(null)
      }

      // Update contract periods
      if (data.contract_periods) {
        state.setContractPeriods(data.contract_periods)
      }

      // Update current contract period
      if (data.current_period) {
        state.setCurrentContractPeriod(data.current_period)
      }

      // Update selected period (when viewing historical period)
      if (data.selected_period) {
        state.setSelectedPeriod(data.selected_period)
      } else if (periodId === null && data.current_period) {
        // If no period specified, use current period
        state.setSelectedPeriod({
          period_id: data.current_period.period_id || 0,
          start_date: data.current_period.start_date,
          end_date: data.current_period.end_date,
          contract_year: data.current_period.contract_year,
          year_index: data.current_period.year_index,
          year_label: data.current_period.year_label,
          total_income: data.current_period.total_income,
          total_expense: data.current_period.total_expense,
          total_profit: data.current_period.total_profit
        })
      }

      // Load subprojects if this is a parent project
      if (data.project.is_parent_project) {
        state.setSubprojectsLoading(true)
        try {
          // Subprojects would be loaded separately if needed
          // For now, we'll leave this as a placeholder
          state.setSubprojects([])
        } catch (err) {
          console.error('Error loading subprojects:', err)
        } finally {
          state.setSubprojectsLoading(false)
        }
      }
    } catch (err: any) {
      console.error('Error loading project data:', err)
      state.setError(err.response?.data?.detail || err.message || 'שגיאה בטעינת נתוני הפרויקט')
      
      // Redirect to dashboard on 404
      if (err.response?.status === 404) {
        navigate('/dashboard')
      }
    } finally {
      state.setLoading(false)
    }
  }

  // Load unforeseen transactions
  const loadUnforeseenTransactions = async () => {
    if (!id || isNaN(Number(id))) return

    try {
      state.setUnforeseenTransactionsLoading(true)
      
      // Get effective period ID for filtering
      const effectivePeriodId = viewingPeriodId ?? state.selectedPeriod?.period_id ?? state.currentContractPeriod?.period_id ?? undefined
      
      const transactions = await UnforeseenTransactionAPI.getUnforeseenTransactions(
        Number(id),
        effectivePeriodId,
        true // include executed
      )
      
      state.setUnforeseenTransactions(transactions as UnforeseenTransaction[])
    } catch (err: any) {
      console.error('Error loading unforeseen transactions:', err)
      // Don't set error state for this - it's not critical
    } finally {
      state.setUnforeseenTransactionsLoading(false)
    }
  }

  // Load recurring transaction templates
  const loadRecurringTemplates = async () => {
    if (!id || isNaN(Number(id))) return

    try {
      const templates = await RecurringTransactionAPI.getProjectRecurringTemplates(Number(id))
      state.setRecurringTemplates(templates as RecurringTransactionTemplate[])
    } catch (err: any) {
      console.error('Error loading recurring templates:', err)
      state.setRecurringTemplates([])
    }
  }

  // Load just project info (used after updates)
  const loadProjectInfo = async () => {
    if (!id || isNaN(Number(id))) return

    try {
      const project = await ProjectAPI.getProject(Number(id))
      state.setProjectName(project.name || '')
      state.setProjectBudget({
        budget_monthly: project.budget_monthly || 0,
        budget_annual: project.budget_annual || 0
      })
      state.setProjectStartDate(project.start_date || null)
      state.setProjectEndDate(project.end_date || null)
      state.setProjectImageUrl(project.image_url || null)
      state.setContractFileUrl(project.contract_file_url || null)
      state.setIsParentProject(project.is_parent_project || false)
      state.setRelationProject(project.relation_project || null)
    } catch (err: any) {
      console.error('Error loading project info:', err)
    }
  }

  return {
    loadAllProjectData,
    loadUnforeseenTransactions,
    loadRecurringTemplates,
    loadProjectInfo
  }
}
