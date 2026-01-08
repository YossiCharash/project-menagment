// TypeScript interfaces generated from backend models
export interface Supplier {
  id: number
  name: string
  contact_email?: string | null
  phone?: string | null
  annual_budget?: number | null
  category?: string | null
  is_active: boolean
  created_at: string
}

export interface Project {
  id: number
  name: string
  description?: string | null
  start_date?: string | null
  end_date?: string | null
  budget_monthly: number
  budget_annual: number
  num_residents?: number | null
  monthly_price_per_apartment?: number | null
  address?: string | null
  city?: string | null
  relation_project?: number | null // Parent project ID
  image_url?: string | null
  contract_file_url?: string | null
  is_parent_project: boolean // True if this is a parent project that can have subprojects
  is_active: boolean
  manager_id?: number | null
  created_at: string
  total_value: number
  has_fund?: boolean
  monthly_fund_amount?: number | null
}

export interface Subproject {
  id: number
  project_id: number
  name: string
  is_active: boolean
  created_at: string
}

export interface Transaction {
  id: number
  project_id: number
  tx_date: string
  type: 'Income' | 'Expense'
  amount: number
  description?: string | null
  category?: string | null
  category_id?: number | null
  payment_method?: string | null
  notes?: string | null
  is_exceptional: boolean
  is_generated?: boolean
  recurring_template_id?: number | null
  file_path?: string | null
  supplier_id?: number | null
  created_at: string
  from_fund?: boolean
  period_start_date?: string | null
  period_end_date?: string | null
}

export interface BudgetCreate {
  category_id: number
  amount: number
  period_type?: 'Annual' | 'Monthly'
  start_date: string
  end_date?: string | null
}

export interface ProjectCreate {
  name: string
  description?: string | null
  start_date?: string | null
  end_date?: string | null
  budget_monthly: number
  budget_annual: number
  num_residents?: number | null
  monthly_price_per_apartment?: number | null
  address?: string | null
  city?: string | null
  relation_project?: number | null // Parent project ID
  image_url?: string | null
  contract_file_url?: string | null
  is_parent_project?: boolean // True if this is a parent project that can have subprojects
  manager_id?: number | null
  recurring_transactions?: RecurringTransactionTemplateCreate[] | null
  budgets?: BudgetCreate[] | null
  has_fund?: boolean
  monthly_fund_amount?: number | null
}

export interface TransactionCreate {
  project_id: number
  tx_date: string
  type: 'Income' | 'Expense'
  amount: number
  description?: string | null
  category?: string | null
  category_id?: number | null
  payment_method?: string | null
  notes?: string | null
  is_exceptional?: boolean
  supplier_id?: number | null
  from_fund?: boolean
  allow_duplicate?: boolean
  subproject_id?: number
  period_start_date?: string | null
  period_end_date?: string | null
}

// Dashboard-specific types
export interface ProjectWithFinance extends Project {
  children?: ProjectWithFinance[]
  income_month_to_date: number
  expense_month_to_date: number
  profit_percent: number
  status_color: 'green' | 'yellow' | 'red'
}

export interface ExpenseCategory {
  category: string
  amount: number
  color: string
}

export interface CategoryBudgetAlert {
  project_id: number
  budget_id: number
  category: string
  amount: number
  spent_amount: number
  spent_percentage: number
  expected_spent_percentage: number
  is_over_budget: boolean
  is_spending_too_fast: boolean
  alert_type: 'over_budget' | 'spending_too_fast'
}

export interface BudgetWithSpending {
  id: number
  project_id: number
  category: string
  amount: number
  base_amount?: number
  period_type: 'Annual' | 'Monthly'
  start_date: string
  end_date?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  spent_amount: number
  expense_amount: number
  income_amount: number
  remaining_amount: number
  spent_percentage: number
  expected_spent_percentage: number
  is_over_budget: boolean
  is_spending_too_fast: boolean
}

export interface DashboardSnapshot {
  projects: ProjectWithFinance[]
  alerts: {
    budget_overrun: number[]
    budget_warning: number[]
    missing_proof: number[]
    unpaid_recurring: number[]
    negative_fund_balance: number[]
    category_budget_alerts: CategoryBudgetAlert[]
  }
  summary: {
    total_income: number
    total_expense: number
    total_profit: number
  }
  expense_categories: ExpenseCategory[]
}

// Recurring Transaction types
export interface RecurringTransactionTemplateCreate {
  project_id: number
  description: string
  type: 'Income' | 'Expense'
  amount: number
  category?: string | null
  category_id?: number | null
  notes?: string | null
  supplier_id: number
  payment_method?: string | null
  frequency?: 'Monthly'
  day_of_month: number
  start_date: string
  end_type?: 'No End' | 'After Occurrences' | 'On Date'
  end_date?: string | null
  max_occurrences?: number | null
  subproject_id?: number
}

export interface RecurringTransactionTemplate {
  id: number
  project_id: number
  description: string
  type: 'Income' | 'Expense'
  amount: number
  category?: string | null
  category_id?: number | null
  notes?: string | null
  supplier_id: number
  payment_method?: string | null
  frequency: 'Monthly'
  day_of_month: number
  start_date: string
  end_type: 'No End' | 'After Occurrences' | 'On Date'
  end_date?: string | null
  max_occurrences?: number | null
  is_active: boolean
  created_at: string
  updated_at: string
  created_by_user_id?: number | null
  created_by_user?: {
    id: number
    email: string
    full_name: string
  } | null
}

export interface RecurringTransactionTemplateUpdate {
  description?: string | null
  amount?: number
  category?: string | null
  category_id?: number | null
  notes?: string | null
  supplier_id?: number | null
  payment_method?: string | null
  day_of_month?: number
  start_date?: string
  end_type?: 'No End' | 'After Occurrences' | 'On Date'
  end_date?: string | null
  max_occurrences?: number | null
  is_active?: boolean
}