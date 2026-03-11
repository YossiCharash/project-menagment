import api from '../lib/api'
import { Project, ProjectCreate, Transaction, TransactionCreate, ProjectWithFinance, DashboardSnapshot, ExpenseCategory, RecurringTransactionTemplate, RecurringTransactionTemplateCreate, RecurringTransactionTemplateUpdate, BudgetWithSpending, UnforeseenTransaction, UnforeseenTransactionCreate, UnforeseenTransactionUpdate } from '../types/api'

// Enhanced API client with proper TypeScript types
export class ProjectAPI {
  // Get all projects with optional parent-child relationships
  static async getProjects(includeArchived = false): Promise<Project[]> {
    const { data } = await api.get<Project[]>(`/projects?include_archived=${includeArchived}`)
    return data
  }

  // Get single project (includes fund information)
  static async getProject(projectId: number): Promise<Project> {
    const { data } = await api.get<Project>(`/projects/${projectId}`)
    return data
  }

  // Get project with financial data for dashboard
  static async getProjectWithFinance(projectId: number): Promise<ProjectWithFinance> {
    const { data } = await api.get<ProjectWithFinance>(`/projects/get_values/${projectId}`)
    return data
  }

  // OPTIMIZED: Get complete project data in a single API call
  // Replaces 5+ separate API calls with ONE for faster page load
  // Optional periodId parameter: When provided, returns data filtered to that specific contract period
  static async getProjectFull(projectId: number, periodId?: number, cacheBust?: boolean): Promise<{
    project: Project & { has_fund?: boolean; monthly_fund_amount?: number | null }
    transactions: Transaction[]
    budgets: BudgetWithSpending[]
    expense_categories: ExpenseCategory[]
    fund: {
      id: number
      project_id: number
      current_balance: number
      monthly_amount: number
      total_deductions: number
      initial_total?: number
      transactions: Transaction[]
    } | null
    current_period: {
      period_id: number | null
      start_date: string
      end_date: string | null
      contract_year: number
      year_index: number
      year_label: string
      total_income: number
      total_expense: number
      total_profit: number
    } | null
    selected_period: {
      period_id: number
      start_date: string
      end_date: string | null
      contract_year: number
      year_index: number
      year_label: string
      total_income: number
      total_expense: number
      total_profit: number
    } | null
    contract_periods: {
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
    } | null
  }> {
    const params: any = periodId ? { period_id: periodId } : {}
    // Add cache busting parameter if requested
    if (cacheBust) {
      params._t = Date.now()
    }
    const { data } = await api.get(`/projects/${projectId}/full`, { params })
    return data
  }

  // Create project with optional parent relationship
  static async createProject(project: ProjectCreate): Promise<Project> {
    const { data } = await api.post<Project>('/projects', project)
    return data
  }

  // Update project
  static async updateProject(projectId: number, updates: Partial<ProjectCreate>): Promise<Project> {
    const { data } = await api.put<Project>(`/projects/${projectId}`, updates)
    return data
  }

  // Archive project
  static async archiveProject(projectId: number): Promise<Project> {
    const { data } = await api.post<Project>(`/projects/${projectId}/archive`)
    return data
  }

  // Restore project
  static async restoreProject(projectId: number): Promise<Project> {
    const { data } = await api.post<Project>(`/projects/${projectId}/restore`)
    return data
  }

