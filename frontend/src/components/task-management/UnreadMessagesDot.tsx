/**
 * סימון בסגנון וואטסאפ המציין שיש במשימה תגובות/הודעות צ'אט חדשות שהמשתמש הנוכחי
 * עדיין לא קרא.
 * - כאשר מועבר ``count`` חיובי מוצג תג אדום בולט עם מספר ההודעות שלא נקראו (``9+`` מעל 9).
 * - אחרת, אם ``show`` אמיתי, מוצגת נקודה אדומה קטנה (תאימות לאחור).
 */
interface UnreadMessagesDotProps {
  /** האם להציג את הנקודה (יש הודעות שלא נקראו) — כשאין ``count`` */
  show?: boolean
  /** מספר ההודעות שלא נקראו — כשחיובי מוצג תג עם מספר */
  count?: number
  /** מחלקות נוספות למיקום עדין */
  className?: string
}

export default function UnreadMessagesDot({ show, count, className = '' }: UnreadMessagesDotProps) {
  const unread = count ?? 0
  if (unread > 0) {
    const label = unread > 9 ? '9+' : String(unread)
    return (
      <span
        role="status"
        aria-label={`${unread} תגובות חדשות שלא נקראו`}
        title={`${unread} תגובות חדשות שלא נקראו`}
        className={
          'flex-shrink-0 inline-flex items-center justify-center ' +
          'min-w-[18px] h-[18px] px-1 rounded-full ' +
          'bg-red-500 text-white text-[11px] font-bold leading-none ' +
          'ring-2 ring-white dark:ring-gray-800 ' +
          className
        }
      >
        {label}
      </span>
    )
  }
  if (!show) return null
  return (
    <span
      role="status"
      aria-label="תגובות חדשות שלא נקראו"
      title="תגובות חדשות שלא נקראו"
      className={
        'flex-shrink-0 inline-block w-2.5 h-2.5 rounded-full bg-red-500 ' +
        'ring-2 ring-white dark:ring-gray-800 ' +
        className
      }
    />
  )
}
