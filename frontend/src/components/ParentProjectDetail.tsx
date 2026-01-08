import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  ArrowLeft, 
  DollarSign,
  RefreshCw,
  Plus,
  Edit
} from 'lucide-react'
import { ProjectWithFinance, Project } from '../types/api'
import { DashboardAPI } from '../lib/apiClient'
import api from '../lib/api'
import ProjectTrendsChart from './charts/ProjectTrendsChart'
import CreateProjectModal from './CreateProjectModal'
import CreateTransactionModal from './CreateTransactionModal'

// Reverse mapping: Hebrew to English (for filtering)
const CATEGORY_REVERSE_MAP: Record<string, string> = {
  'ניקיון': 'CLEANING',
  'חשמל': 'ELECTRICITY',
  'ביטוח': 'INSURANCE',
  'גינון': 'GARDENING',
  'אחר': 'OTHER',
  'תחזוקה': 'MAINTENANCE'
}

// Normalize category for comparison (handles both Hebrew and English)
const normalizeCategoryForFilter = (category: string | null | undefined): string | null => {
  if (!category) return null
  const trimmed = String(category).trim()
  if (trimmed.length === 0) return null
  // If it's already in English (uppercase), return as is
  if (trimmed === trimmed.toUpperCase()) {
    return trimmed
  }
  // If it's in Hebrew, try to convert to English
  if (CATEGORY_REVERSE_MAP[trimmed]) {
    return CATEGORY_REVERSE_MAP[trimmed]
  }
  // Otherwise return as is (might be a custom category)
  return trimmed
}

interface DateRange {
  start: string
  end: string
}

interface FinancialSummary {
  totalIncome: number
  totalExpense: number
  netProfit: number
  profitMargin: number
  subprojectCount: number
  activeSubprojects: number
}

interface SubprojectFinancial {
  id: number
  name: string
  income: number
  expense: number
  profit: number
  profitMargin: number
  status: 'green' | 'yellow' | 'red'
}

interface Transaction {
  id: number
  type: 'Income' | 'Expense'
  amount: number
  description?: string | null
  tx_date: string
  category?: string | null
  notes?: string | null
  subproject_id?: number | null
  is_exceptional?: boolean
  subproject_name?: string
  is_generated?: boolean
}


// Simple Hebrew text constants
const HebrewText = {
  projects: {
    parentProject: 'פרויקט ראשי',
    subprojects: 'תת-פרויקטים',
    projectDetails: 'פרטי הפרויקט',
    projectDescription: 'תיאור הפרויקט',
    projectAddress: 'כתובת הפרויקט'
  },
  financial: {
    totalIncome: 'סה"כ הכנסות',
    totalExpense: 'סה"כ הוצאות',
    netProfit: 'רווח נטו',
    profitMargin: 'אחוז רווחיות',
    income: 'הכנסות',
    expense: 'הוצאות'
  },
  status: {
    active: 'פעיל',
    profitable: 'רווחי',
    balanced: 'מאוזן',
    lossMaking: 'הפסדי'
  },
  time: {
    dateRange: 'בחירת תקופת זמן',
    specificMonth: 'חודש ספציפי',
    specificYear: 'שנה ספציפית',
    customRange: 'טווח תאריכים',
    month: 'חודש',
    year: 'שנה',
    fromDate: 'מתאריך',
    toDate: 'עד תאריך'
  },
  actions: {
    refresh: 'רענן'
  },
  ui: {
    loading: 'טוען...',
    noData: 'לא נמצא'
  },
  property: {
    residents: 'דיירים',
    apartment: 'לדירה'
  },
  months: {
    january: 'ינואר',
    february: 'פברואר',
    march: 'מרץ',
    april: 'אפריל',
    may: 'מאי',
    june: 'יוני',
    july: 'יולי',
    august: 'אוגוסט',
    september: 'ספטמבר',
    october: 'אוקטובר',
    november: 'נובמבר',
    december: 'דצמבר'
  }
}

// Utility functions
const formatCurrency = (amount: number): string => {
  return `${amount.toLocaleString('he-IL')} ₪`
}

const formatPercentage = (value: number): string => {
  return `${value.toFixed(1)}%`
}

const getStatusText = (status: 'green' | 'yellow' | 'red'): string => {
  switch (status) {
    case 'green': return HebrewText.status.profitable
    case 'yellow': return HebrewText.status.balanced
    case 'red': return HebrewText.status.lossMaking
    default: return HebrewText.ui.noData
  }
}

