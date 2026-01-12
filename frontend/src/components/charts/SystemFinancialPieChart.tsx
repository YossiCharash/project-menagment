import React, { useState } from 'react'
import { Pie, PieChart, ResponsiveContainer, Tooltip, Cell, Legend, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { PieChart as PieChartIcon, BarChart as BarChartIcon, Activity } from 'lucide-react'

interface SystemFinancialPieChartProps {
  totalIncome: number
  totalExpense: number
  expenseCategories: Array<{
    category: string
    amount: number
    color: string
  }>
}

type ChartType = 'pie' | 'bar' | 'line'

const COLORS = {
  income: '#10B981', // green-500
  cleaning: '#3B82F6', // blue-500
  electricity: '#F59E0B', // amber-500
  insurance: '#8B5CF6', // violet-500
  gardening: '#059669', // emerald-500
  other: '#EF4444', // red-500
}

export default function SystemFinancialPieChart({ 
  totalIncome, 
  totalExpense, 
  expenseCategories 
}: SystemFinancialPieChartProps) {
  const [chartType, setChartType] = useState<ChartType>('pie')
  
  // Create data for the charts - only expenses by category
  const chartData = expenseCategories.map(cat => ({
    name: cat.category,
    value: cat.amount,
    amount: cat.amount,
    color: cat.color,
    fill: cat.color
  }))

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]
      return (
        <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          <p className="font-semibold text-gray-900 dark:text-white">
            {data.name}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {Number(data.value ?? 0).toLocaleString()} ₪
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500">
            {((Number(data.value ?? 0) / (Number(totalExpense ?? 0) || 1)) * 100).toFixed(1)}%
          </p>
        </div>
      )
    }
    return null
  }

  const CustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    const RADIAN = Math.PI / 180
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    const percentage = (percent * 100).toFixed(1)

    // Only show label if percentage is significant (more than 3%)
    if (percent < 0.03) return null

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        fontSize={12}
        fontWeight="bold"
        className="pointer-events-none"
      >
        {`${name}: ${percentage}%`}
      </text>
    )
  }

  const CustomLegend = ({ payload }: any) => {
    if (!payload || payload.length === 0) return null
    
    return (
      <div className="flex flex-wrap justify-center gap-3 mt-4">
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div 
              className="w-3 h-3 rounded-full flex-shrink-0" 
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {entry.value}
            </span>
          </div>
        ))}
      </div>
    )
  }

  // Filter out categories with zero or negative amounts
  const validChartData = chartData.filter(item => item.value > 0)

  if (!validChartData || validChartData.length === 0) {
    return (
      <div className="w-full bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white text-center mb-1">
            הוצאות לפי קטגוריה
          </h3>
        </div>
        <div className="h-96 flex items-center justify-center">
          <p className="text-gray-500 dark:text-gray-400 text-center">
            אין נתוני הוצאות להצגה
          </p>
        </div>
      </div>
    )
  }

  const renderChart = () => {
    if (chartType === 'pie') {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={validChartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={CustomLabel}
              outerRadius={120}
              fill="#8884d8"
              dataKey="value"
            >
              {validChartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend content={<CustomLegend />} />
          </PieChart>
        </ResponsiveContainer>
      )
    }

    if (chartType === 'bar') {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={validChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="amount" fill="#8884d8">
              {validChartData.map((entry, index) => (
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
          <LineChart data={validChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="amount" stroke="#8884d8" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      )
    }

    return null
  }

  return (
    <div className="w-full bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white text-center mb-1">
          הוצאות לפי קטגוריה
        </h3>
      </div>

      {/* Chart Type Selection */}
      <div className="mb-6 flex justify-center">
        <div className="bg-gray-100 dark:bg-gray-700 p-1 rounded-lg flex items-center gap-1">
          <button
            onClick={() => setChartType('pie')}
            className={`p-2 rounded-md transition-all flex items-center gap-2 ${chartType === 'pie' ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
            title="גרף עוגה"
          >
            <PieChartIcon className="w-5 h-5" />
            <span className="text-sm font-medium hidden sm:inline">עוגה</span>
          </button>
          <button
            onClick={() => setChartType('bar')}
            className={`p-2 rounded-md transition-all flex items-center gap-2 ${chartType === 'bar' ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
            title="גרף עמודות"
          >
            <BarChartIcon className="w-5 h-5" />
            <span className="text-sm font-medium hidden sm:inline">עמודות</span>
          </button>
          <button
            onClick={() => setChartType('line')}
            className={`p-2 rounded-md transition-all flex items-center gap-2 ${chartType === 'line' ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
            title="גרף קו"
          >
            <Activity className="w-5 h-5" />
            <span className="text-sm font-medium hidden sm:inline">קו</span>
          </button>
        </div>
      </div>
      
      <div className="h-96 mb-6">
        {renderChart()}
      </div>
      
    </div>
  )
}
