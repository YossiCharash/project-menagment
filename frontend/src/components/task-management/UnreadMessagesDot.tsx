/**
 * נקודה אדומה בסגנון וואטסאפ המסמנת שיש במשימה תגובות/הודעות צ'אט חדשות
 * שהמשתמש הנוכחי עדיין לא קרא. מוצגת רק כאשר ``show`` אמיתי.
 */
interface UnreadMessagesDotProps {
  /** האם להציג את הנקודה (יש הודעות שלא נקראו) */
  show?: boolean
  /** מחלקות נוספות למיקום עדין */
  className?: string
}

export default function UnreadMessagesDot({ show, className = '' }: UnreadMessagesDotProps) {
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
