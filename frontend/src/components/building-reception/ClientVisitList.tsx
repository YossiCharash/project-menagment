import { UserRound, LogOut, Plus, Trash2, Pencil, Clock } from 'lucide-react'
import type { ClientVisit } from '../../types/api'
import { ACCENT, PALETTE, formatDateTime } from './constants'

interface ClientVisitListProps {
  visits: ClientVisit[]
  onMarkLeft: (visitId: number) => void
  onAddVisit: () => void
  onEditVisit: (visit: ClientVisit) => void
  onDeleteVisit: (visitId: number) => void
}

const PRESENT_GREEN = PALETTE.occupied

/** A single row for one client arrival (active or past). */
function VisitRow({
  visit,
  onMarkLeft,
  onEditVisit,
  onDeleteVisit,
}: {
  visit: ClientVisit
  onMarkLeft: (visitId: number) => void
  onEditVisit: (visit: ClientVisit) => void
  onDeleteVisit: (visitId: number) => void
}) {
  const present = visit.status === 'present'
  const color = present ? PRESENT_GREEN : PALETTE.vacant
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-3 flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}1F`, color }}
      >
        <UserRound className="w-5 h-5" />
      </div>
      <div className="flex-1 leading-tight min-w-0">
        <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
          {visit.name ?? 'לקוח'}
        </div>
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 truncate flex items-center gap-1">
          <Clock className="w-3 h-3 flex-shrink-0" />
          {formatDateTime(visit.arrived_at)}
          {visit.expected_until && <span>· עד {formatDateTime(visit.expected_until)}</span>}
        </div>
        {!present && visit.left_at && (
          <div className="text-[11px] font-semibold text-gray-400 truncate">יצא {formatDateTime(visit.left_at)}</div>
        )}
      </div>
      {present && (
        <button
          type="button"
          onClick={() => onMarkLeft(visit.id)}
          className="text-[10.5px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1"
          style={{ color: PALETTE.task, background: `${PALETTE.task}1F` }}
        >
          <LogOut className="w-3.5 h-3.5" />
          יציאה מיידית
        </button>
      )}
      <button
        type="button"
        onClick={() => onEditVisit(visit)}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20"
        aria-label="עריכת הגעת לקוח"
      >
        <Pencil className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => onDeleteVisit(visit.id)}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
        aria-label="מחיקת הגעת לקוח"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}

/** "לקוחות" — client arrivals for an apartment, split into active + past. */
export default function ClientVisitList({
  visits,
  onMarkLeft,
  onAddVisit,
  onEditVisit,
  onDeleteVisit,
}: ClientVisitListProps) {
  const active = visits.filter((visit) => visit.status === 'present')
  const past = visits.filter((visit) => visit.status !== 'present')

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-xs font-extrabold text-gray-500 dark:text-gray-400">לקוחות בדירה</span>
        <button
          type="button"
          onClick={onAddVisit}
          className="text-xs font-bold rounded-lg px-3 py-1.5 flex items-center gap-1.5 border"
          style={{ color: ACCENT, borderColor: `${ACCENT}73`, background: `${ACCENT}12` }}
        >
          <Plus className="w-4 h-4" />
          הגעת לקוח
        </button>
      </div>

      {active.map((visit) => (
        <VisitRow
          key={visit.id}
          visit={visit}
          onMarkLeft={onMarkLeft}
          onEditVisit={onEditVisit}
          onDeleteVisit={onDeleteVisit}
        />
      ))}

      {past.length > 0 && (
        <>
          <div className="text-xs font-extrabold text-gray-500 dark:text-gray-400 px-0.5 mt-2">הגעות קודמות</div>
          {past.map((visit) => (
            <VisitRow
              key={visit.id}
              visit={visit}
              onMarkLeft={onMarkLeft}
              onEditVisit={onEditVisit}
              onDeleteVisit={onDeleteVisit}
            />
          ))}
        </>
      )}

      {visits.length === 0 && (
        <div className="text-xs font-semibold text-gray-400 text-center py-6">אין הגעות לקוחות לדירה זו</div>
      )}
    </div>
  )
}