  // Upload project image
  static async uploadProjectImage(projectId: number, file: File): Promise<Project> {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await api.post<Project>(`/projects/${projectId}/upload-image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return data
  }

  // Upload project contract file
  static async uploadProjectContract(projectId: number, file: File): Promise<Project> {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await api.post<Project>(`/projects/${projectId}/upload-contract`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return data
  }

  // Upload project document
  static async uploadProjectDocument(projectId: number, formData: FormData): Promise<any> {
    const { data } = await api.post(`/projects/${projectId}/documents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return data
  }

  // Get project documents
  static async getProjectDocuments(projectId: number): Promise<any[]> {
    const { data } = await api.get(`/projects/${projectId}/documents`)
    return data
  }

  // Delete project document
  static async deleteProjectDocument(projectId: number, documentId: number): Promise<void> {
    await api.delete(`/projects/${projectId}/documents/${documentId}`)
  }

  // Get profitability alerts
  static async getProfitabilityAlerts(): Promise<{
    alerts: Array<{
      id: number
      name: string
      profit_margin: number
      income: number
      expense: number
      profit: number
      is_subproject: boolean
      parent_project_id: number | null
    }>
    count: number
    period_start: string
    period_end: string
  }> {
    const { data } = await api.get('/projects/profitability-alerts')
    return data
  }

  // Check if project name exists
  static async checkProjectName(name: string, excludeId?: number): Promise<{ exists: boolean; available: boolean }> {
    const params = new URLSearchParams({ name })
    if (excludeId) {
      params.append('exclude_id', excludeId.toString())
    }
    const { data } = await api.get<{ exists: boolean; available: boolean }>(`/projects/check-name?${params.toString()}`)
    return data
  }

  // Get current active contract period for a project
  static async getCurrentContractPeriod(projectId: number): Promise<{
    project_id: number
    current_period: {
      period_id: number | null
      start_date: string
      end_date: string | null
      contract_year: number
      year_index: number
      year_label: string
      total_income: number
      total_expense: number
      total_profit: number
    } | null
  }> {
    const { data } = await api.get(`/projects/${projectId}/contract-periods/current`)
    return data
  }

  // Get previous contract periods for a project
  static async getContractPeriods(projectId: number): Promise<{
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
  }> {
    const { data } = await api.get(`/projects/${projectId}/contract-periods`)
    return data
  }

  // Get contract period summary
  static async getContractPeriodSummary(projectId: number, periodId: number | null, startDate?: string, endDate?: string): Promise<any> {
    if (periodId) {
      const { data } = await api.get(`/projects/${projectId}/contract-periods/${periodId}`)
      return data
    } else {
      const { data } = await api.get(`/projects/${projectId}/contract-periods/summary/by-dates`, {
        params: { start_date: startDate, end_date: endDate }
      })
      return data
    }
  }

  // Update contract period dates
  static async updateContractPeriod(projectId: number, periodId: number, dates: { start_date?: string, end_date?: string }): Promise<void> {
    await api.put(`/projects/${projectId}/contract-periods/${periodId}`, dates)
  }

  // Export contract period to CSV
  static async exportContractPeriodCSV(projectId: number, periodId: number | null, startDate?: string, endDate?: string): Promise<Blob> {
    const response = await api.get(`/projects/${projectId}/contract-periods/${periodId || 0}/export-csv`, {
      params: { start_date: startDate, end_date: endDate },
      responseType: 'blob'
    })
    return response.data
  }

  // Export all contract periods for a year to CSV
  static async exportContractYearCSV(projectId: number, year: number): Promise<Blob> {
    const response = await api.get(`/projects/${projectId}/contract-periods/year/${year}/export-csv`, {
      responseType: 'blob'
    })
    return response.data
  }

  // Close contract year manually
  static async closeContractYear(projectId: number, endDate: string): Promise<any> {
    const formData = new FormData()
    formData.append('end_date', endDate)
    const { data } = await api.post(`/projects/${projectId}/close-year`, formData)
    return data
  }

  // Check and renew contract
  static async checkAndRenewContract(projectId: number): Promise<{
    renewed: boolean
    message: string
    new_start_date?: string
    new_end_date?: string
    contract_periods?: {
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
    }
  }> {
    const { data } = await api.post(`/projects/${projectId}/check-contract-renewal`)
    return data
  }

  // Get parent project financial summary
  static async getParentProjectFinancialSummary(projectId: number, startDate?: string, endDate?: string): Promise<{
    parent_project: any
    financial_summary: {
      total_income: number
      total_expense: number
      net_profit: number
      profit_margin: number
      subproject_count: number
      active_subprojects: number
    }
    parent_financials: any
    subprojects_financials: any[]
  }> {
    let url = `/projects/${projectId}/financial-summary`
    const params = new URLSearchParams()
    if (startDate) params.append('start_date', startDate)
    if (endDate) params.append('end_date', endDate)
    
    if (params.toString()) {
      url += `?${params.toString()}`
    }
    
    const { data } = await api.get(url)
    return data
  }
}

export class TransactionAPI {
  // Get transactions for a project
  static async getProjectTransactions(projectId: number): Promise<Transaction[]> {
    const { data } = await api.get<Transaction[]>(`/transactions/project/${projectId}`)
    return data
  }

  // Create transaction
  static async createTransaction(transaction: TransactionCreate): Promise<Transaction> {
    // Keep amounts as positive values
    const payload = {
      ...transaction,
      amount: Math.abs(transaction.amount)
    }
    const { data } = await api.post<Transaction>('/transactions', payload)
    return data
  }

  // Update transaction
  static async updateTransaction(transactionId: number, updates: Partial<TransactionCreate>): Promise<Transaction> {
    const { data } = await api.put<Transaction>(`/transactions/${transactionId}`, updates)
    return data
  }

