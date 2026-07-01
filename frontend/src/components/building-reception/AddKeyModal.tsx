import { useEffect, useState } from 'react'
import { KeyRound, Check } from 'lucide-react'
import ModalShell from './ModalShell'
import { LabeledField, PrimaryButton, SecondaryButton, TextField } from './FormControls'

interface AddKeyModalProps {
  isOpen: boolean
  onClose: () => void
  /** When set, the modal renames this existing key instead of creating one. */
  initialLabel?: string | null
  onSubmit: (label: string) => void
  submitting?: boolean
}

/** Modal for registering a new key at the desk, or renaming an existing one. */
export default function AddKeyModal({ isOpen, onClose, initialLabel, onSubmit, submitting }: AddKeyModalProps) {
  const isEditing = initialLabel != null
  const [label, setLabel] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setLabel(initialLabel ?? '')
  }, [isOpen, initialLabel])

  const canSubmit = label.trim().length > 0 && !submitting

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit(label.trim())
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      icon={KeyRound}
      title={isEditing ? 'שינוי שם מפתח' : 'הוספת מפתח'}
      subtitle={isEditing ? 'עדכון התיאור של המפתח' : 'רישום מפתח חדש לדירה זו'}
      footer={
        <>
          <SecondaryButton onClick={onClose}>ביטול</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={!canSubmit} icon={Check}>
            {isEditing ? 'שמור' : 'הוסף מפתח'}
          </PrimaryButton>
        </>
      }
    >
      <LabeledField label="תיאור המפתח">
        <TextField value={label} onChange={setLabel} placeholder="לדוגמה: מפתח ראשי / דלת כניסה" />
      </LabeledField>
    </ModalShell>
  )
}
