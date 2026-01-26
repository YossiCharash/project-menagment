import { Transaction as ApiTransaction } from '../../types/api'

export interface Transaction extends ApiTransaction {
  subproject_id?: number | null
  created_by_user_id?: number | null
  created_by_user?: {
    id: number
    full_name: string
    email: string
  } | null
}

// Helper function to split period transactions by month
export interface SplitTransaction extends Transaction {
  monthKey: string // YYYY-MM format
  proportionalAmount: number
  fullAmount: number
  daysInMonth: number
  totalDays: number
}
