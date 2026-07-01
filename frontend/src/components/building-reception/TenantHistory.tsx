import type { ApartmentActivity } from '../../types/api'
import { ACCENT, formatDate } from './constants'

interface TenantHistoryProps {
  activities: ApartmentActivity[]
}

/** "היסטוריית דיירים ופעילות" — a vertical activity timeline. */
export default function TenantHistory({ activities }: TenantHistoryProps) {
  const ordered = [...activities].sort((first, second) => second.created_at.localeCompare(first.created_at))

  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-extrabold text-gray-500 dark:text-gray-400 px-0.5 mb-1">
        היסטוריית דיירים ופעילות
      </div>
      {ordered.map((activity, index) => (
        <div key={activity.id} className="flex gap-3.5 relative pb-4">
          <div className="flex flex-col items-center flex-shrink-0 w-3.5">
            <span
              className="w-3 h-3 rounded-full mt-1"
              style={{ background: ACCENT, boxShadow: `0 0 0 3px #fff, 0 0 0 4.5px ${ACCENT}55` }}
            />
            {index < ordered.length - 1 && <span className="flex-1 w-0.5 bg-gray-200 dark:bg-gray-700 mt-1" />}
          </div>
          <div className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-gray-900 dark:text-white">{activity.kind}</span>
              <span className="text-[11px] font-bold text-gray-400">{formatDate(activity.created_at)}</span>
            </div>
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
              {activity.text}
            </div>
          </div>
        </div>
      ))}
      {ordered.length === 0 && (
        <div className="text-xs font-semibold text-gray-400 text-center py-6">אין היסטוריית פעילות עדיין</div>
      )}
    </div>
  )
}
