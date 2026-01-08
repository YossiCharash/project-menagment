import React, { useState, useEffect } from 'react'
import { ProjectWithFinance, DashboardSnapshot } from '../types/api'
import { DashboardAPI } from '../lib/apiClient'

interface ProjectCardProps {
  project: ProjectWithFinance
  onProjectClick?: (project: ProjectWithFinance) => void
  onProjectEdit?: (project: ProjectWithFinance) => void
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, onProjectClick, onProjectEdit }) => {
  const getStatusColor = (status: 'green' | 'yellow' | 'red') => {
    switch (status) {
      case 'green': return 'bg-green-100 text-green-800 border-green-200'
      case 'yellow': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'red': return 'bg-red-100 text-red-800 border-red-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusText = (status: 'green' | 'yellow' | 'red') => {
    switch (status) {
      case 'green': return 'רווחי'
      case 'yellow': return 'מאוזן'
      case 'red': return 'הפסדי'
      default: return 'לא ידוע'
    }
  }

  const getImageUrl = (imageUrl: string | null | undefined): string | null => {
    if (!imageUrl) return null
    // If backend already returned full URL (S3 / CloudFront), use as-is
    if (imageUrl.startsWith('http')) {
      return imageUrl
    }
    const apiUrl = import.meta.env.VITE_API_URL || ''
    // @ts-ignore
    const baseUrl = apiUrl ? apiUrl.replace('/api/v1', '') : ''
    return `${baseUrl}/uploads/${imageUrl}`
  }

  const imageUrl = getImageUrl(project.image_url)

  return (
    <div 
      className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow cursor-pointer"
      onClick={() => onProjectClick?.(project)}
    >
      {imageUrl && (
        <div className="mb-3 rounded-lg overflow-hidden">
          <img
            src={imageUrl}
            alt={project.name}
            className="w-full h-40 object-cover"
            onError={(e) => {
              // Image failed to load
              e.currentTarget.style.display = 'none'
            }}
          />
        </div>
      )}
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-lg font-semibold text-gray-900 truncate">{project.name}</h3>
        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(project.status_color)}`}>
          {getStatusText(project.status_color)}
        </span>
      </div>

      <div className="space-y-2 text-sm text-gray-600">
        {project.address && (
          <div className="flex items-center gap-2">
            <span className="text-gray-400">📍</span>
            <span>{project.address}, {project.city}</span>
          </div>
        )}
        
        {/* Removed num_residents and monthly_price_per_apartment display */}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-200">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-500 text-xs">הכנסות השנה</div>
            <div className="font-semibold text-green-600">
              {project.income_month_to_date.toFixed(0)} ₪
            </div>
          </div>
          <div>
            <div className="text-gray-500 text-xs">הוצאות השנה</div>
            <div className="font-semibold text-red-600">
              {project.expense_month_to_date.toFixed(0)} ₪
            </div>
          </div>
        </div>

        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-xs">רווח/הפסד</span>
            <span className={`font-bold ${project.profit_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {project.profit_percent >= 0 ? '+' : ''}{project.profit_percent.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {onProjectEdit && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onProjectEdit(project)
              onProjectEdit(project)
            }}
            className="w-full px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            ערוך פרויקט
          </button>
        </div>
      )}
    </div>
  )
}

interface AlertsStripProps {
  alerts: DashboardSnapshot['alerts']
  projects: ProjectWithFinance[]
}

