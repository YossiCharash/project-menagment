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
  
  // Create data for the charts
  const chartData = [
    {
      name: 'הכנסות',
      value: totalIncome,
      amount: totalIncome,
      color: COLORS.income,
      fill: COLORS.income
    },
    ...expenseCategories.map(cat => ({
      name: cat.category,
      value: cat.amount,
      amount: cat.amount,
      color: cat.color,
      fill: cat.color
    }))
  ]

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
            {((Number(data.value ?? 0) / (Number(totalIncome ?? 0) + Number(totalExpense ?? 0))) * 100).toFixed(1)}%
          </p>
        </div>
      )
    }
    return null
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

  const renderChart = () => {
    if (chartType === 'pie') {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius={120}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
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
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="amount" fill="#8884d8">
              {chartData.map((entry, index) => (
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
          <LineChart data={chartData}>
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
          סקירה פיננסית כללית
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
          הכנסות והוצאות לפי קטגוריות
        </p>
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
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
        <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
          <div className="text-green-600 dark:text-green-400 font-semibold text-sm mb-1">
            סה״כ הכנסות
          </div>
          <div className="text-xl font-bold text-green-700 dark:text-green-300">
            {Number(totalIncome ?? 0).toLocaleString()} ₪
          </div>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
          <div className="text-red-600 dark:text-red-400 font-semibold text-sm mb-1">
            סה״כ הוצאות
          </div>
          <div className="text-xl font-bold text-red-700 dark:text-red-300">
            {Number(totalExpense ?? 0).toLocaleString()} ₪
          </div>
        </div>
        <div className={`p-3 rounded-lg ${
          (Number(totalIncome ?? 0) - Number(totalExpense ?? 0)) >= 0 
            ? 'bg-green-50 dark:bg-green-900/20' 
            : 'bg-red-50 dark:bg-red-900/20'
        }`}>
          <div className={`font-semibold text-sm mb-1 ${
            (Number(totalIncome ?? 0) - Number(totalExpense ?? 0)) >= 0 
              ? 'text-green-600 dark:text-green-400' 
              : 'text-red-600 dark:text-red-400'
          }`}>
            סה״כ רווח/הפסד
          </div>
          <div className={`text-xl font-bold ${
            (Number(totalIncome ?? 0) - Number(totalExpense ?? 0)) >= 0 
              ? 'text-green-700 dark:text-green-300' 
              : 'text-red-700 dark:text-red-300'
          }`}>
            {(Number(totalIncome ?? 0) - Number(totalExpense ?? 0)) >= 0 ? '+' : ''}
            {Number(Number(totalIncome ?? 0) - Number(totalExpense ?? 0)).toLocaleString()} ₪
          </div>
        </div>
      </div>
    </div>
  )
}
