import React from 'react'
import { motion } from 'framer-motion'

interface LineItem {
  name: string
  amount: number | null
}

interface QuoteMonthlyProjectionTableProps {
  lines: LineItem[]
  totalAmount: number
}

const HEBREW_MONTH_NAMES = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

function formatCurrency(amount: number): string {
  return amount.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function buildMonthColumns(): Array<{ label: string; index: number }> {
  const now = new Date()
  const currentMonth = now.getMonth() // 0-11
  const currentYear = now.getFullYear()

  // Hebrew fiscal year starts in July (month index 6)
  const startYear = currentMonth >= 6 ? currentYear : currentYear - 1
  const startMonth = 6 // July

  const months: Array<{ label: string; index: number }> = []
  for (let i = 0; i < 12; i++) {
    const monthIndex = (startMonth + i) % 12
    months.push({
      label: HEBREW_MONTH_NAMES[monthIndex],
      index: i,
    })
  }
  return months
}

const STICKY_HEADER_CLASSES =
  'border border-gray-300 dark:border-gray-600 px-2 py-1 text-right font-semibold text-gray-900 dark:text-white sticky right-0 z-10 min-w-[160px]'

const CELL_CLASSES =
  'border border-gray-300 dark:border-gray-600 px-1 py-1 text-center font-semibold text-gray-900 dark:text-white'

export default function QuoteMonthlyProjectionTable({ lines, totalAmount }: QuoteMonthlyProjectionTableProps) {
  if (lines.length === 0 || totalAmount === 0) return null

  const activeLines = lines.filter((l) => l.amount != null && l.amount > 0)
  if (activeLines.length === 0) return null

  const months = buildMonthColumns()

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4"
    >
      <h2 className="text-xl font-bold text-gray-900 dark:text-white text-right mb-4">
        תחזית ריווחיות שנתית
      </h2>

      <div className="overflow-x-auto" dir="rtl">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className={`${STICKY_HEADER_CLASSES} bg-gray-100 dark:bg-gray-700`}>
                קטגוריה
              </th>
              {months.map((m) => (
                <th
                  key={m.index}
                  className="border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-1 py-1 text-center font-semibold text-gray-900 dark:text-white min-w-[60px]"
                >
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Line item rows */}
            {activeLines.map((line, idx) => (
              <tr key={idx}>
                <td className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-right text-gray-900 dark:text-white sticky right-0 z-10 min-w-[160px]">
                  {line.name}
                </td>
                {months.map((m) => (
                  <td
                    key={m.index}
                    className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-2 text-center text-gray-900 dark:text-white"
                  >
                    {formatCurrency(line.amount!)}
                  </td>
                ))}
              </tr>
            ))}

            {/* Pink: monthly income total */}
            <tr>
              <td className={`${STICKY_HEADER_CLASSES} bg-pink-200 dark:bg-pink-900`}>
                סה"כ הכנסה חודשית
              </td>
              {months.map((m) => (
                <td key={m.index} className={`${CELL_CLASSES} bg-pink-200 dark:bg-pink-900`}>
                  {formatCurrency(totalAmount)}
                </td>
              ))}
            </tr>

            {/* Yellow: expenses */}
            <tr>
              <td className={`${STICKY_HEADER_CLASSES} bg-yellow-200 dark:bg-yellow-900`}>
                הוצאות
              </td>
              {months.map((m) => (
                <td key={m.index} className={`${CELL_CLASSES} bg-yellow-200 dark:bg-yellow-900`}>
                  {formatCurrency(totalAmount)}
                </td>
              ))}
            </tr>

            {/* Blue: surplus */}
            <tr>
              <td className={`${STICKY_HEADER_CLASSES} bg-blue-200 dark:bg-blue-900`}>
                עודף
              </td>
              {months.map((m) => (
                <td key={m.index} className={`${CELL_CLASSES} bg-blue-200 dark:bg-blue-900`}>
                  0
                </td>
              ))}
            </tr>

            {/* Green: cumulative annual total */}
            <tr>
              <td className={`${STICKY_HEADER_CLASSES} bg-green-200 dark:bg-green-900`}>
                סה"כ שנתי מצטבר
              </td>
              {months.map((m) => (
                <td key={m.index} className={`${CELL_CLASSES} bg-green-200 dark:bg-green-900`}>
                  {formatCurrency(totalAmount * (m.index + 1))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}
