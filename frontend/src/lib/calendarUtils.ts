/**
 * Calendar utilities: Hebrew/Gregorian date display and Jewish/Islamic holidays.
 */
import { HDate, HebrewCalendar, gematriya } from '@hebcal/core'

export type CalendarDateDisplay = 'gregorian' | 'hebrew' | 'both'

/** Hebrew day only (gematriya) - no month name. Month is shown at top of calendar. */
function getHebrewDayOnly(date: Date): string {
  try {
    const h = new HDate(date)
    return gematriya(h.getDate())
  } catch {
    return String(date.getDate())
  }
}

/** Format a single day for the calendar cell according to user preference. */
export function formatCalendarDay(date: Date, mode: CalendarDateDisplay): string {
  if (mode === 'gregorian') {
    return String(date.getDate())
  }
  try {
    const hebrewDay = getHebrewDayOnly(date)
    if (mode === 'hebrew') {
      return hebrewDay
    }
    // both: Gregorian and Hebrew day (no month in cell)
    return `${date.getDate()} · ${hebrewDay}`
  } catch {
    return String(date.getDate())
  }
}

/** For "both" mode: get structured parts for better layout in calendar cells. */
export function getCalendarDayBothParts(date: Date): { gregorian: number; hebrew: string } | null {
  try {
    const h = new HDate(date)
    const hebrewDay = gematriya(h.getDate())
    return { gregorian: date.getDate(), hebrew: hebrewDay }
  } catch {
    return null
  }
}

/** Get Hebrew month name in Hebrew for header, no niqqud (e.g. "שבט"). */
export function getHebrewMonthNameHe(date: Date): string {
  try {
    const h = new HDate(date)
    const full = h.renderGematriya(true, true) // no niqqud: "טו חשון"
    const parts = full.split(/\s+/)
    return parts.length >= 2 ? parts[1] : ''
  } catch {
    return ''
  }
}

/** Get Hebrew month and year string for header (e.g. "שבט תשפ״ו" or "שבט – אדר תשפ״ו" when spanning two months). */
export function getHebrewMonthYearHeader(startDate: Date, endDate?: Date): string {
  try {
    const hStart = new HDate(startDate)
    const yearHe = gematriya(hStart.getFullYear())
    const monthStart = getHebrewMonthNameHe(startDate)
    if (!endDate || endDate.getTime() <= startDate.getTime()) {
      return `${monthStart} ${yearHe}`
    }
    const hEnd = new HDate(endDate)
    if (hStart.getMonth() === hEnd.getMonth() && hStart.getFullYear() === hEnd.getFullYear()) {
      return `${monthStart} ${yearHe}`
    }
    const monthEnd = getHebrewMonthNameHe(endDate)
    return `${monthStart} – ${monthEnd} ${yearHe}`
  } catch {
    return ''
  }
}

/** Get Gregorian date range for a Hebrew month (1st to last day). */
export function getHebrewMonthRange(date: Date): { start: Date; end: Date } | null {
  try {
    const h = new HDate(date)
    const month = h.getMonth()
    const year = h.getFullYear()
    const first = new HDate(1, month, year)
    const lastDay = first.daysInMonth()
    const last = new HDate(lastDay, month, year)
    return { start: first.greg(), end: last.greg() }
  } catch {
    return null
  }
}

/** Get the Gregorian start date of the next Hebrew month relative to the given date. */
export function getNextHebrewMonthStart(date: Date): Date {
  try {
    const h = new HDate(date)
    const first = new HDate(1, h.getMonth(), h.getFullYear())
    const daysInMonth = first.daysInMonth()
    const last = new HDate(daysInMonth, h.getMonth(), h.getFullYear())
    const dayAfterLast = new Date(last.greg())
    dayAfterLast.setDate(dayAfterLast.getDate() + 1)
    return dayAfterLast
  } catch {
    return new Date(date.getFullYear(), date.getMonth() + 1, 1)
  }
}

/** Get the Gregorian start date of the previous Hebrew month relative to the given date. */
export function getPrevHebrewMonthStart(date: Date): Date {
  try {
    const h = new HDate(date)
    const firstOfCurrent = new HDate(1, h.getMonth(), h.getFullYear())
    const dayBefore = new Date(firstOfCurrent.greg())
    dayBefore.setDate(dayBefore.getDate() - 1)
    const prevH = new HDate(dayBefore)
    const prevFirst = new HDate(1, prevH.getMonth(), prevH.getFullYear())
    return prevFirst.greg()
  } catch {
    return new Date(date.getFullYear(), date.getMonth() - 1, 1)
  }
}

