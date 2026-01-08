import api from '../lib/api'
import { Project, ProjectCreate, Transaction, TransactionCreate, ProjectWithFinance, DashboardSnapshot, ExpenseCategory, RecurringTransactionTemplate, RecurringTransactionTemplateCreate, RecurringTransactionTemplateUpdate, BudgetWithSpending } from '../types/api'

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
  static async getContractPeriodSummary(projectId: number, periodId: number): Promise<{
    period_id: number
    project_id: number
    start_date: string
    end_date: string
    contract_year: number
    year_index: number
    year_label: string
    total_income: number
    total_expense: number
    total_profit: number
    transactions: Array<{
      id: number
      tx_date: string
      type: string
      amount: number
      description: string | null
      category: string | null
      payment_method: string | null
      notes: string | null
      supplier_id: number | null
    }>
    budgets: Array<{
      category: string
      amount: number
      period_type: string
      start_date: string | null
      end_date: string | null
      is_active: boolean
    }>
  }> {
    const { data } = await api.get(`/projects/${projectId}/contract-periods/${periodId}`)
    return data
  }

  // Update contract period dates
  static async updateContractPeriod(projectId: number, periodId: number, dates: { start_date?: string, end_date?: string }): Promise<void> {
    await api.put(`/projects/${projectId}/contract-periods/${periodId}`, dates)
  }

  // Export contract period to CSV
  static async exportContractPeriodCSV(projectId: number, periodId: number): Promise<Blob> {
    const response = await api.get(`/projects/${projectId}/contract-periods/${periodId}/export-csv`, {
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
  static async uploadTransactionDocument(transactionId: number, file: File): Promise<any> {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await api.post<any>(`/transactions/${transactionId}/supplier-document`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return data
  }

  // Delete transaction document
  static async deleteTransactionDocument(transactionId: number, documentId: number): Promise<void> {
    await api.delete(`/transactions/${transactionId}/documents/${documentId}`)
  }
}

export class DashboardAPI {
  // Get dashboard snapshot with all projects and financial data from backend
  static async getDashboardSnapshot(): Promise<DashboardSnapshot> {
    try {
      // Use the new comprehensive backend endpoint for real-time data
      const { data } = await api.get<DashboardSnapshot>('/reports/dashboard-snapshot')
      return data
    } catch (error: any) {
      throw error
      
      // If authentication error, let the interceptor handle it
      if (error.response?.status === 401) {
        throw error
      }
      
      // Return empty state on other errors
      return {
        projects: [],
        alerts: {
          budget_overrun: [],
          budget_warning: [],
          missing_proof: [],
          unpaid_recurring: [],
          category_budget_alerts: []
        },
        summary: { total_income: 0, total_expense: 0, total_profit: 0 },
        expense_categories: []
      }
    }
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
  }): Promise<void> {
    await api.post('/budgets', payload)
  }

  // Get all budgets for a project with spending information
  static async getProjectBudgets(projectId: number): Promise<BudgetWithSpending[]> {
    const { data } = await api.get<BudgetWithSpending[]>(`/budgets/project/${projectId}`)
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