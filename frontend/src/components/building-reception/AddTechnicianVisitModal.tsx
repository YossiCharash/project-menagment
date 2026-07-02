import { useEffect, useState } from 'react'
import { Wrench, Check } from 'lucide-react'
import type { TechnicianVisitCreate } from '../../types/api'
import ModalShell from './ModalShell'
import { LabeledField, PrimaryButton, SecondaryButton, TextArea, TextField } from './FormControls'

interface TechnicianVisitInitial {
  name: string
  role: string | null
  phone: string | null
  note: string | null
}

interface AddTechnicianVisitModalProps {
  isOpen: boolean
  onClose: () => void
  apartmentId: number | null
  /** When set, the modal edits this visit instead of creating one. */
  initial?: TechnicianVisitInitial | null
  onSubmit: (payload: TechnicianVisitCreate) => void
  submitting?: boolean
}

/** Modal for registering a technician entering an apartment, or editing one. */
export default function AddTechnicianVisitModal({
  isOpen,
  onClose,
  apartmentId,
  initial,
  onSubmit,
  submitting,
}: AddTechnicianVisitModalProps) {
  const isEditing = initial != null
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setName(initial?.name ?? '')
    setRole(initial?.role ?? '')
    setPhone(initial?.phone ?? '')
    setNote(initial?.note ?? '')
  }, [isOpen, initial])

  const canSubmit = apartmentId !== null && name.trim().length > 0 && !submitting

  const handleSubmit = () => {
    if (!canSubmit || apartmentId === null) return
    onSubmit({
      apartment_id: apartmentId,
      name: name.trim(),
      role: role.trim() || null,
      phone: phone.trim() || null,
      note: note.trim() || null,
    })
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      icon={Wrench}
      title={isEditing ? 'עריכת ביקור טכנאי' : 'כניסת טכנאי'}
      subtitle="רישום טכנאי שנכנס לדירה"
      footer={
        <>
          <SecondaryButton onClick={onClose}>ביטול</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={!canSubmit} icon={Check}>
            {isEditing ? 'שמור' : 'רישום כניסה'}
          </PrimaryButton>
        </>
      }
    >
      <LabeledField label="שם הטכנאי">
        <TextField value={name} onChange={setName} placeholder="לדוגמה: ישראל ישראלי" />
      </LabeledField>

      <div className="flex gap-3">
        <div className="flex-1">
          <LabeledField label="תפקיד">
            <TextField value={role} onChange={setRole} placeholder="חשמלאי / אינסטלטור / מיזוג" />
          </LabeledField>
        </div>
        <div className="flex-1">
          <LabeledField label="טלפון">
            <TextField value={phone} onChange={setPhone} placeholder="050-0000000" type="tel" />
          </LabeledField>
        </div>
      </div>

      <LabeledField label="הערות">
        <TextArea value={note} onChange={setNote} placeholder="חברה / סיבת הביקור" />
      </LabeledField>
    </ModalShell>
  )
}
