import React from 'react'
import { Building2, Plus, Trash2 } from 'lucide-react'
import type { QuoteBuilding, QuoteCalculationMethod } from '../lib/apiClient'

export interface QuoteBuildingsPanelProps {
  buildings: QuoteBuilding[]
  activeBuildingIndex: number
  onSelectBuilding: (index: number) => void
  onAddBuilding?: () => void
  onDeleteBuilding?: (buildingId: number) => void
  onSaveAddress?: (address: string | null) => void
  onSaveCalculationMethod?: (method: QuoteCalculationMethod) => void
  isDraft: boolean
  addingBuilding?: boolean
}

export default function QuoteBuildingsPanel({
  buildings,
  activeBuildingIndex,
  onSelectBuilding,
  onAddBuilding,
  onDeleteBuilding,
  onSaveAddress,
  onSaveCalculationMethod,
  isDraft,
  addingBuilding = false,
}: QuoteBuildingsPanelProps) {
  const hasBuildings = buildings.length > 0
  const currentBuilding: QuoteBuilding | null =
    hasBuildings && activeBuildingIndex < buildings.length ? buildings[activeBuildingIndex]! : null

  const showAddBuilding = isDraft && onAddBuilding

  if (!hasBuildings) {
    return showAddBuilding ? (
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-2 mb-4">
        <button
          type="button"
          onClick={onAddBuilding}
          disabled={addingBuilding}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600"
        >
          <Plus className="w-4 h-4" /> הוסף בניין
        </button>
      </div>
    ) : null
  }

  return (
    <>
      {/* טאבים לבניינים */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-2 mb-4">
        {buildings.map((b, idx) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelectBuilding(idx)}
            className={`px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-2 ${
              idx === activeBuildingIndex
                ? 'bg-blue-600 text-white shadow'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            <Building2 className="w-4 h-4" />
            {b.address || `בניין ${idx + 1}`}
          </button>
        ))}
        {showAddBuilding && (
          <button
            type="button"
            onClick={onAddBuilding}
            disabled={addingBuilding}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600"
          >
            <Plus className="w-4 h-4" /> הוסף בניין
          </button>
        )}
      </div>

      {/* פרטי בניין נבחר: כתובת, צורת חישוב, מחק */}
      {currentBuilding != null && (
        <div className="mb-6 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 space-y-4">
          {isDraft && (
            <div className="flex flex-wrap items-center gap-4">
              {onSaveAddress && (
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    כתובת הבניין
                  </label>
                  <input
                    key={currentBuilding.id}
                    type="text"
                    defaultValue={currentBuilding.address ?? ''}
                    onBlur={(e) => onSaveAddress(e.target.value.trim() || null)}
                    placeholder="רחוב, מספר"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              )}
              {onSaveCalculationMethod && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    צורת חישוב
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={`calc-${currentBuilding.id}`}
                        checked={currentBuilding.calculation_method === 'by_residents'}
                        onChange={() => onSaveCalculationMethod('by_residents')}
                        className="rounded"
                      />
                      <span>שווה בשווה (לפי דיירים)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={`calc-${currentBuilding.id}`}
                        checked={currentBuilding.calculation_method === 'by_apartment_size'}
                        onChange={() => onSaveCalculationMethod('by_apartment_size')}
                        className="rounded"
                      />
                      <span>לפי גודל הדירה</span>
                    </label>
                  </div>
                </div>
              )}
              {hasBuildings && buildings.length > 1 && isDraft && onDeleteBuilding && (
                <button
                  type="button"
                  onClick={() => onDeleteBuilding(currentBuilding.id)}
                  className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                  title="מחק בניין"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
