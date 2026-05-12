import { useEffect, useMemo, useRef } from 'react'
import { ChevronRight, ChevronLeft, Plus, CalendarDays, Settings } from 'lucide-react'
import {
  Task,
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  EVENT_TYPE_LABELS,
  USER_CALENDAR_COLORS,
  getTaskOccurrences,
} from '../../pages/TaskCalendar'
import {
  formatCalendarDay,
  type CalendarDateDisplay,
  type HolidayEvent,
} from '../../lib/calendarUtils'
import { cn } from '../../lib/utils'

interface OutlookMobileCalendarProps {
  tasks: Task[]
  jewishHolidays?: HolidayEvent[]
  islamicHolidays?: HolidayEvent[]
  selectedDate: Date
  onSelectDate: (d: Date) => void
  onMonthChange: (start: Date, end: Date) => void
  onEventClick: (task: Task) => void
  onCreateClick: () => void
  onOpenFilters?: () => void
  canCreate: boolean
  calendarDateDisplay: CalendarDateDisplay
}

const HEBREW_WEEKDAY_INITIALS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']
const HEBREW_WEEKDAY_FULL = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

const SWIPE_THRESHOLD_PX = 50

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

function startOfWeek(d: Date): Date {
  const x = startOfDay(d)
  const day = x.getDay() // 0 = Sunday
  x.setDate(x.getDate() - day)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function formatTimeHM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface DayBucket {
  tasks: { task: Task; start: Date; end: Date; allDay: boolean; color: string }[]
  holidays: HolidayEvent[]
}

export default function OutlookMobileCalendar({
  tasks,
  jewishHolidays = [],
  islamicHolidays = [],
  selectedDate,
  onSelectDate,
  onMonthChange,
  onEventClick,
  onCreateClick,
  onOpenFilters,
  canCreate,
  calendarDateDisplay,
}: OutlookMobileCalendarProps) {
  const today = useMemo(() => startOfDay(new Date()), [])
  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate])
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const monthStart = useMemo(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
    [selectedDate],
  )
  const monthEnd = useMemo(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0, 23, 59, 59),
    [selectedDate],
  )

  const lastMonthRangeRef = useRef<string>('')
  useEffect(() => {
    const key = `${ymd(monthStart)}|${ymd(monthEnd)}`
    if (lastMonthRangeRef.current !== key) {
      lastMonthRangeRef.current = key
      onMonthChange(monthStart, monthEnd)
    }
  }, [monthStart, monthEnd, onMonthChange])

  const dayBuckets = useMemo(() => {
    const buckets = new Map<string, DayBucket>()
    const ensure = (key: string): DayBucket => {
      let b = buckets.get(key)
      if (!b) {
        b = { tasks: [], holidays: [] }
        buckets.set(key, b)
      }
      return b
    }
    const rangeStart = startOfDay(addDays(weekStart, -7))
    const rangeEnd = endOfDay(addDays(weekStart, 21))
    for (const t of tasks) {
      if (!t.start_time || !t.end_time) continue
      const occurrences = getTaskOccurrences(t, rangeStart, rangeEnd)
      const color =
        t.status === 'completed'
          ? TASK_STATUS_COLORS.completed
          : (t.assigned_user_color ?? USER_CALENDAR_COLORS[(t.assigned_to_user_id - 1) % USER_CALENDAR_COLORS.length])
      for (const occ of occurrences) {
        const allDay =
          occ.start.getHours() === 0 && occ.start.getMinutes() === 0 &&
          occ.end.getHours() === 23 && occ.end.getMinutes() === 59
        ensure(ymd(occ.start)).tasks.push({ task: t, start: occ.start, end: occ.end, allDay, color })
      }
    }
    for (const h of [...jewishHolidays, ...islamicHolidays]) {
      const key = h.start.slice(0, 10)
      ensure(key).holidays.push(h)
    }
    return buckets
  }, [tasks, weekStart, jewishHolidays, islamicHolidays])

  const selectedKey = ymd(selectedDate)
  const selectedBucket = dayBuckets.get(selectedKey) ?? { tasks: [], holidays: [] }
  const sortedDayTasks = useMemo(() => {
    return [...selectedBucket.tasks].sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
      return a.start.getTime() - b.start.getTime()
    })
  }, [selectedBucket])

  const headerLabel = `${HEBREW_MONTHS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`
  const selectedFullLabel = `יום ${HEBREW_WEEKDAY_FULL[selectedDate.getDay()]}, ${selectedDate.getDate()} ב${HEBREW_MONTHS[selectedDate.getMonth()]}`

  const goPrevMonth = () => onSelectDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1))
  const goNextMonth = () => onSelectDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1))
  const goToday = () => onSelectDate(new Date())

  const touchStartXRef = useRef<number | null>(null)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartXRef.current
    touchStartXRef.current = null
    if (start == null) return
    const end = e.changedTouches[0]?.clientX ?? start
    const dx = end - start
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return
    // RTL: swipe right (positive dx) = previous week; swipe left (negative dx) = next week
    onSelectDate(addDays(selectedDate, dx > 0 ? -7 : 7))
  }

  return (
    <div className="outlook-mobile-cal flex flex-col bg-gray-50 dark:bg-gray-900 min-h-[70vh] rounded-xl overflow-hidden" dir="rtl">
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-3 py-2.5">
          {onOpenFilters ? (
            <button
              type="button"
              onClick={onOpenFilters}
              aria-label="פתח סינון"
              className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Settings className="w-5 h-5" />
            </button>
          ) : (
            <span className="w-10 h-10" />
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goPrevMonth}
              aria-label="חודש קודם"
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <div className="text-base font-semibold text-gray-900 dark:text-white min-w-[7rem] text-center">
              {headerLabel}
            </div>
            <button
              type="button"
              onClick={goNextMonth}
              aria-label="חודש הבא"
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
          <button
            type="button"
            onClick={goToday}
            className="px-3 h-9 inline-flex items-center rounded-lg text-sm font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/20"
          >
            היום
          </button>
        </div>

        <div
          className="outlook-mobile-cal__strip flex gap-1 px-2 pb-2 overflow-x-auto"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {weekDays.map((d) => {
            const key = ymd(d)
            const bucket = dayBuckets.get(key)
            const isSelected = isSameDay(d, selectedDate)
            const isToday = isSameDay(d, today)
            const dotColors = bucket
              ? Array.from(new Set(bucket.tasks.map((t) => t.color))).slice(0, 3)
              : []
            const dayLabel = formatCalendarDay(d, calendarDateDisplay)
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectDate(d)}
                aria-label={`${HEBREW_WEEKDAY_FULL[d.getDay()]} ${d.getDate()} ב${HEBREW_MONTHS[d.getMonth()]}`}
                aria-pressed={isSelected}
                className={cn(
                  'outlook-mobile-cal__day flex-shrink-0 min-w-[44px] flex flex-col items-center gap-1 py-1.5 rounded-xl',
                  isSelected ? '' : 'hover:bg-gray-100 dark:hover:bg-gray-700/40',
                )}
              >
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                  {HEBREW_WEEKDAY_INITIALS[d.getDay()]}
                </span>
                <span
                  className={cn(
                    'w-10 h-10 inline-flex items-center justify-center rounded-full text-sm font-semibold transition-colors',
                    isSelected
                      ? 'bg-violet-600 text-white'
                      : isToday
                        ? 'ring-2 ring-violet-500 text-violet-700 dark:text-violet-300'
                        : 'text-gray-800 dark:text-gray-100',
                  )}
                >
                  {dayLabel}
                </span>
                <span className="h-1.5 flex items-center gap-0.5">
                  {dotColors.map((c, i) => (
                    <span
                      key={i}
                      className="block w-1 h-1 rounded-full"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="px-4 pt-4 pb-2">
        <h3 className="text-base font-bold text-gray-900 dark:text-white">{selectedFullLabel}</h3>
        <div className="mt-2 h-px bg-gray-200 dark:bg-gray-700" />
      </div>

      <div className="flex-1 px-3 pb-24 space-y-2">
        {selectedBucket.holidays.map((h) => (
          <div
            key={h.id}
            className="px-3 py-1.5 rounded-full text-xs font-semibold inline-flex items-center"
            style={{ backgroundColor: h.backgroundColor, color: h.borderColor, border: `1px solid ${h.borderColor}` }}
          >
            {h.title}
          </div>
        ))}

        {sortedDayTasks.length === 0 && selectedBucket.holidays.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500 gap-3">
            <CalendarDays className="w-10 h-10" />
            <span className="text-sm font-medium">אין אירועים ביום זה</span>
          </div>
        )}

        {sortedDayTasks.map((entry) => {
          const { task, start, end, allDay, color } = entry
          const status = (task.status || 'pending') as Task['status']
          return (
            <button
              key={`${task.id}-${start.getTime()}`}
              type="button"
              onClick={() => onEventClick(task)}
              className="w-full text-right bg-white dark:bg-gray-800 rounded-xl shadow-sm p-3 flex gap-3 border-r-4"
              style={{ borderRightColor: color }}
            >
              <div className="flex flex-col items-end justify-start min-w-[3.25rem] text-xs text-gray-500 dark:text-gray-400">
                {allDay ? (
                  <span className="font-semibold text-gray-700 dark:text-gray-200">כל היום</span>
                ) : (
                  <>
                    <span className="font-semibold text-gray-900 dark:text-white text-sm">{formatTimeHM(start.toISOString())}</span>
                    <span>{formatTimeHM(end.toISOString())}</span>
                  </>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 dark:text-white truncate">{task.title}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 truncate">
                  {task.assigned_user_name && <span className="truncate">{task.assigned_user_name}</span>}
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-medium text-white"
                    style={{ backgroundColor: TASK_STATUS_COLORS[status] }}
                  >
                    {TASK_STATUS_LABELS[status]}
                  </span>
                  {task.event_type && task.event_type !== 'task' && (
                    <span className="text-[10px] font-medium text-violet-600 dark:text-violet-300">
                      {EVENT_TYPE_LABELS[task.event_type]}
                    </span>
                  )}
                </div>
                {task.labels && task.labels.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {task.labels.map((lbl) => (
                      <span
                        key={lbl.id}
                        className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: `${lbl.color}22`, color: lbl.color, border: `1px solid ${lbl.color}55` }}
                      >
                        {lbl.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {canCreate && (
        <button
          type="button"
          onClick={onCreateClick}
          aria-label="צור אירוע חדש"
          className="fixed bottom-5 left-5 z-20 w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-500/40 inline-flex items-center justify-center"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}
    </div>
  )
}
