import React, { useState, useEffect, useRef } from 'react'
import { CheckCircle, ChevronDown, Pencil, Trash2, X } from 'lucide-react'
import type { QuoteLine } from '../../../lib/apiClient'

export interface QuoteExpenseLinesTableProps {
  isDraft: boolean
  currentLines: QuoteLine[]
  structureItems: Array<{ id: number; name: string }>
  alreadyAddedIds: Set<number>
  selectedStructureIds: Set<number>
  editingAmounts: Map<number, string>
  addSuccessMessage: string | null
  buildingTotal: number
  showNumResidents: boolean
  currentNumResidentsStr: string
  effectiveResidents: number
  savingNumResidents: boolean
  onToggleStructureId: (id: number) => void
  onAddLines: () => void
  onEditLineAmount: (lineId: number, amount: string) => void
  onCancelEditLine: (lineId: number) => void
  onUpdateLineAmount: (lineId: number, amountStr: string) => void
  onDeleteLine: (lineId: number) => void
  onNumResidentsChange: (value: string) => void
  onNumResidentsBlur: () => void
}

export default function QuoteExpenseLinesTable({
  isDraft,
  currentLines,
  structureItems,
  alreadyAddedIds,
  selectedStructureIds,
  editingAmounts,
  addSuccessMessage,
  buildingTotal,
  showNumResidents,
  currentNumResidentsStr,
  effectiveResidents,
  savingNumResidents,
  onToggleStructureId,
  onAddLines,
  onEditLineAmount,
  onCancelEditLine,
  onUpdateLineAmount,
  onDeleteLine,
  onNumResidentsChange,
  onNumResidentsBlur,
}: QuoteExpenseLinesTableProps) {
  const availableItems = structureItems.filter((item) => !alreadyAddedIds.has(item.id))
  const colSpan = isDraft ? 3 : 2

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-700 dark:bg-gray-600">
            <th className="text-right py-3 px-4 font-semibold text-white">הוצאות הצעת המחיר</th>
            <th className="text-right py-3 px-4 font-semibold text-white w-28">סכום לחיוב (₪)</th>
            {isDraft && <th className="w-20" />}
          </tr>
        </thead>
        <tbody>
          {isDraft && (
            <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <td colSpan={colSpan} className="py-3 px-4">
                <div className="flex items-center gap-2" ref={dropdownRef} style={{position: 'relative'}}>
                  {availableItems.length > 0 ? (
                    <>
                      {/* Trigger button */}
                      <button
                        type="button"
                        onClick={() => setDropdownOpen(o => !o)}
                        className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm min-w-[180px] justify-between"
                      >
                        <span>
                          {selectedStructureIds.size > 0 ? `${selectedStructureIds.size} קטגוריות נבחרו` : 'בחר קטגוריות'}
                        </span>
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      </button>

                      {/* Add button — always visible */}
                      <button
                        type="button"
                        onClick={onAddLines}
                        disabled={selectedStructureIds.size === 0}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
                      >
                        {selectedStructureIds.size > 0 ? `הוסף ${selectedStructureIds.size} קטגוריות` : 'הוסף'}
                      </button>

                      {/* Dropdown panel */}
                      {dropdownOpen && (
                        <div className="absolute top-full mt-1 right-0 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg min-w-[220px] py-1 max-h-56 overflow-y-auto">
                          {availableItems.map((item) => (
                            <label
                              key={item.id}
                              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedStructureIds.has(item.id)}
                                onChange={() => onToggleStructureId(item.id)}
                                className="accent-blue-600"
                              />
                              <span className="text-sm text-gray-900 dark:text-white">{item.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-gray-500 dark:text-gray-400">כל הקטגוריות כבר נוספו</span>
                  )}
                </div>
              </td>
            </tr>
          )}
          {addSuccessMessage && (
            <tr>
              <td colSpan={colSpan} className="py-2 px-4">
                <div className="p-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5" /> {addSuccessMessage}
                </div>
              </td>
            </tr>
          )}
          {(!currentLines || currentLines.length === 0) && !addSuccessMessage ? (
            <tr>
              <td colSpan={colSpan} className="py-8 px-4 text-center text-gray-500 dark:text-gray-400">
                אין פריטים. בחר פריט מהרשימה למעלה והוא יתווסף אוטומטית. להגדרת פריטים: הגדרות → חלוקת הצעת מחיר.
              </td>
            </tr>
          ) : (
            currentLines.map((line) => (
              <tr key={line.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                <td className="py-2.5 px-4 text-gray-900 dark:text-white">
                  {line.quote_structure_item_name}
                </td>
                <td className="py-2.5 px-4 text-right tabular-nums text-gray-900 dark:text-white">
                  {isDraft && editingAmounts.has(line.id) ? (
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        autoFocus
                        value={editingAmounts.get(line.id) ?? ''}
                        onChange={(e) => onEditLineAmount(line.id, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && onUpdateLineAmount(line.id, editingAmounts.get(line.id) ?? '')}
                        className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <button type="button" onClick={() => onUpdateLineAmount(line.id, editingAmounts.get(line.id) ?? '')} className="p-1 text-green-600"><CheckCircle className="w-4 h-4" /></button>
                      <button type="button" onClick={() => onCancelEditLine(line.id)} className="p-1 text-gray-500"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <span
                      className={`tabular-nums ${isDraft ? 'cursor-pointer hover:text-blue-600' : ''}`}
                      onClick={() => isDraft && onEditLineAmount(line.id, line.amount != null ? String(line.amount) : '')}
                    >
                      {line.amount != null ? line.amount.toLocaleString('he-IL') + ' ₪' : '–'}
                    </span>
                  )}
                </td>
                {isDraft && (
                  <td className="py-2.5 px-2">
                    {!editingAmounts.has(line.id) && (
                      <div className="flex gap-0.5">
                        <button type="button" onClick={() => onEditLineAmount(line.id, line.amount != null ? String(line.amount) : '')} className="p-1.5 text-gray-400 hover:text-gray-600 rounded" title="ערוך"><Pencil className="w-4 h-4" /></button>
                        <button type="button" onClick={() => onDeleteLine(line.id)} className="p-1.5 text-red-500 hover:text-red-600 rounded" title="מחק"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="bg-blue-50 dark:bg-blue-900/20 border-t-2 border-gray-200 dark:border-gray-700">
            <td className="py-2.5 px-4 font-semibold text-gray-800 dark:text-gray-200">סה&quot;כ הוצאות הצעת מחיר</td>
            <td className="py-2.5 px-4 text-right font-semibold tabular-nums text-gray-900 dark:text-white">
              {buildingTotal.toLocaleString('he-IL')} ₪
            </td>
            {isDraft && <td />}
          </tr>
          {showNumResidents && (
            <>
              <tr className={`border-t border-gray-200 dark:border-gray-700 ${isDraft ? 'bg-green-50 dark:bg-green-900/20' : 'bg-green-50/50 dark:bg-green-900/10'}`}>
                <td className="py-2.5 px-4 font-semibold text-gray-800 dark:text-gray-200">מספר דיירים</td>
                <td className="py-2.5 px-4 text-right">
                  {isDraft ? (
                    <div className="flex items-center justify-end gap-2">
                      <input
                        type="number"
                        min="1"
                        value={currentNumResidentsStr}
                        onChange={(e) => onNumResidentsChange(e.target.value)}
                        onBlur={onNumResidentsBlur}
                        className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white tabular-nums"
                      />
                      {savingNumResidents && <span className="text-xs text-gray-500">שומר...</span>}
                    </div>
                  ) : (
                    <span className="tabular-nums font-semibold">{effectiveResidents.toLocaleString('he-IL')}</span>
                  )}
                </td>
                {isDraft && <td />}
              </tr>
              <tr className="bg-amber-50 dark:bg-amber-900/20 border-t border-gray-200 dark:border-gray-700 font-semibold">
                <td className="py-2.5 px-4 text-gray-800 dark:text-gray-200">סה&quot;כ הוצאה לכל דייר</td>
                <td className="py-2.5 px-4 text-right tabular-nums text-gray-900 dark:text-white">
                  {effectiveResidents > 0
                    ? (buildingTotal / effectiveResidents).toLocaleString('he-IL', { minimumFractionDigits: 2 })
                    : '0.00'}{' '}
                  ₪
                </td>
                {isDraft && <td />}
              </tr>
            </>
          )}
        </tfoot>
      </table>
    </div>
  )
}
