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
  contract_duration_months?: number | null
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
  show_in_quotes_tab?: boolean // Show in Price Quotes tab even without quotes (created from that tab)
  is_active: boolean
  manager_id?: number | null
  created_at: string
  total_value: number
  has_fund?: boolean
  monthly_fund_amount?: number | null
  /** First (earliest) contract start date. Used for validation: allow transactions in any contract, block only before the first. */
  first_contract_start_date?: string | null
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
  is_unforeseen?: boolean
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
  contract_duration_months?: number | null
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
  show_in_quotes_tab?: boolean // Show in Price Quotes tab even without quotes
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
  /** Current fund balance (only when project has a fund). Used in alerts. */
  fund_balance?: number | null
  /** Count of transactions in period without proof document. Used in alerts. */
  missing_proof_count?: number
  /** Count of unpaid recurring expenses. Used in alerts. */
  unpaid_recurring_count?: number
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

// Unforeseen Transaction types
export interface UnforeseenTransactionExpense {
  id: number
  unforeseen_transaction_id: number
  amount: number
  description?: string | null
  documents?: Array<{
    id: number
    file_path: string
    description?: string | null
    uploaded_at?: string | null
  }>
  created_at: string
  updated_at: string
}

export interface UnforeseenTransactionIncome {
  id: number
  unforeseen_transaction_id: number
  amount: number
  description?: string | null
  documents?: Array<{
    id: number
    file_path: string
    description?: string | null
    uploaded_at?: string | null
  }>
  created_at: string
  updated_at: string
}

export interface UnforeseenTransactionExpenseCreate {
  amount: number
  description?: string | null
}

export interface UnforeseenTransactionIncomeCreate {
  amount: number
  description?: string | null
}

export interface UnforeseenTransaction {
  id: number
  project_id: number
  contract_period_id?: number | null
  income_amount: number
  total_incomes?: number
  total_expenses: number
  profit_loss: number
  status: 'draft' | 'waiting_for_approval' | 'executed'
  description?: string | null
  notes?: string | null
  transaction_date: string
  expenses: UnforeseenTransactionExpense[]
  incomes?: UnforeseenTransactionIncome[]
  created_by_user_id?: number | null
  created_by_user?: {
    id: number
    email: string
    full_name?: string | null
  } | null
  created_at: string
  updated_at: string
  resulting_transaction_id?: number | null
}

export interface UnforeseenTransactionCreate {
  project_id: number
  contract_period_id?: number | null
  income_amount?: number
  description?: string | null
  notes?: string | null
  transaction_date: string
  expenses: UnforeseenTransactionExpenseCreate[]
  incomes?: UnforeseenTransactionIncomeCreate[]
}

export interface UnforeseenTransactionUpdate {
  contract_period_id?: number | null
  income_amount?: number
  description?: string | null
  notes?: string | null
  transaction_date?: string
  status?: 'draft' | 'waiting_for_approval' | 'executed'
  expenses?: UnforeseenTransactionExpenseCreate[]
  incomes?: UnforeseenTransactionIncomeCreate[]
}

// User notifications (הודעות, הוראות, תזכורות)
export type NotificationType = 'instruction' | 'task_assignment' | 'task_reminder' | 'general' | 'task_message'

export interface Notification {
  id: number
  user_id: number
  from_user_id: number | null
  task_id: number | null
  type: NotificationType
  title: string
  body: string | null
  read_at: string | null
  created_at: string
  from_user_name: string | null
  task_title: string | null
}

export interface NotificationCreate {
  user_ids: number[]
  type?: NotificationType
  title: string
  body?: string | null
}

// --- Building Reception Desk (דלפק הבניין) ---

export interface Tenant {
  id: number
  apartment_id: number
  name: string
  phone: string | null
  email: string | null
  move_in_date: string | null
  move_out_date: string | null
  is_current: boolean
  created_at: string
}

export type KeyHolder = 'in_desk' | 'out'
export type KeyTransferDirection = 'out' | 'return'

export interface KeyTransfer {
  id: number
  key_id: number
  direction: KeyTransferDirection
  counterparty_name: string
  note: string | null
  created_by_user_id: number | null
  created_at: string
}

export interface ApartmentKey {
  id: number
  apartment_id: number
  label: string
  holder: KeyHolder
  holder_name: string | null
  created_at: string
  transfers: KeyTransfer[]
}

export interface AuthorizedVehicle {
  id: number
  apartment_id: number
  plate: string
  model: string | null
  owner_name: string
  parking_spot: string | null
  created_at: string
}

export type DeliveryStatus = 'pending' | 'delivered'

export interface Delivery {
  id: number
  apartment_id: number
  title: string
  kind: string | null
  meta: string | null
  status: DeliveryStatus
  received_at: string | null
  created_at: string
}

export type TechnicianVisitStatus = 'inside' | 'left'

export interface TechnicianVisit {
  id: number
  apartment_id: number
  name: string
  role: string | null
  phone: string | null
  note: string | null
  status: TechnicianVisitStatus
  entered_at: string
  left_at: string | null
  created_at: string
}

export interface TechnicianVisitCreate {
  apartment_id: number
  name: string
  role?: string | null
  phone?: string | null
  note?: string | null
}

export interface TechnicianVisitUpdate {
  name?: string
  role?: string | null
  phone?: string | null
  note?: string | null
  status?: TechnicianVisitStatus
}

export type ClientVisitStatus = 'present' | 'left'

export interface ClientVisit {
  id: number
  apartment_id: number
  name: string | null
  arrived_at: string
  expected_until: string | null
  note: string | null
  status: ClientVisitStatus
  left_at: string | null
  created_at: string
}

