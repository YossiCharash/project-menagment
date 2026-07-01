import { Car, Plus, Trash2 } from 'lucide-react'
import type { AuthorizedVehicle } from '../../types/api'
import { ACCENT } from './constants'

interface VehicleListProps {
  vehicles: AuthorizedVehicle[]
  onAdd: () => void
  onDelete: (vehicleId: number) => void
}

/** "רכבים מורשים להיכנס" — the vehicles tab of the apartment panel. */
export default function VehicleList({ vehicles, onAdd, onDelete }: VehicleListProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="text-xs font-extrabold text-gray-500 dark:text-gray-400 px-0.5">רכבים מורשים להיכנס</div>
      {vehicles.map((vehicle) => (
        <div
          key={vehicle.id}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-3 flex items-center gap-3"
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${ACCENT}1F`, color: ACCENT }}
          >
            <Car className="w-5 h-5" />
          </div>
          <div className="flex-1 leading-tight min-w-0">
            <div className="text-sm font-extrabold tracking-wide text-gray-900 dark:text-white">{vehicle.plate}</div>
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 truncate">
              {[vehicle.model, vehicle.owner_name].filter(Boolean).join(' · ')}
            </div>
          </div>
          {vehicle.parking_spot && (
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">
              {vehicle.parking_spot}
            </span>
          )}
          <button
            type="button"
            onClick={() => onDelete(vehicle.id)}
            className="text-gray-400 hover:text-red-500 transition-colors"
            aria-label="מחיקת רכב"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      {vehicles.length === 0 && (
        <div className="text-xs font-semibold text-gray-400 text-center py-6">אין רכבים מורשים לדירה זו</div>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="w-full mt-1 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl py-2.5 text-sm font-bold text-gray-500 dark:text-gray-300 flex items-center justify-center gap-1.5 hover:bg-gray-50 dark:hover:bg-gray-700"
      >
        <Plus className="w-5 h-5" />
        הוספת רכב מורשה
      </button>
    </div>
  )
}
