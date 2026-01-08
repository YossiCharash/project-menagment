import React from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'

interface ExpensePieChartMiniProps {
  expenseCategories: Array<{
    category: string
    amount: number
    color: string
  }>
}

export default function ExpensePieChartMini({ expenseCategories }: ExpensePieChartMiniProps) {
  const totalExpenses = expenseCategories.reduce((sum, cat) => sum + cat.amount, 0)

  if (expenseCategories.length === 0) {
    return (
      <div className="w-full h-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-center">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <div className="text-sm mb-1">אין הוצאות להצגה</div>
          <div className="text-xs">לא נרשמו הוצאות עבור פרויקט זה</div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white text-center">
          פילוח הוצאות
        </h3>
      </div>
      
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={expenseCategories}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
              outerRadius={70}
              fill="#8884d8"
              dataKey="amount"
            >
              {expenseCategories.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip 
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0]
                  return (
                    <div className="bg-white dark:bg-gray-800 p-2 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                      <p className="font-semibold text-xs text-gray-900 dark:text-white">
                        {data.name}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {data.value?.toLocaleString()} ₪
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500">
                        {totalExpenses > 0 ? ((Number(data.value) / totalExpenses) * 100).toFixed(1) : 0}%
                      </p>
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
      </div>
      
      <div className="mt-2 text-center">
        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          סה״כ: {Number(totalExpenses ?? 0).toLocaleString()} ₪
        </div>
      </div>
    </div>
  )
}

