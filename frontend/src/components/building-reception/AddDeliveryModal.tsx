import { useEffect, useState } from 'react'
import { PackagePlus, Check } from 'lucide-react'
import type { DeliveryCreate } from '../../types/api'
import ModalShell from './ModalShell'
import { LabeledField, PrimaryButton, SecondaryButton, TextField } from './FormControls'

interface DeliveryInitial {
  title: string
  kind: string | null
  meta: string | null
}

interface AddDeliveryModalProps {
  isOpen: boolean
  onClose: () => void
  apartmentId: number | null
  /** When set, the modal edits this delivery instead of creating one. */
  initial?: DeliveryInitial | null
  onSubmit: (payload: DeliveryCreate) => void
  submitting?: boolean
}

/** Modal for registering a package that arrived for an apartment, or editing one. */
export default function AddDeliveryModal({ isOpen, onClose, apartmentId, initial, onSubmit, submitting }: AddDeliveryModalProps) {
  const isEditing = initial != null
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState('')
  const [meta, setMeta] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setTitle(initial?.title ?? '')
    setKind(initial?.kind ?? '')
    setMeta(initial?.meta ?? '')
  }, [isOpen, initial])

  const canSubmit = apartmentId !== null && title.trim().length > 0 && !submitting

  const handleSubmit = () => {
    if (!canSubmit || apartmentId === null) return
    onSubmit({
      apartment_id: apartmentId,
      title: title.trim(),
      kind: kind.trim() || null,
      meta: meta.trim() || null,
    })
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      icon={PackagePlus}
      title={isEditing ? 'עריכת משלוח' : 'הוספת משלוח'}
      subtitle="רישום חבילה שהתקבלה בדלפק"
      footer={
        <>
          <SecondaryButton onClick={onClose}>ביטול</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={!canSubmit} icon={Check}>
            {isEditing ? 'שמור' : 'הוסף משלוח'}
          </PrimaryButton>
        </>
      }
    >
      <LabeledField label="תיאור המשלוח">
        <TextField value={title} onChange={setTitle} placeholder="לדוגמה: חבילה מאמזון" />
      </LabeledField>

      <div className="flex gap-3">
        <div className="flex-1">
          <LabeledField label="סוג">
            <TextField value={kind} onChange={setKind} placeholder="חבילה / מכתב / פרחים" />
          </LabeledField>
        </div>
        <div className="flex-1">
          <LabeledField label="פרטים">
            <TextField value={meta} onChange={setMeta} placeholder="שליח / חברה" />
          </LabeledField>
        </div>
      </div>
    </ModalShell>
  )
}
