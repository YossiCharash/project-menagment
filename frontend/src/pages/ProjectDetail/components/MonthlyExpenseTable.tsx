import {motion} from 'framer-motion'
import {Transaction, SplitTransaction} from '../types'
import {splitPeriodTransactionByMonth, formatCurrency} from '../utils'
import {parseLocalDate} from '../../../lib/utils'

interface MonthlyExpenseTableProps {
    transactions: Transaction[]
    projectStartDate: string | null
    projectBudget: {budget_monthly: number; budget_annual: number} | null
    monthlyTableYear: number
    isViewingHistoricalPeriod: boolean
    selectedPeriod: {
        start_date: string
        end_date: string | null
    } | null
    suppliers: Array<{id: number; name: string}>
    onYearChange: (year: number) => void
}

export default function MonthlyExpenseTable({
    transactions,
    projectStartDate,
    projectBudget,
    monthlyTableYear,
    isViewingHistoricalPeriod,
    selectedPeriod,
    suppliers,
    onYearChange
}: MonthlyExpenseTableProps) {
    // Get current date
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() // 0-11 (Jan = 0, Dec = 11)

    // Determine Hebrew year start (July of current year, or previous year if we're before July)
    const hebrewYearStart = currentMonth >= 6 ? currentYear : currentYear - 1 // July = month 6 (0-indexed)
    const hebrewYearStartDate = new Date(hebrewYearStart, 6, 1) // July 1st

    // Get project start date if available
    let projectStartMonthDate: Date | null = null
    if (projectStartDate) {
        try {
            const projectDate = parseLocalDate(projectStartDate)
            if (projectDate) {
                projectStartMonthDate = new Date(projectDate.getFullYear(), projectDate.getMonth(), 1) // Start of month
            }
        } catch (e) {
            // Invalid date, ignore
        }
    }

    // Hebrew month names by calendar month (0=Jan, 11=Dec)
    const monthNamesByCalendarMonth = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

    // Create months array - use historical period dates if viewing one, otherwise use default logic
    const months: Array<{
        year: number;
        month: number;
        monthIndex: number;
        monthKey: string;
        label: string
    }> = []

    if (isViewingHistoricalPeriod && selectedPeriod?.start_date && selectedPeriod?.end_date) {
        // When viewing historical period, show months from that period's date range
        const periodStart = parseLocalDate(selectedPeriod.start_date)
        const periodEnd = parseLocalDate(selectedPeriod.end_date || '')

        if (periodStart && periodEnd && periodEnd >= periodStart) {
            // Start from first day of start month
            let current = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1)
            const endYear = periodEnd.getFullYear()
            const endMonth = periodEnd.getMonth()
            let i = 0

            // Iterate through all months from period start to period end (inclusive)
            while (current.getFullYear() < endYear || (current.getFullYear() === endYear && current.getMonth() <= endMonth)) {
                const year = current.getFullYear()
                const month = current.getMonth()
                const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
                months.push({
                    year,
                    month,
                    monthIndex: i,
                    monthKey,
                    label: monthNamesByCalendarMonth[month]
                })
                i++
                // Move to next month
                current = new Date(year, month + 1, 1)
            }
        }
    }

    // If no months were created (not viewing historical period or invalid dates), use default logic
    if (months.length === 0) {
        // Choose the start date
        let tableStartDate: Date = hebrewYearStartDate

        if (projectStartMonthDate) {
            const projectStartMonth = projectStartMonthDate.getMonth() // 0=Jan, 11=Dec

            // Contract starts January: use calendar year (Jan–Dec) so table starts in January
            if (projectStartMonth === 0) {
                tableStartDate = new Date(monthlyTableYear, 0, 1)
            } else if (projectStartMonthDate > hebrewYearStartDate) {
                // Project start is later than Hebrew year start (e.g. August)
                tableStartDate = projectStartMonthDate
            } else {
                // Project started before Hebrew year start (e.g. May)
                const oneYearAfterProjectStart = new Date(projectStartMonthDate)
                oneYearAfterProjectStart.setMonth(oneYearAfterProjectStart.getMonth() + 12)
                if (now < oneYearAfterProjectStart) {
                    tableStartDate = projectStartMonthDate
                }
            }
        }

        const startYear = tableStartDate.getFullYear()
        const startMonth = tableStartDate.getMonth() // 0-11

        // Create 12 month periods starting from the chosen start date
        for (let i = 0; i < 12; i++) {
            const monthIndex = (startMonth + i) % 12
            const year = startYear + Math.floor((startMonth + i) / 12)
            const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`
            months.push({
                year,
                month: monthIndex,
                monthIndex: i,
                monthKey,
                label: monthNamesByCalendarMonth[monthIndex]
            })
        }
    }

    // Split all transactions by month (including period transactions)
    const allSplits: SplitTransaction[] = []
    transactions.forEach((tx: Transaction) => {
        const splits = splitPeriodTransactionByMonth(tx)
        allSplits.push(...splits)
    })

    // Filter out fund transactions
    const regularSplits = allSplits.filter(s => !s.from_fund)

    // Group by month, category, and supplier
    const monthlyData: Record<string, {
        income: number
        expenses: Record<string, Record<string, number>> // category -> supplier -> amount
        totalExpenses: number
    }> = {}

    // Initialize all months
    months.forEach(m => {
        monthlyData[m.monthKey] = {
            income: 0,
            expenses: {},
            totalExpenses: 0
        }
    })

    // Process transactions
    regularSplits.forEach(split => {
        const monthKey = split.monthKey
        if (monthlyData[monthKey]) {
            if (split.type === 'Income') {
                monthlyData[monthKey].income += split.proportionalAmount
            } else if (split.type === 'Expense') {
                const category = split.category || 'אחר'
                const supplierId = split.supplier_id
                const supplierName = supplierId ? (suppliers.find(s => s.id === supplierId)?.name || `[ספק ${supplierId}]`) : 'ללא ספק'

                if (!monthlyData[monthKey].expenses[category]) {
                    monthlyData[monthKey].expenses[category] = {}
                }
                monthlyData[monthKey].expenses[category][supplierName] = (monthlyData[monthKey].expenses[category][supplierName] || 0) + split.proportionalAmount
                monthlyData[monthKey].totalExpenses += split.proportionalAmount
            }
        }
    })

    // Get all unique category-supplier combinations
    const categorySupplierPairs = new Set<string>()
    Object.values(monthlyData).forEach(month => {
        Object.keys(month.expenses).forEach(category => {
            Object.keys(month.expenses[category]).forEach(supplier => {
                categorySupplierPairs.add(`${category}|||${supplier}`)
            })
        })
    })

    // Convert to array and sort
    const categorySupplierList = Array.from(categorySupplierPairs)
        .map(pair => {
            const [category, supplier] = pair.split('|||')
            return {category, supplier}
        })
        .sort((a, b) => {
            // Sort by category first, then by supplier
            if (a.category !== b.category) {
                return a.category.localeCompare(b.category)
            }
            return a.supplier.localeCompare(b.supplier)
        })

    // Calculate main supplier for each category (by total amount)
    const categorySuppliers: Record<string, number | null> = {}
    // Get unique categories from categorySupplierList
    const uniqueCategories = Array.from(new Set(categorySupplierList.map(item => item.category)))
    uniqueCategories.forEach(category => {
        const supplierAmounts: Record<number, number> = {}
        regularSplits.forEach(split => {
            if (split.type === 'Expense' && (split.category || 'אחר') === category && split.supplier_id) {
                supplierAmounts[split.supplier_id] = (supplierAmounts[split.supplier_id] || 0) + split.proportionalAmount
            }
        })
        // Find supplier with highest amount
        let mainSupplierId: number | null = null
        let maxAmount = 0
        Object.entries(supplierAmounts).forEach(([supplierId, amount]) => {
            if (amount > maxAmount) {
                maxAmount = amount
                mainSupplierId = parseInt(supplierId)
            }
        })
        categorySuppliers[category] = mainSupplierId
    })

    // Helper function to check if we've reached a month (month has started or passed)
    const hasReachedMonth = (year: number, month: number): boolean => {
        const now = new Date()
        const currentYear = now.getFullYear()
        const currentMonth = now.getMonth() // 0-11
        const monthDate = new Date(year, month, 1)
        const currentDate = new Date(currentYear, currentMonth, 1)
        return monthDate <= currentDate
    }

    // Helper function to check if a month has any transactions (past, present, or future)
    const hasMonthTransactions = (monthKey: string): boolean => {
        const monthData = monthlyData[monthKey]
        if (!monthData) return false
        // Check if there are any transactions (income or expenses) for this month
        return monthData.income > 0 || monthData.totalExpenses > 0
    }

    // Get monthly budget amount (the fixed amount collected from tenants each month)
    const monthlyBudgetAmount = Number(projectBudget?.budget_monthly || 0)

    // Calculate monthly income - combine actual transactions with monthly budget
    // For months that have been reached, add the monthly budget amount
    // Always include the first month (monthIndex === 0) even if it hasn't been reached yet
    const monthlyIncome = months.map((m, monthIndex) => {
        const transactionIncome = monthlyData[m.monthKey].income
        const hasReached = hasReachedMonth(m.year, m.month)
        // Add monthly budget if we've reached this month and there's a budget
        // Always include budget for the first month if there's a budget
        if ((monthIndex === 0 || hasReached) && monthlyBudgetAmount > 0) {
            return transactionIncome + monthlyBudgetAmount
        }
        return transactionIncome
    })

    // Calculate total expenses per month
    const monthlyTotals = months.map(m => monthlyData[m.monthKey].totalExpenses)

    // Calculate running totals (cumulative) - accumulates month by month
    // Include future months if they have transactions
    let runningTotal = 0
    const runningTotals: number[] = []
    months.forEach((m, monthIndex) => {
        const monthData = monthlyData[m.monthKey]
        const hasReached = hasReachedMonth(m.year, m.month)
        const hasTransactions = hasMonthTransactions(m.monthKey)
        // Accumulate if we've reached this month OR if there are transactions for this month
        // Always include the first month (monthIndex === 0) even if it hasn't been reached yet
        if (monthIndex === 0 || hasReached || hasTransactions) {
            const monthBalance = monthlyIncome[monthIndex] - monthData.totalExpenses
            runningTotal += monthBalance
        }
        runningTotals.push(runningTotal)
    })

    const projectStartsInJanuary = projectStartMonthDate !== null && projectStartMonthDate.getMonth() === 0
    const projectStartYear = projectStartMonthDate ? projectStartMonthDate.getFullYear() : currentYear
    const yearOptions = Array.from({length: currentYear - projectStartYear + 1}, (_, i) => projectStartYear + i)

    return (
        <motion.div
            initial={{opacity: 0, y: 20}}
            animate={{opacity: 1, y: 0}}
            transition={{duration: 0.3}}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4"
        >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white text-right">
                    דוח הוצאות חודשי
                </h2>
                {projectStartsInJanuary && !isViewingHistoricalPeriod && (
                    <label className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">שנה:</span>
                        <select
                            value={monthlyTableYear}
                            onChange={(e) => onYearChange(parseInt(e.target.value, 10))}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {yearOptions.map((y) => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </label>
                )}
            </div>
            <div className="overflow-x-auto" dir="rtl">
                <table className="w-full border-collapse text-xs">
                    <thead>
                    <tr>
                        <th className="border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-2 py-1 text-right font-semibold text-gray-900 dark:text-white sticky left-0 z-10 min-w-[120px]">
                            קטגוריה
                        </th>
                        <th className="border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-2 py-1 text-right font-semibold text-gray-900 dark:text-white sticky left-[120px] z-10 min-w-[120px]">
                            ספק
                        </th>
                        {months.map((m, idx) => (
                            <th key={idx}
                                className="border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-1 py-1 text-center font-semibold text-gray-900 dark:text-white min-w-[60px]">
                                {m.label}
                            </th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {/* Expense category-supplier rows */}
                    {categorySupplierList.map((item, idx) => (
                        <tr key={idx}>
                            <td className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-right text-gray-900 dark:text-white sticky left-0 z-10">
                                {item.category}
                            </td>
                            <td className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-right text-gray-900 dark:text-white sticky left-[120px] z-10">
                                {item.supplier}
                            </td>
                            {months.map((m, monthIdx) => {
                                const hasReached = hasReachedMonth(m.year, m.month)
                                const hasTransactions = hasMonthTransactions(m.monthKey)
                                // Show if month has been reached OR if there are transactions for this month
                                // Always show the first month (monthIdx === 0) even if it hasn't been reached yet
                                const shouldShow = monthIdx === 0 || hasReached || hasTransactions
                                const amount = monthlyData[m.monthKey].expenses[item.category]?.[item.supplier] || 0
                                return (
                                    <td key={monthIdx}
                                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-2 text-center text-gray-900 dark:text-white">
                                        {shouldShow && amount > 0
                                            ? formatCurrency(amount)
                                            : shouldShow ? '0' : ''}
                                    </td>
                                )
                            })}
                        </tr>
                    ))}

                    {/* Empty rows for spacing (if needed) */}
                    {categorySupplierList.length === 0 && (
                        <tr>
                            <td colSpan={14}
                                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-center text-gray-500 dark:text-gray-400">
                                אין הוצאות להצגה
                            </td>
                        </tr>
                    )}

                    {/* סה"כ בקופה החודשית (Total in monthly fund) - Pink */}
                    <tr>
                        <td colSpan={2}
                            className="border border-gray-300 dark:border-gray-600 bg-pink-200 dark:bg-pink-900 px-2 py-1 text-right font-semibold text-gray-900 dark:text-white sticky left-0 z-10">
                            סה"כ בקופה החודשית
                        </td>
                        {months.map((m, monthIdx) => {
                            const hasReached = hasReachedMonth(m.year, m.month)
                            const hasTransactions = hasMonthTransactions(m.monthKey)
                            // Show if month has been reached OR if there are transactions for this month
                            // Always show the first month (monthIdx === 0) even if it hasn't been reached yet
                            const shouldShow = monthIdx === 0 || hasReached || hasTransactions
                            return (
                                <td key={monthIdx}
                                    className="border border-gray-300 dark:border-gray-600 bg-pink-200 dark:bg-pink-900 px-1 py-1 text-center font-semibold text-gray-900 dark:text-white">
                                    {shouldShow ? formatCurrency(monthlyIncome[monthIdx]) : ''}
                                </td>
                            )
                        })}
                    </tr>

                    {/* הוצאות (Expenses) - Yellow */}
                    <tr>
                        <td colSpan={2}
                            className="border border-gray-300 dark:border-gray-600 bg-yellow-200 dark:bg-yellow-900 px-2 py-1 text-right font-semibold text-gray-900 dark:text-white sticky left-0 z-10">
                            הוצאות
                        </td>
                        {months.map((m, monthIdx) => {
                            const hasReached = hasReachedMonth(m.year, m.month)
                            const hasTransactions = hasMonthTransactions(m.monthKey)
                            // Show if month has been reached OR if there are transactions for this month
                            // Always show the first month (monthIdx === 0) even if it hasn't been reached yet
                            const shouldShow = monthIdx === 0 || hasReached || hasTransactions
                            return (
                                <td key={monthIdx}
                                    className="border border-gray-300 dark:border-gray-600 bg-yellow-200 dark:bg-yellow-900 px-1 py-1 text-center font-semibold text-gray-900 dark:text-white">
                                    {shouldShow ? formatCurrency(monthlyTotals[monthIdx]) : ''}
                                </td>
                            )
                        })}
                    </tr>

                    {/* עודף (Surplus/Balance) - Light Blue */}
                    <tr>
                        <td colSpan={2}
                            className="border border-gray-300 dark:border-gray-600 bg-blue-200 dark:bg-blue-900 px-2 py-1 text-right font-semibold text-gray-900 dark:text-white sticky left-0 z-10">
                            עודף
                        </td>
                        {months.map((m, monthIdx) => {
                            const hasReached = hasReachedMonth(m.year, m.month)
                            const hasTransactions = hasMonthTransactions(m.monthKey)
                            // Show if month has been reached OR if there are transactions for this month
                            // Always show the first month (monthIdx === 0) even if it hasn't been reached yet
                            const shouldShow = monthIdx === 0 || hasReached || hasTransactions
                            const balance = monthlyIncome[monthIdx] - monthlyTotals[monthIdx]
                            return (
                                <td key={monthIdx}
                                    className="border border-gray-300 dark:border-gray-600 bg-blue-200 dark:bg-blue-900 px-1 py-1 text-center font-semibold text-gray-900 dark:text-white">
                                    {shouldShow ? formatCurrency(balance) : ''}
                                </td>
                            )
                        })}
                    </tr>

                    {/* סה"כ בקופה השנתית (Total in annual fund) - Light Green */}
                    <tr>
                        <td colSpan={2}
                            className="border border-gray-300 dark:border-gray-600 bg-green-200 dark:bg-green-900 px-2 py-1 text-right font-semibold text-gray-900 dark:text-white sticky left-0 z-10">
                            סה"כ בקופה השנתית
                        </td>
                        {months.map((m, monthIdx) => {
                            const hasReached = hasReachedMonth(m.year, m.month)
                            const hasTransactions = hasMonthTransactions(m.monthKey)
                            // Show if month has been reached OR if there are transactions for this month
                            // Always show the first month (monthIdx === 0) even if it hasn't been reached yet
                            const shouldShow = monthIdx === 0 || hasReached || hasTransactions
                            return (
                                <td key={monthIdx}
                                    className="border border-gray-300 dark:border-gray-600 bg-green-200 dark:bg-green-900 px-1 py-1 text-center font-semibold text-gray-900 dark:text-white">
                                    {shouldShow ? formatCurrency(runningTotals[monthIdx]) : ''}
                                </td>
                            )
                        })}
                    </tr>
                    </tbody>
                </table>
            </div>
        </motion.div>
    )
}