  // Upload receipt for transaction
  static async uploadReceipt(transactionId: number, file: File): Promise<Transaction> {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await api.post<Transaction>(`/transactions/${transactionId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return data
  }

  // Delete transaction
  static async deleteTransaction(transactionId: number): Promise<void> {
    await api.delete(`/transactions/${transactionId}`)
  }

  // Get transaction documents
  static async getTransactionDocuments(transactionId: number): Promise<any[]> {
    const { data } = await api.get<any[]>(`/transactions/${transactionId}/documents`)
    return data
  }

  // Upload document to transaction
  static async uploadTransactionDocument(transactionId: number, file: File, retries = 2): Promise<any> {
    const formData = new FormData()
    formData.append('file', file)
    
    // Calculate timeout based on file size (1MB = 15 seconds, minimum 60 seconds)
    const fileSizeMB = file.size / (1024 * 1024)
    const timeout = Math.max(60000, fileSizeMB * 15000)
    
    const url = `/transactions/${transactionId}/supplier-document`
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Don't set Content-Type header - let axios set it automatically with boundary
        const config = {
          timeout: timeout,
          headers: {} as any,
        }
        
        const response = await api.post<any>(url, formData, config)
        return response.data
      } catch (error: any) {
        const isNetworkError = !error.response && (error.code === 'ECONNABORTED' || error.message?.includes('Network Error') || error.message?.includes('ERR_NETWORK'))
        const isLastAttempt = attempt === retries
        
        if (isNetworkError && !isLastAttempt) {
          const waitTime = 1000 * (attempt + 1)
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          continue
        }
        
        // If it's the last attempt or not a network error, throw
        throw error
      }
    }
    
    throw new Error('Upload failed after all retry attempts')
  }

  // Delete transaction document
  static async deleteTransactionDocument(transactionId: number, documentId: number): Promise<void> {
    await api.delete(`/transactions/${transactionId}/documents/${documentId}`)
  }

  /** Rollback a transaction (creator only, no documents). Used when group transaction document upload fails. */
  static async rollbackTransaction(transactionId: number): Promise<{ ok: boolean }> {
    const { data } = await api.post<{ ok: boolean }>(`/transactions/${transactionId}/rollback`)
    return data
  }
}

/** Group transaction draft (טיוטת עסקה קבוצתית) - rows + documents stored until user submits. */
export interface GroupTransactionDraftDocumentOut {
  id: number
  row_index: number
  sub_type: string | null
  sub_index: number | null
  original_filename: string
}

export interface GroupTransactionDraftOut {
  id: number
  user_id: number
  name: string | null
  rows: Record<string, unknown>[]
  documents: GroupTransactionDraftDocumentOut[]
  created_at: string
  updated_at: string
}

export class GroupTransactionDraftAPI {
  static async list(): Promise<GroupTransactionDraftOut[]> {
    const { data } = await api.get<GroupTransactionDraftOut[]>('/group-transaction-drafts')
    return data
  }

  static async get(draftId: number): Promise<GroupTransactionDraftOut> {
    const { data } = await api.get<GroupTransactionDraftOut>(`/group-transaction-drafts/${draftId}`)
    return data
  }

  static async create(payload: { name: string; rows: Record<string, unknown>[] }): Promise<GroupTransactionDraftOut> {
    const { data } = await api.post<GroupTransactionDraftOut>('/group-transaction-drafts', payload)
    return data
  }

  static async update(
    draftId: number,
    payload: { name?: string; rows?: Record<string, unknown>[] }
  ): Promise<GroupTransactionDraftOut> {
    const { data } = await api.patch<GroupTransactionDraftOut>(`/group-transaction-drafts/${draftId}`, payload)
    return data
  }

  static async delete(draftId: number): Promise<void> {
    await api.delete(`/group-transaction-drafts/${draftId}`)
  }

  static async uploadDocument(
    draftId: number,
    file: File,
    rowIndex: number,
    subType: 'main' | 'income' | 'expense' = 'main',
    subIndex?: number
  ): Promise<GroupTransactionDraftDocumentOut> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('row_index', String(rowIndex))
    formData.append('sub_type', subType)
    if (subIndex != null) formData.append('sub_index', String(subIndex))
    const fileSizeMB = file.size / (1024 * 1024)
    const timeout = Math.max(60000, fileSizeMB * 15000)
    const { data } = await api.post<GroupTransactionDraftDocumentOut>(
      `/group-transaction-drafts/${draftId}/documents`,
      formData,
      { timeout }
    )
    return data
  }

  static async downloadDocument(draftId: number, docId: number): Promise<Blob> {
    const { data } = await api.get(`/group-transaction-drafts/${draftId}/documents/${docId}/download`, {
      responseType: 'blob'
    })
    return data
  }
}

export class DashboardAPI {
  // Get dashboard snapshot with all projects and financial data from backend
  static async getDashboardSnapshot(): Promise<DashboardSnapshot> {
    const { data } = await api.get<DashboardSnapshot>('/reports/dashboard-snapshot')
    return data
  }
}

export class ReportAPI {
  // Get expense categories for a specific project
  static async getProjectExpenseCategories(projectId: number): Promise<ExpenseCategory[]> {
    const { data } = await api.get<ExpenseCategory[]>(`/reports/project/${projectId}/expense-categories`)
    return data
  }

  // Get all transactions for a specific project
  static async getProjectTransactions(projectId: number): Promise<Transaction[]> {
    const { data } = await api.get<Transaction[]>(`/reports/project/${projectId}/transactions`)
    return data
  }
}

export class BudgetAPI {
  // Create a new budget for a project
  static async createBudget(payload: {
    project_id: number
    category: string
    amount: number
    period_type?: 'Annual' | 'Monthly'
    start_date: string
    end_date?: string | null
    contract_period_id?: number | null
  }): Promise<void> {
    await api.post('/budgets', payload)
  }

  // Get all budgets for a project with spending information, optionally filtered by contract period
  static async getProjectBudgets(projectId: number, contractPeriodId?: number | null): Promise<BudgetWithSpending[]> {
    const params = new URLSearchParams()
    if (contractPeriodId) {
      params.append('contract_period_id', contractPeriodId.toString())
    }
    const queryString = params.toString()
    const url = `/budgets/project/${projectId}${queryString ? '?' + queryString : ''}`
    const { data } = await api.get<BudgetWithSpending[]>(url)
    return data
  }

  // Get a specific budget with spending information
  static async getBudget(budgetId: number): Promise<BudgetWithSpending> {
    const { data } = await api.get<BudgetWithSpending>(`/budgets/${budgetId}`)
    return data
  }

  // Update an existing budget
  static async updateBudget(
    budgetId: number,
    payload: {
      category?: string
      amount?: number
      period_type?: 'Annual' | 'Monthly'
      start_date?: string
      end_date?: string | null
      is_active?: boolean
    }
  ): Promise<void> {
    await api.put(`/budgets/${budgetId}`, payload)
  }

  // Delete a specific budget
  static async deleteBudget(budgetId: number): Promise<void> {
    await api.delete(`/budgets/${budgetId}`)
  }
}

export class RecurringTransactionAPI {
  // Get all recurring transaction templates for a project
  static async getProjectRecurringTemplates(projectId: number): Promise<RecurringTransactionTemplate[]> {
    const { data } = await api.get<RecurringTransactionTemplate[]>(`/recurring-transactions/project/${projectId}`)
    return data
  }

  // Create a recurring transaction template
  static async createTemplate(template: RecurringTransactionTemplateCreate): Promise<RecurringTransactionTemplate> {
    const { data } = await api.post<RecurringTransactionTemplate>('/recurring-transactions', template)
    return data
  }

  // Update a recurring transaction template
  static async updateTemplate(templateId: number, updates: RecurringTransactionTemplateUpdate): Promise<RecurringTransactionTemplate> {
    const { data } = await api.put<RecurringTransactionTemplate>(`/recurring-transactions/${templateId}`, updates)
    return data
  }

  // Delete a recurring transaction template
  static async deleteTemplate(templateId: number): Promise<void> {
    await api.delete(`/recurring-transactions/${templateId}`)
  }

  // Deactivate a recurring transaction template
  static async deactivateTemplate(templateId: number): Promise<RecurringTransactionTemplate> {
    const { data } = await api.post<RecurringTransactionTemplate>(`/recurring-transactions/${templateId}/deactivate`)
    return data
  }

  // Get all transactions generated from a specific template
  static async getTemplateTransactions(templateId: number): Promise<Transaction[]> {
    const { data } = await api.get<Transaction[]>(`/recurring-transactions/${templateId}/transactions`)
    return data
  }

  // Get a template with its transactions
  static async getTemplate(templateId: number): Promise<RecurringTransactionTemplate & { generated_transactions?: Transaction[] }> {
    const { data } = await api.get<RecurringTransactionTemplate & { generated_transactions?: Transaction[] }>(`/recurring-transactions/${templateId}`)
    return data
  }

  // Ensure all recurring transactions for a project are generated (only missing ones)
  static async ensureProjectTransactionsGenerated(projectId: number): Promise<{ generated_count: number; project_id: number }> {
    const { data } = await api.post<{ generated_count: number; project_id: number }>(`/recurring-transactions/project/${projectId}/ensure-generated`)
    return data
  }

  // Generate transactions for a specific month
  static async generateMonthlyTransactions(year: number, month: number): Promise<{ generated_count: number; transactions: Transaction[] }> {
    const { data } = await api.post<{ generated_count: number; transactions: Transaction[] }>(`/recurring-transactions/generate/${year}/${month}`)
    return data
  }

  // Update a specific transaction instance (for recurring transactions)
  static async updateTransactionInstance(transactionId: number, updates: { tx_date?: string; amount?: number; category?: string; notes?: string }): Promise<Transaction> {
    const { data } = await api.put<Transaction>(`/recurring-transactions/transactions/${transactionId}`, updates)
    return data
  }

  // Delete a specific transaction instance (for recurring transactions)
  static async deleteTransactionInstance(transactionId: number): Promise<void> {
    await api.delete(`/recurring-transactions/transactions/${transactionId}`)
  }
}

export interface Category {
  id: number
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CategoryCreate {
  name: string
}

export interface CategoryUpdate {
  is_active?: boolean
}

export class CategoryAPI {
  // Get all categories
  static async getCategories(includeInactive: boolean = false): Promise<Category[]> {
    const { data } = await api.get<Category[]>(`/categories?include_inactive=${includeInactive}`)
    return data
  }

  // Get category by ID
  static async getCategory(categoryId: number): Promise<Category> {
    const { data } = await api.get<Category>(`/categories/${categoryId}`)
    return data
  }

  // Create a new category
  static async createCategory(category: CategoryCreate): Promise<Category> {
    const { data } = await api.post<Category>('/categories', category)
    return data
  }

  // Update a category
  static async updateCategory(categoryId: number, updates: CategoryUpdate): Promise<Category> {
    const { data } = await api.put<Category>(`/categories/${categoryId}`, updates)
    return data
  }

  // Delete a category (soft delete)
  static async deleteCategory(categoryId: number): Promise<void> {
    await api.delete(`/categories/${categoryId}`)
  }

  // Get suppliers for a category
  static async getCategorySuppliers(categoryId: number): Promise<Array<{ id: number; name: string; category: string | null; transaction_count: number }>> {
    const { data } = await api.get<Array<{ id: number; name: string; category: string | null; transaction_count: number }>>(`/categories/${categoryId}/suppliers`)
    return data
  }
}

export interface Supplier {
  id: number
  name: string
  contact_email?: string | null
  phone?: string | null
  category?: string | null
  annual_budget?: number | null
  is_active?: boolean
  created_at?: string
}

export interface SupplierCreate {
  name: string
  contact_email?: string | null
  phone?: string | null
  category?: string | null
  annual_budget?: number | null
}

export interface SupplierUpdate {
  name?: string
  contact_email?: string | null
  phone?: string | null
  category?: string | null
  annual_budget?: number | null
  is_active?: boolean
}

export class SupplierAPI {
  // Get all suppliers
  static async getSuppliers(): Promise<Supplier[]> {
    const { data } = await api.get<Supplier[]>('/suppliers')
    return data
  }

  // Get supplier by ID
  static async getSupplier(supplierId: number): Promise<Supplier> {
    const { data } = await api.get<Supplier>(`/suppliers/${supplierId}`)
    return data
  }

  // Create a new supplier
  static async createSupplier(supplier: SupplierCreate): Promise<Supplier> {
    const { data } = await api.post<Supplier>('/suppliers/', supplier)
    return data
  }

  // Update a supplier
  static async updateSupplier(supplierId: number, updates: SupplierUpdate): Promise<Supplier> {
    const { data } = await api.put<Supplier>(`/suppliers/${supplierId}`, updates)
    return data
  }

  // Delete a supplier
  static async deleteSupplier(supplierId: number, transferToSupplierId?: number): Promise<void> {
    const params = transferToSupplierId ? { transfer_to_supplier_id: transferToSupplierId } : {}
    await api.delete(`/suppliers/${supplierId}`, { params })
  }

  // Get transaction count for a supplier
  static async getSupplierTransactionCount(supplierId: number): Promise<{ supplier_id: number; transaction_count: number }> {
    const { data } = await api.get<{ supplier_id: number; transaction_count: number }>(`/suppliers/${supplierId}/transaction-count`)
    return data
  }
}

export class UnforeseenTransactionAPI {
  // Get all unforeseen transactions for a project
  static async getUnforeseenTransactions(
    projectId: number,
    contractPeriodId?: number,
    includeExecuted: boolean = true,
    cacheBust: boolean = false
  ): Promise<UnforeseenTransaction[]> {
    const params: any = { project_id: projectId, include_executed: includeExecuted }
    if (contractPeriodId) {
      params.contract_period_id = contractPeriodId
    }
    if (cacheBust) {
      params._t = Date.now()
    }
    const { data } = await api.get<UnforeseenTransaction[]>('/unforeseen-transactions', { params })
    return data
  }

  // Get unforeseen transactions by contract period
  static async getUnforeseenTransactionsByContractPeriod(contractPeriodId: number): Promise<UnforeseenTransaction[]> {
    const { data } = await api.get<UnforeseenTransaction[]>(`/unforeseen-transactions/contract-period/${contractPeriodId}`)
    return data
  }

  // Get a single unforeseen transaction
  static async getUnforeseenTransaction(txId: number): Promise<UnforeseenTransaction> {
    const { data } = await api.get<UnforeseenTransaction>(`/unforeseen-transactions/${txId}`)
    return data
  }

  // Get unforeseen transaction by the ID of its resulting transaction (for list view)
  static async getUnforeseenTransactionByResultingTransactionId(resultingTransactionId: number): Promise<UnforeseenTransaction> {
    const { data } = await api.get<UnforeseenTransaction>(`/unforeseen-transactions/by-resulting-transaction/${resultingTransactionId}`)
    return data
  }

  // Create a new unforeseen transaction
  static async createUnforeseenTransaction(tx: UnforeseenTransactionCreate): Promise<UnforeseenTransaction> {
    const { data } = await api.post<UnforeseenTransaction>('/unforeseen-transactions', tx)
    return data
  }

  // Update an unforeseen transaction
  static async updateUnforeseenTransaction(txId: number, updates: UnforeseenTransactionUpdate): Promise<UnforeseenTransaction> {
    const { data } = await api.put<UnforeseenTransaction>(`/unforeseen-transactions/${txId}`, updates)
    return data
  }

  // Delete an unforeseen transaction
  static async deleteUnforeseenTransaction(txId: number): Promise<void> {
    await api.delete(`/unforeseen-transactions/${txId}`)
  }

  // Execute an unforeseen transaction
  static async executeUnforeseenTransaction(txId: number): Promise<{
    message: string
    transaction: UnforeseenTransaction
    resulting_transaction?: {
      id: number
      amount: number
      type: string
      description: string
    }
  }> {
    const { data } = await api.post(`/unforeseen-transactions/${txId}/execute`)
    return data
  }

  // Upload document for an expense
  static async uploadExpenseDocument(
    txId: number,
    expenseId: number,
    file: File,
    description?: string
  ): Promise<{
    id: number
    file_path: string
    description?: string | null
    uploaded_at?: string | null
  }> {
    const formData = new FormData()
    formData.append('file', file)
    if (description) {
      formData.append('description', description)
    }
    const { data } = await api.post(`/unforeseen-transactions/${txId}/expenses/${expenseId}/document`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return data
  }

  // Upload document for an income
  static async uploadIncomeDocument(
    txId: number,
    incomeId: number,
    file: File,
    description?: string
  ): Promise<{
    id: number
    file_path: string
    description?: string | null
    uploaded_at?: string | null
  }> {
    const formData = new FormData()
    formData.append('file', file)
    if (description) {
      formData.append('description', description)
    }
    const { data } = await api.post(`/unforeseen-transactions/${txId}/incomes/${incomeId}/document`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return data
  }
}

// --- Quote Structure (חלוקת הצעת מחיר) - Settings ---
export interface QuoteStructureItem {
  id: number
  name: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface QuoteStructureItemCreate {
  name: string
  sort_order?: number
}

export interface QuoteStructureItemUpdate {
  name?: string
  sort_order?: number
  is_active?: boolean
}

export class QuoteStructureAPI {
  static async list(includeInactive = false): Promise<QuoteStructureItem[]> {
    const { data } = await api.get<QuoteStructureItem[]>(`/quote-structure?include_inactive=${includeInactive}`)
    return data
  }

  static async get(id: number): Promise<QuoteStructureItem> {
    const { data } = await api.get<QuoteStructureItem>(`/quote-structure/${id}`)
    return data
  }

  static async create(payload: QuoteStructureItemCreate): Promise<QuoteStructureItem> {
    const { data } = await api.post<QuoteStructureItem>('/quote-structure', payload)
    return data
  }

  static async update(id: number, payload: QuoteStructureItemUpdate): Promise<QuoteStructureItem> {
    const { data } = await api.put<QuoteStructureItem>(`/quote-structure/${id}`, payload)
    return data
  }

  static async delete(id: number): Promise<void> {
    await api.delete(`/quote-structure/${id}`)
  }
}

// --- Quote Subjects (פרויקטים בהצעות מחיר) ---
export interface QuoteSubject {
  id: number
  address: string | null
  num_apartments: number | null
  num_buildings: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface QuoteSubjectCreate {
  address?: string | null
  num_apartments?: number | null
  num_buildings?: number | null
  notes?: string | null
}

export interface QuoteSubjectUpdate {
  address?: string | null
  num_apartments?: number | null
  num_buildings?: number | null
  notes?: string | null
}

export class QuoteSubjectsAPI {
  static async list(): Promise<QuoteSubject[]> {
    const { data } = await api.get<QuoteSubject[]>('/quote-subjects')
    return data
  }

  static async get(id: number): Promise<QuoteSubject> {
    const { data } = await api.get<QuoteSubject>(`/quote-subjects/${id}`)
    return data
  }

  static async create(payload: QuoteSubjectCreate): Promise<QuoteSubject> {
    const { data } = await api.post<QuoteSubject>('/quote-subjects', payload)
    return data
  }

  static async update(id: number, payload: QuoteSubjectUpdate): Promise<QuoteSubject> {
    const { data } = await api.put<QuoteSubject>(`/quote-subjects/${id}`, payload)
    return data
  }

  static async delete(id: number): Promise<void> {
    await api.delete(`/quote-subjects/${id}`)
  }

  /** Delete subject and all its quotes (admin only, requires password). */
  static async deleteWithPassword(id: number, password: string): Promise<void> {
    await api.post(`/quote-subjects/${id}/delete`, { password })
  }
}

// --- Quote Projects (הצעות מחיר) ---
export type QuoteCalculationMethod = 'by_residents' | 'by_apartment_size'

export interface QuoteApartment {
  id: number
  quote_building_id: number
  size_sqm: number
  sort_order: number
  created_at: string
}

export interface QuoteBuilding {
  id: number
  quote_project_id: number
  address: string | null
  num_residents: number | null
  calculation_method: QuoteCalculationMethod
  sort_order: number
  created_at: string
  updated_at: string
  quote_lines: QuoteLine[]
  quote_apartments: QuoteApartment[]
}

export interface QuoteSubjectInfo {
  id: number
  address: string | null
  num_apartments: number | null
  num_buildings: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface QuoteLine {
  id: number
  quote_project_id: number | null
  quote_structure_item_id: number
  quote_structure_item_name: string
  amount: number | null
  sort_order: number
  created_at?: string
}

export interface QuoteProject {
  id: number
  name: string
  description: string | null
  parent_id: number | null
  project_id: number | null
  quote_subject_id: number | null
  expected_start_date: string | null
  expected_income: number | null
  expected_expenses: number | null
  num_residents: number | null
  status: 'draft' | 'approved'
  converted_project_id: number | null
  created_at: string
  updated_at: string
  quote_lines: QuoteLine[]
  quote_buildings: QuoteBuilding[]
  quote_subject: QuoteSubjectInfo | null
  children_count: number
}

export interface QuoteProjectCreate {
  name: string
  quote_subject_id: number
  description?: string | null
  parent_id?: number | null
  project_id?: number | null
  expected_start_date?: string | null
  expected_income?: number | null
  expected_expenses?: number | null
  num_residents?: number | null
}

export interface QuoteProjectUpdate {
  name?: string
  description?: string | null
  parent_id?: number | null
  expected_start_date?: string | null
  expected_income?: number | null
  expected_expenses?: number | null
  num_residents?: number | null
}

export interface QuoteLineCreate {
  quote_structure_item_id: number
  amount?: number | null
  sort_order?: number
  quote_building_id?: number | null
}

export interface QuoteBuildingCreate {
  address?: string | null
  num_residents?: number | null
  calculation_method?: QuoteCalculationMethod
  sort_order?: number
}

export interface QuoteBuildingUpdate {
  address?: string | null
  num_residents?: number | null
  calculation_method?: QuoteCalculationMethod
  sort_order?: number
}

export class QuoteProjectsAPI {
  static async list(
    parentId?: number | null,
    projectId?: number | null,
    quoteSubjectId?: number | null,
    status?: 'draft' | 'approved',
    includeAll?: boolean
  ): Promise<QuoteProject[]> {
    const params = new URLSearchParams()
    if (parentId != null) params.set('parent_id', String(parentId))
    if (projectId != null) params.set('project_id', String(projectId))
    if (quoteSubjectId != null) params.set('quote_subject_id', String(quoteSubjectId))
    if (status) params.set('status', status)
    if (includeAll) params.set('include_all', 'true')
    const { data } = await api.get<QuoteProject[]>(`/quote-projects?${params}`)
    return data
  }

  static async get(id: number): Promise<QuoteProject> {
    const { data } = await api.get<QuoteProject>(`/quote-projects/${id}`)
    return data
  }

  static async create(payload: QuoteProjectCreate): Promise<QuoteProject> {
    const { data } = await api.post<QuoteProject>('/quote-projects', payload)
    return data
  }

  static async update(id: number, payload: QuoteProjectUpdate): Promise<QuoteProject> {
    const { data } = await api.put<QuoteProject>(`/quote-projects/${id}`, payload)
    return data
  }

  static async delete(id: number): Promise<void> {
    await api.delete(`/quote-projects/${id}`)
  }

  static async approve(
    id: number,
    projectId?: number | null
  ): Promise<{ message: string; quote_project_id: number; project_id: number }> {
    const body = projectId != null ? { project_id: projectId } : undefined
    const { data } = await api.post(`/quote-projects/${id}/approve`, body)
    return data
  }

  static async listLines(quoteProjectId: number): Promise<QuoteLine[]> {
    const { data } = await api.get<QuoteLine[]>(`/quote-projects/${quoteProjectId}/lines`)
    return data
  }

  static async addLine(quoteProjectId: number, payload: QuoteLineCreate): Promise<QuoteLine> {
    const { data } = await api.post<QuoteLine>(`/quote-projects/${quoteProjectId}/lines`, payload)
    return data
  }

  static async updateLine(quoteProjectId: number, lineId: number, payload: { amount?: number | null; sort_order?: number }): Promise<QuoteLine> {
    const { data } = await api.put<QuoteLine>(`/quote-projects/${quoteProjectId}/lines/${lineId}`, payload)
    return data
  }

  static async deleteLine(quoteProjectId: number, lineId: number): Promise<void> {
    await api.delete(`/quote-projects/${quoteProjectId}/lines/${lineId}`)
  }

  static async addBuilding(quoteProjectId: number, payload: QuoteBuildingCreate): Promise<QuoteBuilding> {
    const { data } = await api.post<QuoteBuilding>(`/quote-projects/${quoteProjectId}/buildings`, payload)
    return data
  }

  static async updateBuilding(quoteProjectId: number, buildingId: number, payload: QuoteBuildingUpdate): Promise<QuoteBuilding> {
    const { data } = await api.put<QuoteBuilding>(`/quote-projects/${quoteProjectId}/buildings/${buildingId}`, payload)
    return data
  }

  static async deleteBuilding(quoteProjectId: number, buildingId: number): Promise<void> {
    await api.delete(`/quote-projects/${quoteProjectId}/buildings/${buildingId}`)
  }

  static async addApartmentsBulk(quoteProjectId: number, buildingId: number, payload: { count: number; size_sqm: number }): Promise<QuoteBuilding> {
    const { data } = await api.post<QuoteBuilding>(`/quote-projects/${quoteProjectId}/buildings/${buildingId}/apartments/bulk`, payload)
    return data
  }

  static async deleteApartment(quoteProjectId: number, buildingId: number, apartmentId: number): Promise<void> {
    await api.delete(`/quote-projects/${quoteProjectId}/buildings/${buildingId}/apartments/${apartmentId}`)
  }
}

export interface TaskChecklistItem {
  id: number
  task_id: number
  text: string
  is_completed: boolean
  sort_order: number
  created_at: string
  assigned_to_user_id: number | null
  assigned_user_name: string | null
  assigned_user_avatar: string | null
  assigned_user_color: string | null
  handled_by_user_id: number | null
  handled_by_user_name: string | null
  handled_by_user_avatar: string | null
  handled_by_user_color: string | null
  handled_at: string | null
}

export class TaskChecklistAPI {
  static async list(taskId: number): Promise<TaskChecklistItem[]> {
    const { data } = await api.get<TaskChecklistItem[]>(`/tasks/${taskId}/checklist`)
    return data
  }

  static async create(taskId: number, text: string): Promise<TaskChecklistItem> {
    const { data } = await api.post<TaskChecklistItem>(`/tasks/${taskId}/checklist`, { text })
    return data
  }

  static async update(
    taskId: number,
    itemId: number,
    payload: { is_completed?: boolean; text?: string; assigned_to_user_id?: number | null; clear_assignment?: boolean }
  ): Promise<TaskChecklistItem> {
    const { data } = await api.patch<TaskChecklistItem>(
      `/tasks/${taskId}/checklist/${itemId}`,
      payload
    )
    return data
  }

  static async delete(taskId: number, itemId: number): Promise<void> {
    await api.delete(`/tasks/${taskId}/checklist/${itemId}`)
  }
}