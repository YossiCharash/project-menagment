import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export type CategoryPoint = { category: string; income: number; expense: number }

export default function CategoryBarChart({ data }: { data: CategoryPoint[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="category" />
          <YAxis />
          <Tooltip formatter={(value, name) => [String(value), name === 'income' ? 'הכנסה' : 'הוצאה']} />
          <Legend formatter={(value) => (value === 'income' ? 'הכנסה' : 'הוצאה')} />
          <Bar dataKey="income" fill="var(--green)" />
          <Bar dataKey="expense" fill="var(--red)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )}
