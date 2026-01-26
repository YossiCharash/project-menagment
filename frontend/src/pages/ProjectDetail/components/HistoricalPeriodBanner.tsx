import {motion} from 'framer-motion'
import {ChevronLeft, ChevronRight, History} from 'lucide-react'
import {formatDate} from '../../../lib/utils'

interface Period {
    period_id: number
    contract_year: number
    year_label?: string
    start_date: string
    end_date: string | null
}

interface HistoricalPeriodBannerProps {
    selectedPeriod: Period | null
    prevPeriod: Period | null
    nextPeriod: Period | null
    onNavigateToPeriod: (periodId: number) => void
    onReturnToCurrent: () => void
}

export default function HistoricalPeriodBanner({
    selectedPeriod,
    prevPeriod,
    nextPeriod,
    onNavigateToPeriod,
    onReturnToCurrent
}: HistoricalPeriodBannerProps) {
    if (!selectedPeriod) return null

    return (
        <motion.div
            initial={{opacity: 0, y: -10}}
            animate={{opacity: 1, y: 0}}
            className="bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl shadow-lg p-4"
        >
            <div className="flex items-center justify-between gap-3">
                {/* Left side: Next period arrow or return to current */}
                <div className="flex items-center gap-2">
                    {nextPeriod ? (
                        <button
                            onClick={() => onNavigateToPeriod(nextPeriod.period_id)}
                            className="p-2 bg-white text-orange-600 rounded-lg hover:bg-orange-50 transition-all shadow-md flex items-center gap-1 group"
                            title="לתקופה הבאה"
                        >
                            <ChevronLeft className="w-6 h-6 group-hover:-translate-x-0.5 transition-transform"/>
                            <span className="hidden sm:inline font-medium px-1">לתקופה הבאה</span>
                        </button>
                    ) : (
                        <button
                            onClick={onReturnToCurrent}
                            className="px-4 py-2 bg-white text-orange-600 font-medium rounded-lg hover:bg-orange-50 transition-all flex items-center shadow-md"
                        >
                            חזור לתקופה נוכחית
                        </button>
                    )}
                </div>

                {/* Middle/Right: Info and Previous arrow */}
                <div className="flex items-center gap-4">
                    <div className="text-right flex flex-col items-end">
                        <div className="flex items-center gap-2">
                            <p className="font-bold text-lg leading-tight">
                                צפייה בתקופה היסטורית
                            </p>
                            <div className="p-1 bg-white/20 rounded-md">
                                <History className="w-5 h-5"/>
                            </div>
                        </div>
                        <p className="text-white/90 text-sm">
                            {selectedPeriod?.year_label ? `שנת ${selectedPeriod.contract_year} - ${selectedPeriod.year_label}` : `שנת ${selectedPeriod?.contract_year}`}
                            {' | '}
                            {selectedPeriod && formatDate(selectedPeriod.start_date)} - {selectedPeriod && formatDate(selectedPeriod.end_date)}
                        </p>
                    </div>

                    {prevPeriod && (
                        <button
                            onClick={() => onNavigateToPeriod(prevPeriod.period_id)}
                            className="p-2 bg-white text-orange-600 rounded-lg hover:bg-orange-50 transition-all shadow-md flex items-center gap-1 group"
                            title="לתקופה הקודמת"
                        >
                            <span className="hidden sm:inline font-medium px-1">לתקופה הקודמת</span>
                            <ChevronRight className="w-6 h-6 group-hover:translate-x-0.5 transition-transform"/>
                        </button>
                    )}
                </div>
            </div>
        </motion.div>
    )
}
