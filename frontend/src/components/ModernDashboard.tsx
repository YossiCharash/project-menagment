import React, { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import { fetchMe } from '../store/slices/authSlice'
import { DashboardAPI } from '../lib/apiClient'
import { DashboardSnapshot } from '../types/api'
import { LoadingDashboard } from './ui/Loading'
import { useNavigate } from 'react-router-dom'
import { 
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Wallet,
  Percent,
  BarChart3,
  Pin,
  ChevronDown
} from 'lucide-react'
import SystemFinancialPieChart from './charts/SystemFinancialPieChart'
import { ProjectWithFinance } from '../types/api'

// Removed all project-related components - simplified dashboard only shows central pie chart

interface AlertsStripProps {
  alerts: DashboardSnapshot['alerts']
  projects: ProjectWithFinance[]
  onProjectClick?: (project: ProjectWithFinance) => void
  /** Navigate to project and scroll to fund or transactions section */
  onGoToFix?: (project: ProjectWithFinance, focus: 'fund' | 'transactions') => void
}

const PINNED_ALERTS_KEY = 'pinned_dashboard_alerts'

const AlertsStrip: React.FC<AlertsStripProps> = ({ alerts, projects, onProjectClick, onGoToFix }) => {
  const [isExpanded, setIsExpanded] = React.useState(false)
  const [dismissedProjects, setDismissedProjects] = React.useState<Set<number>>(() => {
    const stored = localStorage.getItem('dismissed_alert_projects')
    return stored ? new Set(JSON.parse(stored)) : new Set()
  })
  const [pinnedAlerts, setPinnedAlerts] = React.useState<Set<string>>(() => {
    const stored = localStorage.getItem(PINNED_ALERTS_KEY)
    return stored ? new Set(JSON.parse(stored)) : new Set()
  })

  const getPinKey = (projectId: number, alertType: string, extra?: string) =>
    extra ? `${alertType}_${projectId}_${extra}` : `${alertType}_${projectId}`
  const isPinned = (key: string) => pinnedAlerts.has(key)
  const togglePin = (e: React.MouseEvent, key: string) => {
    e.stopPropagation()
    const next = new Set(pinnedAlerts)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setPinnedAlerts(next)
    localStorage.setItem(PINNED_ALERTS_KEY, JSON.stringify(Array.from(next)))
  }
  const sortPinnedFirst = <T,>(list: T[], getKey: (item: T) => string): T[] =>
    [...list].sort((a, b) => (isPinned(getKey(b)) ? 1 : 0) - (isPinned(getKey(a)) ? 1 : 0))

  const allProjectsFlat = useMemo(() => {
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
  }, [projects])

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
  const allNegativeFundBalanceIds = alerts.negative_fund_balance || []
  const allCategoryBudgetAlertIds = (alerts.category_budget_alerts || []).map(a => a.project_id)
  const allUnprofitableIds = allProjectsFlat.filter(p => p.status_color === 'red' && p.profit_percent < 0).map(p => p.id)
  
  const totalDismissed = new Set([
    ...allBudgetOverrunIds.filter(id => dismissedProjects.has(id)),
    ...allBudgetWarningIds.filter(id => dismissedProjects.has(id)),
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
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <span className="font-semibold text-base text-gray-900 dark:text-white">
              התראות ({totalAlerts})
            </span>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            הצמד התראה ספציפית עם סיכה – ההתראות המצורפות יופיעו בראש כל קטגוריה
          </span>
        </div>
          {totalDismissed > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              ({totalDismissed} הוסתרו)
            </span>
          )}
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
          {(budgetOverrunProjects.length > 0 || budgetWarningProjects.length > 0 || negativeFundBalanceProjects.length > 0) && (
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
                      {sortPinnedFirst(budgetOverrunProjects, p => getPinKey(p.id, 'budget_overrun')).map(project => {
                        const yearlyBudget = (project.budget_annual || 0) > 0 ? (project.budget_annual || 0) : ((project.budget_monthly || 0) * 12)
                        const pinKey = getPinKey(project.id, 'budget_overrun')
                        return (
                          <div
                            key={project.id}
                            role={onProjectClick ? 'button' : undefined}
                            onClick={onProjectClick ? () => onProjectClick(project) : undefined}
                            className={`bg-blue-50 dark:bg-blue-900/30 rounded p-2 border border-blue-200 dark:border-blue-800 relative group ${onProjectClick ? 'cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/50' : ''} ${isPinned(pinKey) ? 'ring-1 ring-amber-400 dark:ring-amber-500' : ''}`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="font-medium text-sm text-blue-900 dark:text-blue-100">{project.name}</div>
                              <div className="flex items-center gap-0.5 flex-shrink-0">
                                <button onClick={(e) => togglePin(e, pinKey)} className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${isPinned(pinKey) ? 'opacity-100 text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400 hover:text-amber-600'}`} title={isPinned(pinKey) ? 'הסר הצמדה' : 'הצמד התראה'}><Pin className={`w-3.5 h-3.5 ${isPinned(pinKey) ? 'fill-current' : ''}`} /></button>
                                <button onClick={(e) => { e.stopPropagation(); handleDismissProject(project.id) }} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 text-xs px-1.5 py-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 opacity-0 group-hover:opacity-100 transition-opacity" title="החריג פרויקט">✕</button>
                              </div>
                            </div>
                            <div className="text-xs text-blue-700 dark:text-blue-300 space-y-0.5">
                              <div>הוצא: <span className="font-semibold">{project.expense_month_to_date.toLocaleString('he-IL')} ₪</span></div>
                              <div>תקציב: <span className="font-semibold">{yearlyBudget.toLocaleString('he-IL')} ₪</span></div>
                              {onProjectClick && <div className="text-blue-600 dark:text-blue-400 mt-1">לפרטים ←</div>}
                            </div>
                          </div>
                        )
                      })}
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
                      {sortPinnedFirst(budgetWarningProjects, p => getPinKey(p.id, 'budget_warning')).map(project => {
                        const yearlyBudget = (project.budget_annual || 0) > 0 ? (project.budget_annual || 0) : ((project.budget_monthly || 0) * 12)
                        const budgetPercent = yearlyBudget > 0 ? (project.expense_month_to_date / yearlyBudget) * 100 : 0
                        const pinKey = getPinKey(project.id, 'budget_warning')
                        return (
                          <div
                            key={project.id}
                            role={onProjectClick ? 'button' : undefined}
                            onClick={onProjectClick ? () => onProjectClick(project) : undefined}
                            className={`bg-yellow-50 dark:bg-yellow-900/30 rounded p-2 border border-yellow-200 dark:border-yellow-800 relative group ${onProjectClick ? 'cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/50' : ''} ${isPinned(pinKey) ? 'ring-1 ring-amber-400 dark:ring-amber-500' : ''}`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="font-medium text-sm text-yellow-900 dark:text-yellow-100">{project.name}</div>
                              <div className="flex items-center gap-0.5 flex-shrink-0">
                                <button onClick={(e) => togglePin(e, pinKey)} className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${isPinned(pinKey) ? 'opacity-100 text-amber-600 dark:text-amber-400' : 'text-yellow-600 dark:text-yellow-400 hover:text-amber-600'}`} title={isPinned(pinKey) ? 'הסר הצמדה' : 'הצמד התראה'}><Pin className={`w-3.5 h-3.5 ${isPinned(pinKey) ? 'fill-current' : ''}`} /></button>
                                <button onClick={(e) => { e.stopPropagation(); handleDismissProject(project.id) }} className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200 text-xs px-1.5 py-0.5 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/50 opacity-0 group-hover:opacity-100 transition-opacity" title="החריג פרויקט">✕</button>
                              </div>
                            </div>
                            <div className="text-xs text-yellow-700 dark:text-yellow-300 space-y-0.5">
                              <div>הוצא: <span className="font-semibold">{project.expense_month_to_date.toLocaleString('he-IL')} ₪</span></div>
                              <div>תקציב: <span className="font-semibold">{yearlyBudget.toLocaleString('he-IL')} ₪</span></div>
                              <div className="font-semibold text-yellow-800 dark:text-yellow-200 mt-1">{budgetPercent.toFixed(1)}% מהתקציב</div>
                              {onProjectClick && <div className="text-yellow-600 dark:text-yellow-400 mt-1">לפרטים ←</div>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Negative Fund Balance – עם סכום יתרה וקישור לפרויקט */}
                {negativeFundBalanceProjects.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-red-200 dark:border-red-800 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">💰</span>
                      <span className="font-medium text-xs text-red-900 dark:text-red-200">יתרה שלילית בקופה</span>
                    </div>
                    <p className="text-xs text-red-700 dark:text-red-300 mb-2">יתרת הקופה שלילית – יש להפקיד או לעדכן תנועות</p>
                    <div className="space-y-2">
                      {sortPinnedFirst(negativeFundBalanceProjects, p => getPinKey(p.id, 'negative_fund')).map(project => {
                        const pinKey = getPinKey(project.id, 'negative_fund')
                        return (
                          <div
                            key={project.id}
                            role={onProjectClick ? 'button' : undefined}
                            onClick={onProjectClick ? () => onProjectClick(project) : undefined}
                            className={`bg-red-50 dark:bg-red-900/30 rounded p-2 border border-red-200 dark:border-red-800 relative group ${onProjectClick ? 'cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/50' : ''} ${isPinned(pinKey) ? 'ring-1 ring-amber-400 dark:ring-amber-500' : ''}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-sm text-red-900 dark:text-red-100">{project.name}</div>
                                <div className="text-xs text-red-700 dark:text-red-300 mt-0.5 font-semibold">
                                  יתרה: {(project.fund_balance ?? 0).toLocaleString('he-IL')} ₪
                                </div>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button onClick={(e) => togglePin(e, pinKey)} className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${isPinned(pinKey) ? 'opacity-100 text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400 hover:text-amber-600'}`} title={isPinned(pinKey) ? 'הסר הצמדה' : 'הצמד התראה'}><Pin className={`w-3.5 h-3.5 ${isPinned(pinKey) ? 'fill-current' : ''}`} /></button>
                                {onProjectClick && <span className="text-xs text-red-600 dark:text-red-400">לפרטים ←</span>}
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDismissProject(project.id) }}
                                  className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 text-xs px-1.5 py-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/50 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="החריג פרויקט"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
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
              <p className="text-xs text-purple-700 dark:text-purple-300 mb-3">הכנסות נמוכות מהוצאות – כדאי לבדוק תמחור או הוצאות</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {sortPinnedFirst(unprofitableProjects, p => getPinKey(p.id, 'unprofitable')).map(project => {
                  const pinKey = getPinKey(project.id, 'unprofitable')
                  return (
                  <div
                    key={project.id}
                    role={onProjectClick ? 'button' : undefined}
                    onClick={onProjectClick ? () => onProjectClick(project) : undefined}
                    className={`bg-white dark:bg-gray-800 rounded-lg p-3 border border-purple-200 dark:border-purple-800 shadow-sm relative group ${onProjectClick ? 'cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/30' : ''} ${isPinned(pinKey) ? 'ring-1 ring-amber-400 dark:ring-amber-500' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-sm text-purple-900 dark:text-purple-100">{project.name}</div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button onClick={(e) => togglePin(e, pinKey)} className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${isPinned(pinKey) ? 'opacity-100 text-amber-600 dark:text-amber-400' : 'text-purple-600 dark:text-purple-400 hover:text-amber-600'}`} title={isPinned(pinKey) ? 'הסר הצמדה' : 'הצמד התראה'}><Pin className={`w-3.5 h-3.5 ${isPinned(pinKey) ? 'fill-current' : ''}`} /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleDismissProject(project.id) }} className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200 text-xs px-1.5 py-0.5 rounded hover:bg-purple-100 dark:hover:bg-purple-900/50 opacity-0 group-hover:opacity-100 transition-opacity" title="החריג פרויקט">✕</button>
                      </div>
                    </div>
                    <div className="bg-purple-50 dark:bg-purple-900/30 rounded p-2 border border-purple-200 dark:border-purple-800">
                      <div className="text-xs text-purple-700 dark:text-purple-300 mb-1">
                        רווח: <span className="font-semibold">{project.profit_percent.toFixed(1)}%</span>
                      </div>
                      <div className="text-xs text-purple-700 dark:text-purple-300">
                        הכנסות: {project.income_month_to_date.toLocaleString('he-IL')} ₪
                      </div>
                      <div className="text-xs text-purple-700 dark:text-purple-300">
                        הוצאות: {project.expense_month_to_date.toLocaleString('he-IL')} ₪
                      </div>
                      {onProjectClick && <div className="text-purple-600 dark:text-purple-400 text-xs mt-1">לפרטים ←</div>}
                    </div>
                  </div>
                  )
                })}
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
                      return overBudgetAlerts.map((alert, idx) => {
                        const pinKey = getPinKey(alert.project_id, 'category', String(alert.budget_id))
                        return (
                        <div
                          key={`${projectId}-${idx}`}
                          role={onProjectClick && project ? 'button' : undefined}
                          onClick={onProjectClick && project ? () => onProjectClick(project) : undefined}
                          className={`bg-white dark:bg-gray-800 rounded-lg p-3 border border-red-200 dark:border-red-800 shadow-sm relative group ${onProjectClick && project ? 'cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/20' : ''} ${isPinned(pinKey) ? 'ring-1 ring-amber-400 dark:ring-amber-500' : ''}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-xs text-red-900 dark:text-red-100">📁 {project?.name || `פרויקט ${projectId}`}</span>
                            <div className="flex items-center gap-0.5 flex-shrink-0">
                              <button onClick={(e) => togglePin(e, pinKey)} className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${isPinned(pinKey) ? 'opacity-100 text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400 hover:text-amber-600'}`} title={isPinned(pinKey) ? 'הסר הצמדה' : 'הצמד התראה'}><Pin className={`w-3.5 h-3.5 ${isPinned(pinKey) ? 'fill-current' : ''}`} /></button>
                              <button onClick={(e) => { e.stopPropagation(); handleDismissProject(parseInt(projectId)) }} className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 text-xs px-1.5 py-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/50 opacity-0 group-hover:opacity-100 transition-opacity" title="החריג פרויקט">✕</button>
                            </div>
                          </div>
                          <div className="bg-red-50 dark:bg-red-900/30 rounded p-2 border border-red-200 dark:border-red-800">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <span className="font-medium text-xs text-red-900 dark:text-red-100 block mb-1">{alert.category}</span>
                                <div className="text-xs text-red-700 dark:text-red-300">
                                  {alert.spent_amount.toLocaleString('he-IL')} ₪ / {alert.amount.toLocaleString('he-IL')} ₪
                                </div>
                                <div className="text-xs font-semibold text-red-800 dark:text-red-200 mt-0.5">{alert.spent_percentage.toFixed(1)}%</div>
                                {onProjectClick && project && <div className="text-red-600 dark:text-red-400 text-xs mt-1">לפרטים ←</div>}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                      })
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
                      return fastSpendingAlerts.map((alert, idx) => {
                        const pinKey = getPinKey(alert.project_id, 'category', String(alert.budget_id))
                        return (
                        <div
                          key={`${projectId}-${idx}`}
                          role={onProjectClick && project ? 'button' : undefined}
                          onClick={onProjectClick && project ? () => onProjectClick(project) : undefined}
                          className={`bg-white dark:bg-gray-800 rounded-lg p-3 border border-orange-200 dark:border-orange-800 shadow-sm relative group ${onProjectClick && project ? 'cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-900/20' : ''} ${isPinned(pinKey) ? 'ring-1 ring-amber-400 dark:ring-amber-500' : ''}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-xs text-orange-900 dark:text-orange-100">📁 {project?.name || `פרויקט ${projectId}`}</span>
                            <div className="flex items-center gap-0.5 flex-shrink-0">
                              <button onClick={(e) => togglePin(e, pinKey)} className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${isPinned(pinKey) ? 'opacity-100 text-amber-600 dark:text-amber-400' : 'text-orange-600 dark:text-orange-400 hover:text-amber-600'}`} title={isPinned(pinKey) ? 'הסר הצמדה' : 'הצמד התראה'}><Pin className={`w-3.5 h-3.5 ${isPinned(pinKey) ? 'fill-current' : ''}`} /></button>
                              <button onClick={(e) => { e.stopPropagation(); handleDismissProject(parseInt(projectId)) }} className="text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-200 text-xs px-1.5 py-0.5 rounded hover:bg-orange-100 dark:hover:bg-orange-900/50 opacity-0 group-hover:opacity-100 transition-opacity" title="החריג פרויקט">✕</button>
                            </div>
                          </div>
                          <div className="bg-orange-50 dark:bg-orange-900/30 rounded p-2 border border-orange-200 dark:border-orange-800">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <span className="font-medium text-xs text-orange-900 dark:text-orange-100 block mb-1">{alert.category}</span>
                                <div className="text-xs text-orange-700 dark:text-orange-300">
                                  הוצא: {alert.spent_percentage.toFixed(1)}% | צפוי: {alert.expected_spent_percentage.toFixed(1)}%
                                </div>
                                <div className="text-xs font-semibold text-orange-800 dark:text-orange-200 mt-0.5">{alert.spent_amount.toLocaleString('he-IL')} ₪</div>
                                {onProjectClick && project && <div className="text-orange-600 dark:text-orange-400 text-xs mt-1">לפרטים ←</div>}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                      })
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
  const [projectsByStatusOpen, setProjectsByStatusOpen] = useState(false)

  useEffect(() => {
    // Do not block on user; load dashboard in parallel for speed
    if (!me) dispatch(fetchMe())
  }, [dispatch, me])

  useEffect(() => {
    loadDashboardData()
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

  // OPTIMIZATION: Calculate profitability alerts from dashboard data
  // This eliminates the need for a separate API call and periodic refresh
  useEffect(() => {
    if (!dashboardData) {
      setProfitabilityAlerts([])
      return
    }
    
    // Helper to flatten all projects including children
    const getAllProjectsFlat = (projects: typeof dashboardData.projects): typeof dashboardData.projects => {
      const result: typeof dashboardData.projects = []
      const flatten = (projs: typeof dashboardData.projects) => {
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
    
    const allProjects = getAllProjectsFlat(dashboardData.projects)
    
    // Calculate profitability alerts: projects with profit_margin <= -10%
    // Using income_month_to_date and expense_month_to_date from ProjectWithFinance
    const alerts = allProjects
      .filter(p => {
        const income = p.income_month_to_date || 0
        const expense = p.expense_month_to_date || 0
        const profit = income - expense
        
        // Calculate profit margin
        let profitMargin: number
        if (income > 0) {
          profitMargin = (profit / income) * 100
        } else if (expense > 0) {
          profitMargin = -100
        } else {
          return false // No transactions
        }
        
        return profitMargin <= -10
      })
      .map(p => {
        const income = p.income_month_to_date || 0
        const expense = p.expense_month_to_date || 0
        const profit = income - expense
        const profitMargin = income > 0 ? (profit / income) * 100 : (expense > 0 ? -100 : 0)
        
        return {
          id: p.id,
          name: p.name,
          profit_margin: Math.round(profitMargin * 10) / 10,
          income,
          expense,
          profit,
          is_subproject: p.relation_project !== null && p.relation_project !== undefined,
          parent_project_id: p.relation_project || null
        }
      })
      .sort((a, b) => a.profit_margin - b.profit_margin) // Most negative first
    
    setProfitabilityAlerts(alerts)
    setAlertsLoading(false)
  }, [dashboardData])

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

  // --- Financial overview for PM (product-minded) ---
  const summary = dashboardData?.summary ?? { total_income: 0, total_expense: 0, total_profit: 0 }
  const profitMargin =
    summary.total_income > 0
      ? (summary.total_profit / summary.total_income) * 100
      : summary.total_expense > 0
        ? -100
        : 0
  const statusCounts = allProjectsFlat.reduce(
    (acc, p) => {
      acc[p.status_color] = (acc[p.status_color] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>
  )
  const projectsByStatusGreen = allProjectsFlat.filter((p) => p.status_color === 'green')
  const projectsByStatusYellow = allProjectsFlat.filter((p) => p.status_color === 'yellow')
  const projectsByStatusRed = allProjectsFlat.filter((p) => p.status_color === 'red')
  const projectProfit = (p: ProjectWithFinance) => (p.income_month_to_date || 0) - (p.expense_month_to_date || 0)
  const topProfitableProjects = [...allProjectsFlat]
    .filter((p) => projectProfit(p) > 0)
    .sort((a, b) => projectProfit(b) - projectProfit(a))
    .slice(0, 5)
  const topLossMakingProjects = [...allProjectsFlat]
    .filter((p) => projectProfit(p) < 0)
    .sort((a, b) => projectProfit(a) - projectProfit(b))
    .slice(0, 5)

  return (
    <div className="space-y-8">
      {/* Financial Overview – מצב כספי במבט אחד */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-4"
      >
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          מצב כספי במבט אחד
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
              <TrendingUp className="w-4 h-4" />
              <span>הכנסות</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {summary.total_income.toLocaleString('he-IL')} ₪
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
              <TrendingDown className="w-4 h-4" />
              <span>הוצאות</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {summary.total_expense.toLocaleString('he-IL')} ₪
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
              <Wallet className="w-4 h-4" />
              <span>רווח / הפסד</span>
            </div>
            <div
              className={`text-2xl font-bold ${
                summary.total_profit >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {summary.total_profit >= 0 ? '' : '−'}
              {Math.abs(summary.total_profit).toLocaleString('he-IL')} ₪
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
              <Percent className="w-4 h-4" />
              <span>אחוז רווחיות</span>
            </div>
            <div
              className={`text-2xl font-bold ${
                profitMargin >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {profitMargin.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Projects by status – פרויקטים לפי מצב (מצומצם, לחיצה לפתיחה כקומפוננטה צפה) */}
        {allProjectsFlat.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setProjectsByStatusOpen((v) => !v)}
              className="w-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-right flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm font-medium flex-shrink-0">
                <BarChart3 className="w-4 h-4" />
                פרויקטים לפי מצב
              </div>
              <div className="flex flex-wrap items-center justify-end gap-4 min-w-0">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-gray-600 dark:text-gray-400">במצב טוב</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{statusCounts['green'] ?? 0}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="text-gray-600 dark:text-gray-400">שימו לב</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{statusCounts['yellow'] ?? 0}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <span className="text-gray-600 dark:text-gray-400">דורש טיפול</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{statusCounts['red'] ?? 0}</span>
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 flex-shrink-0 text-gray-500 dark:text-gray-400 transition-transform ${projectsByStatusOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Floating panel – נפתח בלחיצה */}
            {projectsByStatusOpen && (
              <>
                <div
                  role="presentation"
                  className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40 backdrop-blur-md"
                  onClick={() => setProjectsByStatusOpen(false)}
                  aria-hidden="true"
                />
                <div
                  className="fixed z-50 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl max-w-4xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col"
                  style={{
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2 p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm font-medium">
                      <BarChart3 className="w-4 h-4" />
                      פרויקטים לפי מצב
                    </div>
                    <button
                      type="button"
                      onClick={() => setProjectsByStatusOpen(false)}
                      className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-1 rounded"
                      aria-label="סגור"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 px-4 pb-3 flex-shrink-0">
                    ירוק = רווחיות טובה · צהוב = רווחיות בינונית · אדום = הפסד או רווחיות שלילית. לחיצה על פרויקט – מעבר לפרטים.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-4 pb-4 overflow-y-auto flex-1 min-h-0">
                    <div>
                      <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 text-sm font-medium mb-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        במצב טוב – פירוט
                      </div>
                      <ul className="space-y-1 max-h-72 overflow-y-auto">
                        {projectsByStatusGreen.map((p, idx) => (
                          <li key={`green-${p.id}-${idx}`}>
                            <button
                              type="button"
                              onClick={() => {
                                onProjectClick?.(p)
                                setProjectsByStatusOpen(false)
                              }}
                              className="text-sm text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-100 hover:underline text-right w-full"
                            >
                              {p.name}
                              <span className="text-emerald-600 dark:text-emerald-400 mr-1">←</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm font-medium mb-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        שימו לב – פירוט
                      </div>
                      <ul className="space-y-1 max-h-72 overflow-y-auto">
                        {projectsByStatusYellow.map((p, idx) => (
                          <li key={`yellow-${p.id}-${idx}`}>
                            <button
                              type="button"
                              onClick={() => {
                                onProjectClick?.(p)
                                setProjectsByStatusOpen(false)
                              }}
                              className="text-sm text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 hover:underline text-right w-full"
                            >
                              {p.name}
                              <span className="text-amber-600 dark:text-amber-400 mr-1">←</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-red-700 dark:text-red-300 text-sm font-medium mb-2">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        דורש טיפול – פירוט
                      </div>
                      <ul className="space-y-1 max-h-72 overflow-y-auto">
                        {projectsByStatusRed.map((p, idx) => (
                          <li key={`red-${p.id}-${idx}`}>
                            <button
                              type="button"
                              onClick={() => {
                                onProjectClick?.(p)
                                setProjectsByStatusOpen(false)
                              }}
                              className="text-sm text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100 hover:underline text-right w-full"
                            >
                              {p.name}
                              <span className="text-red-600 dark:text-red-400 mr-1">←</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* פרויקטים ריווחיים והפסדיים ביותר */}
        {(topProfitableProjects.length > 0 || topLossMakingProjects.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {topProfitableProjects.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  פרויקטים הריווחיים ביותר
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">לפי רווח (הכנסות פחות הוצאות)</p>
                <ul className="space-y-2">
                  {topProfitableProjects.map((p, idx) => {
                    const profit = projectProfit(p)
                    return (
                      <li
                        key={`profit-${p.id}-${idx}`}
                        className="flex justify-between items-center gap-2 text-sm py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0"
                      >
                        <button
                          type="button"
                          onClick={() => onProjectClick?.(p)}
                          className="text-gray-900 dark:text-white truncate text-right hover:underline min-w-0 flex-1"
                        >
                          {p.name}
                        </button>
                        <span className="font-medium text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                          {profit.toLocaleString('he-IL')} ₪
                        </span>
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                          {p.profit_percent.toFixed(0)}%
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            {topLossMakingProjects.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  פרויקטים ההפסדיים ביותר
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">לפי הפסד (הוצאות גבוהות מהכנסות)</p>
                <ul className="space-y-2">
                  {topLossMakingProjects.map((p, idx) => {
                    const profit = projectProfit(p)
                    return (
                      <li
                        key={`loss-${p.id}-${idx}`}
                        className="flex justify-between items-center gap-2 text-sm py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0"
                      >
                        <button
                          type="button"
                          onClick={() => onProjectClick?.(p)}
                          className="text-gray-900 dark:text-white truncate text-right hover:underline min-w-0 flex-1"
                        >
                          {p.name}
                        </button>
                        <span className="font-medium text-red-600 dark:text-red-400 flex-shrink-0">
                          {profit.toLocaleString('he-IL')} ₪
                        </span>
                        <span className="text-xs text-red-600 dark:text-red-400 flex-shrink-0">
                          {p.profit_percent.toFixed(0)}%
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Budget and Project Alerts */}
      {dashboardData && (
        <AlertsStrip alerts={dashboardData.alerts} projects={allProjectsFlat} onProjectClick={onProjectClick} onGoToFix={(project, focus) => navigate(`/projects/${project.id}?focus=${focus}`)} />
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
              <span className="text-sm text-gray-700 dark:text-gray-300">מחוזה הראשון</span>
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
