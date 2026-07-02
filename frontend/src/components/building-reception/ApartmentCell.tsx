import { KeyRound, Package, ClipboardX } from 'lucide-react'
import type { Apartment } from '../../types/api'
import { ACCENT, PALETTE, apartmentTitle, deriveIndicators } from './constants'

interface ApartmentCellProps {
  apartment: Apartment
  onSelect: (apartment: Apartment) => void
}

/**
 * A single clickable apartment/common-area tile in the building overview grid.
 * Purely presentational — it renders derived visual state and delegates the
 * click upward. No data fetching or business logic lives here.
 */
export default function ApartmentCell({ apartment, onSelect }: ApartmentCellProps) {
  const { hasKeys, hasPendingDelivery, hasOpenTask, isVacant } = deriveIndicators(apartment)

  const accentBorder = apartment.is_common_area ? ACCENT : isVacant ? PALETTE.vacant : PALETTE.occupied
  const tenantLabel = apartment.is_common_area
    ? (apartment.label ?? 'שטח משותף')
    : isVacant
      ? '— פנויה —'
      : (apartment.current_tenant?.name ?? '—')
  const statusLabel = apartment.is_common_area ? 'תקין' : isVacant ? 'פנויה' : 'מאוכלסת'

  return (
    <button
      type="button"
      onClick={() => onSelect(apartment)}
      dir="rtl"
      className="w-[150px] min-h-[62px] text-right rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 flex flex-col gap-1 transition-transform duration-100 hover:-translate-y-0.5 hover:shadow-md"
      style={{ borderRightWidth: 4, borderRightColor: accentBorder }}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="font-extrabold text-sm text-gray-900 dark:text-white">
          {apartmentTitle(apartment)}
        </span>
        <span className="flex items-center gap-1">
          {hasKeys && <KeyRound className="w-4 h-4" style={{ color: PALETTE.key }} aria-label="מפתח" />}
          {hasPendingDelivery && (
            <Package className="w-4 h-4" style={{ color: PALETTE.delivery }} aria-label="משלוח ממתין" />
          )}
          {hasOpenTask && (
            <ClipboardX className="w-4 h-4" style={{ color: PALETTE.task }} aria-label="משימה פתוחה" />
          )}
        </span>
      </div>
      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 truncate">
        {tenantLabel}
      </span>
      <span className="flex items-center gap-1.5 text-[10.5px] font-bold" style={{ color: accentBorder }}>
        <span className="w-[7px] h-[7px] rounded-full" style={{ background: accentBorder }} />
        {statusLabel}
      </span>
    </button>
  )
}
