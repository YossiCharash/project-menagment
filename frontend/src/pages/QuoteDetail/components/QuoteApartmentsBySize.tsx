import React from 'react'
import { Trash2 } from 'lucide-react'
import type { QuoteApartment } from '../../../lib/apiClient'

export interface QuoteApartmentsBySizeProps {
  isDraft: boolean
  apartments: QuoteApartment[]
  totalSqm: number
  costPerSqm: number
  /** כמות דירות להוספה (ברירת מחדל 1) */
  addCount: string
  /** גודל כל דירה במ"ר */
  addSizeSqm: string
  onAddCountChange: (value: string) => void
  onAddSizeSqmChange: (value: string) => void
  onAddApartments: (count: number, sizeSqm: number) => void
  adding?: boolean
  /** הסרת כל הדירות של גודל נתון (רק במצב טיוטה) */
  onDeleteApartmentsOfSize?: (sizeSqm: number) => void
  deletingSizeSqm?: number | null
}

export default function QuoteApartmentsBySize({
  isDraft,
  apartments,
  totalSqm,
  costPerSqm,
  addCount,
  addSizeSqm,
  onAddCountChange,
  onAddSizeSqmChange,
  onAddApartments,
  adding = false,
  onDeleteApartmentsOfSize,
  deletingSizeSqm = null,
}: QuoteApartmentsBySizeProps) {
  const handleAdd = () => {
    const count = parseInt(addCount.trim(), 10) || 1
    const size = parseFloat(addSizeSqm.trim())
    if (count >= 1 && !isNaN(size) && size > 0) onAddApartments(count, size)
  }

  // קיבוץ לפי גודל דירה – תשלום לכל סוג
  const bySize = React.useMemo(() => {
    const map = new Map<number, number>()
    for (const apt of apartments) {
      const n = map.get(apt.size_sqm) ?? 0
      map.set(apt.size_sqm, n + 1)
    }
    return Array.from(map.entries())
      .map(([sizeSqm, count]) => ({ sizeSqm, count, paymentPerApt: costPerSqm * sizeSqm }))
      .sort((a, b) => a.sizeSqm - b.sizeSqm)
  }, [apartments, costPerSqm])

  return (
    <div className="mt-6 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-amber-50/30 dark:bg-amber-900/10">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">חישוב לפי גודל הדירה</h3>
      {isDraft && (
        <div className="flex flex-wrap items-end gap-2 mb-4">
          <input
            type="number"
            min="1"
            max="500"
            value={addCount}
            onChange={(e) => onAddCountChange(e.target.value)}
            placeholder="1"
            className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            aria-label="כמות דירות"
          />
          <span className="text-gray-600 dark:text-gray-400 text-sm">דירות בגודל</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={addSizeSqm}
            onChange={(e) => onAddSizeSqmChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder='גודל (מ"ר)'
            className="w-28 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            aria-label='גודל במ"ר'
          />
          <span className="text-gray-600 dark:text-gray-400 text-sm">מ&quot;ר</span>
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {adding ? 'מוסיף...' : 'הוסף דירות'}
          </button>
        </div>
      )}
      {apartments.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">הוסף דירות עם גודל (מ&quot;ר) כדי לראות תשלום לכל דירה.</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            סה&quot;כ שטח: {totalSqm.toLocaleString('he-IL')} מ&quot;ר · מחיר למ&quot;ר: {costPerSqm.toLocaleString('he-IL', { minimumFractionDigits: 2 })} ₪
          </p>

          {bySize.length > 0 && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20 p-3">
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">תשלום לכל סוג דירה</h4>
              <ul className="space-y-2 text-sm">
                {bySize.map(({ sizeSqm, count, paymentPerApt }) => (
                  <li key={sizeSqm} className="flex justify-between items-center gap-4 text-gray-700 dark:text-gray-300">
                    <span>
                      דירות של {sizeSqm.toLocaleString('he-IL')} מ&quot;ר
                      {count > 1 && <span className="text-gray-500 dark:text-gray-400 mr-1">({count} דירות)</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums text-gray-900 dark:text-white">
                        {(paymentPerApt).toLocaleString('he-IL', { minimumFractionDigits: 2 })} ₪ לדירה
                      </span>
                      {isDraft && onDeleteApartmentsOfSize && (
                        <button
                          type="button"
                          onClick={() => onDeleteApartmentsOfSize(sizeSqm)}
                          disabled={deletingSizeSqm === sizeSqm}
                          className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                          title="הסר סוג דירה זה"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