export interface ClientVisitCreate {
  apartment_id: number
  name?: string | null
  arrived_at: string
  expected_until?: string | null
  note?: string | null
}

export interface ClientVisitUpdate {
  name?: string | null
  arrived_at?: string
  expected_until?: string | null
  note?: string | null
  status?: ClientVisitStatus
}

export interface ApartmentActivity {
  id: number
  apartment_id: number
  kind: string
  text: string
  created_at: string
}

/** Apartment as it appears inside a building overview (summary counts only). */
export interface Apartment {
  id: number
  building_id: number
  floor: number
  unit_number: string
  label: string | null
  is_common_area: boolean
  owner_name: string | null
  owner_phone: string | null
  management_company_name: string | null
  management_company_phone: string | null
  attorneys: string | null
  equipment: string | null
  notes: string | null
  created_at: string
  current_tenant: Tenant | null
  has_active_client_visit: boolean
  keys_count: number
  keys_in_desk_count: number
  keys_out_count: number
  vehicles_count: number
  pending_deliveries_count: number
  open_tasks_count: number
}

/** Full apartment payload for the detail side panel. */
export interface ApartmentDetail extends Apartment {
  tenants: Tenant[]
  keys: ApartmentKey[]
  vehicles: AuthorizedVehicle[]
  deliveries: Delivery[]
  technician_visits: TechnicianVisit[]
  client_visits: ClientVisit[]
  activities: ApartmentActivity[]
}

/** A document stored in an apartment's personal area (אזור אישי). */
export interface ApartmentDocument {
  id: number
  apartment_id: number
  file_path: string
  filename: string | null
  description: string | null
  uploaded_at: string
}

/** Full personal-area payload, returned only after the admin password verifies. */
export interface PersonalArea {
  apartment_id: number
  private_details: string | null
  private_notes: string | null
  documents: ApartmentDocument[]
}

export interface PersonalAreaUpdate {
  private_details?: string | null
  private_notes?: string | null
}

export interface Building {
  id: number
  name: string
  address: string | null
  compound_name: string | null
  project_id: number | null
  floors_count: number
  units_per_floor: number
  has_common_areas: boolean
  created_at: string
  apartments: Apartment[]
}

/** Building as it appears in the buildings list (no nested apartments). */
export interface BuildingListItem {
  id: number
  name: string
  address: string | null
  compound_name: string | null
  project_id: number | null
  floors_count: number
  units_per_floor: number
  has_common_areas: boolean
  created_at: string
  apartments_count: number
}

export interface BuildingCreate {
  name: string
  address?: string | null
  compound_name?: string | null
  project_id?: number | null
  floors_count: number
  units_per_floor: number
  has_common_areas: boolean
  /** Number of the first residential unit; the rest ascend sequentially. */
  first_unit_number?: number
}

export interface BuildingProject {
  id: number
  name: string
  description: string | null
  created_at: string
  buildings: BuildingListItem[]
}

export interface BuildingProjectListItem {
  id: number
  name: string
  description: string | null
  created_at: string
  buildings_count: number
}

export interface BuildingProjectCreate {
  name: string
  description?: string | null
}

export interface BuildingProjectUpdate {
  name?: string
  description?: string | null
}

export interface BuildingUpdate {
  name?: string
  address?: string | null
  compound_name?: string | null
  project_id?: number | null
  floors_count?: number
  units_per_floor?: number
  has_common_areas?: boolean
}

export interface ApartmentUpdate {
  floor?: number
  unit_number?: string
  label?: string | null
  is_common_area?: boolean
  owner_name?: string | null
  owner_phone?: string | null
  management_company_name?: string | null
  management_company_phone?: string | null
  attorneys?: string | null
  equipment?: string | null
  notes?: string | null
}

export interface ApartmentCreate {
  building_id: number
  floor: number
  unit_number: string
  label?: string | null
  is_common_area?: boolean
  owner_name?: string | null
  owner_phone?: string | null
  management_company_name?: string | null
  management_company_phone?: string | null
  attorneys?: string | null
  equipment?: string | null
  notes?: string | null
}

export interface ApartmentTask {
  id: number
  title: string
  start_time: string | null
  status: string
  assigned_to_user_id: number | null
  assignee_name: string | null
}

export interface TenantCreate {
  name: string
  phone?: string | null
  email?: string | null
  move_in_date?: string | null
  move_out_date?: string | null
}

export interface ApartmentKeyCreate {
  apartment_id: number
  label: string
}

export interface KeyTransferCreate {
  direction: KeyTransferDirection
  counterparty_name: string
  note?: string | null
}

export interface AuthorizedVehicleCreate {
  apartment_id: number
  plate: string
  model?: string | null
  owner_name: string
  parking_spot?: string | null
}

export interface DeliveryCreate {
  apartment_id: number
  title: string
  kind?: string | null
  meta?: string | null
}

export interface TenantUpdate {
  name?: string
  phone?: string | null
  email?: string | null
  move_in_date?: string | null
  move_out_date?: string | null
  is_current?: boolean
}

export interface ApartmentKeyUpdate {
  label?: string
}

export interface AuthorizedVehicleUpdate {
  plate?: string
  model?: string | null
  owner_name?: string
  parking_spot?: string | null
}

export interface DeliveryUpdate {
  title?: string
  kind?: string | null
  meta?: string | null
  status?: DeliveryStatus
}

export interface BuildingReceptionTaskCreate {
  title: string
  assigned_to_user_id: number
  apartment_id?: number | null
  start_time?: string | null
  end_time?: string | null
  description?: string | null
  recurrence_rule?: string
  recurrence_end_date?: string | null
}