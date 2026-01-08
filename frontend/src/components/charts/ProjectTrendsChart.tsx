import React, { useState, useEffect } from 'react'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Calendar, Filter, TrendingUp, PieChart as PieChartIcon, BarChart as BarChartIcon, Activity } from 'lucide-react'

interface ProjectTrendsChartProps {
  projectId: number
  projectName: string
  transactions: Array<{
    tx_date: string
    type: 'Income' | 'Expense'
    amount: number
    category?: string | null
    from_fund?: boolean
    period_start_date?: string | null
    period_end_date?: string | null
  }>
  expenseCategories?: Array<{
    category: string
    amount: number
    color: string
  }>
  compact?: boolean
  projectIncome?: number
}

interface ChartDataPoint {
  date: string
  income: number
  expense: number
  net: number
}

type FilterType = 'month' | 'year' | 'all' | 'custom'
type ChartType = 'line' | 'bar' | 'pie'

export default function ProjectTrendsChart({ 
  projectId, 
  projectName, 
  transactions,
  expenseCategories = [],
  compact = false,
  projectIncome = 0
}: ProjectTrendsChartProps) {
  const [viewMode, setViewMode] = useState<'profitability' | 'categories'>('categories')
  const [filterType, setFilterType] = useState<FilterType>('month')
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString())
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [chartType, setChartType] = useState<ChartType>('line')
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [filteredExpenseCategories, setFilteredExpenseCategories] = useState<Array<{
    category: string
    amount: number
    color: string
    transactionCount: number
  }>>([])

  useEffect(() => {
    if (viewMode === 'profitability') {
      setChartType('line')
    } else {
      setChartType('pie')
    }
  }, [viewMode])

  useEffect(() => {
    processData()
    processExpenseCategories()
  }, [filterType, selectedMonth, selectedYear, customStartDate, customEndDate, transactions, expenseCategories, projectIncome])

  // Helper function to split period transactions by month
  const splitPeriodTransactionByMonth = (tx: any, filterStart: Date, filterEnd: Date) => {
    if (!tx.period_start_date || !tx.period_end_date) {
      return [{ tx, dateKey: tx.tx_date, amount: tx.amount }]
    }

    const periodStart = new Date(tx.period_start_date)
    const periodEnd = new Date(tx.period_end_date)
    const totalDays = Math.floor((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
    
    if (totalDays <= 0) {
      return [{ tx, dateKey: tx.tx_date, amount: tx.amount }]
    }

    const dailyRate = tx.amount / totalDays
    const splits: Array<{ tx: any; dateKey: string; amount: number }> = []
    
    // Iterate through each month in the period that overlaps with filter range
    const current = new Date(Math.max(periodStart.getTime(), filterStart.getTime()))
    current.setDate(1) // Start of month
    
    while (current <= Math.min(periodEnd, filterEnd)) {
      const year = current.getFullYear()
      const month = current.getMonth()
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
      
      // Calculate the first and last day of this month that are within the period and filter range
      const monthStart = new Date(year, month, 1)
      const monthEnd = new Date(year, month + 1, 0)
      
      const overlapStart = new Date(Math.max(periodStart.getTime(), monthStart.getTime(), filterStart.getTime()))
      const overlapEnd = new Date(Math.min(periodEnd.getTime(), monthEnd.getTime(), filterEnd.getTime()))
      
      if (overlapStart <= overlapEnd) {
        const daysInMonth = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
        const proportionalAmount = dailyRate * daysInMonth
        
        // Determine dateKey based on filter type
        let dateKey: string
        if (filterType === 'year') {
          dateKey = monthKey
        } else if (filterType === 'month') {
          const day = overlapStart.getDate()
          dateKey = `${monthKey}-${String(day).padStart(2, '0')}`
        } else {
          dateKey = overlapStart.toISOString().split('T')[0]
        }
        
        splits.push({ tx, dateKey, amount: proportionalAmount })
      }
      
      // Move to next month
      current.setMonth(month + 1)
    }
    
    return splits.length > 0 ? splits : [{ tx, dateKey: tx.tx_date, amount: tx.amount }]
  }

  const processData = () => {
    // First, filter out cash register transactions (from_fund = true)
    let filteredTransactions = transactions.filter(tx => !tx.from_fund)
    const now = new Date()

    let filterStart: Date
    let filterEnd: Date

    switch (filterType) {
      case 'month':
        filterStart = new Date(selectedMonth + '-01')
        filterEnd = new Date(filterStart.getFullYear(), filterStart.getMonth() + 1, 0)
        filteredTransactions = filteredTransactions.filter(tx => {
          // For period transactions, check if period overlaps with month
          if (tx.period_start_date && tx.period_end_date) {
            const periodStart = new Date(tx.period_start_date)
            const periodEnd = new Date(tx.period_end_date)
            return periodStart <= filterEnd && periodEnd >= filterStart
          } else {
            // Regular transaction - check tx_date
            const txDate = new Date(tx.tx_date)
            return txDate >= filterStart && txDate <= filterEnd
          }
        })
        break
      case 'year':
        filterStart = new Date(parseInt(selectedYear), 0, 1)
        filterEnd = new Date(parseInt(selectedYear), 11, 31)
        filteredTransactions = filteredTransactions.filter(tx => {
          // For period transactions, check if period overlaps with year
          if (tx.period_start_date && tx.period_end_date) {
            const periodStart = new Date(tx.period_start_date)
            const periodEnd = new Date(tx.period_end_date)
            return periodStart <= filterEnd && periodEnd >= filterStart
          } else {
            // Regular transaction - check tx_date
            const txDate = new Date(tx.tx_date)
            return txDate >= filterStart && txDate <= filterEnd
          }
        })
        break
      case 'all':
        filterStart = new Date(1900, 0, 1)
        filterEnd = new Date(2100, 11, 31)
        // No date filtering needed, but from_fund is already filtered
        break
      case 'custom':
        if (customStartDate && customEndDate) {
          filterStart = new Date(customStartDate)
          filterEnd = new Date(customEndDate)
          filteredTransactions = filteredTransactions.filter(tx => {
            // For period transactions, check if period overlaps with range
            if (tx.period_start_date && tx.period_end_date) {
              const periodStart = new Date(tx.period_start_date)
              const periodEnd = new Date(tx.period_end_date)
              return periodStart <= filterEnd && periodEnd >= filterStart
            } else {
              // Regular transaction - check tx_date
              const txDate = new Date(tx.tx_date)
              return txDate >= filterStart && txDate <= filterEnd
            }
          })
        } else {
          filterStart = new Date(1900, 0, 1)
          filterEnd = new Date(2100, 11, 31)
        }
        break
    }

    // Group by date and calculate totals
    const groupedData: { [key: string]: { income: number; expense: number } } = {}

    // Initialize data structure based on view type
    if (filterType === 'year') {
      // Initialize all months for the selected year
      for (let i = 0; i < 12; i++) {
        // Create date as UTC to avoid timezone shifts
        const monthStr = `${selectedYear}-${(i + 1).toString().padStart(2, '0')}`
        groupedData[monthStr] = { income: projectIncome || 0, expense: 0 }
      }
    } else if (filterType === 'month') {
      // Initialize all days for the selected month
      const [year, month] = selectedMonth.split('-').map(Number)
      const daysInMonth = new Date(year, month, 0).getDate()
      
      for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${selectedMonth}-${i.toString().padStart(2, '0')}`
        groupedData[dateStr] = { income: 0, expense: 0 }
      }
    }
    
    // Process transactions and split period transactions
    filteredTransactions.forEach(tx => {
      const splits = splitPeriodTransactionByMonth(tx, filterStart, filterEnd)
      
      splits.forEach(split => {
        const dateKey = split.dateKey
        
        if (!groupedData[dateKey]) {
          // For 'year'/'month' view, keys should be initialized, but for other views we create as needed
          if (filterType !== 'year' && filterType !== 'month') {
            groupedData[dateKey] = { income: 0, expense: 0 }
          } else {
            // If transaction is outside the initialized range (shouldn't happen with filter)
            return
          }
        }
        
        if (split.tx.type === 'Income') {
          // If we have a fixed project income and we are in year view (monthly grouping), 
          // we use the fixed income instead of summing transactions
          if (!projectIncome || filterType !== 'year') {
            groupedData[dateKey].income += Math.abs(split.amount)
          }
        } else {
          groupedData[dateKey].expense += Math.abs(split.amount)
        }
      })
    })

    // Convert to array and sort by date
    const dataArray = Object.entries(groupedData)
      .map(([date, values]) => ({
        date,
        income: values.income,
        expense: values.expense,
        net: values.income - values.expense
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    setChartData(dataArray)
  }

  const processExpenseCategories = () => {
    // First, filter out cash register transactions (from_fund = true)
    let filteredTransactions = transactions.filter(tx => !tx.from_fund)

    let filterStart: Date
    let filterEnd: Date

    switch (filterType) {
      case 'month':
        filterStart = new Date(selectedMonth + '-01')
        filterEnd = new Date(filterStart.getFullYear(), filterStart.getMonth() + 1, 0)
        filteredTransactions = filteredTransactions.filter(tx => {
          // For period transactions, check if period overlaps with month
          if (tx.period_start_date && tx.period_end_date) {
            const periodStart = new Date(tx.period_start_date)
            const periodEnd = new Date(tx.period_end_date)
            return periodStart <= filterEnd && periodEnd >= filterStart
          } else {
            // Regular transaction - check tx_date
            const txDate = new Date(tx.tx_date)
            return txDate >= filterStart && txDate <= filterEnd
          }
        })
        break
      case 'year':
        filterStart = new Date(parseInt(selectedYear), 0, 1)
        filterEnd = new Date(parseInt(selectedYear), 11, 31)
        filteredTransactions = filteredTransactions.filter(tx => {
          // For period transactions, check if period overlaps with year
          if (tx.period_start_date && tx.period_end_date) {
            const periodStart = new Date(tx.period_start_date)
            const periodEnd = new Date(tx.period_end_date)
            return periodStart <= filterEnd && periodEnd >= filterStart
          } else {
            // Regular transaction - check tx_date
            const txDate = new Date(tx.tx_date)
            return txDate >= filterStart && txDate <= filterEnd
          }
        })
        break
      case 'all':
        filterStart = new Date(1900, 0, 1)
        filterEnd = new Date(2100, 11, 31)
        // No date filtering needed, but from_fund is already filtered
        break
      case 'custom':
        if (customStartDate && customEndDate) {
          filterStart = new Date(customStartDate)
          filterEnd = new Date(customEndDate)
          filteredTransactions = filteredTransactions.filter(tx => {
            // For period transactions, check if period overlaps with range
            if (tx.period_start_date && tx.period_end_date) {
              const periodStart = new Date(tx.period_start_date)
              const periodEnd = new Date(tx.period_end_date)
              return periodStart <= filterEnd && periodEnd >= filterStart
            } else {
              // Regular transaction - check tx_date
              const txDate = new Date(tx.tx_date)
              return txDate >= filterStart && txDate <= filterEnd
            }
          })
        } else {
          filterStart = new Date(1900, 0, 1)
          filterEnd = new Date(2100, 11, 31)
        }
        break
    }

    // Group expenses by category
    const categoryTotals: { [key: string]: { amount: number; color: string; transactionCount: number } } = {}
    
    // Initialize with all known expense categories (with 0 amount)
    // This ensures all categories are shown even if they have no transactions in the period
    expenseCategories.forEach(cat => {
      categoryTotals[cat.category] = {
        amount: 0,
        color: cat.color,
        transactionCount: 0
      }
    })

    filteredTransactions
      .filter(tx => tx.type === 'Expense')
      .forEach(tx => {
        const category = tx.category || 'אחר'
        if (!categoryTotals[category]) {
          // Find color from original expenseCategories or use default
          const originalCategory = expenseCategories.find(cat => cat.category === category)
          categoryTotals[category] = {
            amount: 0,
            color: originalCategory?.color || '#8884d8',
            transactionCount: 0
          }
        }
        
        // For period transactions, calculate proportional amount
        if (tx.period_start_date && tx.period_end_date) {
          const splits = splitPeriodTransactionByMonth(tx, filterStart, filterEnd)
          const totalAmount = splits.reduce((sum, split) => sum + Math.abs(split.amount), 0)
          categoryTotals[category].amount += totalAmount
          categoryTotals[category].transactionCount += 1
        } else {
          // Regular transaction - use full amount
          categoryTotals[category].amount += Math.abs(tx.amount)
          categoryTotals[category].transactionCount += 1
        }
      })

    // Convert to array and sort by amount
    const categoriesArray = Object.entries(categoryTotals)
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        color: data.color,
        transactionCount: data.transactionCount
      }))
      .sort((a, b) => b.amount - a.amount)

    setFilteredExpenseCategories(categoriesArray)
  }

  const formatDateAxis = (dateStr: string) => {
    const date = new Date(dateStr)
    // Handle invalid dates
    if (isNaN(date.getTime())) return dateStr

    if (filterType === 'year') {
      return date.toLocaleDateString('he-IL', { month: 'short' })
    }
    return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      let dateLabel = label
      try {
        if (filterType === 'year') {
          dateLabel = new Date(label).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
        } else if (filterType === 'month') {
          dateLabel = new Date(label).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
        } else {
          dateLabel = new Date(label).toLocaleDateString('he-IL')
        }
      } catch (e) {
        // fallback
      }

      return (
        <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          <p className="font-semibold text-gray-900 dark:text-white mb-2">
            {viewMode === 'profitability' ? dateLabel : label}
          </p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color || entry.stroke || entry.fill }}>
              {entry.name}: {Number(entry.value ?? 0).toLocaleString()} ₪
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  const renderProfitabilityChart = () => {
    // Check if we have data (or if in year/month mode, we usually have data points)
    if (chartData.length === 0) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-gray-500 dark:text-gray-400">
            <div className="text-lg mb-2">אין נתונים להצגה</div>
            <div className="text-sm">לא נמצאו עסקאות בטווח הזמן שנבחר</div>
          </div>
        </div>
      )
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        {chartType === 'line' ? (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDateAxis}
            />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="net" stroke="#3B82F6" strokeWidth={2} name="רווח נטו" />
          </LineChart>
        ) : (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDateAxis}
            />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="net" fill="#3B82F6" name="רווח נטו" />
          </BarChart>
        )}
      </ResponsiveContainer>
    )
  }

  const renderCategoriesChart = () => {
    // If we have no categories at all (even empty ones), show empty state
    if (filteredExpenseCategories.length === 0) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-gray-500 dark:text-gray-400">
            <div className="text-lg mb-2">אין הוצאות להצגה</div>
            <div className="text-sm">לא נרשמו הוצאות עבור פרויקט זה בתקופה שנבחרה</div>
          </div>
        </div>
      )
    }

    if (chartType === 'pie') {
      return (
        <>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={filteredExpenseCategories.filter(c => c.amount > 0)} // Pie chart looks bad with 0 values
                cx="50%"
                cy="50%"
                labelLine={false}
                label={false}
                outerRadius={compact ? 80 : 120}
                fill="#8884d8"
                dataKey="amount"
                nameKey="category"
              >
                {filteredExpenseCategories.filter(c => c.amount > 0).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0]
                    const categoryData = filteredExpenseCategories.find(cat => cat.category === data.name)
                    const total = filteredExpenseCategories.reduce((sum, cat) => sum + cat.amount, 0)
                    const percentage = total > 0 ? ((Number(data.value) / total) * 100).toFixed(1) : 0
                    const transactionCount = categoryData?.transactionCount || 0
                    
                    return (
                      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 min-w-[200px]">
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200 dark:border-gray-700">
                          <div 
                            className="w-4 h-4 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: data.payload?.fill || data.payload?.color || '#8884d8' }}
                          />
                          <p className="font-bold text-lg text-gray-900 dark:text-white">
                            {data.name}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600 dark:text-gray-400">סכום:</span>
                            <span className="text-base font-semibold text-gray-900 dark:text-white">
                              {Number(data.value).toLocaleString('he-IL')} ₪
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600 dark:text-gray-400">אחוז מסך:</span>
                            <span className="text-base font-semibold text-gray-900 dark:text-white">
                              {percentage}%
                            </span>
                          </div>
                          {transactionCount > 0 && (
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600 dark:text-gray-400">מספר עסקאות:</span>
                              <span className="text-base font-semibold text-gray-900 dark:text-white">
                                {transactionCount}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Legend 
                content={({ payload }) => (
                  <div className="flex flex-wrap justify-center gap-2 mt-2">
                    {payload?.map((entry: any, index: number) => (
                      <div key={index} className="flex items-center gap-1">
                        <div 
                          className="w-2 h-2 rounded-full" 
                          style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-xs text-gray-700 dark:text-gray-300">
                          {entry.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
          {!compact && (
            <div className="mt-4 text-center">
              <div className="text-lg font-bold text-gray-700 dark:text-gray-300">
                סה״כ הוצאות: {Number(filteredExpenseCategories.reduce((sum, cat) => sum + (cat.amount ?? 0), 0)).toLocaleString()} ₪
              </div>
            </div>
          )}
        </>
      )
    }

    if (chartType === 'bar') {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filteredExpenseCategories}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="category" />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="amount" name="סכום הוצאות" fill="#8884d8">
              {filteredExpenseCategories.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )
    }

    if (chartType === 'line') {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={filteredExpenseCategories}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="category" />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="amount" name="סכום הוצאות" stroke="#8884d8" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      )
    }
  }

  return (
    <div className="w-full bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white text-center mb-2">
          {viewMode === 'categories' ? `פילוח הוצאות - ${projectName}` : `מגמות פיננסיות - ${projectName}`}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
          {viewMode === 'categories' ? 'הוצאות לפי קטגוריות' : 'הכנסות והוצאות לאורך זמן'}
        </p>
      </div>

      {/* View Mode Toggle */}
      <div className="flex justify-center mb-6">
        <div className="bg-gray-100 dark:bg-gray-700 p-1 rounded-lg flex items-center">
          <button
            onClick={() => setViewMode('profitability')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              viewMode === 'profitability'
                ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            מגמות רווחיות
          </button>
          <button
            onClick={() => setViewMode('categories')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              viewMode === 'categories'
                ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <PieChartIcon className="w-4 h-4" />
            פילוח קטגוריות
          </button>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-wrap gap-4 items-center justify-center">
            {/* Filter Type Selection */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as FilterType)}
                className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="month">לפי חודש</option>
                <option value="year">לפי שנה</option>
                <option value="all">כל התקופה</option>
                <option value="custom">טווח תאריכים</option>
              </select>
            </div>

            {/* Month Filter */}
            {filterType === 'month' && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Year Filter */}
            {filterType === 'year' && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                    <option key={year} value={year.toString()}>{year}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Custom Date Range */}
            {filterType === 'custom' && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  placeholder="תאריך התחלה"
                  className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-500">עד</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  placeholder="תאריך סיום"
                  className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>
      </div>

      {/* Chart Type Selection - Context Aware */}
      <div className="mb-6 flex justify-center">
        <div className="flex items-center gap-2">
          {viewMode === 'categories' ? (
            <div className="flex gap-2">
              <button
                onClick={() => setChartType('pie')}
                className={`p-2 rounded-lg transition-colors ${chartType === 'pie' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                title="גרף עוגה"
              >
                <PieChartIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => setChartType('bar')}
                className={`p-2 rounded-lg transition-colors ${chartType === 'bar' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                title="גרף עמודות"
              >
                <BarChartIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => setChartType('line')}
                className={`p-2 rounded-lg transition-colors ${chartType === 'line' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                title="גרף קו"
              >
                <Activity className="w-5 h-5" />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Chart */}
      <div className={compact ? "h-64" : "h-96"}>
        {viewMode === 'profitability' ? renderProfitabilityChart() : renderCategoriesChart()}
      </div>
    </div>
  )
}