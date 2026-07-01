import { useEffect, useState } from 'react'
import { Car, Plus } from 'lucide-react'
import type { AuthorizedVehicleCreate } from '../../types/api'
import ModalShell from './ModalShell'
import { LabeledField, PrimaryButton, SecondaryButton, TextField } from './FormControls'

interface AddVehicleModalProps {
  isOpen: boolean
  onClose: () => void
  apartmentId: number | null
  onSubmit: (payload: AuthorizedVehicleCreate) => void
  submitting?: boolean
}

/**
 * Modal for authorizing a vehicle to enter for a specific apartment. Owns only
 * its own draft state; the create request is delegated to `onSubmit`.
 */
export default function AddVehicleModal({ isOpen, onClose, apartmentId, onSubmit, submitting }: AddVehicleModalProps) {
  const [plate, setPlate] = useState('')
  const [owner, setOwner] = useState('')
  const [model, setModel] = useState('')
  const [spot, setSpot] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setPlate('')
    setOwner('')
    setModel('')
    setSpot('')
  }, [isOpen])

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
      title="הוספת רכב מורשה"
      subtitle="רכבים המורשים להיכנס לחניון עבור דירה זו"
      footer={
        <>
          <SecondaryButton onClick={onClose}>ביטול</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={!canSubmit} icon={Plus}>
            הוסף רכב
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
