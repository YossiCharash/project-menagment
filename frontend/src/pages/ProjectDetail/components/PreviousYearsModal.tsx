import {motion} from 'framer-motion'
import {Download, Eye} from 'lucide-react'
import {formatDate, parseLocalDate, dateToLocalString} from '../../../lib/utils'
import {ProjectAPI} from '../../../lib/apiClient'

interface Period {
    period_id: number
    start_date: string
    end_date: string
    year_index: number
    year_label?: string
}

interface YearGroup {
    year: number
    periods: Period[]
}

interface ContractPeriods {
    periods_by_year: YearGroup[]
}

interface PreviousYearsModalProps {
    isOpen: boolean
    loadingPeriodSummary: boolean
    contractPeriods: ContractPeriods | null
    projectName: string
    projectId: string
    onClose: () => void
    onNavigateToPeriod: (periodId: number) => void
}

export default function PreviousYearsModal({
    isOpen,
    loadingPeriodSummary,
    contractPeriods,
    projectName,
    projectId,
    onClose,
    onNavigateToPeriod
}: PreviousYearsModalProps) {
    if (!isOpen) return null

    const handleExportYear = async (year: number) => {
        try {
            const blob = await ProjectAPI.exportContractYearCSV(parseInt(projectId), year)
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            const safeProjectName = (projectName || 'project').replace(/[^a-zA-Z0-9_\-]/g, '_')
            link.setAttribute('download', `${safeProjectName}_year_${year}.xlsx`)
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.URL.revokeObjectURL(url)
        } catch (err) {
            console.error('Error exporting year CSV:', err)
            alert('שגיאה בייצוא קובץ שנה')
        }
    }

    const handleExportPeriod = async (period: Period) => {
        try {
            const blob = await ProjectAPI.exportContractPeriodCSV(
                parseInt(projectId),
                period.period_id,
                period.start_date,
                period.end_date
            )
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            const safeProjectName = (projectName || 'project').replace(/[^a-zA-Z0-9_\-]/g, '_')
            const yearLabel = period.year_label || `period_${period.period_id}`
            const safeYearLabel = yearLabel.replace(/[^a-zA-Z0-9_\-א-ת]/g, '_')
            link.setAttribute('download', `${safeProjectName}_${safeYearLabel}.xlsx`)
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.URL.revokeObjectURL(url)
        } catch (err) {
            console.error('Error exporting CSV:', err)
            alert('שגיאה בייצוא קובץ תקופה')
        }
    }

    return (
        <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{opacity: 0, scale: 0.95}}
                animate={{opacity: 1, scale: 1}}
                exit={{opacity: 0, scale: 0.95}}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                        שנים קודמות
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                    {loadingPeriodSummary ? (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            טוען...
                        </div>
                    ) : !contractPeriods ? (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            טוען תקופות חוזה...
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Show previous periods only (not the current period) */}
                            {contractPeriods?.periods_by_year && contractPeriods.periods_by_year.length > 0 && (
                                <>
                                    {contractPeriods.periods_by_year.map((yearGroup) => (
                                        <div key={yearGroup.year}
                                             className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 shadow-sm">
                                            <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
                                                <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                                    <span className="text-blue-600 dark:text-blue-400">📅</span>
                                                    שנת {yearGroup.year}
                                                </h3>
                                                <button
                                                    onClick={() => handleExportYear(yearGroup.year)}
                                                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium shadow-sm"
                                                    title={`הורד סיכום שנתי לשנת ${yearGroup.year}`}
                                                >
                                                    <Download className="w-4 h-4"/>
                                                    הורד סיכום שנתי
                                                </button>
                                            </div>
                                            <div className="space-y-3">
                                                {yearGroup.periods.map((period) => (
                                                    <div
                                                        key={period.period_id || `${period.start_date}-${period.end_date}`}
                                                        className="bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600 rounded-xl p-4 hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-200 group"
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <div
                                                                className="flex-1 cursor-pointer"
                                                                onClick={() => {
                                                                    if (period.period_id) {
                                                                        onNavigateToPeriod(period.period_id)
                                                                    }
                                                                }}
                                                            >
                                                                <div className="font-bold text-gray-900 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                                    {period.year_label || `תקופה ${period.year_index || ''}`}
                                                                </div>
                                                                <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                                                                    <span>📅</span>
                                                                    {period.start_date && period.end_date ? (
                                                                        (() => {
                                                                            const start = parseLocalDate(period.start_date);
                                                                            const end = parseLocalDate(period.end_date);
                                                                            if (!start || !end) {
                                                                                return `\u200E${formatDate(period.start_date)} - ${formatDate(period.end_date)}`;
                                                                            }
                                                                            const displayStart = start <= end ? start : end;
                                                                            const displayEnd = start <= end ? end : start;
                                                                            return `\u200E${formatDate(dateToLocalString(displayStart))} - ${formatDate(dateToLocalString(displayEnd))}`;
                                                                        })()
                                                                    ) : period.start_date ? formatDate(period.start_date) : ''}
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        handleExportPeriod(period)
                                                                    }}
                                                                    className="px-3 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors flex items-center gap-2 text-sm font-medium"
                                                                    title="הורד פירוט תקופתי"
                                                                >
                                                                    <Download className="w-4 h-4"/>
                                                                    <span className="hidden sm:inline">הורדה</span>
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        if (period.period_id) {
                                                                            onNavigateToPeriod(period.period_id)
                                                                        }
                                                                    }}
                                                                    className="px-3 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-2 text-sm font-medium"
                                                                    title="צפה בתקופה"
                                                                >
                                                                    <Eye className="w-4 h-4"/>
                                                                    <span className="hidden sm:inline">צפייה</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}

                            {/* Show message if no previous periods */}
                            {(!contractPeriods?.periods_by_year || contractPeriods.periods_by_year.length === 0) && (
                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                    <p className="text-lg mb-2">אין חוזים קודמים</p>
                                    <p className="text-sm">חוזים קודמים יופיעו כאן לאחר חידוש החוזה</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    )
}