export interface HolidayEvent {
  id: string
  title: string
  start: string
  end: string
  allDay: true
  backgroundColor: string
  borderColor: string
  classNames: string[]
  extendedProps: { isHoliday: true; kind: 'jewish' | 'islamic' }
}

const JEWISH_HOLIDAY_BG = 'rgba(76, 175, 80, 0.25)'
const JEWISH_HOLIDAY_BORDER = '#4CAF50'
const ISLAMIC_HOLIDAY_BG = 'rgba(33, 150, 243, 0.25)'
const ISLAMIC_HOLIDAY_BORDER = '#2196F3'

/** Get Jewish (Israeli) holidays for the given date range. */
export function getJewishHolidays(start: Date, end: Date): HolidayEvent[] {
  const events: HolidayEvent[] = []
  try {
    const cal = HebrewCalendar.calendar({
      start,
      end,
      il: true, // Israel schedule
      noMinorFast: true,
      noSpecialShabbat: true,
      noRoshChodesh: true,
      noModern: false,
    })
    for (const ev of cal) {
      const hd = ev.getDate()
      const g = hd.greg()
      const title = ev.render('he-x-nonikud') || ev.render('he') || ev.getDesc() || ''
      const startStr = g.toISOString().slice(0, 10) + 'T00:00:00'
      const endStr = g.toISOString().slice(0, 10) + 'T23:59:59'
      events.push({
        id: `jewish-${hd.toString()}-${title}`,
        title: `🕎 ${title}`,
        start: startStr,
        end: endStr,
        allDay: true,
        backgroundColor: JEWISH_HOLIDAY_BG,
        borderColor: JEWISH_HOLIDAY_BORDER,
        classNames: ['fc-event-holiday', 'fc-event-holiday-jewish'],
        extendedProps: { isHoliday: true as const, kind: 'jewish' },
      })
    }
  } catch (e) {
    console.warn('Jewish holidays error:', e)
  }
  return events
}

/** Islamic holidays: (Hijri month, day) -> Hebrew name. */
const ISLAMIC_HOLIDAYS: { month: number; day: number; nameHe: string }[] = [
  { month: 1, day: 1, nameHe: 'ראש השנה האסלאמית' },
  { month: 10, day: 1, nameHe: 'עיד אל-פיטר' },
  { month: 12, day: 10, nameHe: 'עיד אל-אדחא' },
  { month: 9, day: 1, nameHe: 'תחילת רמדאן' },
]

/** Get Islamic holidays for the given date range by checking each day's Hijri date. */
export function getIslamicHolidays(start: Date, end: Date): HolidayEvent[] {
  const events: HolidayEvent[] = []
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const HijriDate = require('hijri-date').default as (d: number) => { getMonth: () => number; getDate: () => number }
    const cursor = new Date(start)
    cursor.setHours(0, 0, 0, 0)
    const endTime = end.getTime()
    while (cursor.getTime() <= endTime) {
      const h = new HijriDate(cursor.getTime())
      const hMonth = h.getMonth()
      const hDay = h.getDate()
      for (const hol of ISLAMIC_HOLIDAYS) {
        if (hol.month === hMonth && hol.day === hDay) {
          const startStr = cursor.toISOString().slice(0, 10) + 'T00:00:00'
          const endStr = cursor.toISOString().slice(0, 10) + 'T23:59:59'
          events.push({
            id: `islamic-${cursor.toISOString().slice(0, 10)}-${hol.nameHe}`,
            title: `☪ ${hol.nameHe}`,
            start: startStr,
            end: endStr,
            allDay: true,
            backgroundColor: ISLAMIC_HOLIDAY_BG,
            borderColor: ISLAMIC_HOLIDAY_BORDER,
            classNames: ['fc-event-holiday', 'fc-event-holiday-islamic'],
            extendedProps: { isHoliday: true as const, kind: 'islamic' },
          })
        }
      }
      cursor.setDate(cursor.getDate() + 1)
    }
  } catch (e) {
    console.warn('Islamic holidays error:', e)
  }
  return events
}
