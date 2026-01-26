import {motion} from 'framer-motion'
import {formatDate, parseLocalDate} from '../../../lib/utils'

interface Period {
    period_id: number
    contract_year: number
    year_label?: string
    start_date: string
    end_date: string | null
}

interface GlobalDateFilterProps {
    isViewingHistoricalPeriod: boolean
    selectedPeriod: Period | null
    globalDateFilterMode: 'current_month' | 'selected_month' | 'date_range' | 'project' | 'all_time'
    globalSelectedMonth: string
    globalStartDate: string
    globalEndDate: string
    projectStartDate: string | null
    onDateFilterModeChange: (mode: 'current_month' | 'selected_month' | 'date_range' | 'project' | 'all_time') => void
    onSelectedMonthChange: (month: string) => void
    onStartDateChange: (date: string) => void
    onEndDateChange: (date: string) => void
}

export default function GlobalDateFilter({
    isViewingHistoricalPeriod,
    selectedPeriod,
    globalDateFilterMode,
    globalSelectedMonth,
    globalStartDate,
    globalEndDate,
    projectStartDate,
    onDateFilterModeChange,
    onSelectedMonthChange,
    onStartDateChange,
    onEndDateChange
}: GlobalDateFilterProps) {
    return (
        <motion.div
            initial={{opacity: 0, y: 20}}
            animate={{opacity: 1, y: 0}}
            transition={{delay: 0.02}}
            className={`rounded-2xl shadow-sm border p-4 ${
                isViewingHistoricalPeriod
                    ? 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-gray-800 dark:to-gray-800 border-amber-200 dark:border-gray-700'
                    : 'bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-gray-800 dark:to-gray-800 border-indigo-200 dark:border-gray-700'
            }`}
        >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <svg
                        className={`w-5 h-5 ${isViewingHistoricalPeriod ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-400'}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                    <h3 className={`text-lg font-semibold ${isViewingHistoricalPeriod ? 'text-amber-900 dark:text-white' : 'text-indigo-900 dark:text-white'}`}>
                        {isViewingHistoricalPeriod ? 'צפייה בתקופה היסטורית' : 'סינון לפי תאריך'}
                    </h3>
                </div>

                {/* Hide filter controls when viewing historical period - data is already filtered by period */}
                {!isViewingHistoricalPeriod && (
                    <div className="flex flex-wrap items-center gap-3">
                        <select
                            value={globalDateFilterMode}
                            onChange={(e) => onDateFilterModeChange(e.target.value as any)}
                            className="px-4 py-2 border border-indigo-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500 font-medium"
                        >
                            <option value="current_month">חודש נוכחי</option>
                            <option value="selected_month">חודש ספציפי</option>
                            <option value="date_range">טווח תאריכים</option>
                            <option value="project">מתחילת הפרויקט</option>
                            <option value="all_time">כל הזמן</option>
                        </select>

                        {globalDateFilterMode === 'selected_month' && (
                            <input
                                type="month"
                                value={globalSelectedMonth}
                                onChange={(e) => onSelectedMonthChange(e.target.value)}
                                className="px-4 py-2 border border-indigo-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500"
                            />
                        )}

                        {globalDateFilterMode === 'date_range' && (
                            <div className="flex items-center gap-2">
                                <input
                                    type="date"
                                    value={globalStartDate}
                                    onChange={(e) => onStartDateChange(e.target.value)}
                                    className="px-3 py-2 border border-indigo-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500"
                                    placeholder="מתאריך"
                                />
                                <span className="text-gray-500 font-medium">עד</span>
                                <input
                                    type="date"
                                    value={globalEndDate}
                                    onChange={(e) => onEndDateChange(e.target.value)}
                                    min={globalStartDate}
                                    className="px-3 py-2 border border-indigo-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500"
                                    placeholder="עד תאריך"
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Filter description */}
            <div
                className={`mt-2 text-sm ${isViewingHistoricalPeriod ? 'text-amber-700 dark:text-amber-300' : 'text-indigo-700 dark:text-indigo-300'}`}>
                {isViewingHistoricalPeriod && selectedPeriod ? (
                    <span>
                        מציג נתונים מתקופה: {selectedPeriod.year_label ? `שנת ${selectedPeriod.contract_year} - ${selectedPeriod.year_label}` : `שנת ${selectedPeriod.contract_year}`}
                        {' '}({formatDate(selectedPeriod.start_date)} - {formatDate(selectedPeriod.end_date || '')})
                    </span>
                ) : (
                    <>
                        {globalDateFilterMode === 'current_month' && (
                            <span>מציג נתונים מהחודש הנוכחי ({new Date().toLocaleDateString('he-IL', {
                                month: 'long',
                                year: 'numeric'
                            })})</span>
                        )}
                        {globalDateFilterMode === 'selected_month' && globalSelectedMonth && (
                            <span>מציג נתונים מחודש {new Date(globalSelectedMonth + '-01').toLocaleDateString('he-IL', {
                                month: 'long',
                                year: 'numeric'
                            })}</span>
                        )}
                        {globalDateFilterMode === 'date_range' && globalStartDate && globalEndDate && (
                            <span>מציג נתונים מ-{parseLocalDate(globalStartDate)?.toLocaleDateString('he-IL')} עד {parseLocalDate(globalEndDate)?.toLocaleDateString('he-IL')}</span>
                        )}
                        {globalDateFilterMode === 'project' && (
                            <span>מציג נתונים מתחילת הפרויקט {projectStartDate ? `(${parseLocalDate(projectStartDate)?.toLocaleDateString('he-IL')})` : ''}</span>
                        )}
                        {globalDateFilterMode === 'all_time' && (
                            <span>מציג את כל הנתונים ללא הגבלת תאריך</span>
                        )}
                    </>
                )}
            </div>
        </motion.div>
    )
}
