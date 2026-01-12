import { Pie, PieChart, ResponsiveContainer, Tooltip, Cell } from 'recharts'

export default function IncomeExpensePie({ income, expenses }: { income: number; expenses: number }) {
  const allData = [
    { name: 'הכנסות', value: income, color: '#10B981' },
    { name: 'הוצאות', value: expenses, color: '#EF4444' },
  ]
  
  // Filter out zero values
  const data = allData.filter(item => item.value > 0)
  
  // If no data at all, show a placeholder
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <div className="text-4xl mb-2">📊</div>
          <div className="text-sm">אין נתונים להצגה</div>
        </div>
      </div>
    )
  }
  
  // If only one type of data (e.g., only expenses, no income), show with indicator
  const hasOnlyOneType = data.length === 1
  
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0]
      const total = income + expenses
      const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : '100'
      return (
        <div className="bg-white dark:bg-gray-800 p-2 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 text-sm">
          <p className="font-semibold" style={{ color: item.payload.color }}>
            {item.name}
          </p>
          <p className="text-gray-600 dark:text-gray-400">
            {Number(item.value).toLocaleString()} ₪
          </p>
          <p className="text-gray-500 text-xs">
            {percentage}%
          </p>
        </div>
      )
    }
    return null
  }
  
  return (
    <div className="h-64 relative flex flex-col items-center">
      {hasOnlyOneType && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          {income === 0 ? 'ללא הכנסות' : 'ללא הוצאות'}
        </div>
      )}
      <div className="flex-1 w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie 
              data={data} 
              dataKey="value" 
              nameKey="name" 
              outerRadius={70} 
              innerRadius={hasOnlyOneType ? 35 : 0}
              fill="#8884d8" 
              label={false}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label for donut chart */}
        {hasOnlyOneType && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {data[0].name}
              </div>
              <div className="text-sm font-bold" style={{ color: data[0].color }}>
                100%
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
