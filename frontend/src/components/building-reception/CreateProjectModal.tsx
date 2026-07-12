import { useEffect, useState } from 'react'
import { Layers, Check } from 'lucide-react'
import type { BuildingProjectCreate } from '../../types/api'
import ModalShell from './ModalShell'
import { LabeledField, PrimaryButton, SecondaryButton, TextField } from './FormControls'

interface CreateProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (payload: BuildingProjectCreate) => void
  /** When provided, the modal opens in edit mode pre-filled with these values. */
  initial?: { name: string; description: string | null } | null
  submitting?: boolean
}

/**
 * Modal for creating or editing a reception-desk project that groups several
 * buildings. Passing `initial` switches it to edit mode (same fields, different
 * copy) — the parent decides create vs. update from its own edit target.
 */
export default function CreateProjectModal({ isOpen, onClose, onSubmit, initial, submitting }: CreateProjectModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const isEdit = initial != null

  useEffect(() => {
    if (!isOpen) return
    setName(initial?.name ?? '')
    setDescription(initial?.description ?? '')
  }, [isOpen, initial])

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
      title={isEdit ? 'עריכת פרויקט' : 'הקמת פרויקט'}
      subtitle="פרויקט מקבץ כמה בניינים תחת מתחם אחד"
      footer={
        <>
          <SecondaryButton onClick={onClose}>ביטול</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={!canSubmit} icon={Check}>
            {isEdit ? 'שמור שינויים' : 'הקם פרויקט'}
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
