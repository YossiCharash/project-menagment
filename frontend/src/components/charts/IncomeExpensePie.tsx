import { Pie, PieChart, ResponsiveContainer, Tooltip, Cell } from 'recharts'

export default function IncomeExpensePie({ income, expenses }: { income: number; expenses: number }) {
  const data = [
    { name: 'Income', value: income, color: 'var(--green)' },
    { name: 'Expenses', value: expenses, color: 'var(--red)' },
  ]
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" outerRadius={80} fill="#8884d8" label>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