const AlertsStrip: React.FC<AlertsStripProps> = ({ alerts, projects }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [dismissedProjects, setDismissedProjects] = useState<Set<number>>(() => {
    // Load dismissed projects from localStorage
    const stored = localStorage.getItem('dismissed_alert_projects')
    return stored ? new Set(JSON.parse(stored)) : new Set()
  })

  // Filter out dismissed projects
  const budgetOverrunProjects = projects.filter(p => 
    alerts.budget_overrun.includes(p.id) && !dismissedProjects.has(p.id)
  )
  const budgetWarningProjects = projects.filter(p => 
    (alerts.budget_warning || []).includes(p.id) && !dismissedProjects.has(p.id)
  )
  const missingProofProjects = projects.filter(p => 
    alerts.missing_proof.includes(p.id) && !dismissedProjects.has(p.id)
  )
  const unpaidRecurringProjects = projects.filter(p => 
    alerts.unpaid_recurring.includes(p.id) && !dismissedProjects.has(p.id)
  )
  const negativeFundBalanceProjects = projects.filter(p => 
    (alerts.negative_fund_balance || []).includes(p.id) && !dismissedProjects.has(p.id)
  )
  const categoryBudgetAlerts = (alerts.category_budget_alerts || []).filter(alert => 
    !dismissedProjects.has(alert.project_id)
  )

  // Filter unprofitable projects (red status, negative profit)
  const unprofitableProjects = projects.filter(p => 
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

  if (totalAlerts === 0) return null

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚠️</span>
          <span className="font-semibold text-base text-gray-900 dark:text-white">
            התראות ({totalAlerts})
          </span>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded text-sm transition-colors"
        >
          {isExpanded ? '▼ סגור' : '▶ פתח'}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-3 space-y-3 border-t border-gray-200 dark:border-gray-700 pt-3">
          {/* Section 1: Project-Level Alerts */}
          {(budgetOverrunProjects.length > 0 || budgetWarningProjects.length > 0 || missingProofProjects.length > 0 || unpaidRecurringProjects.length > 0 || negativeFundBalanceProjects.length > 0) && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🏢</span>
                <span className="font-semibold text-sm text-blue-900 dark:text-blue-100">התראות ברמת פרויקט</span>
              </div>
              <div className="space-y-2">
                {/* General Budget Overrun */}
                {budgetOverrunProjects.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded p-2 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">💰</span>
                      <span className="font-medium text-xs text-blue-900 dark:text-blue-200">חריגת תקציב כללי:</span>
                    </div>
                    <div className="space-y-1.5">
                      {budgetOverrunProjects.map(project => (
                        <div key={project.id} className="bg-blue-50 dark:bg-blue-900/30 rounded p-2 flex items-center justify-between group">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-blue-900 dark:text-blue-100 truncate">{project.name}</div>
                            <div className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                              הוצא: {project.expense_month_to_date.toFixed(0)} ₪ | תקציב: {((project.budget_annual || 0) > 0 ? (project.budget_annual || 0) : ((project.budget_monthly || 0) * 12)).toFixed(0)} ₪
                            </div>
                          </div>
                          <button
                            onClick={() => handleDismissProject(project.id)}
                            className="ml-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
                            title="החריג פרויקט"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Budget Warning - Approaching Budget */}
                {budgetWarningProjects.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded p-2 border border-yellow-200 dark:border-yellow-800">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">⚠️</span>
                      <span className="font-medium text-xs text-yellow-900 dark:text-yellow-200">מתקרב לתקציב:</span>
                    </div>
                    <div className="space-y-1.5">
                      {budgetWarningProjects.map(project => {
                        const yearlyBudget = (project.budget_annual || 0) > 0 ? (project.budget_annual || 0) : ((project.budget_monthly || 0) * 12)
                        const budgetPercent = yearlyBudget > 0 ? (project.expense_month_to_date / yearlyBudget) * 100 : 0
                        return (
                          <div key={project.id} className="bg-yellow-50 dark:bg-yellow-900/30 rounded p-2 flex items-center justify-between group">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-yellow-900 dark:text-yellow-100 truncate">{project.name}</div>
                              <div className="text-xs text-yellow-700 dark:text-yellow-300 mt-0.5">
                                הוצא: {project.expense_month_to_date.toFixed(0)} ₪ | תקציב: {yearlyBudget.toFixed(0)} ₪ ({budgetPercent.toFixed(1)}%)
                              </div>
                            </div>
                            <button
                              onClick={() => handleDismissProject(project.id)}
                              className="ml-2 text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
                              title="החריג פרויקט"
                            >
                              ✕
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Missing Proof */}
                {missingProofProjects.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded p-2 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">📄</span>
                      <span className="font-medium text-xs text-blue-900 dark:text-blue-200">חסרים אישורים:</span>
                    </div>
                    <div className="space-y-1.5">
                      {missingProofProjects.map(project => (
                        <div key={project.id} className="bg-blue-50 dark:bg-blue-900/30 rounded p-2 flex items-center justify-between group">
                          <span className="font-medium text-sm text-blue-900 dark:text-blue-100">{project.name}</span>
                          <button
                            onClick={() => handleDismissProject(project.id)}
                            className="ml-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
                            title="החריג פרויקט"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Unpaid Recurring */}
                {unpaidRecurringProjects.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded p-2 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">🔄</span>
                      <span className="font-medium text-xs text-blue-900 dark:text-blue-200">הוצאות חוזרות לא שולמו:</span>
                    </div>
                    <div className="space-y-1.5">
                      {unpaidRecurringProjects.map(project => (
                        <div key={project.id} className="bg-blue-50 dark:bg-blue-900/30 rounded p-2 flex items-center justify-between group">
                          <span className="font-medium text-sm text-blue-900 dark:text-blue-100">{project.name}</span>
                          <button
                            onClick={() => handleDismissProject(project.id)}
                            className="ml-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
                            title="החריג פרויקט"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Negative Fund Balance */}
                {negativeFundBalanceProjects.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded p-2 border border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">💰</span>
                      <span className="font-medium text-xs text-red-900 dark:text-red-200">יתרה שלילית בקופה:</span>
                    </div>
                    <div className="space-y-1.5">
                      {negativeFundBalanceProjects.map(project => (
                        <div key={project.id} className="bg-red-50 dark:bg-red-900/30 rounded p-2 flex items-center justify-between group">
                          <span className="font-medium text-sm text-red-900 dark:text-red-100">{project.name}</span>
                          <button
                            onClick={() => handleDismissProject(project.id)}
                            className="ml-2 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 rounded hover:bg-red-100 dark:hover:bg-red-900/50"
                            title="החריג פרויקט"
                          >
                            ✕
                          </button>
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
              <div className="space-y-1.5">
                {unprofitableProjects.map(project => (
                  <div key={project.id} className="bg-white dark:bg-gray-800 rounded p-2 border border-purple-200 dark:border-purple-800 flex items-center justify-between group">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-purple-900 dark:text-purple-100 truncate">{project.name}</div>
                      <div className="text-xs text-purple-700 dark:text-purple-300 mt-0.5">
                        רווח: {project.profit_percent.toFixed(1)}% ({project.income_month_to_date.toFixed(0)} ₪ - {project.expense_month_to_date.toFixed(0)} ₪)
                      </div>
                    </div>
                    <button
                      onClick={() => handleDismissProject(project.id)}
                      className="ml-2 text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 rounded hover:bg-purple-100 dark:hover:bg-purple-900/50"
                      title="החריג פרויקט"
                    >
                      ✕
                    </button>
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
                  <div className="space-y-1.5">
                    {Object.entries(categoryAlertsByProject).map(([projectId, projectAlerts]) => {
                      const overBudgetAlerts = projectAlerts.filter(a => a.is_over_budget)
                      if (overBudgetAlerts.length === 0) return null
                      const project = projects.find(p => p.id === parseInt(projectId))
                      return (
                        <div key={projectId} className="bg-white dark:bg-gray-800 rounded p-2 border border-red-200 dark:border-red-800">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-medium text-xs text-red-900 dark:text-red-100">📁 {project?.name || `פרויקט ${projectId}`}</span>
                            <button
                              onClick={() => handleDismissProject(parseInt(projectId))}
                              className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 text-xs px-2 py-1 rounded hover:bg-red-100 dark:hover:bg-red-900/50"
                              title="החריג פרויקט"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="space-y-1">
                            {overBudgetAlerts.map((alert, idx) => (
                              <div key={idx} className="bg-red-50 dark:bg-red-900/30 rounded p-1.5 border border-red-200 dark:border-red-800">
                                <div className="flex items-center justify-between">
                                  <div className="flex-1 min-w-0">
                                    <span className="font-medium text-xs text-red-900 dark:text-red-100">{alert.category}</span>
                                    <div className="text-xs text-red-700 dark:text-red-300 mt-0.5">
                                      {alert.spent_amount.toFixed(0)} ₪ / {alert.amount.toFixed(0)} ₪ ({alert.spent_percentage.toFixed(1)}%)
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
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
                  <div className="space-y-1.5">
                    {Object.entries(categoryAlertsByProject).map(([projectId, projectAlerts]) => {
                      const fastSpendingAlerts = projectAlerts.filter(a => a.is_spending_too_fast && !a.is_over_budget)
                      if (fastSpendingAlerts.length === 0) return null
                      const project = projects.find(p => p.id === parseInt(projectId))
                      return (
                        <div key={projectId} className="bg-white dark:bg-gray-800 rounded p-2 border border-orange-200 dark:border-orange-800">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-medium text-xs text-orange-900 dark:text-orange-100">📁 {project?.name || `פרויקט ${projectId}`}</span>
                            <button
                              onClick={() => handleDismissProject(parseInt(projectId))}
                              className="text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-200 text-xs px-2 py-1 rounded hover:bg-orange-100 dark:hover:bg-orange-900/50"
                              title="החריג פרויקט"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="space-y-1">
                            {fastSpendingAlerts.map((alert, idx) => (
                              <div key={idx} className="bg-orange-50 dark:bg-orange-900/30 rounded p-1.5 border border-orange-200 dark:border-orange-800">
                                <div className="flex items-center justify-between">
                                  <div className="flex-1 min-w-0">
                                    <span className="font-medium text-xs text-orange-900 dark:text-orange-100">{alert.category}</span>
                                    <div className="text-xs text-orange-700 dark:text-orange-300 mt-0.5">
                                      הוצא: {alert.spent_percentage.toFixed(1)}% | צפוי: {alert.expected_spent_percentage.toFixed(1)}% ({alert.spent_amount.toFixed(0)} ₪)
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
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

interface SummaryChartProps {
  summary: DashboardSnapshot['summary']
}

const SummaryChart: React.FC<SummaryChartProps> = ({ summary }) => {
  const maxValue = Math.max(summary.total_income, summary.total_expense)
  const incomePercent = maxValue > 0 ? (summary.total_income / maxValue) * 100 : 0
  const expensePercent = maxValue > 0 ? (summary.total_expense / maxValue) * 100 : 0

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">סיכום כללי</h3>
      
      <div className="space-y-4">
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">הכנסות</span>
            <span className="text-sm font-semibold text-green-600">
              {summary.total_income.toFixed(0)} ₪
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${incomePercent}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">הוצאות</span>
            <span className="text-sm font-semibold text-red-600">
              {summary.total_expense.toFixed(0)} ₪
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-red-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${expensePercent}%` }}
            />
          </div>
        </div>

        <div className="pt-4 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <span className="text-lg font-semibold text-gray-900">רווח/הפסד נטו</span>
            <span className={`text-lg font-bold ${summary.total_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {summary.total_profit >= 0 ? '+' : ''}{summary.total_profit.toFixed(0)} ₪
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

interface EnhancedDashboardProps {
  onProjectClick?: (project: ProjectWithFinance) => void
  onProjectEdit?: (project: ProjectWithFinance) => void
  onCreateProject?: () => void
}

const EnhancedDashboard: React.FC<EnhancedDashboardProps> = ({
  onProjectClick,
  onProjectEdit,
  onCreateProject
}) => {
  const [dashboardData, setDashboardData] = useState<DashboardSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterCity, setFilterCity] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterParent, setFilterParent] = useState<string>('')
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await DashboardAPI.getDashboardSnapshot()
      setDashboardData(data)
      setLastRefresh(new Date())
    } catch (err: any) {
      // Dashboard data loading error
      setError(err.message || 'שגיאה בטעינת הנתונים')
      // Set empty state on error to prevent UI crashes
      setDashboardData({
        projects: [],
        alerts: { budget_overrun: [], missing_proof: [], unpaid_recurring: [] },
        summary: { total_income: 0, total_expense: 0, total_profit: 0 }
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    loadDashboardData()
  }

  const getFilteredProjects = (): ProjectWithFinance[] => {
    if (!dashboardData) return []

    let filtered = dashboardData.projects

    if (filterCity) {
      filtered = filtered.filter(p => p.city?.toLowerCase().includes(filterCity.toLowerCase()))
    }

    if (filterStatus) {
      filtered = filtered.filter(p => p.status_color === filterStatus)
    }

    if (filterParent) {
      if (filterParent === 'root') {
        filtered = filtered.filter(p => !p.relation_project)
      } else if (filterParent === 'child') {
        filtered = filtered.filter(p => p.relation_project)
      }
    }

    return filtered
  }

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">טוען נתונים...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="text-red-600">שגיאה: {error}</div>
        <button 
          onClick={loadDashboardData}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          נסה שוב
        </button>
      </div>
    )
  }

  if (!dashboardData) return null

  const filteredProjects = getFilteredProjects()
  const allProjectsFlat = getAllProjectsFlat(dashboardData.projects)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">לוח בקרה מתקדם</h1>
          {lastRefresh && (
            <p className="text-sm text-gray-500 mt-1">
              עודכן לאחרונה: {lastRefresh.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <span className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}>⟳</span>
            <span>רענן</span>
          </button>
          {onCreateProject && (
            <button
              onClick={onCreateProject}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              צור פרויקט חדש
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סינון לפי עיר</label>
            <input
              type="text"
              value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}
              placeholder="הקלד שם עיר..."
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סינון לפי סטטוס</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">כל הסטטוסים</option>
              <option value="green">רווחי</option>
              <option value="yellow">מאוזן</option>
              <option value="red">הפסדי</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סינון לפי היררכיה</label>
            <select
              value={filterParent}
              onChange={(e) => setFilterParent(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">כל הפרויקטים</option>
              <option value="root">פרויקטים ראשיים בלבד</option>
              <option value="child">תת-פרויקטים בלבד</option>
            </select>
          </div>
        </div>
      </div>

      {/* Alerts */}
      <AlertsStrip alerts={dashboardData.alerts} projects={allProjectsFlat} />

      {/* Summary Chart */}
      <SummaryChart summary={dashboardData.summary} />

      {/* Project Cards */}
      <div>
        <h2 className="text-xl font-semibold mb-4">
          פרויקטים ({filteredProjects.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onProjectClick={onProjectClick}
              onProjectEdit={onProjectEdit}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default EnhancedDashboard