const getStatusColorClass = (status: 'green' | 'yellow' | 'red'): string => {
  switch (status) {
    case 'green': return 'text-green-600 dark:text-green-400'
    case 'yellow': return 'text-yellow-600 dark:text-yellow-400'
    case 'red': return 'text-red-600 dark:text-red-400'
    default: return 'text-gray-600 dark:text-gray-400'
  }
}

const getStatusBgClass = (status: 'green' | 'yellow' | 'red'): string => {
  switch (status) {
    case 'green': return 'bg-green-50 dark:bg-green-900/20'
    case 'yellow': return 'bg-yellow-50 dark:bg-yellow-900/20'
    case 'red': return 'bg-red-50 dark:bg-red-900/20'
    default: return 'bg-gray-50 dark:bg-gray-700'
  }
}



interface ConsolidatedFinancialSummaryProps {
  summary: FinancialSummary
  subprojects: SubprojectFinancial[]
  onAddTransaction?: (subprojectId: number) => void
  onEditSubproject?: (subprojectId: number) => void
  onNavigateSubproject?: (subprojectId: number) => void
  
  // Filter Props
  filterMode: 'month' | 'year' | 'project' | 'custom'
  onFilterModeChange: (mode: 'month' | 'year' | 'project' | 'custom') => void
  selectedMonth: string
  onMonthChange: (month: string) => void
  selectedYear: number
  onYearChange: (year: number) => void
  customStart: string
  onCustomStartChange: (date: string) => void
  customEnd: string
  onCustomEndChange: (date: string) => void
}

