import { useState } from 'react'
import { Building2, Check, CheckSquare, Square } from 'lucide-react'
import type { BuildingCreate } from '../../types/api'
import { ACCENT } from './constants'
import ModalShell from './ModalShell'
import { LabeledField, PrimaryButton, SecondaryButton, Stepper, TextField } from './FormControls'

interface CreateBuildingModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (payload: BuildingCreate) => void
  submitting?: boolean
}

const DEFAULT_FLOORS = 5
const DEFAULT_UNITS_PER_FLOOR = 4

/**
 * Wizard-style modal for provisioning a new building. Owns only its own draft
 * form state; the actual create request is delegated to `onSubmit` (Dependency
 * Inversion — the modal depends on a callback abstraction, not on the store).
 */
export default function CreateBuildingModal({ isOpen, onClose, onSubmit, submitting }: CreateBuildingModalProps) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [floors, setFloors] = useState(DEFAULT_FLOORS)
  const [unitsPerFloor, setUnitsPerFloor] = useState(DEFAULT_UNITS_PER_FLOOR)
  const [hasCommonAreas, setHasCommonAreas] = useState(true)

  const totalUnits = floors * unitsPerFloor
  const canSubmit = name.trim().length > 0 && !submitting

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit({
      name: name.trim(),
      address: address.trim() || null,
      floors_count: floors,
      units_per_floor: unitsPerFloor,
      has_common_areas: hasCommonAreas,
    })
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      icon={Building2}
      title="הקמת בניין חדש"
      subtitle="הבניינים מנוהלים כאן בתוך הדלפק, בנפרד מהפרויקטים הכלליים במערכת."
      footer={
        <>
          <SecondaryButton onClick={onClose}>ביטול</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={!canSubmit} icon={Check}>
            הקם בניין
          </PrimaryButton>
        </>
      }
    >
      <LabeledField label="שם הבניין">
        <TextField value={name} onChange={setName} placeholder="לדוגמה: בניין D" />
      </LabeledField>

      <LabeledField label="כתובת">
        <TextField value={address} onChange={setAddress} placeholder="רחוב ומספר" />
      </LabeledField>

      <div className="flex gap-3">
        <div className="flex-1">
          <LabeledField label="מספר קומות">
            <Stepper value={floors} min={1} max={40} onChange={setFloors} />
          </LabeledField>
        </div>
        <div className="flex-1">
          <LabeledField label="דירות בקומה">
            <Stepper value={unitsPerFloor} min={1} max={12} onChange={setUnitsPerFloor} />
          </LabeledField>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setHasCommonAreas((current) => !current)}
        dir="rtl"
        className="text-right rounded-xl px-3.5 py-3 flex items-center gap-3 border transition-colors"
        style={{
          borderColor: hasCommonAreas ? ACCENT : '#E2E2E8',
          background: hasCommonAreas ? `${ACCENT}12` : 'transparent',
        }}
      >
        {hasCommonAreas ? (
          <CheckSquare className="w-5 h-5" style={{ color: ACCENT }} />
        ) : (
          <Square className="w-5 h-5 text-gray-400" />
        )}
        <span className="flex-1 leading-tight">
          <span className="block text-sm font-bold text-gray-900 dark:text-white">כלול שטחים משותפים</span>
          <span className="block text-xs font-semibold text-gray-500 dark:text-gray-400">
            לובי, חניון ומחסנים — אזורים שאינם נכס מגורים
          </span>
        </span>
      </button>

      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-xl px-3.5 py-2.5 leading-relaxed">
        ייווצרו <b className="text-gray-900 dark:text-white">{totalUnits}</b> דירות ב-
        <b className="text-gray-900 dark:text-white"> {floors}</b> קומות. ניתן יהיה להיכנס לכל דירה ולמלא פרטים מלאים.
      </div>
    </ModalShell>
  )
}
