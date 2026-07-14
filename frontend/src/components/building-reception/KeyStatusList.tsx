import { KeyRound, ArrowLeftRight, AlertTriangle, Plus, Trash2, Pencil } from 'lucide-react'
import type { ApartmentKey } from '../../types/api'
import { ACCENT, PALETTE, formatDate } from './constants'

interface KeyStatusListProps {
  keys: ApartmentKey[]
  onTransfer: () => void
  onAddKey: () => void
  onEditKey: (key: ApartmentKey) => void
  onDeleteKey: (keyId: number) => void
}

// Shared with the overview grid markers so the desk-green / out-red stay in sync.
const OUT_RED = PALETTE.keyOut
const IN_GREEN = PALETTE.keyDesk

/** Keys state list + the per-key transfer log, shown in the apartment panel. */
export default function KeyStatusList({ keys, onTransfer, onAddKey, onEditKey, onDeleteKey }: KeyStatusListProps) {
  const keyOut = keys.find((key) => key.holder === 'out')
  const transfers = keys
    .flatMap((key) => key.transfers.map((transfer) => ({ ...transfer, keyLabel: key.label })))
    .sort((first, second) => second.created_at.localeCompare(first.created_at))

  return (
    <div className="flex flex-col gap-3">
      {keyOut && (
        <div className="rounded-xl px-3.5 py-3 flex items-center gap-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: OUT_RED }} />
          <div className="text-xs font-bold text-red-800 dark:text-red-300 leading-snug">
            מפתח בחוץ שטרם הוחזר לדלפק — נמסר ל{keyOut.holder_name ?? 'גורם חיצוני'}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-0.5">
        <span className="text-xs font-extrabold text-gray-500 dark:text-gray-400">מצב מפתחות</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onAddKey}
            className="text-xs font-bold rounded-lg px-3 py-1.5 flex items-center gap-1.5 border"
            style={{ color: ACCENT, borderColor: `${ACCENT}73`, background: `${ACCENT}12` }}
          >
            <Plus className="w-4 h-4" />
            מפתח
          </button>
          <button
            type="button"
            onClick={onTransfer}
            className="text-xs font-bold text-white rounded-lg px-3 py-1.5 flex items-center gap-1.5"
            style={{ background: ACCENT }}
          >
            <ArrowLeftRight className="w-4 h-4" />
            העברת מפתח
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {keys.map((key) => {
          const out = key.holder === 'out'
          const color = out ? OUT_RED : IN_GREEN
          return (
            <div
              key={key.id}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-3 flex items-center gap-3"
            >
              <KeyRound className="w-5 h-5" style={{ color }} />
              <div className="flex-1 leading-tight">
                <div className="text-sm font-bold text-gray-900 dark:text-white">{key.label}</div>
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  {out ? `בחוץ — ${key.holder_name ?? 'גורם חיצוני'}` : 'בכספת הדלפק'}
                </div>
              </div>
              <span
                className="text-[10.5px] font-bold px-2.5 py-1 rounded-full"
                style={{ color, background: `${color}1F` }}
              >
                {out ? 'בחוץ' : 'בדלפק'}
              </span>
              <button
                type="button"
                onClick={() => onEditKey(key)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                aria-label="שינוי שם מפתח"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onDeleteKey(key.id)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                aria-label="מחיקת מפתח"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )
        })}
        {keys.length === 0 && (
          <div className="text-xs font-semibold text-gray-400 text-center py-6">אין מפתחות רשומים לדירה זו</div>
        )}
      </div>

      {transfers.length > 0 && (
        <>
          <div className="text-xs font-extrabold text-gray-500 dark:text-gray-400 px-0.5 mt-2">יומן העברות מפתח</div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 divide-y divide-gray-100 dark:divide-gray-700">
            {transfers.map((transfer) => (
              <div key={transfer.id} className="flex gap-2.5 py-2.5">
                <span className="text-[11px] font-bold text-gray-400 flex-shrink-0 w-16">
                  {formatDate(transfer.created_at)}
                </span>
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 flex-1">
                  {transfer.direction === 'out' ? 'מסירת' : 'החזרת'} {transfer.keyLabel}{' '}
                  {transfer.direction === 'out' ? 'ל' : 'מ'}
                  {transfer.counterparty_name}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
