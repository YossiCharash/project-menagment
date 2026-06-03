import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, AlertTriangle, Loader2, Package } from 'lucide-react'
import { cemsApi, type TransferConfirmPreview } from '../../lib/cemsApi'

// ─── Small presentational helpers ───────────────────────────────────────────

const PAGE_WRAPPER =
  'min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4'

const CARD =
  'w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden'

const CARD_HEADER =
  'bg-blue-600 dark:bg-blue-700 text-white p-5 text-center text-xl font-semibold'

const PRIMARY_BUTTON =
  'w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium transition-colors'

const DETAIL_ROW =
  'flex items-start justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0'

const DETAIL_LABEL = 'text-sm text-gray-500 dark:text-gray-400 font-medium'

const DETAIL_VALUE = 'text-sm text-gray-900 dark:text-gray-100 text-left'

// ─── Component ──────────────────────────────────────────────────────────────

type Phase = 'loading' | 'preview' | 'confirming' | 'confirmed' | 'error'

interface ErrorState {
  message: string
}

export default function ConfirmTransferPage() {
  const { token } = useParams<{ token: string }>()
  const [phase, setPhase] = useState<Phase>('loading')
  const [preview, setPreview] = useState<TransferConfirmPreview | null>(null)
  const [error, setError] = useState<ErrorState | null>(null)
  const [confirmedAssetName, setConfirmedAssetName] = useState<string>('')

  useEffect(() => {
    if (!token) {
      setError({ message: 'קישור האישור אינו תקין.' })
      setPhase('error')
      return
    }
    let isMounted = true
    cemsApi
      .getTransferConfirmPreview(token)
      .then((response) => {
        if (!isMounted) return
        setPreview(response.data)
        setPhase(response.data.status === 'PENDING' ? 'preview' : 'error')
        if (response.data.status !== 'PENDING') {
          setError({ message: 'ההעברה כבר אושרה או הושלמה בעבר.' })
        }
      })
      .catch((err) => {
        if (!isMounted) return
        const detail = err?.response?.data?.detail
        setError({ message: typeof detail === 'string' ? detail : 'אירעה שגיאה בטעינת פרטי ההעברה.' })
        setPhase('error')
      })
    return () => {
      isMounted = false
    }
  }, [token])

  async function handleConfirm() {
    if (!token) return
    setPhase('confirming')
    setError(null)
    try {
      const response = await cemsApi.confirmTransfer(token)
      setConfirmedAssetName(response.data.asset_name)
      setPhase('confirmed')
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError({ message: typeof detail === 'string' ? detail : 'אישור הקבלה נכשל. נסו שוב מאוחר יותר.' })
      setPhase('error')
    }
  }

  return (
    <div className={PAGE_WRAPPER} dir="rtl">
      <div className={CARD}>
        <div className={CARD_HEADER}>אישור קבלת ציוד</div>
        <div className="p-6 space-y-4">
          {phase === 'loading' && <LoadingState />}
          {phase === 'preview' && preview && (
            <PreviewState preview={preview} onConfirm={handleConfirm} />
          )}
          {phase === 'confirming' && <ConfirmingState />}
          {phase === 'confirmed' && <ConfirmedState assetName={confirmedAssetName} />}
          {phase === 'error' && (
            <ErrorState message={error?.message ?? 'אירעה שגיאה.'} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Phase sub-components ───────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-gray-600 dark:text-gray-300">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      <p className="text-sm">טוען פרטי העברה...</p>
    </div>
  )
}

function ConfirmingState() {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-gray-600 dark:text-gray-300">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      <p className="text-sm">מאשר את הקבלה...</p>
    </div>
  )
}

function ConfirmedState({ assetName }: { assetName: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <CheckCircle2 className="w-16 h-16 text-green-600" />
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">הקבלה אושרה. תודה!</h2>
      {assetName && (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          הציוד <strong>{assetName}</strong> סומן כהתקבל אצלך.
        </p>
      )}
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <AlertTriangle className="w-14 h-14 text-amber-500" />
      <p className="text-sm text-gray-800 dark:text-gray-200">{message}</p>
    </div>
  )
}

function PreviewState({
  preview,
  onConfirm,
}: {
  preview: TransferConfirmPreview
  onConfirm: () => void
}) {
  return (
    <>
      <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
        <Package className="w-6 h-6 text-blue-600 flex-shrink-0" />
        <p className="text-sm text-blue-900 dark:text-blue-200">
          שלום {preview.to_user_name}, להלן פרטי הציוד שמסירתו ממתינה לאישורך.
        </p>
      </div>

      <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-4 space-y-1">
        <div className={DETAIL_ROW}>
          <span className={DETAIL_LABEL}>שם הציוד</span>
          <span className={DETAIL_VALUE}>{preview.asset_name}</span>
        </div>
        {preview.asset_serial_number && (
          <div className={DETAIL_ROW}>
            <span className={DETAIL_LABEL}>מספר סידורי</span>
            <span className={DETAIL_VALUE}>{preview.asset_serial_number}</span>
          </div>
        )}
        {preview.from_user_name && (
          <div className={DETAIL_ROW}>
            <span className={DETAIL_LABEL}>נמסר על ידי</span>
            <span className={DETAIL_VALUE}>{preview.from_user_name}</span>
          </div>
        )}
        <div className={DETAIL_ROW}>
          <span className={DETAIL_LABEL}>תאריך יזימה</span>
          <span className={DETAIL_VALUE}>
            {new Date(preview.initiated_at).toLocaleString('he-IL')}
          </span>
        </div>
        {preview.notes && (
          <div className={DETAIL_ROW}>
            <span className={DETAIL_LABEL}>הערות</span>
            <span className={DETAIL_VALUE}>{preview.notes}</span>
          </div>
        )}
      </div>

      <button type="button" onClick={onConfirm} className={PRIMARY_BUTTON}>
        <CheckCircle2 className="w-5 h-5" />
        אני מאשר שקיבלתי את הפריט
      </button>
      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
        בלחיצה על הכפתור הציוד יסומן כהתקבל אצלך במערכת.
      </p>
    </>
  )
}
