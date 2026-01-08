import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export type ExpensePoint = { name: string; expense: number }

export default function ExpenseChart({ data }: { data: ExpensePoint[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip formatter={(value) => [`${value}`, 'הוצאה']} />
          <Bar dataKey="expense" fill="var(--red)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
