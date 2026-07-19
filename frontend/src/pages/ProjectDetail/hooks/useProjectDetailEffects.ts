import { useEffect } from 'react'
import { CategoryAPI, RecurringTransactionAPI } from '../../../lib/apiClient'
import { fetchMe } from '../../../store/slices/authSlice'
import { fetchSuppliers } from '../../../store/slices/suppliersSlice'

export function useProjectDetailEffects(
  id: string | undefined,
  viewingPeriodId: number | null,
  state: any, // Full state object from useProjectDetailState
  dataLoaders: any, // Data loading functions from useProjectDetailData
  dispatch: any,
  navigate: (path: string) => void,
  me: any
) {
  // Load user data if not available
  useEffect(() => {
    if (!me) dispatch(fetchMe())
  }, [dispatch, me])

  // Load recurring templates when filter is set to recurring
  useEffect(() => {
    if (state.transactionTypeFilter === 'recurring') {
      dataLoaders.loadRecurringTemplates()
    }
  }, [state.transactionTypeFilter, id])

  // Ensure modal stays open when template loads
  useEffect(() => {
    if (state.selectedTemplateForEdit && state.pendingTemplateLoad && state.editTemplateModalOpen) {
      state.setPendingTemplateLoad(false)
    }
  }, [state.selectedTemplateForEdit, state.pendingTemplateLoad, state.editTemplateModalOpen])

  // Generate recurring transactions for selected month, date range, or all_time when user changes filter
  useEffect(() => {
    if (!id || isNaN(Number(id))) return

    const generateForSelectedPeriod = async () => {
      try {
        // NOTE: loadAllProjectData() calls GET /projects/{id}/full, which ALREADY ensures
        // all recurring transactions are generated up to today, server-side. We must not
        // also fire a separate ensureProjectTransactionsGenerated here: on mount this effect
        // runs concurrently with the mount-load effect below, so the duplicate call caused
        // two concurrent backfills of the same project (lock contention + wasted work, and a
        // duplicate-insert race on first load). The only case /full cannot cover is a FUTURE
        // selected month, which we generate explicitly.
        if (viewingPeriodId) {
          await dataLoaders.loadAllProjectData(viewingPeriodId)
          await dataLoaders.loadUnforeseenTransactions()
          return
        }

        const dateFilterMode = state.globalDateFilterMode === 'project' ? 'all_time' : state.globalDateFilterMode
        const selectedMonth = state.globalSelectedMonth

        // Generate for a selected month only when it is in the future (/full stops at today).
        if (dateFilterMode === 'selected_month' && selectedMonth) {
          const [year, month] = selectedMonth.split('-').map(Number)
          const selectedDate = new Date(year, month - 1, 1)
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          selectedDate.setHours(0, 0, 0, 0)

          if (selectedDate > today) {
            try {
              await RecurringTransactionAPI.generateMonthlyTransactions(year, month)
            } catch (genErr) {
              // Silently fail - transactions might already exist
              console.log('Could not generate recurring transactions for selected month:', genErr)
            }
          }
        }

        // Reload full project data when switching to date_range / all_time / selected_month.
        // current_month is already loaded by the mount effect below, so reloading it here
        // would just duplicate the (expensive) /full call.
        // Do NOT use /transactions/project/{id} - that endpoint filters by project contract
        // dates and would hide regular transactions outside that range. getProjectFull returns
        // all transactions; TransactionsList then filters by the user's chosen date range.
        if (dateFilterMode !== 'current_month') {
          await dataLoaders.loadAllProjectData()
        }
      } catch (err) {
        console.log('Could not generate recurring transactions:', err)
      }
    }

    generateForSelectedPeriod()
  }, [state.globalSelectedMonth, state.globalDateFilterMode, state.globalStartDate, state.globalEndDate, id, viewingPeriodId])

  // Load categories from database (only categories defined in settings)
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const categories = await CategoryAPI.getCategories()
        const categoryNames = categories.filter((cat: any) => cat.is_active).map((cat: any) => cat.name)
        state.setAvailableCategories(categoryNames)
        // Set default category for budget form if available
        if (categoryNames.length > 0 && !state.newBudgetForm.category) {
          state.setNewBudgetForm((prev: any) => ({ ...prev, category: categoryNames[0] }))
        }
      } catch (err) {
        console.error('Error loading categories:', err)
        state.setAvailableCategories([])
      }
    }
    loadCategories()
  }, [])

  // Update budget start date based on date mode
  useEffect(() => {
    if (state.budgetDateMode === 'project_start' && state.projectStartDate) {
      const dateStr = state.projectStartDate.includes('T') ? state.projectStartDate.split('T')[0] : state.projectStartDate
      state.setNewBudgetForm((prev: any) => ({ ...prev, start_date: dateStr }))
    } else if (state.budgetDateMode === 'today') {
      state.setNewBudgetForm((prev: any) => ({ ...prev, start_date: new Date().toISOString().split('T')[0] }))
    }
    // For 'custom' mode, user will manually select the date
  }, [state.budgetDateMode, state.projectStartDate])

  // Close contract modal if contract file URL is removed
  useEffect(() => {
    if (!state.contractFileUrl) {
      state.setShowContractModal(false)
    }
  }, [state.contractFileUrl])

  // Reset project-specific state when id changes so we don't use stale parent state
  // (e.g. when navigating from a parent project to a subproject, avoid redirecting to /parent)
  useEffect(() => {
    if (id) {
      state.setIsParentProject(false)
      state.setSubprojects([])
    }
  }, [id])

  // Load all project data on mount and when period changes
  useEffect(() => {
    if (id && !isNaN(Number(id))) {
      // OPTIMIZED: Load ALL project data in a SINGLE API call
      // Before: 5+ separate API calls (project, transactions, budgets, categories, fund)
      // After: 1 API call that returns everything
      // Pass viewingPeriodId for historical period viewing
      dataLoaders.loadAllProjectData(viewingPeriodId)
      dataLoaders.loadUnforeseenTransactions()
    }
  }, [id, viewingPeriodId])

  // Redirect to parent project route if this is a parent project (only after data is loaded for this id)
  useEffect(() => {
    if (state.isParentProject && id && !isNaN(Number(id)) && !state.loading) {
      // Use setTimeout to ensure the navigation happens after the component has rendered
      const timer = setTimeout(() => {
        navigate(`/projects/${id}/parent`, { replace: true })
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [state.isParentProject, id, navigate, state.loading])

  // Load suppliers
  useEffect(() => {
    dispatch(fetchSuppliers())
  }, [dispatch])

  // Reload project info when project is updated (e.g., after editing in modal or uploading image)
  useEffect(() => {
    const handleProjectUpdated = async (event: Event) => {
      const customEvent = event as CustomEvent
      if (customEvent.detail?.projectId && id && customEvent.detail.projectId === parseInt(id)) {
        state.setUpdatingProject(true)
        try {
          // Use loadAllProjectData with viewingPeriodId to maintain historical period filtering
          await dataLoaders.loadAllProjectData(viewingPeriodId)
          await dataLoaders.loadUnforeseenTransactions()
        } catch (err) {
          console.error('Error reloading project data after update:', err)
        } finally {
          state.setUpdatingProject(false)
        }
      }
    }

    window.addEventListener('projectUpdated', handleProjectUpdated)
    return () => window.removeEventListener('projectUpdated', handleProjectUpdated)
  }, [id, state.hasFund, viewingPeriodId])
}
