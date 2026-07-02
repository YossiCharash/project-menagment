import { Wrench, CheckCircle2, Plus, Trash2, Pencil, Phone } from 'lucide-react'
import type { TechnicianVisit } from '../../types/api'
import { ACCENT, PALETTE, formatDate } from './constants'

interface TechnicianVisitListProps {
  visits: TechnicianVisit[]
  onMarkLeft: (visitId: number) => void
  onAddVisit: () => void
  onEditVisit: (visit: TechnicianVisit) => void
  onDeleteVisit: (visitId: number) => void
}

const LEFT_GREEN = '#12B76A'

/** "כניסות טכנאים" — the technicians tab of the apartment panel. */
export default function TechnicianVisitList({
  visits,
  onMarkLeft,
  onAddVisit,
  onEditVisit,
  onDeleteVisit,
}: TechnicianVisitListProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-xs font-extrabold text-gray-500 dark:text-gray-400">כניסות טכנאים</span>
        <button
          type="button"
          onClick={onAddVisit}
          className="text-xs font-bold rounded-lg px-3 py-1.5 flex items-center gap-1.5 border"
          style={{ color: ACCENT, borderColor: `${ACCENT}73`, background: `${ACCENT}12` }}
        >
          <Plus className="w-4 h-4" />
          כניסת טכנאי
        </button>
      </div>
      {visits.map((visit) => {
        const inside = visit.status === 'inside'
        const color = inside ? PALETTE.technician : LEFT_GREEN
        const Icon = inside ? Wrench : CheckCircle2
        const subParts = [visit.role, visit.phone].filter((part): part is string => Boolean(part))
        return (
          <div
            key={visit.id}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-3 flex items-center gap-3"
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: `${color}1F`, color }}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 leading-tight min-w-0">
              <div className="text-sm font-bold text-gray-900 dark:text-white truncate">{visit.name}</div>
              {subParts.length > 0 && (
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 truncate flex items-center gap-1">
                  {visit.role && <span>{visit.role}</span>}
                  {visit.role && visit.phone && <span>·</span>}
                  {visit.phone && (
                    <a
                      href={`tel:${visit.phone}`}
                      className="inline-flex items-center gap-1 hover:text-violet-500"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Phone className="w-3 h-3" />
                      {visit.phone}
                    </a>
                  )}
                </div>
              )}
              <div className="text-[11px] font-semibold text-gray-400 truncate">
                {visit.left_at ? `עזב ${formatDate(visit.left_at)}` : formatDate(visit.entered_at)}
              </div>
            </div>
            {inside ? (
              <button
                type="button"
                onClick={() => onMarkLeft(visit.id)}
                className="text-[10.5px] font-bold px-2.5 py-1 rounded-full"
                style={{ color: PALETTE.technician, background: `${PALETTE.technician}1F` }}
              >
                סמן יציאה
              </button>
            ) : (
              <span
                className="text-[10.5px] font-bold px-2.5 py-1 rounded-full"
                style={{ color: LEFT_GREEN, background: `${LEFT_GREEN}1F` }}
              >
                עזב
              </span>
            )}
            <button
              type="button"
              onClick={() => onEditVisit(visit)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20"
              aria-label="עריכת ביקור טכנאי"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onDeleteVisit(visit.id)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
              aria-label="מחיקת ביקור טכנאי"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )
      })}
      {visits.length === 0 && (
        <div className="text-xs font-semibold text-gray-400 text-center py-6">אין כניסות טכנאים לדירה זו</div>
      )}
    </div>
  )
}
