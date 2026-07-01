import { useEffect, useState } from 'react'
import { Car, Plus } from 'lucide-react'
import type { AuthorizedVehicleCreate } from '../../types/api'
import ModalShell from './ModalShell'
import { LabeledField, PrimaryButton, SecondaryButton, TextField } from './FormControls'

interface VehicleInitial {
  plate: string
  model: string | null
  owner_name: string
  parking_spot: string | null
}

interface AddVehicleModalProps {
  isOpen: boolean
  onClose: () => void
  apartmentId: number | null
  /** When set, the modal edits this vehicle instead of creating one. */
  initial?: VehicleInitial | null
  onSubmit: (payload: AuthorizedVehicleCreate) => void
  submitting?: boolean
}

/**
 * Modal for authorizing a vehicle for an apartment, or editing an existing one.
 * Owns only its own draft state; the request is delegated to `onSubmit`.
 */
export default function AddVehicleModal({ isOpen, onClose, apartmentId, initial, onSubmit, submitting }: AddVehicleModalProps) {
  const isEditing = initial != null
  const [plate, setPlate] = useState('')
  const [owner, setOwner] = useState('')
  const [model, setModel] = useState('')
  const [spot, setSpot] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setPlate(initial?.plate ?? '')
    setOwner(initial?.owner_name ?? '')
    setModel(initial?.model ?? '')
    setSpot(initial?.parking_spot ?? '')
  }, [isOpen, initial])

  const canSubmit = apartmentId !== null && plate.trim().length > 0 && owner.trim().length > 0 && !submitting

  const handleSubmit = () => {
    if (!canSubmit || apartmentId === null) return
    onSubmit({
      apartment_id: apartmentId,
      plate: plate.trim(),
      owner_name: owner.trim(),
      model: model.trim() || null,
      parking_spot: spot.trim() || null,
    })
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      icon={Car}
      title={isEditing ? 'עריכת רכב מורשה' : 'הוספת רכב מורשה'}
      subtitle="רכבים המורשים להיכנס לחניון עבור דירה זו"
      footer={
        <>
          <SecondaryButton onClick={onClose}>ביטול</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={!canSubmit} icon={Plus}>
            {isEditing ? 'שמור' : 'הוסף רכב'}
          </PrimaryButton>
        </>
      }
    >
      <div className="flex gap-3">
        <div className="flex-1">
          <LabeledField label="מספר רכב">
            <TextField value={plate} onChange={setPlate} placeholder="12-345-67" />
          </LabeledField>
        </div>
        <div className="flex-1">
          <LabeledField label="דגם">
            <TextField value={model} onChange={setModel} placeholder="לדוגמה: מאזדה 3" />
          </LabeledField>
        </div>
      </div>

      <LabeledField label="בעל הרכב">
        <TextField value={owner} onChange={setOwner} placeholder="שם בעל הרכב" />
      </LabeledField>

      <LabeledField label="חניה">
        <TextField value={spot} onChange={setSpot} placeholder="לדוגמה: B-14" />
      </LabeledField>
    </ModalShell>
  )
}
