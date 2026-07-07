import { useState } from 'react'
import { MapPin, Settings, X } from 'lucide-react'
import { cemsApi, type CemsUser, type Warehouse } from '../../lib/cemsApi'
import { warehouseLabel } from '../../lib/warehouse'
import MapLocationPicker from './MapLocationPicker'

// ─── Style constants (shared with WarehousesPage) ────────────────────────────

const MODAL_OVERLAY = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4'
const MODAL_PANEL = 'bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto'
const INPUT_CLASS = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const LABEL_CLASS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'
const BTN_PRIMARY = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'
const BTN_SECONDARY = 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors'

// ─── Error messages (Hebrew) ─────────────────────────────────────────────────

const ERROR_NAME_REQUIRED = 'שם המחסן הוא שדה חובה'
const ERROR_UPDATE_GENERIC = 'שגיאה בעדכון פרטי המחסן'
const ERROR_UPDATE_MANAGER = 'שגיאה בעדכון מנהל המחסן'

// ─── Helpers ────────────────────────────────────────────────────────────────

interface FormState {
  name: string
  location: string
  managerId: number | ''
  latitude: number | null
  longitude: number | null
  parentId: string
}

/** Pure function: builds the initial form state from a warehouse record. */
function buildInitialFormState(warehouse: Warehouse): FormState {
  return {
    name: warehouse.name,
    location: warehouse.location ?? '',
    managerId: warehouse.current_manager_id ?? '',
    latitude: warehouse.latitude,
    longitude: warehouse.longitude,
    parentId: warehouse.parent_id ?? '',
  }
}

/**
 * Determines whether the manager assignment differs from the original.
 * Pulled out as a pure helper so the persistence step stays declarative.
 */
function isManagerChanged(form: FormState, original: Warehouse): boolean {
  const originalId = original.current_manager_id ?? ''
  return form.managerId !== originalId && form.managerId !== ''
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface WarehouseSettingsModalProps {
  warehouse: Warehouse
  /** All warehouses — used to populate the parent-warehouse selector. */
  warehouses: Warehouse[]
  users: CemsUser[]
  onClose: () => void
  onUpdated: () => void
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * Settings dialog for a single warehouse — name, manager, address, map location.
 * Wires to the existing `PUT /warehouses/{id}` and `change-manager` endpoints.
 */
export default function WarehouseSettingsModal({
  warehouse,
  warehouses,
  users,
  onClose,
  onUpdated,
}: WarehouseSettingsModalProps) {
  const [form, setForm] = useState<FormState>(() => buildInitialFormState(warehouse))

  // Exclude the warehouse itself so it cannot be its own parent.
  const parentOptions = warehouses.filter((candidate) => candidate.id !== warehouse.id)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function validate(): string | null {
    if (!form.name.trim()) return ERROR_NAME_REQUIRED
    return null
  }

  async function persistFieldChanges() {
    await cemsApi.updateWarehouse(warehouse.id, {
      name: form.name.trim(),
      location: form.location.trim() || null,
      latitude: form.latitude,
      longitude: form.longitude,
      parent_id: form.parentId || null,
    })
  }

  async function persistManagerChange() {
    if (!isManagerChanged(form, warehouse)) return
    try {
      await cemsApi.changeWarehouseManager(warehouse.id, form.managerId as number)
    } catch {
      throw new Error(ERROR_UPDATE_MANAGER)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await persistFieldChanges()
      await persistManagerChange()
      onUpdated()
      onClose()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : ERROR_UPDATE_GENERIC
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_PANEL} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
              <Settings className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              הגדרות מחסן — {warehouse.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="סגור"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4" dir="rtl">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-800 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Warehouse name */}
          <div>
            <label className={LABEL_CLASS}>שם המחסן *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              className={INPUT_CLASS}
              required
            />
          </div>

          {/* Manager selector */}
          <div>
            <label className={LABEL_CLASS}>מנהל</label>
            <select
              value={form.managerId}
              onChange={(e) =>
                updateField('managerId', e.target.value ? Number(e.target.value) : '')
              }
              className={INPUT_CLASS}
            >
              <option value="">לא הוגדר</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.full_name} ({user.email})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              שינוי המנהל יתועד בהיסטוריית המחסן.
            </p>
          </div>

          {/* Address */}
          <div>
            <label className={LABEL_CLASS}>מיקום (כתובת)</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => updateField('location', e.target.value)}
              className={INPUT_CLASS}
              placeholder="כתובת או תיאור מיקום"
            />
          </div>

          {/* Parent warehouse */}
          <div>
            <label className={LABEL_CLASS}>מחסן אב (אופציונלי)</label>
            <select
              value={form.parentId}
              onChange={(e) => updateField('parentId', e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">ללא (מחסן ראשי)</option>
              {parentOptions.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {warehouseLabel(candidate)}
                </option>
              ))}
            </select>
          </div>

          {/* Map picker */}
          <div>
            <label className={LABEL_CLASS}>מיקום במפה</label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              לחץ על המפה או גרור את הסמן כדי להגדיר את מיקום המחסן.
            </p>
            <MapLocationPicker
              latitude={form.latitude}
              longitude={form.longitude}
              onChange={({ lat, lng }) => {
                updateField('latitude', lat)
                updateField('longitude', lng)
              }}
            />
            {form.latitude !== null && form.longitude !== null && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 tabular-nums">
                {form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>
              ביטול
            </button>
            <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
              {submitting ? 'שומר...' : 'שמור שינויים'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
