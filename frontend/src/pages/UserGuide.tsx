import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  FolderOpen,
  BarChart3,
  Receipt,
  ClipboardList,
  Building2,
  Settings,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  BookOpen,
  TrendingUp,
  FileText,
  Users,
  Bell,
  DollarSign,
  Calendar,
  Tag,
  PlusCircle,
  Search,
  Eye,
} from 'lucide-react'
import { cn } from '../lib/utils'

/* ------------------------------------------------------------------ */
/* Screenshot helper – shows image if it exists, otherwise placeholder */
/* ------------------------------------------------------------------ */
function Screenshot({
  src,
  alt,
  caption,
}: {
  src: string
  alt: string
  caption?: string
}) {
  const [failed, setFailed] = useState(false)

  return (
    <div className="my-4">
      {!failed ? (
        <img
          src={src}
          alt={alt}
          onError={() => setFailed(true)}
          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 shadow-md object-cover"
        />
      ) : (
        <div className="w-full min-h-[220px] rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 flex flex-col items-center justify-center gap-3 p-6">
          <Eye className="w-10 h-10 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center font-medium">{alt}</p>
          <p className="text-xs text-gray-300 dark:text-gray-600 text-center">
            הצב את קובץ הצילום כאן:{' '}
            <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{src}</code>
          </p>
        </div>
      )}
      {caption && (
        <p className="mt-2 text-xs text-center text-gray-500 dark:text-gray-400 italic">
          {caption}
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Collapsible section                                                  */
/* ------------------------------------------------------------------ */
function Section({
  id,
  icon: Icon,
  title,
  color,
  children,
  defaultOpen = false,
}: {
  id: string
  icon: React.ElementType
  title: string
  color: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div
      id={id}
      className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden"
    >
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'w-full flex items-center justify-between px-6 py-5 text-right transition-colors',
          open ? 'bg-gray-50 dark:bg-gray-700/50' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
        )}
      >
        <div className="flex items-center gap-4">
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', color)}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900 dark:text-white">{title}</span>
        </div>
        {open ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {open && (
        <div className="px-6 pb-6 pt-4 space-y-4 border-t border-gray-100 dark:border-gray-700">
          {children}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Feature bullet                                                       */
/* ------------------------------------------------------------------ */
function Feature({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{text}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Step card                                                            */
/* ------------------------------------------------------------------ */
function Step({ num, title, desc }: { num: number; title: string; desc: string }) {
  return (
    <div className="flex gap-4">
      <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
        {num}
      </div>
      <div>
        <p className="font-semibold text-gray-900 dark:text-white text-sm">{title}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Nav pill for table of contents                                       */
/* ------------------------------------------------------------------ */
function NavPill({ id, label, color }: { id: string; label: string; color: string }) {
  return (
    <a
      href={`#${id}`}
      onClick={(e) => {
        e.preventDefault()
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }}
      className={cn(
        'px-4 py-2 rounded-full text-xs font-semibold text-white transition-opacity hover:opacity-80',
        color
      )}
    >
      {label}
    </a>
  )
}

/* ================================================================== */
/* Main page                                                            */
/* ================================================================== */
export default function UserGuide() {
  // Standalone page – set document title
  useEffect(() => {
    document.title = 'מדריך למשתמש | מערכת ניהול פרויקטים'
  }, [])

  const sections = [
    { id: 'dashboard',      label: 'לוח בקרה',          color: 'bg-blue-500' },
    { id: 'projects',       label: 'פרויקטים',           color: 'bg-emerald-500' },
    { id: 'transactions',   label: 'תנועות כספיות',      color: 'bg-violet-500' },
    { id: 'quotes',         label: 'הצעות מחיר',         color: 'bg-orange-500' },
    { id: 'reports',        label: 'דוחות',              color: 'bg-pink-500' },
    { id: 'tasks',          label: 'ניהול משימות',       color: 'bg-cyan-500' },
    { id: 'suppliers',      label: 'ספקים',              color: 'bg-amber-500' },
    { id: 'settings',       label: 'הגדרות',             color: 'bg-gray-500' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900" dir="rtl">
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-6 pb-16">
      {/* Hero */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">מדריך למשתמש</h1>
            <p className="text-blue-200 text-sm">מערכת ניהול פרויקטים</p>
          </div>
        </div>
        <p className="text-blue-100 leading-relaxed max-w-2xl">
          מדריך זה מסביר את כל הפונקציות של המערכת – מהוספת פרויקט ועד ניהול הצעות מחיר, דוחות
          ומשימות. לחץ על כל חלק לפתיחתו.
        </p>

        {/* Quick-nav pills */}
        <div className="flex flex-wrap gap-2 mt-6">
          {sections.map((s) => (
            <NavPill key={s.id} id={s.id} label={s.label} color={s.color} />
          ))}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 1. Dashboard                                                  */}
      {/* ============================================================ */}
      <Section id="dashboard" icon={LayoutDashboard} title="לוח בקרה" color="bg-blue-500" defaultOpen>
        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
          לוח הבקרה הוא מסך הפתיחה של המערכת. הוא מציג סקירה פיננסית כוללת של כל הפרויקטים
          הפעילים ומאפשר ניווט מהיר לכל חלק במערכת.
        </p>

        <Screenshot
          src="/screenshots/dashboard.png"
          alt="צילום מסך – לוח בקרה"
          caption="לוח הבקרה הראשי עם סיכום פיננסי של כל הפרויקטים"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Feature icon={TrendingUp} text="סיכום תקציב וצריכה של כל הפרויקטים בזמן אמת" />
          <Feature icon={BarChart3}  text="גרפים ותרשימי עוגה לפי קטגוריה וסוג הוצאה" />
          <Feature icon={FolderOpen} text="גישה מהירה לפרויקטים האחרונים שנפתחו" />
          <Feature icon={Bell}       text="תצוגת התראות ומשימות פתוחות" />
        </div>

        <a
          href="/"
          className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline mt-2"
        >
          <ExternalLink className="w-4 h-4" />
          עבור ללוח הבקרה
        </a>
      </Section>

      {/* ============================================================ */}
      {/* 2. Projects                                                   */}
      {/* ============================================================ */}
      <Section id="projects" icon={FolderOpen} title="פרויקטים" color="bg-emerald-500">
        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
          מודול הפרויקטים הוא ליבת המערכת. כאן מנהלים את כל הפרויקטים, תת-פרויקטים, תקציבים
          ומסמכים.
        </p>

        <Screenshot
          src="/screenshots/projects-list.png"
          alt="צילום מסך – רשימת פרויקטים"
          caption="רשימת כל הפרויקטים עם תצוגת תקציב וסטטוס"
        />

        <h3 className="font-bold text-gray-900 dark:text-white mt-4">מקרא צבעי מסגרת</h3>
        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
          כרטיסי הפרויקטים מקבלים מסגרת צבעונית לפי סוג הפרויקט:
        </p>
        <div className="flex flex-col gap-2 mt-2 pr-1" dir="rtl">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded border-2 border-blue-400 bg-white dark:bg-gray-800 flex-shrink-0" />
            <span className="text-sm text-gray-700 dark:text-gray-300"><strong>מסגרת כחולה</strong> — פרויקט אב עם תתי-פרויקטים</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 flex-shrink-0" />
            <span className="text-sm text-gray-700 dark:text-gray-300"><strong>מסגרת אפורה</strong> — פרויקט רגיל</span>
          </div>
        </div>

        <h3 className="font-bold text-gray-900 dark:text-white mt-2">יצירת פרויקט חדש</h3>
        <div className="space-y-3">
          <Step num={1} title="לחץ על 'פרויקט חדש'" desc="כפתור + בפינה הימנית העליונה של עמוד הפרויקטים" />
          <Step num={2} title="מלא את פרטי הפרויקט"  desc="שם, תיאור, כתובת, תאריכי התחלה וסיום" />
          <Step num={3} title="הגדר תקציב"            desc="תקציב חודשי ו/או שנתי לפרויקט" />
          <Step num={4} title="שמור ופתח"             desc="הפרויקט נוצר ונפתחת דף הפרויקט עם כל הפרטים" />
        </div>

        <Screenshot
          src="/screenshots/project-create.png"
          alt="צילום מסך – יצירת פרויקט"
          caption="מודל יצירת פרויקט חדש"
        />

        <h3 className="font-bold text-gray-900 dark:text-white mt-4">דף הפרויקט</h3>
        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
          בדף הפרויקט ניתן לראות סיכום פיננסי, רשימת תנועות, מסמכים, ותת-פרויקטים.
        </p>

        <Screenshot
          src="/screenshots/project-detail.png"
          alt="צילום מסך – דף פרויקט"
          caption="דף פרויקט עם סיכום פיננסי, תנועות ומסמכים"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          <Feature icon={DollarSign} text="סיכום תקציב, הוצאות בפועל ויתרה" />
          <Feature icon={FileText}   text="ניהול מסמכים וחוזים מצורפים לפרויקט" />
          <Feature icon={FolderOpen} text="תת-פרויקטים מקושרים תחת פרויקט אב" />
          <Feature icon={Calendar}   text="תקופות חוזה ומעקב על פני שנים" />
        </div>

        <a
          href="/projects"
          className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-medium hover:underline mt-2"
        >
          <ExternalLink className="w-4 h-4" />
          עבור לפרויקטים
        </a>
      </Section>

      {/* ============================================================ */}
      {/* 3. Transactions                                               */}
      {/* ============================================================ */}
      <Section id="transactions" icon={DollarSign} title="תנועות כספיות" color="bg-violet-500">
        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
          כל תנועה כספית (הוצאה או הכנסה) מוזנת לפרויקט ספציפי. המערכת תומכת בתנועות חד-פעמיות
          ובתנועות חוזרות (חודשיות/שנתיות).
        </p>

        <Screenshot
          src="/screenshots/transactions-list.png"
          alt="צילום מסך – רשימת תנועות"
          caption="רשימת תנועות כספיות בתוך פרויקט עם סינון וחיפוש"
        />

        <h3 className="font-bold text-gray-900 dark:text-white mt-2">הוספת תנועה</h3>
        <div className="space-y-3">
          <Step num={1} title="פתח דף פרויקט"     desc="נווט לפרויקט הרלוונטי" />
          <Step num={2} title="לחץ 'הוסף תנועה'" desc="כפתור + בסעיף התנועות" />
          <Step num={3} title="מלא פרטים"         desc="סכום, תאריך, קטגוריה, ספק, תיאור" />
          <Step num={4} title="צרף מסמך (אופציה)" desc="ניתן לצרף חשבונית או קבלה" />
        </div>

        <Screenshot
          src="/screenshots/transaction-create.png"
          alt="צילום מסך – הוספת תנועה"
          caption="מודל הוספת תנועה כספית"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          <Feature icon={Tag}        text="סיווג לפי קטגוריות מוגדרות מראש" />
          <Feature icon={Building2}  text="שיוך לספק קיים מהרשימה" />
          <Feature icon={Calendar}   text="תנועות חוזרות – הגדרה פעם אחת, ביצוע אוטומטי" />
          <Feature icon={Search}     text="סינון לפי תאריך, קטגוריה, ספק וסכום" />
        </div>
      </Section>

      {/* ============================================================ */}
      {/* 4. Price Quotes                                               */}
      {/* ============================================================ */}
      <Section id="quotes" icon={Receipt} title="הצעות מחיר" color="bg-orange-500">
        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
          מודול הצעות המחיר מאפשר לבנות הצעות מחיר מפורטות לפי נושאים, בניינים ודירות, ולהמיר
          אותן לפרויקטים.
        </p>

        <Screenshot
          src="/screenshots/quotes-list.png"
          alt="צילום מסך – רשימת הצעות מחיר"
          caption="רשימת הצעות המחיר עם סטטוסים וסכומים"
        />

        <h3 className="font-bold text-gray-900 dark:text-white mt-2">בניית הצעת מחיר</h3>
        <div className="space-y-3">
          <Step num={1} title="צור הצעה חדשה"        desc="הזן שם, לקוח ותאריך" />
          <Step num={2} title="הוסף נושאי עבודה"    desc="חלוקה לנושאים (כגון: עבודות קרקע, חשמל, צנרת)" />
          <Step num={3} title="הוסף שורות הוצאה"    desc="לכל נושא – פריטים עם כמות ומחיר יחידה" />
          <Step num={4} title="הגדר בניינים ודירות" desc="הצעה ניתנת לחלוקה לפי מבנה פיזי" />
          <Step num={5} title="שלח ו/או המר לפרויקט" desc="ייצוא PDF או המרה ישירה לפרויקט חדש" />
        </div>

        <Screenshot
          src="/screenshots/quote-detail.png"
          alt="צילום מסך – עריכת הצעת מחיר"
          caption="עמוד עריכת הצעת מחיר עם שורות הוצאה ונושאים"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          <Feature icon={FileText}   text="ייצוא PDF מלא של הצעת המחיר" />
          <Feature icon={FolderOpen} text="המרה ישירה להצעה לפרויקט" />
          <Feature icon={Building2}  text="חלוקה לפי בניינים ודירות" />
          <Feature icon={Tag}        text="שימוש במבנה הצעה מוגדר מראש מההגדרות" />
        </div>

        <a
          href="/price-quotes"
          className="inline-flex items-center gap-2 text-orange-600 dark:text-orange-400 text-sm font-medium hover:underline mt-2"
        >
          <ExternalLink className="w-4 h-4" />
          עבור להצעות מחיר
        </a>
      </Section>

      {/* ============================================================ */}
      {/* 5. Reports                                                    */}
      {/* ============================================================ */}
      <Section id="reports" icon={BarChart3} title="דוחות" color="bg-pink-500">
        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
          מודול הדוחות מאפשר לנתח את הנתונים הפיננסיים על פני כל הפרויקטים, לסנן לפי תקופות
          ולייצא לאקסל.
        </p>

        <Screenshot
          src="/screenshots/reports.png"
          alt="צילום מסך – דוחות"
          caption="עמוד הדוחות עם גרפים ותרשימים פיננסיים"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Feature icon={BarChart3}  text="דוח הוצאות לפי קטגוריה על פני כל הפרויקטים" />
          <Feature icon={TrendingUp} text="מגמות חודשיות ושנתיות" />
          <Feature icon={FileText}   text="ייצוא לאקסל (CSV/XLSX)" />
          <Feature icon={Search}     text="סינון לפי תקופה, פרויקט וקטגוריה" />
        </div>

        <a
          href="/reports"
          className="inline-flex items-center gap-2 text-pink-600 dark:text-pink-400 text-sm font-medium hover:underline mt-2"
        >
          <ExternalLink className="w-4 h-4" />
          עבור לדוחות
        </a>
      </Section>

      {/* ============================================================ */}
      {/* 6. Task Management                                            */}
      {/* ============================================================ */}
      <Section id="tasks" icon={ClipboardList} title="ניהול משימות" color="bg-cyan-500">
        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
          מודול ניהול המשימות כולל לוח משימות (Kanban), יומן, הודעות פנימיות ומעקב אחר עבודת
          הצוות.
        </p>

        <Screenshot
          src="/screenshots/task-kanban.png"
          alt="צילום מסך – לוח משימות"
          caption="לוח Kanban עם עמודות סטטוס וגרירת כרטיסי משימה"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Feature icon={ClipboardList} text="לוח Kanban – גרירת משימות בין עמודות סטטוס" />
          <Feature icon={Calendar}      text="תצוגת יומן עם ניהול אירועים" />
          <Feature icon={Bell}          text="הודעות פנימיות בין משתמשי המערכת" />
          <Feature icon={Users}         text="שיוך משימות למשתמשים ספציפיים" />
        </div>

        <Screenshot
          src="/screenshots/task-calendar.png"
          alt="צילום מסך – יומן משימות"
          caption="תצוגת יומן עם אירועים ומשימות מתוזמנות"
        />

        <h3 className="font-bold text-gray-900 dark:text-white mt-4">הוספת משימה</h3>
        <div className="space-y-3">
          <Step num={1} title="עבור לניהול משימות" desc="לחץ על 'ניהול משימות' בתפריט הצדדי" />
          <Step num={2} title="לחץ '+' בעמודת הסטטוס הרצויה" desc="לדוגמה: 'לביצוע', 'בתהליך'" />
          <Step num={3} title="מלא כותרת, תיאור ותאריך יעד" desc="ניתן גם לשייך לפרויקט ולמשתמש" />
          <Step num={4} title="שמור"              desc="המשימה מופיעה בלוח וביומן" />
        </div>

        <a
          href="/task-management"
          className="inline-flex items-center gap-2 text-cyan-600 dark:text-cyan-400 text-sm font-medium hover:underline mt-2"
        >
          <ExternalLink className="w-4 h-4" />
          עבור לניהול משימות
        </a>
      </Section>

      {/* ============================================================ */}
      {/* 7. Suppliers                                                  */}
      {/* ============================================================ */}
      <Section id="suppliers" icon={Building2} title="ספקים" color="bg-amber-500">
        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
          ניהול ספקים מאפשר שמירת פרטי קשר, קישור לקטגוריות, הגדרת תקציב שנתי ואחסון מסמכים
          ייעודיים לכל ספק.
        </p>

        <Screenshot
          src="/screenshots/suppliers.png"
          alt="צילום מסך – רשימת ספקים"
          caption="רשימת הספקים עם סיכום תקציב ותנועות"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Feature icon={Building2}  text="פרטי ספק: שם, אימייל, טלפון, קטגוריה" />
          <Feature icon={DollarSign} text="תקציב שנתי לכל ספק ומעקב צריכה" />
          <Feature icon={FileText}   text="מסמכים ייעודיים לכל ספק (חוזים, חשבוניות)" />
          <Feature icon={Tag}        text="קישור ספקים לקטגוריות ולפרויקטים" />
        </div>

        <a
          href="/suppliers"
          className="inline-flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm font-medium hover:underline mt-2"
        >
          <ExternalLink className="w-4 h-4" />
          עבור לספקים
        </a>
      </Section>

      {/* ============================================================ */}
      {/* 8. Settings                                                   */}
      {/* ============================================================ */}
      <Section id="settings" icon={Settings} title="הגדרות" color="bg-gray-500">
        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
          עמוד ההגדרות מאגד את כל הפרמטרים האישיים ופרמטרי המערכת: פרופיל משתמש, קטגוריות,
          ספקים, ערכת נושא ועוד.
        </p>

        <Screenshot
          src="/screenshots/settings.png"
          alt="צילום מסך – הגדרות"
          caption="עמוד ההגדרות עם טאבים לפרופיל, קטגוריות, ספקים ותצוגה"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Feature icon={Users}     text="עדכון שם, אימייל וסיסמה" />
          <Feature icon={Tag}       text="ניהול קטגוריות הוצאות מותאמות אישית" />
          <Feature icon={Building2} text="ניהול ספקים וחלוקה לקטגוריות" />
          <Feature icon={Eye}       text="מצב כהה/בהיר, שפה וכיוון טקסט" />
          <Feature icon={Receipt}   text="הגדרת מבנה הצעות מחיר (נושאים ברירת מחדל)" />
          <Feature icon={Calendar}  text="הגדרות יומן ו-Google Calendar" />
        </div>

        <a
          href="/settings"
          className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 text-sm font-medium hover:underline mt-2"
        >
          <ExternalLink className="w-4 h-4" />
          עבור להגדרות
        </a>
      </Section>

      {/* ============================================================ */}
      {/* Footer note                                                   */}
      {/* ============================================================ */}
    </div>
    </div>
  )
}
