import { useEffect, useState } from 'react'
import { Layers, Check } from 'lucide-react'
import type { BuildingProjectCreate } from '../../types/api'
import ModalShell from './ModalShell'
import { LabeledField, PrimaryButton, SecondaryButton, TextField } from './FormControls'

interface CreateProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (payload: BuildingProjectCreate) => void
  submitting?: boolean
}

/** Modal for creating a reception-desk project that groups several buildings. */
export default function CreateProjectModal({ isOpen, onClose, onSubmit, submitting }: CreateProjectModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setName('')
    setDescription('')
  }, [isOpen])

  const canSubmit = name.trim().length > 0 && !submitting

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit({ name: name.trim(), description: description.trim() || null })
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      icon={Layers}
      title="הקמת פרויקט"
      subtitle="פרויקט מקבץ כמה בניינים תחת מתחם אחד"
      footer={
        <>
          <SecondaryButton onClick={onClose}>ביטול</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={!canSubmit} icon={Check}>
            הקם פרויקט
          </PrimaryButton>
        </>
      }
    >
      <LabeledField label="שם הפרויקט">
        <TextField value={name} onChange={setName} placeholder="לדוגמה: מתחם יערות ישראל" />
      </LabeledField>

      <LabeledField label="תיאור (לא חובה)">
        <TextField value={description} onChange={setDescription} placeholder="פרטים על הפרויקט" />
      </LabeledField>
    </ModalShell>
  )
}