const ConsolidatedFinancialSummary: React.FC<ConsolidatedFinancialSummaryProps> = ({ 
  subprojects, 
  onAddTransaction, 
  onEditSubproject, 
  onNavigateSubproject,
  filterMode,
  onFilterModeChange,
  selectedMonth,
  onMonthChange,
  selectedYear,
  onYearChange,
  customStart,
  onCustomStartChange,
  customEnd,
  onCustomEndChange
}) => {
  // Filter out parent project from subprojects (if it's included with "(ראשי)" in the name)
  const actualSubprojects = subprojects.filter(sp => !sp.name.includes('(ראשי)'))
  
  // Calculate totals only from subprojects
  const subprojectsTotalIncome = actualSubprojects.reduce((sum, sp) => sum + sp.income, 0)
  const subprojectsTotalExpense = actualSubprojects.reduce((sum, sp) => sum + sp.expense, 0)
  const subprojectsNetProfit = subprojectsTotalIncome - subprojectsTotalExpense

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white">דאשבורד פיננסי - תתי פרויקטים</h3>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          סה"כ תתי פרויקטים: {actualSubprojects.length}
        </div>
      </div>

      {/* Main Financial Summary - Subprojects Only */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl p-8 border border-blue-200 dark:border-blue-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
          <div>
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">סיכום פיננסי כולל - תתי פרויקטים</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">סיכום כל התתי פרויקטים בלבד</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterMode}
              onChange={(e) => onFilterModeChange(e.target.value as any)}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="month">חודש ספציפי</option>
              <option value="year">שנה ספציפית</option>
              <option value="project">מתחילת הפרויקט</option>
              <option value="custom">טווח תאריכים</option>
            </select>

            {filterMode === 'month' && (
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => onMonthChange(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500"
              />
            )}

            {filterMode === 'year' && (
              <select
                value={selectedYear}
                onChange={(e) => onYearChange(Number(e.target.value))}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500"
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            )}

            {filterMode === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => onCustomStartChange(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                  placeholder="מתאריך"
                />
                <span className="text-gray-500">-</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => onCustomEndChange(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                  placeholder="עד תאריך"
                />
              </div>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                {formatCurrency(subprojectsTotalIncome)}
              </div>
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400">{HebrewText.financial.income}</div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600 dark:text-red-400 mb-2">
                {formatCurrency(subprojectsTotalExpense)}
              </div>
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400">{HebrewText.financial.expense}</div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
            <div className="text-center">
              <div className={`text-3xl font-bold mb-2 ${
                subprojectsNetProfit >= 0 
                  ? 'text-green-600 dark:text-green-400' 
                  : 'text-red-600 dark:text-red-400'
              }`}>
                {subprojectsNetProfit >= 0 ? '+' : ''}{formatCurrency(subprojectsNetProfit)}
              </div>
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400">{HebrewText.financial.netProfit}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Subprojects Financial Breakdown */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <h4 className="text-xl font-semibold text-gray-900 dark:text-white">
            פירוט פיננסי לפי תת-פרויקט
          </h4>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {actualSubprojects.length} תתי פרויקטים
          </div>
        </div>
        
        {actualSubprojects.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            אין תתי פרויקטים להצגה
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {actualSubprojects.map((subproject) => {
              const handleCardClick = (e: React.MouseEvent) => {
                // Don't navigate if clicking on buttons or interactive elements
                const target = e.target as HTMLElement
                if (target.closest('button') || target.closest('a')) {
                  return
                }
                if (onNavigateSubproject) {
                  onNavigateSubproject(subproject.id)
                }
              }

              return (
              <div
                key={subproject.id}
                onClick={handleCardClick}
                className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-700 dark:to-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-5 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between mb-4">
                  <h5 className="font-semibold text-gray-900 dark:text-white text-lg flex-1">
                    {subproject.name}
                  </h5>
                  <div className="flex items-center gap-2">
                    {onAddTransaction && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onAddTransaction(subproject.id)
                        }}
                        className="px-3 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center gap-1.5"
                        title="הוסף עסקה לתת-פרויקט"
                      >
                        <Plus className="w-3 h-3" />
                        הוסף עסקה
                      </button>
                    )}
                    {onEditSubproject && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onEditSubproject(subproject.id)
                        }}
                        className="px-3 py-1.5 text-xs bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors flex items-center gap-1.5"
                        title="ערוך תת-פרויקט"
                      >
                        <Edit className="w-3 h-3" />
                        ערוך
                      </button>
                    )}
                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBgClass(subproject.status)} ${getStatusColorClass(subproject.status)}`}>
                      {getStatusText(subproject.status)}
                    </div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{HebrewText.financial.income}</span>
                    <span className="font-semibold text-green-600 dark:text-green-400">
                      {formatCurrency(subproject.income)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{HebrewText.financial.expense}</span>
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      {formatCurrency(subproject.expense)}
                    </span>
                  </div>
                  
                  <div className="border-t border-gray-200 dark:border-gray-600 pt-3 mt-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{HebrewText.financial.netProfit}</span>
                      <span className={`font-bold text-lg ${
                        subproject.profit >= 0 
                          ? 'text-green-600 dark:text-green-400' 
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {subproject.profit >= 0 ? '+' : ''}{formatCurrency(subproject.profit)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500 dark:text-gray-400">{HebrewText.financial.profitMargin}</span>
                      <span className={`text-sm font-medium ${
                        subproject.profitMargin >= 0 
                          ? 'text-green-600 dark:text-green-400' 
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {subproject.profitMargin >= 0 ? '+' : ''}{formatPercentage(subproject.profitMargin)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}


const ConsolidatedTransactionsTable: React.FC<{
  transactions: Transaction[]
  loading: boolean
  onFilterChange: (filters: {
    type: 'all' | 'Income' | 'Expense'
    month: string
    year: string
    category: string
    exceptional: 'all' | 'only' | 'none'
  }) => void
  filters: {
    type: 'all' | 'Income' | 'Expense'
    month: string
    year: string
    category: string
    exceptional: 'all' | 'only' | 'none'
  }
}> = ({ transactions, loading, onFilterChange, filters }) => {
  const filteredTransactions = transactions.filter(transaction => {
    const txDate = new Date(transaction.tx_date)
    const transactionMonth = (txDate.getMonth() + 1).toString().padStart(2, '0')
    const transactionYear = txDate.getFullYear().toString()
    
    const typeMatch = filters.type === 'all' || transaction.type === filters.type
    const monthMatch = !filters.month || transactionMonth === filters.month
    const yearMatch = !filters.year || transactionYear === filters.year
    
    // Category filter: exact match (consistent with ProjectDetail.tsx)
    // Handle both Hebrew and English categories
    let categoryMatch = true
    if (filters.category) {
      const catName = getCategoryName(transaction.category)
      const txCategory = normalizeCategoryForFilter(catName)
      const filterCategory = normalizeCategoryForFilter(filters.category)
      // Match if normalized categories are equal, or if original categories match
      const normalizedMatch: boolean = txCategory !== null && filterCategory !== null && txCategory === filterCategory
      const directMatch: boolean = !!(catName && String(catName).trim() === String(filters.category).trim())
      categoryMatch = normalizedMatch || directMatch
    }
    
    // Exceptional filter: handle null/undefined explicitly
    const exceptionalMatch = filters.exceptional === 'all' || 
      (filters.exceptional === 'only' && transaction.is_exceptional === true) ||
      (filters.exceptional === 'none' && transaction.is_exceptional !== true)
    
    return typeMatch && monthMatch && yearMatch && categoryMatch && exceptionalMatch
  })

  const totalIncome = filteredTransactions
    .filter(t => t.type === 'Income')
    .reduce((sum, t) => sum + t.amount, 0)
  
  const totalExpense = filteredTransactions
    .filter(t => t.type === 'Expense')
    .reduce((sum, t) => sum + t.amount, 0)

  const categories = Array.from(new Set(transactions.map(t => t.category).filter(Boolean)))

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
          עסקאות מאוחדות ({filteredTransactions.length})
        </h3>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          הכנסות: {formatCurrency(totalIncome)} | הוצאות: {formatCurrency(totalExpense)}
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            סוג עסקה
          </label>
          <select
            value={filters.type}
            onChange={(e) => onFilterChange({ ...filters, type: e.target.value as 'all' | 'Income' | 'Expense' })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="all">הכל</option>
            <option value="Income">הכנסות</option>
            <option value="Expense">הוצאות</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            חודש
          </label>
          <select
            value={filters.month}
            onChange={(e) => onFilterChange({ ...filters, month: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">כל החודשים</option>
            <option value="01">ינואר</option>
            <option value="02">פברואר</option>
            <option value="03">מרץ</option>
            <option value="04">אפריל</option>
            <option value="05">מאי</option>
            <option value="06">יוני</option>
            <option value="07">יולי</option>
            <option value="08">אוגוסט</option>
            <option value="09">ספטמבר</option>
            <option value="10">אוקטובר</option>
            <option value="11">נובמבר</option>
            <option value="12">דצמבר</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            שנה
          </label>
          <select
            value={filters.year}
            onChange={(e) => onFilterChange({ ...filters, year: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">כל השנים</option>
            <option value="2024">2024</option>
            <option value="2023">2023</option>
            <option value="2022">2022</option>
            <option value="2021">2021</option>
            <option value="2020">2020</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            קטגוריה
          </label>
          <select
            value={filters.category}
            onChange={(e) => onFilterChange({ ...filters, category: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">כל הקטגוריות</option>
            {categories.map(category => (
              <option key={category} value={category || ''}>{category}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            עסקאות חריגות
          </label>
          <select
            value={filters.exceptional}
            onChange={(e) => onFilterChange({ ...filters, exceptional: e.target.value as 'all' | 'only' | 'none' })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="all">הכל</option>
            <option value="only">רק חריגות</option>
            <option value="none">ללא חריגות</option>
          </select>
        </div>
      </div>

      {/* Transactions Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          טוען עסקאות...
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          לא נמצאו עסקאות המתאימות לסינון
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                <th className="p-3 font-medium text-gray-700 dark:text-gray-300">תת-פרויקט</th>
                <th className="p-3 font-medium text-gray-700 dark:text-gray-300">סוג</th>
                <th className="p-3 font-medium text-gray-700 dark:text-gray-300">תאריך</th>
                <th className="p-3 font-medium text-gray-700 dark:text-gray-300">סכום</th>
                <th className="p-3 font-medium text-gray-700 dark:text-gray-300">קטגוריה</th>
                <th className="p-3 font-medium text-gray-700 dark:text-gray-300">תיאור</th>
                <th className="p-3 font-medium text-gray-700 dark:text-gray-300">הערות</th>
                <th className="p-3 font-medium text-gray-700 dark:text-gray-300">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map(transaction => (
                <tr key={transaction.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="p-3 text-gray-900 dark:text-white font-medium">
                    {transaction.subproject_name || 'ללא תת-פרויקט'}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      transaction.type === 'Income' 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' 
                        : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                    }`}>
                      {transaction.type === 'Income' ? 'הכנסה' : 'הוצאה'}
                    </span>
                    {transaction.is_generated && (
                      <span className="mr-2 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
                        מחזורי
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-gray-700 dark:text-gray-300">
                    {new Date(transaction.tx_date).toLocaleDateString('he-IL')}
                  </td>
                  <td className={`p-3 font-semibold ${
                    transaction.type === 'Income' 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {formatCurrency(transaction.amount)}
                  </td>
                  <td className="p-3 text-gray-700 dark:text-gray-300">
                    {getCategoryName(transaction.category) || '-'}
                  </td>
                  <td className="p-3 text-gray-700 dark:text-gray-300">
                    {transaction.description || '-'}
                  </td>
                  <td className="p-3 text-gray-700 dark:text-gray-300">
                    {transaction.notes || '-'}
                  </td>
                  <td className="p-3">
                    {transaction.is_exceptional && (
                      <span className="px-2 py-1 bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300 rounded-full text-xs font-medium">
                        חריגה
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      {filteredTransactions.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg text-center">
              <div className="text-red-600 dark:text-red-400 font-semibold mb-1">סה"כ הוצאות</div>
              <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                {formatCurrency(totalExpense)}
              </div>
            </div>
            <div className={`p-4 rounded-lg text-center ${
              totalIncome - totalExpense < 0 
                ? 'bg-red-50 dark:bg-red-900/20' 
                : 'bg-green-50 dark:bg-green-900/20'
            }`}>
              <div className={`font-semibold mb-1 ${
                totalIncome - totalExpense < 0 
                  ? 'text-red-600 dark:text-red-400' 
                  : 'text-green-600 dark:text-green-400'
              }`}>
                רווח נטו
              </div>
              <div className={`text-2xl font-bold ${
                totalIncome - totalExpense < 0 
                  ? 'text-red-700 dark:text-red-300' 
                  : 'text-green-700 dark:text-green-300'
              }`}>
                {formatCurrency(totalIncome - totalExpense)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Helper to safely get category name whether it's a string or an object
const getCategoryName = (category: any): string => {
  if (!category) return '';
  if (typeof category === 'object' && category.name) {
    return category.name;
  }
  return String(category);
}

export default function ParentProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  
  const [parentProject, setParentProject] = useState<ProjectWithFinance | null>(null)
  const [subprojects, setSubprojects] = useState<SubprojectFinancial[]>([])
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [transactionsLoading, setTransactionsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateSubprojectModal, setShowCreateSubprojectModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showEditSubprojectModal, setShowEditSubprojectModal] = useState(false)
  const [editingSubproject, setEditingSubproject] = useState<Project | null>(null)
  const [showAddTransactionModal, setShowAddTransactionModal] = useState(false)
  const [selectedSubprojectForTransaction, setSelectedSubprojectForTransaction] = useState<number | null>(null)
  
  // Transaction filters
  const [transactionFilters, setTransactionFilters] = useState({
    type: 'all' as 'all' | 'Income' | 'Expense',
    month: '',
    year: '',
    category: '',
    exceptional: 'all' as 'all' | 'only' | 'none'
  })
  
  // Date selector state
  const [dateType, setDateType] = useState<'month' | 'year' | 'project' | 'custom'>('month')
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  const [customRange, setCustomRange] = useState<DateRange>({
    start: '',
    end: ''
  })

  useEffect(() => {
    if (id) {
      loadParentProjectData()
    }
  }, [id])

  // Reload data when date filters change
  useEffect(() => {
    if (id && parentProject) {
      loadAdvancedFinancialSummary(parseInt(id))
      loadTransactions()
    }
  }, [dateType, selectedMonth, selectedYear, customRange, id, parentProject])

  const loadParentProjectData = async () => {
    if (!id) return
    
    setLoading(true)
    setError(null)
    
    try {
      // Load parent project info
      const dashboardData = await DashboardAPI.getDashboardSnapshot()
      const parent = dashboardData.projects.find(p => p.id === parseInt(id))
      
      if (!parent) {
        setError('פרויקט לא נמצא')
        return
      }
      
      setParentProject(parent)
      
      // Load all data using the new advanced API
      await loadAdvancedFinancialSummary(parseInt(id))
      
      // Load transactions
      await loadTransactions()
      
    } catch (err: any) {
      // Parent project data loading error
      setError(err.message || 'שגיאה בטעינת נתוני הפרויקט')
    } finally {
      setLoading(false)
    }
  }

  const loadAdvancedFinancialSummary = async (parentId: number) => {
    try {
      // Build date range parameters
      let startDate: string | undefined
      let endDate: string | undefined
      
      if (dateType === 'month') {
        const [year, month] = selectedMonth.split('-').map(Number)
        const targetDate = new Date(year, month - 1, 1)
        const nextMonth = new Date(year, month, 1)
        startDate = targetDate.toISOString().split('T')[0]
        // End date should be last day of the month
        const lastDayOfMonth = new Date(nextMonth.getTime() - 1)
        endDate = lastDayOfMonth.toISOString().split('T')[0]
      } else if (dateType === 'year') {
        startDate = `${selectedYear}-01-01`
        endDate = `${selectedYear}-12-31`
      } else if (dateType === 'custom') {
        startDate = customRange.start
        endDate = customRange.end
      } else if (dateType === 'project') {
        startDate = undefined
        endDate = undefined
      }
      
      // Load advanced financial summary
      const params = new URLSearchParams()
      if (startDate) params.append('start_date', startDate)
      if (endDate) params.append('end_date', endDate)
      
      // Loading financial summary
      
      const { data: financialSummary } = await api.get(`/projects/${parentId}/financial-summary?${params.toString()}`)
      
      // Financial summary loaded
      
      // Update state with advanced data
      if (financialSummary.financial_summary) {
        setFinancialSummary({
          totalIncome: financialSummary.financial_summary.total_income,
          totalExpense: financialSummary.financial_summary.total_expense,
          netProfit: financialSummary.financial_summary.net_profit,
          profitMargin: financialSummary.financial_summary.profit_margin,
          subprojectCount: financialSummary.financial_summary.subproject_count,
          activeSubprojects: financialSummary.financial_summary.active_subprojects
        })
      }
      
      // Update subprojects with advanced data
      if (financialSummary.subproject_financials) {
        const advancedSubprojects: SubprojectFinancial[] = financialSummary.subproject_financials.map((sp: any) => ({
          id: sp.id,
          name: sp.name,
          income: sp.income,
          expense: sp.expense,
          profit: sp.profit,
          profitMargin: sp.profit_margin,
          status: sp.status
        }))
        setSubprojects(advancedSubprojects)
      }
      
    } catch (err: any) {
      // Error loading advanced financial summary, fallback to basic loading
      try {
        await loadSubprojectsData(parentId)
      } catch (fallbackErr) {
        // Fallback loading also failed
      }
    }
  }


  const loadSubprojectsData = async (parentId: number) => {
    try {
      // Get all projects and filter subprojects
      const { data: allProjects } = await api.get('/projects')
      const subprojectList = allProjects.filter((p: any) => p.relation_project === parentId)
      
      const subprojectFinancials: SubprojectFinancial[] = []
      let totalIncome = 0
      let totalExpense = 0
      
      // Calculate financial data for parent project
      try {
        const { data: parentTransactions } = await api.get(`/transactions/project/${parentId}`)
        
        // Ensure we have transactions data
        const transactions = parentTransactions || []
        
        // Filter parent transactions by date range
        const filteredParentTransactions = filterTransactionsByDate(transactions)
        
        const parentIncome = filteredParentTransactions
          .filter((t: any) => t.type === 'Income')
          .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0)
        
        const parentExpense = filteredParentTransactions
          .filter((t: any) => t.type === 'Expense')
          .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0)
        
        const parentProfit = parentIncome - parentExpense
        const parentProfitMargin = parentIncome > 0 ? (parentProfit / parentIncome) * 100 : 0
        
        let parentStatus: 'green' | 'yellow' | 'red' = 'yellow'
        if (parentProfitMargin >= 10) parentStatus = 'green'
        else if (parentProfitMargin <= -10) parentStatus = 'red'
        
        // Add parent project as first item in subprojects list
        subprojectFinancials.push({
          id: parentId,
          name: `${parentProject?.name || 'פרויקט ראשי'} (ראשי)`,
          income: parentIncome,
          expense: parentExpense,
          profit: parentProfit,
          profitMargin: parentProfitMargin,
          status: parentStatus
        })
        
        totalIncome += parentIncome
        totalExpense += parentExpense
        
      } catch (err) {
        // Error loading parent project financial data
      }
      
      // Calculate financial data for each subproject
      for (const subproject of subprojectList) {
        try {
          // Get transactions for the subproject
          const { data: transactions } = await api.get(`/transactions/project/${subproject.id}`)
          
          // Ensure we have transactions data
          const transactionsData = transactions || []
          
          // Filter subproject transactions by date range
          const filteredTransactions = filterTransactionsByDate(transactionsData)
          
          const income = filteredTransactions
            .filter((t: any) => t.type === 'Income')
            .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0)
          
          const expense = filteredTransactions
            .filter((t: any) => t.type === 'Expense')
            .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0)
          
          const profit = income - expense
          const profitMargin = income > 0 ? (profit / income) * 100 : 0
          
          let status: 'green' | 'yellow' | 'red' = 'yellow'
          if (profitMargin >= 10) status = 'green'
          else if (profitMargin <= -10) status = 'red'
          
          subprojectFinancials.push({
            id: subproject.id,
            name: subproject.name,
            income,
            expense,
            profit,
            profitMargin,
            status
          })
          
          totalIncome += income
          totalExpense += expense
          
        } catch (err) {
          // Error loading financial data
        }
      }
      
      setSubprojects(subprojectFinancials)
      
      const netProfit = totalIncome - totalExpense
      const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0
      
      setFinancialSummary({
        totalIncome,
        totalExpense,
        netProfit,
        profitMargin,
        subprojectCount: subprojectList.length + 1, // +1 for parent project
        activeSubprojects: subprojectList.filter((p: any) => p.is_active !== false).length + 1 // +1 for parent project
      })
      
      // Show message if no financial data found
      if (subprojectFinancials.length === 0) {
        // No financial data found
      }
      
    } catch (err: any) {
      // Error loading subprojects financial data
      setError('שגיאה בטעינת נתונים פיננסיים של תת-פרויקטים')
    }
  }

  const loadTransactions = async () => {
    if (!id) return
    
    setTransactionsLoading(true)
    try {
      const allTransactions: Transaction[] = []
      
      // Load parent project transactions
      try {
        const { data: parentTransactions } = await api.get(`/transactions/project/${id}`)
        const parentProjectName = parentProject?.name || 'פרויקט ראשי'
        
        // Ensure we have transactions data
        const transactions = parentTransactions || []
        
        // Filter transactions by date range
        const filteredParentTransactions = filterTransactionsByDate(transactions)
        
        filteredParentTransactions.forEach((transaction: any) => {
          allTransactions.push({
            ...transaction,
            subproject_name: parentProjectName,
            subproject_id: null
          })
        })
      } catch (err) {
        // Error loading parent project transactions
      }
      
      // Load subprojects transactions in parallel (not sequentially)
      try {
        const { data: allProjects } = await api.get('/projects')
        const subprojectList = allProjects.filter((p: any) => p.relation_project === parseInt(id))
        
        // Load all subproject transactions in parallel using Promise.all
        const subprojectTransactionsPromises = subprojectList.map(async (subproject: any) => {
          try {
            const { data: subprojectTransactions } = await api.get(`/transactions/project/${subproject.id}`)
            const transactions = subprojectTransactions || []
            const filteredSubprojectTransactions = filterTransactionsByDate(transactions)
            
            return filteredSubprojectTransactions.map((transaction: any) => ({
              ...transaction,
              subproject_name: subproject.name,
              subproject_id: subproject.id
            }))
          } catch (err) {
            // Error loading transactions for this subproject - return empty array
            return []
          }
        })
        
        // Wait for all subproject transactions to load in parallel
        const subprojectTransactionsResults = await Promise.all(subprojectTransactionsPromises)
        
        // Flatten the results into allTransactions
        subprojectTransactionsResults.forEach((transactions: any[]) => {
          transactions.forEach((transaction: any) => {
            allTransactions.push(transaction)
          })
        })
      } catch (err) {
        // Error loading subprojects
      }
      
      // Sort transactions by date (newest first)
      allTransactions.sort((a, b) => new Date(b.tx_date).getTime() - new Date(a.tx_date).getTime())
      
      setTransactions(allTransactions)
      
      // Show message if no transactions found
      if (allTransactions.length === 0) {
        // No transactions found
      }
    } catch (err: any) {
      // Error loading transactions
      setError('שגיאה בטעינת הטרנזקציות')
    } finally {
      setTransactionsLoading(false)
    }
  }

  const filterTransactionsByDate = (transactions: any[]) => {
    return transactions.filter((transaction: any) => {
      const txDate = new Date(transaction.tx_date)
      
      if (dateType === 'month') {
        const [year, month] = selectedMonth.split('-').map(Number)
        return txDate.getFullYear() === year && (txDate.getMonth() + 1) === month
      } else if (dateType === 'year') {
        return txDate.getFullYear() === selectedYear
      } else if (dateType === 'custom') {
        if (!customRange.start || !customRange.end) return true
        const startDate = new Date(customRange.start)
        const endDate = new Date(customRange.end)
        endDate.setHours(23, 59, 59, 999)
        return txDate >= startDate && txDate <= endDate
      } else if (dateType === 'project') {
        return true
      }
      
      return true
    })
  }

  const handleEditSubproject = async (subprojectId: number) => {
    try {
      // Load subproject data for editing
      const { data } = await api.get(`/projects/${subprojectId}`)
      setEditingSubproject(data)
      setShowEditSubprojectModal(true)
    } catch (err: any) {
      alert(err.response?.data?.detail || 'שגיאה בטעינת נתוני תת-פרויקט')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">{HebrewText.ui.loading} {HebrewText.projects.parentProject}...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded">
          {error}
        </div>
        <button
          onClick={() => navigate('/projects')}
          className="bg-gray-900 text-white px-4 py-2 rounded"
        >
          חזור לפרויקטים
        </button>
      </div>
    )
  }

  if (!parentProject) {
    return (
      <div className="space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded">
          {HebrewText.projects.parentProject} {HebrewText.ui.noData}
        </div>
        <button
          onClick={() => navigate('/projects')}
          className="bg-gray-900 text-white px-4 py-2 rounded"
        >
          חזור לפרויקטים
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/projects')}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {parentProject.name}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {HebrewText.projects.parentProject} - {HebrewText.projects.subprojects}
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setShowCreateSubprojectModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-colors shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>צור תת-פרויקט</span>
          </button>
          <button
            onClick={() => setShowEditModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors shadow-md"
          >
            <Edit className="w-4 h-4" />
            <span>ערוך פרויקט</span>
          </button>
          <button
            onClick={loadParentProjectData}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {HebrewText.actions.refresh}
          </button>
        </div>
      </motion.div>


      {/* Date Selector removed - moved to Financial Summary */}

      {/* Subprojects Financial Dashboard */}
      {subprojects.length > 0 ? (
        <ConsolidatedFinancialSummary
          summary={financialSummary || {
            totalIncome: 0,
            totalExpense: 0,
            netProfit: 0,
            profitMargin: 0,
            subprojectCount: subprojects.length,
            activeSubprojects: subprojects.length
          }}
          subprojects={subprojects}
          onAddTransaction={(subprojectId) => {
            setSelectedSubprojectForTransaction(subprojectId)
            setShowAddTransactionModal(true)
          }}
          onEditSubproject={handleEditSubproject}
          onNavigateSubproject={(subprojectId) => {
            navigate(`/projects/${subprojectId}`)
          }}
          filterMode={dateType}
          onFilterModeChange={setDateType}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          selectedYear={selectedYear}
          onYearChange={setSelectedYear}
          customStart={customRange.start}
          onCustomStartChange={(val) => setCustomRange(prev => ({ ...prev, start: val }))}
          customEnd={customRange.end}
          onCustomEndChange={(val) => setCustomRange(prev => ({ ...prev, end: val }))}
        />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              אין תת-פרויקטים
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              לפרויקט זה אין תת-פרויקטים קשורים
            </p>
            <button
              onClick={() => navigate('/projects')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
            >
              צפה בכל הפרויקטים
            </button>
          </div>
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 gap-8">

        {/* Project Trends Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {transactionsLoading ? (
            <div className="h-96 bg-gray-100 dark:bg-gray-700 rounded-2xl animate-pulse flex items-center justify-center">
              <div className="text-gray-500 dark:text-gray-400">טוען נתוני גרפים...</div>
            </div>
          ) : (
            <ProjectTrendsChart
              projectId={parseInt(id || '0')}
              projectName={parentProject?.name || 'פרויקט ראשי'}
              transactions={transactions}
            />
          )}
        </motion.div>
      </div>

      {/* Consolidated Transactions Table */}
      <ConsolidatedTransactionsTable
        transactions={transactions}
        loading={transactionsLoading}
        onFilterChange={setTransactionFilters}
        filters={transactionFilters}
      />

      {/* Create Subproject Modal */}
      <CreateProjectModal
        isOpen={showCreateSubprojectModal}
        onClose={() => setShowCreateSubprojectModal(false)}
        onSuccess={() => {
          setShowCreateSubprojectModal(false)
          loadParentProjectData()
        }}
        parentProjectId={id ? parseInt(id) : undefined}
      />

      {/* Edit Parent Project Modal */}
      {parentProject && (
        <CreateProjectModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false)
            loadParentProjectData()
          }}
          editingProject={parentProject}
        />
      )}

      {/* Edit Subproject Modal */}
      {editingSubproject && (
        <CreateProjectModal
          isOpen={showEditSubprojectModal}
          onClose={() => {
            setShowEditSubprojectModal(false)
            setEditingSubproject(null)
          }}
          onSuccess={() => {
            setShowEditSubprojectModal(false)
            setEditingSubproject(null)
            loadParentProjectData()
          }}
          editingProject={editingSubproject}
          parentProjectId={id ? parseInt(id) : undefined}
        />
      )}

      {/* Add Transaction Modal */}
      <CreateTransactionModal
        isOpen={showAddTransactionModal}
        onClose={() => {
          setShowAddTransactionModal(false)
          setSelectedSubprojectForTransaction(null)
        }}
        onSuccess={() => {
          setShowAddTransactionModal(false)
          setSelectedSubprojectForTransaction(null)
          loadParentProjectData()
          loadTransactions()
          loadAdvancedFinancialSummary(parseInt(id || '0'))
        }}
        projectId={selectedSubprojectForTransaction || 0}
        isSubproject={true}
        projectName={subprojects.find(sp => sp.id === selectedSubprojectForTransaction)?.name}
      />
    </div>
  )
}
