import { useEffect, useState, useRef, useMemo } from 'react'
import api from '../lib/api'
import IncomeExpensePie from '../components/charts/IncomeExpensePie'
import ProjectTrendsChart from '../components/charts/ProjectTrendsChart'
import { FileText, Archive, Download, Filter, ChevronDown, ChevronUp, Calendar } from 'lucide-react'
import { CategoryAPI, SupplierAPI, ReportAPI, ProjectAPI } from '../lib/apiClient'
import { parseLocalDate } from '../lib/utils'
import { ExpenseCategory, Transaction } from '../types/api'
import html2canvas from 'html2canvas'

interface Report {
    income: number;
    expenses: number;
    profit: number;
    budget_monthly: number;
    budget_annual: number;
    has_budget: boolean;
    has_fund: boolean;
}
interface Project { id: number; name: string; start_date?: string | null; end_date?: string | null }
interface Category { id: number; name: string; is_active?: boolean }
interface Supplier { id: number; name: string; is_active?: boolean; category?: string | null }

export default function Reports() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<string>('')
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  // Chart Refs for capturing
  const incomeExpenseChartRef = useRef<HTMLDivElement>(null)
  const trendsChartRef = useRef<HTMLDivElement>(null)

  // State for ProjectTrendsChart
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([])
  const [projectName, setProjectName] = useState<string>('')
  const [projectBudget, setProjectBudget] = useState<{ budget_monthly: number; budget_annual: number }>({ budget_monthly: 0, budget_annual: 0 })
  
  // Chart selection state - user can choose which chart to include in report
  const [selectedChartViewMode, setSelectedChartViewMode] = useState<'categories' | 'profitability'>('categories')
  const [selectedChartType, setSelectedChartType] = useState<'pie' | 'bar' | 'line'>('pie')

  // Global Date Filter State - Used across all components
  const [dateFilterMode, setDateFilterMode] = useState<'current_month' | 'selected_month' | 'date_range' | 'all_time'>('current_month')
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [filterStartDate, setFilterStartDate] = useState<string>('')
  const [filterEndDate, setFilterEndDate] = useState<string>('')

  // Calculate actual startDate and endDate based on filter mode
  const { startDate, endDate } = useMemo(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1

    let calculatedStartDate = ''
    let calculatedEndDate = ''

    if (dateFilterMode === 'current_month') {
      // Current month
      const monthStart = new Date(currentYear, currentMonth - 1, 1)
      const monthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999)
      calculatedStartDate = monthStart.toISOString().split('T')[0]
      calculatedEndDate = monthEnd.toISOString().split('T')[0]
    } else if (dateFilterMode === 'selected_month') {
      // Selected month
      const [year, month] = selectedMonth.split('-').map(Number)
      const monthStart = new Date(year, month - 1, 1)
      const monthEnd = new Date(year, month, 0, 23, 59, 59, 999)
      calculatedStartDate = monthStart.toISOString().split('T')[0]
      calculatedEndDate = monthEnd.toISOString().split('T')[0]
    } else if (dateFilterMode === 'date_range') {
      // Date range
      calculatedStartDate = filterStartDate
      calculatedEndDate = filterEndDate
    } else if (dateFilterMode === 'all_time') {
      // All time - empty dates means no filter
      calculatedStartDate = ''
      calculatedEndDate = ''
    }

    return { startDate: calculatedStartDate, endDate: calculatedEndDate }
  }, [dateFilterMode, selectedMonth, filterStartDate, filterEndDate])
  const [includeSummary, setIncludeSummary] = useState(true)
  const [includeBudgets, setIncludeBudgets] = useState(true)
  const [includeFunds, setIncludeFunds] = useState(false)
  const [includeTransactions, setIncludeTransactions] = useState(false) // Default: don't show transaction table, only charts
  const [onlyRecurring, setOnlyRecurring] = useState(false)
  const [txType, setTxType] = useState<string[]>([]) // empty = all

  // New Filters
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedSuppliers, setSelectedSuppliers] = useState<number[]>([])
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)

  // ZIP Options
  const [includeContract, setIncludeContract] = useState(false)
  const [includeImage, setIncludeImage] = useState(false)
  const [showZipOptions, setShowZipOptions] = useState(false)

  // Chart Options
  const [includeCharts, setIncludeCharts] = useState(true) // Default: show charts
  const [selectedChartTypes, setSelectedChartTypes] = useState<string[]>([])

  // Supplier Report State
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('')
  const [supplierStartDate, setSupplierStartDate] = useState('')
  const [supplierEndDate, setSupplierEndDate] = useState('')
  const [supplierTxType, setSupplierTxType] = useState<string[]>([])
  const [supplierOnlyRecurring, setSupplierOnlyRecurring] = useState(false)
  const [supplierSelectedCategories, setSupplierSelectedCategories] = useState<string[]>([])
  const [supplierSelectedProjects, setSupplierSelectedProjects] = useState<number[]>([])
  const [supplierShowAdvancedFilters, setSupplierShowAdvancedFilters] = useState(false)
  const [generatingSupplierReport, setGeneratingSupplierReport] = useState(false)

  useEffect(() => {
    const fetchProjects = async () => {
        try {
            const { data } = await api.get('/reports/dashboard-snapshot')
            if (data.projects) {
                setProjects(data.projects)
                if (data.projects.length > 0) {
                    setProjectId(String(data.projects[0].id))
                }
            }
        } catch (e) {
            console.error(e)
        }
    }
    fetchProjects()

    // Fetch Categories and Suppliers
    CategoryAPI.getCategories().then(setCategories).catch(console.error)
    SupplierAPI.getSuppliers().then(setSuppliers).catch(console.error)
  }, [])

  // Note: Removed the effect that sets dates from project - now dates are controlled by the date filter

  useEffect(() => {
    if (!projectId) return
    const run = async () => {
      setLoading(true)
      try {
          // Build query params with date filters
          const params = new URLSearchParams()
          if (startDate) params.append('start_date', startDate)
          if (endDate) params.append('end_date', endDate)
          
          const queryString = params.toString()
          const url = `/reports/project/${projectId}${queryString ? '?' + queryString : ''}`
          const { data } = await api.get(url)
          setData(data)
          // Update checkbox defaults based on availability
          setIncludeBudgets(!!data.has_budget)
          setIncludeFunds(!!data.has_fund)

          // Load project full data for charts
          try {
            const fullData = await ProjectAPI.getProjectFull(Number(projectId))
            setProjectName(fullData.project.name || '')
            setProjectBudget({
              budget_monthly: fullData.project.budget_monthly || 0,
              budget_annual: fullData.project.budget_annual || 0
            })
            
            // Filter transactions by date range if specified
            let filteredTransactions = fullData.transactions || []
            if (startDate || endDate) {
              filteredTransactions = filteredTransactions.filter((tx: Transaction) => {
                const txDate = tx.tx_date
                if (startDate && txDate < startDate) return false
                if (endDate && txDate > endDate) return false
                return true
              })
            }
            setTransactions(filteredTransactions)
            setExpenseCategories(fullData.expense_categories || [])
          } catch (e) {
            console.error('Error loading project full data:', e)
            setTransactions([])
            setExpenseCategories([])
          }
      } catch (e) {
          console.error(e)
      } finally {
          setLoading(false)
      }
    }
    run()
  }, [projectId, startDate, endDate])

  // Filter suppliers based on selected categories
  // Only show suppliers if categories are selected
  const filteredSuppliers = useMemo(() => {
    if (selectedCategories.length === 0) {
      // If no categories selected, show no suppliers
      return []
    }
    // Filter suppliers that belong to selected categories
    return suppliers.filter(sup => 
      sup.category && selectedCategories.includes(sup.category)
    )
  }, [suppliers, selectedCategories])

  // Clear selected suppliers when categories are cleared or when suppliers are filtered out
  useEffect(() => {
    if (selectedCategories.length === 0) {
      // If no categories selected, clear all selected suppliers
      if (selectedSuppliers.length > 0) {
        setSelectedSuppliers([])
      }
    } else if (selectedSuppliers.length > 0) {
      // If categories are selected, keep only suppliers that are in the filtered list
      const validSupplierIds = filteredSuppliers.map(s => s.id)
      const filteredSelectedSuppliers = selectedSuppliers.filter(id => validSupplierIds.includes(id))
      if (filteredSelectedSuppliers.length !== selectedSuppliers.length) {
        setSelectedSuppliers(filteredSelectedSuppliers)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredSuppliers, selectedCategories])

  // Function to capture chart as base64 using html2canvas
  const captureChartAsBase64 = async (chartRef: React.RefObject<HTMLDivElement>): Promise<string | null> => {
    if (!chartRef.current) return null

    try {
      // Use html2canvas for more reliable capture
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: document.documentElement.classList.contains('dark') ? '#1f2937' : '#ffffff',
        scale: 2, // Higher quality
        logging: false,
        useCORS: true
      })
      
      const base64 = canvas.toDataURL('image/png')
      return base64
    } catch (error) {
      console.error('Error capturing chart:', error)
      return null
    }
  }

  const handleDownload = async (format: 'pdf' | 'excel' | 'zip') => {
      if (!projectId) return

      // If ZIP, show options first if not already confirmed or if user didn't see them
      if (format === 'zip' && !showZipOptions) {
          setShowZipOptions(true)
          return
      }

      setGenerating(true)

      try {
        // Capture charts if requested
        let chartImages: Record<string, string> | null = null
        let componentChartType = '' // Define outside the if block
        
        if (includeCharts) {
          chartImages = {}

          // Don't capture income/expense pie - only expense breakdown charts

          // Always capture the ProjectTrendsChart if it's displayed (user's selected chart)
          if (trendsChartRef.current) {
            // Map the selected chart type to backend chart type
            if (selectedChartViewMode === 'categories') {
              if (selectedChartType === 'pie') {
                componentChartType = 'expense_by_category_pie'
              } else if (selectedChartType === 'bar') {
                componentChartType = 'expense_by_category_bar'
              } else if (selectedChartType === 'line') {
                componentChartType = 'trends_line'
              }
            } else {
              // profitability mode - only line chart makes sense
              if (selectedChartType === 'line') {
                componentChartType = 'trends_line'
              } else if (selectedChartType === 'bar') {
                componentChartType = 'trends_line' // Use line chart type for backend
              }
            }

            // Always capture the chart that the user selected in the component
            if (componentChartType) {
              const chartBase64 = await captureChartAsBase64(trendsChartRef)
              if (chartBase64) {
                chartImages[componentChartType] = chartBase64
              }
            }
          }

          // Capture other charts if selected
          // You can add more chart captures here based on selectedChartTypes
        }

        const payload = {
          project_id: Number(projectId),
          start_date: startDate || null,
          end_date: endDate || null,
          include_summary: includeSummary,
          include_budgets: includeBudgets,
          include_funds: includeFunds,
          include_transactions: includeTransactions,
          transaction_types: txType.length > 0 ? txType : ["Income", "Expense"],
          only_recurring: onlyRecurring,
          categories: selectedCategories.length > 0 ? selectedCategories : null,
          suppliers: selectedSuppliers.length > 0 ? selectedSuppliers : null,
          include_project_contract: format === 'zip' ? includeContract : false,
          include_project_image: format === 'zip' ? includeImage : false,
          include_charts: includeCharts,
          // Include the chart from component plus any selected checkboxes
          chart_types: includeCharts 
            ? (componentChartType 
                ? [...new Set([componentChartType, ...selectedChartTypes])] 
                : (selectedChartTypes.length > 0 ? selectedChartTypes : ['expense_by_category_pie']))
            : null,
          format: format,
          chart_images: chartImages // Add captured charts
        }

        console.log('Sending report request with payload:', {
          ...payload,
          chart_images: chartImages ? Object.keys(chartImages) : null
        })
        
        const response = await api.post('/reports/project/custom-report', payload, { responseType: 'blob' })
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;

        // Try to get filename from header
        let filename = `report_project_${projectId}.${format === 'excel' ? 'xlsx' : format}`;
        const contentDisposition = response.headers['content-disposition'];
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename\*=UTF-8''(.+)/) || contentDisposition.match(/filename="?([^"]+)"?/);
            if (filenameMatch && filenameMatch[1]) {
                filename = decodeURIComponent(filenameMatch[1]);
            }
        }

        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();

        // Reset zip options visibility after download
        if (format === 'zip') setShowZipOptions(false)
      } catch (e: any) {
          console.error("Export failed", e)
          let errorMessage = "שגיאה לא ידועה"
          
          if (e?.response) {
            // Try to parse error from response
            if (e.response.data instanceof Blob) {
              // If it's a blob, try to read it as text
              const text = await e.response.data.text()
              try {
                const json = JSON.parse(text)
                errorMessage = json.detail || json.message || text
              } catch {
                errorMessage = text || "שגיאה בהפקת הדוח"
              }
            } else if (e.response.data?.detail) {
              errorMessage = e.response.data.detail
            } else if (e.response.data?.message) {
              errorMessage = e.response.data.message
            } else if (typeof e.response.data === 'string') {
              errorMessage = e.response.data
            }
          } else if (e?.message) {
            errorMessage = e.message
          }
          
          alert(`שגיאה בהפקת הדוח: ${errorMessage}`)
      } finally {
          setGenerating(false)
      }
  }

  const handleSupplierDownload = async (format: 'pdf' | 'excel' | 'zip') => {
      if (!selectedSupplierId) {
          alert("אנא בחר ספק")
          return
      }

      setGeneratingSupplierReport(true)

      const payload = {
          supplier_id: Number(selectedSupplierId),
          start_date: supplierStartDate || null,
          end_date: supplierEndDate || null,
          include_transactions: true,
          transaction_types: supplierTxType.length > 0 ? supplierTxType : ["Income", "Expense"],
          only_recurring: supplierOnlyRecurring,
          categories: supplierSelectedCategories.length > 0 ? supplierSelectedCategories : null,
          project_ids: supplierSelectedProjects.length > 0 ? supplierSelectedProjects : null,
          format: format,
          chart_images: null // Can add chart capture for supplier reports too
      }

      try {
        const response = await api.post(`/reports/supplier/${selectedSupplierId}/custom-report`, payload, { responseType: 'blob' })
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;

        let filename = `supplier_${selectedSupplierId}_report.${format === 'excel' ? 'xlsx' : format}`;
        const contentDisposition = response.headers['content-disposition'];
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename\*=UTF-8''(.+)/) || contentDisposition.match(/filename="?([^"]+)"?/);
            if (filenameMatch && filenameMatch[1]) {
                filename = decodeURIComponent(filenameMatch[1]);
            }
        }

        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
      } catch (e) {
          console.error("Supplier report export failed", e)
          alert("שגיאה בהפקת דוח הספק")
      } finally {
          setGeneratingSupplierReport(false)
      }
  }

  return (
    <div className="space-y-6 pb-20" dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">דוחות וייצוא נתונים</h1>

      {/* Project Selector */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">בחר פרויקט</label>
          <select
            className="w-full md:w-64 border border-gray-300 dark:border-gray-600 p-2 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
          >
              {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
              ))}
          </select>
      </div>

      {/* Global Date Filter - Prominent at top */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl shadow-sm border border-blue-200 dark:border-blue-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold text-blue-900 dark:text-white">סינון לפי תאריך</h3>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={dateFilterMode}
              onChange={(e) => setDateFilterMode(e.target.value as any)}
              className="px-4 py-2 border border-blue-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 font-medium"
            >
              <option value="current_month">חודש נוכחי</option>
              <option value="selected_month">חודש ספציפי</option>
              <option value="date_range">טווח תאריכים</option>
              <option value="all_time">כל הזמן</option>
            </select>

            {dateFilterMode === 'selected_month' && (
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-4 py-2 border border-blue-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500"
              />
            )}

            {dateFilterMode === 'date_range' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="px-3 py-2 border border-blue-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="מתאריך"
                />
                <span className="text-gray-500 font-medium">עד</span>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  min={filterStartDate}
                  className="px-3 py-2 border border-blue-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="עד תאריך"
                />
              </div>
            )}
          </div>
        </div>

        {/* Filter description */}
        <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
          {dateFilterMode === 'current_month' && (
            <span>מציג נתונים מהחודש הנוכחי ({new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })})</span>
          )}
          {dateFilterMode === 'selected_month' && selectedMonth && (
            <span>מציג נתונים מחודש {new Date(selectedMonth + '-01').toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}</span>
          )}
          {dateFilterMode === 'date_range' && filterStartDate && filterEndDate && (
            <span>מציג נתונים מ-{parseLocalDate(filterStartDate)?.toLocaleDateString('he-IL')} עד {parseLocalDate(filterEndDate)?.toLocaleDateString('he-IL')}</span>
          )}
          {dateFilterMode === 'all_time' && (
            <span>מציג את כל הנתונים ללא הגבלת תאריך</span>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6" dir="rtl">
          {/* Project Trends Chart - Interactive Chart Selection - Replaces Quick Stats */}
          {projectId && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6" dir="rtl">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center text-gray-500 dark:text-gray-400">
                    <div className="text-lg mb-2">טוען נתונים...</div>
                  </div>
                </div>
              ) : (
                <div ref={trendsChartRef}>
                  <ProjectTrendsChart
                    projectId={Number(projectId)}
                    projectName={projectName || 'פרויקט'}
                    transactions={transactions}
                    expenseCategories={expenseCategories}
                    compact={false}
                    projectIncome={projectBudget?.budget_monthly || 0}
                    globalFilterType={dateFilterMode === 'current_month' ? 'current_month' : dateFilterMode === 'selected_month' ? 'selected_month' : dateFilterMode === 'date_range' ? 'date_range' : 'all_time'}
                    globalSelectedMonth={selectedMonth}
                    globalStartDate={startDate}
                    globalEndDate={endDate}
                    hideFilterControls={true}
                    onViewModeChange={setSelectedChartViewMode}
                    onChartTypeChange={setSelectedChartType}
                    controlledViewMode={selectedChartViewMode}
                    controlledChartType={selectedChartType}
                  />
                </div>
              )}
            </div>
          )}

          {/* Report Settings */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                  <Filter className="w-5 h-5" />
                  הגדרות דוח
              </h2>

              <div className="space-y-4">
                  {/* Components */}
                  <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">רכיבי הדוח</label>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                          <label className="flex items-center gap-2 cursor-pointer dark:text-gray-300">
                              <input type="checkbox" checked={includeSummary} onChange={e => setIncludeSummary(e.target.checked)} className="rounded text-blue-600" />
                              סיכום פיננסי
                          </label>
                          <label className={`flex items-center gap-2 cursor-pointer dark:text-gray-300 ${!data?.has_budget ? 'opacity-50 cursor-not-allowed' : ''}`}>
                              <input
                                type="checkbox"
                                checked={includeBudgets}
                                onChange={e => setIncludeBudgets(e.target.checked)}
                                className="rounded text-blue-600"
                                disabled={!data?.has_budget}
                              />
                              פירוט תקציבים {!data?.has_budget && '(אין תקציב)'}
                          </label>
                          <label className={`flex items-center gap-2 cursor-pointer dark:text-gray-300 ${!data?.has_fund ? 'opacity-50 cursor-not-allowed' : ''}`}>
                              <input
                                type="checkbox"
                                checked={includeFunds}
                                onChange={e => setIncludeFunds(e.target.checked)}
                                className="rounded text-blue-600"
                                disabled={!data?.has_fund}
                              />
                              מצב קופה (Funds) {!data?.has_fund && '(אין קופה)'}
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer dark:text-gray-300">
                              <input type="checkbox" checked={includeTransactions} onChange={e => setIncludeTransactions(e.target.checked)} className="rounded text-blue-600" />
                              רשימת עסקאות
                          </label>
                      </div>
                  </div>

                  {/* Charts Section */}
                  <div>
                      <label className="flex items-center gap-2 cursor-pointer dark:text-gray-300 mb-2">
                          <input type="checkbox" checked={includeCharts} onChange={e => setIncludeCharts(e.target.checked)} className="rounded text-blue-600" />
                          <span className="font-medium">הוסף גרפים</span>
                      </label>

                      {includeCharts && (
                          <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg text-sm space-y-2 mt-2">
                              <label className="block text-xs font-medium text-gray-500 mb-1">בחר סוגי גרפים לדוח:</label>
                              <div className="grid grid-cols-2 gap-2">
                                  <label className="flex items-center gap-2 cursor-pointer dark:text-gray-300">
                                      <input
                                          type="checkbox"
                                          checked={selectedChartTypes.includes('expense_by_category_pie')}
                                          onChange={e => {
                                              if (e.target.checked) {
                                                  setSelectedChartTypes([...selectedChartTypes, 'expense_by_category_pie'])
                                                  // Sync preview to show pie chart
                                                  setSelectedChartViewMode('categories')
                                                  setSelectedChartType('pie')
                                              } else {
                                                  setSelectedChartTypes(selectedChartTypes.filter(t => t !== 'expense_by_category_pie'))
                                              }
                                          }}
                                          className="rounded text-blue-600"
                                      />
                                      עוגה: הוצאות לפי קטגוריה
                                  </label>
                                  <label className="flex items-center gap-2 cursor-pointer dark:text-gray-300">
                                      <input
                                          type="checkbox"
                                          checked={selectedChartTypes.includes('expense_by_category_bar')}
                                          onChange={e => {
                                              if (e.target.checked) {
                                                  setSelectedChartTypes([...selectedChartTypes, 'expense_by_category_bar'])
                                                  // Sync preview to show bar chart
                                                  setSelectedChartViewMode('categories')
                                                  setSelectedChartType('bar')
                                              } else {
                                                  setSelectedChartTypes(selectedChartTypes.filter(t => t !== 'expense_by_category_bar'))
                                              }
                                          }}
                                          className="rounded text-blue-600"
                                      />
                                      עמודות: הוצאות לפי קטגוריה
                                  </label>
                                  <label className="flex items-center gap-2 cursor-pointer dark:text-gray-300">
                                      <input
                                          type="checkbox"
                                          checked={selectedChartTypes.includes('trends_line')}
                                          onChange={e => {
                                              if (e.target.checked) {
                                                  setSelectedChartTypes([...selectedChartTypes, 'trends_line'])
                                                  // Sync preview to show line chart
                                                  setSelectedChartViewMode('profitability')
                                                  setSelectedChartType('line')
                                              } else {
                                                  setSelectedChartTypes(selectedChartTypes.filter(t => t !== 'trends_line'))
                                              }
                                          }}
                                          className="rounded text-blue-600"
                                      />
                                      קו: מגמות לאורך זמן
                                  </label>
                              </div>
                              {selectedChartTypes.length > 0 && (
                                  <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded text-xs text-green-800 dark:text-green-300">
                                      ✓ {selectedChartTypes.length} גרפים יופיעו בדוח
                                  </div>
                              )}
                          </div>
                      )}
                  </div>

                  {/* Transactions Filters (Conditional) */}
                  {includeTransactions && (
                    <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg text-sm transition-all">
                        <div className="flex justify-between items-center mb-2 cursor-pointer" onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}>
                            <label className="block text-xs font-medium text-gray-500 cursor-pointer">סינון עסקאות מתקדם</label>
                            {showAdvancedFilters ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </div>

                        {showAdvancedFilters && (
                            <div className="space-y-3 pt-2 border-t dark:border-gray-600">
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-1 cursor-pointer dark:text-gray-300">
                                        <input type="checkbox" checked={txType.length === 0 || (txType.includes('Income') && txType.includes('Expense'))}
                                            onChange={() => setTxType([])}
                                            className="rounded text-blue-600" />
                                        הכל
                                    </label>
                                    <label className="flex items-center gap-1 cursor-pointer dark:text-gray-300">
                                        <input type="checkbox" checked={txType.includes('Income') && !txType.includes('Expense')}
                                            onChange={() => setTxType(['Income'])}
                                            className="rounded text-blue-600" />
                                        רק הכנסות
                                    </label>
                                    <label className="flex items-center gap-1 cursor-pointer dark:text-gray-300">
                                        <input type="checkbox" checked={txType.includes('Expense') && !txType.includes('Income')}
                                            onChange={() => setTxType(['Expense'])}
                                            className="rounded text-blue-600" />
                                        רק הוצאות
                                    </label>
                                </div>

                                <label className="flex items-center gap-2 cursor-pointer dark:text-gray-300">
                                    <input type="checkbox" checked={onlyRecurring} onChange={e => setOnlyRecurring(e.target.checked)} className="rounded text-blue-600" />
                                    רק עסקאות מחזוריות (קבועות)
                                </label>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            קטגוריות
                                        </label>
                                        <select
                                            multiple
                                            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2 dark:bg-gray-700 dark:text-white h-32 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            value={selectedCategories}
                                            onChange={e => {
                                                const options = Array.from(e.target.selectedOptions, option => option.value);
                                                setSelectedCategories(options);
                                            }}
                                        >
                                            {categories.filter(cat => cat.is_active !== false).map(cat => (
                                                <option key={cat.id} value={cat.name}>{cat.name}</option>
                                            ))}
                                        </select>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 flex items-center gap-1">
                                            <span>💡</span>
                                            <span>לבחירה מרובה: לחץ Ctrl (או Cmd במאק)</span>
                                        </div>
                                        {selectedCategories.length > 0 && (
                                            <div className="mt-2 text-xs text-green-600 dark:text-green-400 font-medium">
                                                נבחרו {selectedCategories.length} קטגוריות
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            ספקים
                                        </label>
                                        {selectedCategories.length === 0 ? (
                                            <div className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 h-32 flex items-center justify-center bg-gray-50 dark:bg-gray-800/50">
                                                <div className="text-center">
                                                    <div className="text-gray-400 dark:text-gray-500 text-sm mb-1">
                                                        📋
                                                    </div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                                        בחר קטגוריות כדי לראות ספקים
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <select
                                                    multiple
                                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2 dark:bg-gray-700 dark:text-white h-32 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    value={selectedSuppliers.map(String)}
                                                    onChange={e => {
                                                        const options = Array.from(e.target.selectedOptions, option => Number(option.value));
                                                        setSelectedSuppliers(options);
                                                    }}
                                                    disabled={filteredSuppliers.length === 0}
                                                >
                                                    {filteredSuppliers.length > 0 ? (
                                                        filteredSuppliers.map(sup => (
                                                            <option key={sup.id} value={sup.id}>{sup.name}</option>
                                                        ))
                                                    ) : (
                                                        <option disabled>אין ספקים בקטגוריות שנבחרו</option>
                                                    )}
                                                </select>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 flex items-center gap-1">
                                                    <span>💡</span>
                                                    <span>לבחירה מרובה: לחץ Ctrl (או Cmd במאק)</span>
                                                </div>
                                                {filteredSuppliers.length > 0 && (
                                                    <div className="mt-2 flex items-center justify-between">
                                                        <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                                            נמצאו {filteredSuppliers.length} ספקים
                                                        </div>
                                                        {selectedSuppliers.length > 0 && (
                                                            <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                                                נבחרו {selectedSuppliers.length} ספקים
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                  )}

                  {/* ZIP Options */}
                  {showZipOptions && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
                          <h3 className="text-sm font-semibold mb-2 text-blue-800 dark:text-blue-300">אפשרויות הורדת ZIP</h3>
                          <div className="space-y-2">
                              <label className="flex items-center gap-2 cursor-pointer dark:text-gray-300">
                                  <input type="checkbox" checked={includeContract} onChange={e => setIncludeContract(e.target.checked)} className="rounded text-blue-600" />
                                  כלול את חוזה הפרויקט
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer dark:text-gray-300">
                                  <input type="checkbox" checked={includeImage} onChange={e => setIncludeImage(e.target.checked)} className="rounded text-blue-600" />
                                  כלול תמונת פרויקט
                              </label>
                          </div>
                          <button
                            onClick={() => handleDownload('zip')}
                            disabled={generating}
                            className="w-full mt-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
                          >
                              {generating ? 'מכין קובץ...' : 'אשר והורד'}
                          </button>
                      </div>
                  )}

                  {!showZipOptions && (
                    <div className="pt-4 flex gap-3">
                        <button
                            onClick={() => handleDownload('pdf')}
                            disabled={generating}
                            className="flex-1 py-2 px-3 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                        >
                            <FileText className="w-4 h-4" />
                            PDF
                        </button>
                        <button
                            onClick={() => handleDownload('excel')}
                            disabled={generating}
                            className="flex-1 py-2 px-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                        >
                            <Download className="w-4 h-4" />
                            Excel
                        </button>
                        <button
                            onClick={() => setShowZipOptions(true)}
                            disabled={generating}
                            className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                        >
                            <Archive className="w-4 h-4" />
                            ZIP (עם מסמכים)
                        </button>
                    </div>
                  )}

                  {generating && !showZipOptions && <p className="text-center text-xs text-gray-500 animate-pulse">מפיק דוח... נא להמתין</p>}
              </div>
          </div>
      </div>

      {/* Supplier Report Section */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">דוח ספק</h2>

          <div className="space-y-4">
              {/* Supplier Selector */}
              <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">בחר ספק</label>
                  <select
                    className="w-full md:w-64 border border-gray-300 dark:border-gray-600 p-2 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    value={selectedSupplierId}
                    onChange={e => setSelectedSupplierId(e.target.value)}
                  >
                      <option value="">-- בחר ספק --</option>
                      {suppliers.filter(s => s.is_active !== false).map(sup => (
                          <option key={sup.id} value={sup.id}>{sup.name}</option>
                      ))}
                  </select>
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-4">
                  <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">מתאריך</label>
                      <input
                        type="date"
                        className="w-full border border-gray-300 dark:border-gray-600 rounded p-1.5 dark:bg-gray-700 dark:text-white"
                        value={supplierStartDate}
                        onChange={e => setSupplierStartDate(e.target.value)}
                      />
                  </div>
                  <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">עד תאריך</label>
                      <input
                        type="date"
                        className="w-full border border-gray-300 dark:border-gray-600 rounded p-1.5 dark:bg-gray-700 dark:text-white"
                        value={supplierEndDate}
                        onChange={e => setSupplierEndDate(e.target.value)}
                      />
                  </div>
              </div>

              {/* Advanced Filters */}
              <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg text-sm">
                  <div className="flex justify-between items-center mb-2 cursor-pointer" onClick={() => setSupplierShowAdvancedFilters(!supplierShowAdvancedFilters)}>
                      <label className="block text-xs font-medium text-gray-500 cursor-pointer">סינון מתקדם</label>
                      {supplierShowAdvancedFilters ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>

                  {supplierShowAdvancedFilters && (
                      <div className="space-y-3 pt-2 border-t dark:border-gray-600">
                          <div className="flex gap-4">
                              <label className="flex items-center gap-1 cursor-pointer dark:text-gray-300">
                                  <input
                                    type="checkbox"
                                    checked={supplierTxType.length === 0 || (supplierTxType.includes('Income') && supplierTxType.includes('Expense'))}
                                    onChange={() => setSupplierTxType([])}
                                    className="rounded text-blue-600"
                                  />
                                  הכל
                              </label>
                              <label className="flex items-center gap-1 cursor-pointer dark:text-gray-300">
                                  <input
                                    type="checkbox"
                                    checked={supplierTxType.includes('Income') && !supplierTxType.includes('Expense')}
                                    onChange={() => setSupplierTxType(['Income'])}
                                    className="rounded text-blue-600"
                                  />
                                  רק הכנסות
                              </label>
                              <label className="flex items-center gap-1 cursor-pointer dark:text-gray-300">
                                  <input
                                    type="checkbox"
                                    checked={supplierTxType.includes('Expense') && !supplierTxType.includes('Income')}
                                    onChange={() => setSupplierTxType(['Expense'])}
                                    className="rounded text-blue-600"
                                  />
                                  רק הוצאות
                              </label>
                          </div>

                          <label className="flex items-center gap-2 cursor-pointer dark:text-gray-300">
                              <input
                                type="checkbox"
                                checked={supplierOnlyRecurring}
                                onChange={e => setSupplierOnlyRecurring(e.target.checked)}
                                className="rounded text-blue-600"
                              />
                              רק עסקאות מחזוריות (קבועות)
                          </label>

                          <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">קטגוריות</label>
                              <select
                                  multiple
                                  className="w-full border border-gray-300 dark:border-gray-600 rounded p-1.5 dark:bg-gray-700 dark:text-white h-24 text-xs"
                                  value={supplierSelectedCategories}
                                  onChange={e => {
                                      const options = Array.from(e.target.selectedOptions, option => option.value);
                                      setSupplierSelectedCategories(options);
                                  }}
                              >
                                  {categories.map(cat => (
                                      <option key={cat.id} value={cat.name}>{cat.name}</option>
                                  ))}
                              </select>
                              <div className="text-[10px] text-gray-400 mt-1">לחץ Ctrl לבחירה מרובה</div>
                          </div>

                          <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">פרויקטים</label>
                              <select
                                  multiple
                                  className="w-full border border-gray-300 dark:border-gray-600 rounded p-1.5 dark:bg-gray-700 dark:text-white h-24 text-xs"
                                  value={supplierSelectedProjects.map(String)}
                                  onChange={e => {
                                      const options = Array.from(e.target.selectedOptions, option => Number(option.value));
                                      setSupplierSelectedProjects(options);
                                  }}
                              >
                                  {projects.map(proj => (
                                      <option key={proj.id} value={proj.id}>{proj.name}</option>
                                  ))}
                              </select>
                              <div className="text-[10px] text-gray-400 mt-1">לחץ Ctrl לבחירה מרובה (אופציונלי - אם לא נבחר, יוצגו כל הפרויקטים)</div>
                          </div>
                      </div>
                  )}
              </div>

              {/* Download Buttons */}
              <div className="pt-4 flex gap-3">
                  <button
                      onClick={() => handleSupplierDownload('pdf')}
                      disabled={generatingSupplierReport || !selectedSupplierId}
                      className="flex-1 py-2 px-3 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                      <FileText className="w-4 h-4" />
                      PDF
                  </button>
                  <button
                      onClick={() => handleSupplierDownload('excel')}
                      disabled={generatingSupplierReport || !selectedSupplierId}
                      className="flex-1 py-2 px-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                      <Download className="w-4 h-4" />
                      Excel
                  </button>
                  <button
                      onClick={() => handleSupplierDownload('zip')}
                      disabled={generatingSupplierReport || !selectedSupplierId}
                      className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                      <Archive className="w-4 h-4" />
                      ZIP (עם מסמכים)
                  </button>
              </div>

              {generatingSupplierReport && <p className="text-center text-xs text-gray-500 animate-pulse">מפיק דוח ספק... נא להמתין</p>}
          </div>
      </div>
    </div>
  )
}