import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import { fetchMe } from '../store/slices/authSlice'
import { DashboardAPI, ProjectAPI } from '../lib/apiClient'
import { DashboardSnapshot } from '../types/api'
import { LoadingDashboard } from './ui/Loading'
import { useNavigate } from 'react-router-dom'
import { 
  AlertTriangle,
  Plus,
  RefreshCw,
  X,
  ExternalLink
} from 'lucide-react'
import SystemFinancialPieChart from './charts/SystemFinancialPieChart'
import { ProjectWithFinance } from '../types/api'

// Removed all project-related components - simplified dashboard only shows central pie chart

interface AlertsStripProps {
  alerts: DashboardSnapshot['alerts']
  projects: ProjectWithFinance[]
}

const AlertsStrip: React.FC<AlertsStripProps> = ({ alerts, projects }) => {
  const [isExpanded, setIsExpanded] = React.useState(false)
  const [dismissedProjects, setDismissedProjects] = React.useState<Set<number>>(() => {
    // Load dismissed projects from localStorage
    const stored = localStorage.getItem('dismissed_alert_projects')
    return stored ? new Set(JSON.parse(stored)) : new Set()
  })

  // Helper to flatten projects with children
  const getAllProjectsFlat = (projects: ProjectWithFinance[]): ProjectWithFinance[] => {
    const result: ProjectWithFinance[] = []
    const flatten = (projs: ProjectWithFinance[]) => {
      projs.forEach(project => {
        result.push(project)
        if (project.children && project.children.length > 0) {
          flatten(project.children)
        }
      })
    }
    flatten(projects)
    return result
  }

  const allProjectsFlat = getAllProjectsFlat(projects)

  // Filter out dismissed projects
  const budgetOverrunProjects = allProjectsFlat.filter(p => {
    const isInOverrun = alerts.budget_overrun.includes(p.id)
    const isDismissed = dismissedProjects.has(p.id)
    return isInOverrun && !isDismissed
  })
  const budgetWarningProjects = allProjectsFlat.filter(p => {
    const isInWarning = (alerts.budget_warning || []).includes(p.id)
    const isDismissed = dismissedProjects.has(p.id)
    return isInWarning && !isDismissed
  })
  const missingProofProjects = allProjectsFlat.filter(p => 
    alerts.missing_proof.includes(p.id) && !dismissedProjects.has(p.id)
  )
  const unpaidRecurringProjects = allProjectsFlat.filter(p => 
    alerts.unpaid_recurring.includes(p.id) && !dismissedProjects.has(p.id)
  )
  const negativeFundBalanceProjects = allProjectsFlat.filter(p => 
    (alerts.negative_fund_balance || []).includes(p.id) && !dismissedProjects.has(p.id)
  )
  const categoryBudgetAlerts = (alerts.category_budget_alerts || []).filter(alert => 
    !dismissedProjects.has(alert.project_id)
  )

  // Filter unprofitable projects (red status, negative profit)
  const unprofitableProjects = allProjectsFlat.filter(p => 
    p.status_color === 'red' && p.profit_percent < 0 && !dismissedProjects.has(p.id)
  )

  // Group category budget alerts by project
  const categoryAlertsByProject = categoryBudgetAlerts.reduce((acc, alert) => {
    if (!acc[alert.project_id]) {
      acc[alert.project_id] = []
    }
    acc[alert.project_id].push(alert)
    return acc
  }, {} as Record<number, typeof categoryBudgetAlerts>)

  const totalAlerts = budgetOverrunProjects.length + 
                     budgetWarningProjects.length +
                     missingProofProjects.length + 
                     unpaidRecurringProjects.length + 
                     negativeFundBalanceProjects.length +
                     categoryBudgetAlerts.length +
                     unprofitableProjects.length

  const handleDismissProject = (projectId: number) => {
    const newDismissed = new Set(dismissedProjects)
    newDismissed.add(projectId)
    setDismissedProjects(newDismissed)
    localStorage.setItem('dismissed_alert_projects', JSON.stringify(Array.from(newDismissed)))
  }

  const handleClearDismissed = () => {
    if (window.confirm('האם אתה בטוח שברצונך להציג מחדש את כל ההתראות שהוסתרו?')) {
      setDismissedProjects(new Set())
      localStorage.removeItem('dismissed_alert_projects')
    }
  }

  // Check if there are dismissed projects that should show alerts
  const allBudgetOverrunIds = alerts.budget_overrun || []
  const allBudgetWarningIds = alerts.budget_warning || []
  const allMissingProofIds = alerts.missing_proof || []
  const allUnpaidRecurringIds = alerts.unpaid_recurring || []
  const allNegativeFundBalanceIds = alerts.negative_fund_balance || []
  const allCategoryBudgetAlertIds = (alerts.category_budget_alerts || []).map(a => a.project_id)
  const allUnprofitableIds = allProjectsFlat.filter(p => p.status_color === 'red' && p.profit_percent < 0).map(p => p.id)
  
  const totalDismissed = new Set([
    ...allBudgetOverrunIds.filter(id => dismissedProjects.has(id)),
    ...allBudgetWarningIds.filter(id => dismissedProjects.has(id)),
    ...allMissingProofIds.filter(id => dismissedProjects.has(id)),
    ...allUnpaidRecurringIds.filter(id => dismissedProjects.has(id)),
    ...allNegativeFundBalanceIds.filter(id => dismissedProjects.has(id)),
    ...allCategoryBudgetAlertIds.filter(id => dismissedProjects.has(id)),
    ...allUnprofitableIds.filter(id => dismissedProjects.has(id))
  ]).size

  if (totalAlerts === 0 && totalDismissed === 0) {
    return null
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚠️</span>
          <span className="font-semibold text-base text-gray-900 dark:text-white">
            התראות ({totalAlerts})
          </span>
          {totalDismissed > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              ({totalDismissed} הוסתרו)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {totalDismissed > 0 && (
            <button
              onClick={handleClearDismissed}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-2 py-1 rounded text-xs transition-colors"
              title="הצג מחדש התראות שהוסתרו"
            >
              🔄 הצג מחדש
            </button>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded text-sm transition-colors"
          >
            {isExpanded ? '▼ סגור' : '▶ פתח'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 space-y-3 border-t border-gray-200 dark:border-gray-700 pt-3">
          {/* Section 1: Project-Level Alerts */}
          {(budgetOverrunProjects.length > 0 || budgetWarningProjects.length > 0 || missingProofProjects.length > 0 || unpaidRecurringProjects.length > 0 || negativeFundBalanceProjects.length > 0) && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded p-3">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🏢</span>
                <span className="font-semibold text-sm text-blue-900 dark:text-blue-100">התראות ברמת פרויקט</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* General Budget Overrun */}
                {budgetOverrunProjects.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-blue-200 dark:border-blue-800 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">💰</span>
                      <span className="font-medium text-xs text-blue-900 dark:text-blue-200">חריגת תקציב כללי</span>
                    </div>
                    <div className="space-y-2">
                      {budgetOverrunProjects.map(project => (
                        <div key={project.id} className="bg-blue-50 dark:bg-blue-900/30 rounded p-2 border border-blue-200 dark:border-blue-800 relative group">
                          <div className="flex items-center justify-between mb-1">
                            <div className="font-medium text-sm text-blue-900 dark:text-blue-100">{project.name}</div>
                            <button
                              onClick={() => handleDismissProject(project.id)}
                              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 text-xs px-1.5 py-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="החריג פרויקט"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="text-xs text-blue-700 dark:text-blue-300 space-y-0.5">
                            <div>הוצא: <span className="font-semibold">{project.expense_month_to_date.toFixed(0)} ₪</span></div>
                            <div>תקציב: <span className="font-semibold">{((project.budget_annual || 0) > 0 ? (project.budget_annual || 0) : ((project.budget_monthly || 0) * 12)).toFixed(0)} ₪</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Budget Warning - Approaching Budget */}
                {budgetWarningProjects.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-yellow-200 dark:border-yellow-800 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">⚠️</span>
                      <span className="font-medium text-xs text-yellow-900 dark:text-yellow-200">מתקרב לתקציב</span>
                    </div>
                    <div className="space-y-2">
                      {budgetWarningProjects.map(project => {
                        const yearlyBudget = (project.budget_annual || 0) > 0 ? (project.budget_annual || 0) : ((project.budget_monthly || 0) * 12)
                        const budgetPercent = yearlyBudget > 0 ? (project.expense_month_to_date / yearlyBudget) * 100 : 0
                        return (
                          <div key={project.id} className="bg-yellow-50 dark:bg-yellow-900/30 rounded p-2 border border-yellow-200 dark:border-yellow-800 relative group">
                            <div className="flex items-center justify-between mb-1">
                              <div className="font-medium text-sm text-yellow-900 dark:text-yellow-100">{project.name}</div>
                              <button
                                onClick={() => handleDismissProject(project.id)}
                                className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200 text-xs px-1.5 py-0.5 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/50 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="החריג פרויקט"
                              >
                                ✕
                              </button>
                            </div>
                            <div className="text-xs text-yellow-700 dark:text-yellow-300 space-y-0.5">
                              <div>הוצא: <span className="font-semibold">{project.expense_month_to_date.toFixed(0)} ₪</span></div>
                              <div>תקציב: <span className="font-semibold">{yearlyBudget.toFixed(0)} ₪</span></div>
                              <div className="font-semibold text-yellow-800 dark:text-yellow-200 mt-1">
                                {budgetPercent.toFixed(1)}% מהתקציב
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Missing Proof */}
                {missingProofProjects.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-blue-200 dark:border-blue-800 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">📄</span>
                      <span className="font-medium text-xs text-blue-900 dark:text-blue-200">חסרים אישורים</span>
                    </div>
                    <div className="space-y-2">
                      {missingProofProjects.map(project => (
                        <div key={project.id} className="bg-blue-50 dark:bg-blue-900/30 rounded p-2 border border-blue-200 dark:border-blue-800 relative group">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm text-blue-900 dark:text-blue-100">{project.name}</span>
                            <button
                              onClick={() => handleDismissProject(project.id)}
                              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 text-xs px-1.5 py-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="החריג פרויקט"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Unpaid Recurring */}
                {unpaidRecurringProjects.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-blue-200 dark:border-blue-800 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">🔄</span>
                      <span className="font-medium text-xs text-blue-900 dark:text-blue-200">הוצאות חוזרות לא שולמו</span>
                    </div>
                    <div className="space-y-2">
                      {unpaidRecurringProjects.map(project => (
                        <div key={project.id} className="bg-blue-50 dark:bg-blue-900/30 rounded p-2 border border-blue-200 dark:border-blue-800 relative group">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm text-blue-900 dark:text-blue-100">{project.name}</span>
                            <button
                              onClick={() => handleDismissProject(project.id)}
                              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 text-xs px-1.5 py-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="החריג פרויקט"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Negative Fund Balance */}
                {negativeFundBalanceProjects.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-red-200 dark:border-red-800 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">💰</span>
                      <span className="font-medium text-xs text-red-900 dark:text-red-200">יתרה שלילית בקופה</span>
                    </div>
                    <div className="space-y-2">
                      {negativeFundBalanceProjects.map(project => (
                        <div key={project.id} className="bg-red-50 dark:bg-red-900/30 rounded p-2 border border-red-200 dark:border-red-800 relative group">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm text-red-900 dark:text-red-100">{project.name}</span>
                            <button
                              onClick={() => handleDismissProject(project.id)}
                              className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 text-xs px-1.5 py-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/50 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="החריג פרויקט"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section 2: Unprofitable Projects - PURPLE/PINK */}
          {unprofitableProjects.length > 0 && (
            <div className="bg-purple-50 dark:bg-purple-900/20 border-l-4 border-purple-500 rounded p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">📉</span>
                <span className="font-semibold text-sm text-purple-900 dark:text-purple-100">פרויקטים לא רווחיים</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {unprofitableProjects.map(project => (
                  <div key={project.id} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-purple-200 dark:border-purple-800 shadow-sm relative group">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-sm text-purple-900 dark:text-purple-100">{project.name}</div>
                      <button
                        onClick={() => handleDismissProject(project.id)}
                        className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200 text-xs px-1.5 py-0.5 rounded hover:bg-purple-100 dark:hover:bg-purple-900/50 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="החריג פרויקט"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="bg-purple-50 dark:bg-purple-900/30 rounded p-2 border border-purple-200 dark:border-purple-800">
                      <div className="text-xs text-purple-700 dark:text-purple-300 mb-1">
                        רווח: <span className="font-semibold">{project.profit_percent.toFixed(1)}%</span>
                      </div>
                      <div className="text-xs text-purple-700 dark:text-purple-300">
                        הכנסות: {project.income_month_to_date.toFixed(0)} ₪
                      </div>
                      <div className="text-xs text-purple-700 dark:text-purple-300">
                        הוצאות: {project.expense_month_to_date.toFixed(0)} ₪
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 3: Category Budget Alerts - Different styles for over budget vs spending too fast */}
          {categoryBudgetAlerts.length > 0 && (
            <div className="space-y-2">
              {/* Over Budget Alerts - RED */}
              {categoryBudgetAlerts.filter(a => a.is_over_budget).length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🚨</span>
                    <span className="font-semibold text-sm text-red-900 dark:text-red-100">חריגה מעל התקציב</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(categoryAlertsByProject).map(([projectId, projectAlerts]) => {
                      const overBudgetAlerts = projectAlerts.filter(a => a.is_over_budget)
                      if (overBudgetAlerts.length === 0) return null
                      const project = allProjectsFlat.find(p => p.id === parseInt(projectId))
                      return overBudgetAlerts.map((alert, idx) => (
                        <div key={`${projectId}-${idx}`} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-red-200 dark:border-red-800 shadow-sm relative group">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-xs text-red-900 dark:text-red-100">📁 {project?.name || `פרויקט ${projectId}`}</span>
                            <button
                              onClick={() => handleDismissProject(parseInt(projectId))}
                              className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 text-xs px-1.5 py-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/50 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="החריג פרויקט"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="bg-red-50 dark:bg-red-900/30 rounded p-2 border border-red-200 dark:border-red-800">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <span className="font-medium text-xs text-red-900 dark:text-red-100 block mb-1">{alert.category}</span>
                                <div className="text-xs text-red-700 dark:text-red-300">
                                  {alert.spent_amount.toFixed(0)} ₪ / {alert.amount.toFixed(0)} ₪
                                </div>
                                <div className="text-xs font-semibold text-red-800 dark:text-red-200 mt-0.5">
                                  {alert.spent_percentage.toFixed(1)}%
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    })}
                  </div>
                </div>
              )}

              {/* Spending Too Fast Alerts - ORANGE */}
              {categoryBudgetAlerts.filter(a => a.is_spending_too_fast && !a.is_over_budget).length > 0 && (
                <div className="bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500 rounded p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">⚠️</span>
                    <span className="font-semibold text-sm text-orange-900 dark:text-orange-100">הוצאה מהירה מהצפוי</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(categoryAlertsByProject).map(([projectId, projectAlerts]) => {
                      const fastSpendingAlerts = projectAlerts.filter(a => a.is_spending_too_fast && !a.is_over_budget)
                      if (fastSpendingAlerts.length === 0) return null
                      const project = allProjectsFlat.find(p => p.id === parseInt(projectId))
                      return fastSpendingAlerts.map((alert, idx) => (
                        <div key={`${projectId}-${idx}`} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-orange-200 dark:border-orange-800 shadow-sm relative group">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-xs text-orange-900 dark:text-orange-100">📁 {project?.name || `פרויקט ${projectId}`}</span>
                            <button
                              onClick={() => handleDismissProject(parseInt(projectId))}
                              className="text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-200 text-xs px-1.5 py-0.5 rounded hover:bg-orange-100 dark:hover:bg-orange-900/50 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="החריג פרויקט"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="bg-orange-50 dark:bg-orange-900/30 rounded p-2 border border-orange-200 dark:border-orange-800">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <span className="font-medium text-xs text-orange-900 dark:text-orange-100 block mb-1">{alert.category}</span>
                                <div className="text-xs text-orange-700 dark:text-orange-300">
                                  הוצא: {alert.spent_percentage.toFixed(1)}% | צפוי: {alert.expected_spent_percentage.toFixed(1)}%
                                </div>
                                <div className="text-xs font-semibold text-orange-800 dark:text-orange-200 mt-0.5">
                                  {alert.spent_amount.toFixed(0)} ₪
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface ModernDashboardProps {
  onProjectClick?: (project: any) => void
  onProjectEdit?: (project: any) => void
}

export default function ModernDashboard({ onProjectClick, onProjectEdit }: ModernDashboardProps) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const me = useAppSelector(s => s.auth.me)
  const [dashboardData, setDashboardData] = useState<DashboardSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Date filter state
  const [dateFilterMode, setDateFilterMode] = useState<'current_month' | 'selected_month' | 'date_range' | 'all_time'>('current_month')
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [profitabilityAlerts, setProfitabilityAlerts] = useState<Array<{
    id: number
    name: string
    profit_margin: number
    income: number
    expense: number
    profit: number
    is_subproject: boolean
    parent_project_id: number | null
  }>>([])
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<number>>(new Set())
  const [selectedAlerts, setSelectedAlerts] = useState<Set<number>>(new Set())
  const [showRestoreDialog, setShowRestoreDialog] = useState(false)
  const [alertsLoading, setAlertsLoading] = useState(false)

  useEffect(() => {
    // Do not block on user; load dashboard in parallel for speed
    if (!me) dispatch(fetchMe())
  }, [dispatch, me])

  useEffect(() => {
    loadDashboardData()
    loadProfitabilityAlerts()
    // Load dismissed alerts from localStorage
    const dismissed = localStorage.getItem('dismissedProfitabilityAlerts')
    if (dismissed) {
      try {
        setDismissedAlerts(new Set(JSON.parse(dismissed)))
      } catch (e) {
        // Ignore parsing errors
      }
    }
  }, [])

  // Auto-refresh alerts every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (!loading) {
        loadProfitabilityAlerts()
      }
    }, 30000) // 30 seconds

    return () => clearInterval(interval)
  }, [loading])

  const loadProfitabilityAlerts = async () => {
    setAlertsLoading(true)
    try {
      const data = await ProjectAPI.getProfitabilityAlerts()
      setProfitabilityAlerts(data.alerts || [])
    } catch (err: any) {
      setProfitabilityAlerts([])
    } finally {
      setAlertsLoading(false)
    }
  }

  const dismissAlert = (alertId: number) => {
    if (window.confirm('האם אתה בטוח שברצונך להסתיר את ההתראה הזו?\n\nההתראה תחזור אוטומטית אם הפרויקט ימשיך להיות בעייתי בבדיקה הבאה.')) {
      const newDismissed = new Set(dismissedAlerts)
      newDismissed.add(alertId)
      setDismissedAlerts(newDismissed)
      // Save to localStorage
      localStorage.setItem('dismissedProfitabilityAlerts', JSON.stringify(Array.from(newDismissed)))
    }
  }

  const toggleAlertSelection = (alertId: number) => {
    const newSelected = new Set(selectedAlerts)
    if (newSelected.has(alertId)) {
      newSelected.delete(alertId)
    } else {
      newSelected.add(alertId)
    }
    setSelectedAlerts(newSelected)
  }

  const dismissSelectedAlerts = () => {
    if (selectedAlerts.size === 0) return
    
    const alertNames = profitabilityAlerts
      .filter(a => selectedAlerts.has(a.id))
      .map(a => a.name)
      .join(', ')
    
    if (window.confirm(`האם אתה בטוח שברצונך להסתיר את ההתראות הבאות?\n\n${alertNames}\n\nההתראות יחזרו אוטומטית אם הפרויקטים ימשיכו להיות בעייתיים בבדיקה הבאה.`)) {
      const newDismissed = new Set(dismissedAlerts)
      selectedAlerts.forEach(id => newDismissed.add(id))
      setDismissedAlerts(newDismissed)
      setSelectedAlerts(new Set())
      // Save to localStorage
      localStorage.setItem('dismissedProfitabilityAlerts', JSON.stringify(Array.from(newDismissed)))
    }
  }

  const restoreDismissedAlerts = () => {
    if (window.confirm('האם אתה בטוח שברצונך להציג מחדש את כל ההתראות שהוסתרו?')) {
      setDismissedAlerts(new Set())
      localStorage.removeItem('dismissedProfitabilityAlerts')
      setShowRestoreDialog(false)
    }
  }

  const handleAlertClick = (alert: typeof profitabilityAlerts[0]) => {
    if (alert.is_subproject && alert.parent_project_id) {
      // Navigate to parent project detail page
      navigate(`/projects/${alert.parent_project_id}/parent`)
    } else {
      // Navigate to project detail page
      navigate(`/projects/${alert.id}`)
    }
  }

  const loadDashboardData = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await DashboardAPI.getDashboardSnapshot()
      setDashboardData(data)
    } catch (err: any) {
      setError(err.message || 'שגיאה בטעינת הנתונים')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <LoadingDashboard count={1} />

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-8 text-center"
      >
        <AlertTriangle className="w-12 h-12 text-red-600 dark:text-red-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-2">שגיאה בטעינת הנתונים</h3>
        <p className="text-red-700 dark:text-red-400 mb-4">{error}</p>
        <button 
          onClick={loadDashboardData}
          className="px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors flex items-center gap-2 mx-auto"
        >
          <RefreshCw className="w-4 h-4" />
          נסה שוב
        </button>
      </motion.div>
    )
  }

  if (!dashboardData) {
    return (
      <div className="space-y-6">
        <div className="text-center text-gray-500 dark:text-gray-400">אין נתוני דשבורד להצגה</div>
      </div>
    )
  }

  // Filter out dismissed alerts
  const visibleAlerts = profitabilityAlerts.filter(alert => !dismissedAlerts.has(alert.id))

  // Helper to flatten projects with children
  const getAllProjectsFlat = (projects: ProjectWithFinance[]): ProjectWithFinance[] => {
    const result: ProjectWithFinance[] = []
    const flatten = (projs: ProjectWithFinance[]) => {
      projs.forEach(project => {
        result.push(project)
        if (project.children) {
          flatten(project.children)
        }
      })
    }
    flatten(projects)
    return result
  }

  const allProjectsFlat = dashboardData ? getAllProjectsFlat(dashboardData.projects) : []

  return (
    <div className="space-y-8">
      {/* Budget and Project Alerts */}
      {dashboardData && (
        <AlertsStrip alerts={dashboardData.alerts} projects={allProjectsFlat} />
      )}

      {/* Date Filter Options for Dashboard */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            סינון לפי תאריך
          </label>
          <div className="flex flex-wrap gap-3 sm:gap-4">
            <label className="flex items-center gap-2 whitespace-nowrap">
              <input
                type="radio"
                name="dashboardDateFilter"
                value="current_month"
                checked={dateFilterMode === 'current_month'}
                onChange={() => setDateFilterMode('current_month')}
                className="w-4 h-4 text-blue-600 flex-shrink-0"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">חודש נוכחי</span>
            </label>
            <label className="flex items-center gap-2 whitespace-nowrap">
              <input
                type="radio"
                name="dashboardDateFilter"
                value="selected_month"
                checked={dateFilterMode === 'selected_month'}
                onChange={() => setDateFilterMode('selected_month')}
                className="w-4 h-4 text-blue-600 flex-shrink-0"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">חודש מסוים</span>
            </label>
            <label className="flex items-center gap-2 whitespace-nowrap">
              <input
                type="radio"
                name="dashboardDateFilter"
                value="all_time"
                checked={dateFilterMode === 'all_time'}
                onChange={() => setDateFilterMode('all_time')}
                className="w-4 h-4 text-blue-600 flex-shrink-0"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">כל הזמן</span>
            </label>
            <label className="flex items-center gap-2 whitespace-nowrap">
              <input
                type="radio"
                name="dashboardDateFilter"
                value="date_range"
                checked={dateFilterMode === 'date_range'}
                onChange={() => setDateFilterMode('date_range')}
                className="w-4 h-4 text-blue-600 flex-shrink-0"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">טווח תאריכים</span>
            </label>
          </div>
        </div>

        {dateFilterMode === 'selected_month' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              בחר חודש
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {dateFilterMode === 'date_range' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                מתאריך
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                עד תאריך
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
      </motion.div>

      {/* Central Financial Overview Pie Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="flex justify-center"
      >
        <SystemFinancialPieChart
          totalIncome={dashboardData.summary.total_income}
          totalExpense={dashboardData.summary.total_expense}
          expenseCategories={dashboardData.expense_categories}
        />
      </motion.div>

      {/* Restore Dialog */}
      {showRestoreDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowRestoreDialog(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
          >
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              הצג מחדש התראות מוסתרות
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              יש לך {dismissedAlerts.size} התראות מוסתרות. האם אתה בטוח שברצונך להציג אותן מחדש?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowRestoreDialog(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={restoreDismissedAlerts}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                הצג מחדש
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
