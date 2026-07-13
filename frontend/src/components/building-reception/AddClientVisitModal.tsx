import { useEffect, useState } from 'react'
import { UserRound, Check } from 'lucide-react'
import type { ClientVisitCreate } from '../../types/api'
import ModalShell from './ModalShell'
import { DateTimeField, LabeledField, PrimaryButton, SecondaryButton, TextArea, TextField } from './FormControls'
import { localInputToUtcIso, utcIsoToLocalInput } from './constants'

interface ClientVisitInitial {
  name: string | null
  arrived_at: string
  expected_until: string | null
  note: string | null
}

interface AddClientVisitModalProps {
  isOpen: boolean
  onClose: () => void
  apartmentId: number | null
  /** When set, the modal edits this arrival instead of creating one. */
  initial?: ClientVisitInitial | null
  onSubmit: (payload: ClientVisitCreate) => void
  submitting?: boolean
}

/** Current local wall-clock as a `datetime-local` value (default arrival time). */
function nowLocalInput(): string {
  return utcIsoToLocalInput(new Date().toISOString())
}

/** Modal for registering a client arriving at an apartment, or editing one. */
export default function AddClientVisitModal({
  isOpen,
  onClose,
  apartmentId,
  initial,
  onSubmit,
  submitting,
}: AddClientVisitModalProps) {
  const isEditing = initial != null
  const [name, setName] = useState('')
  const [arrivedAt, setArrivedAt] = useState('')
  const [expectedUntil, setExpectedUntil] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setName(initial?.name ?? '')
    setArrivedAt(initial ? utcIsoToLocalInput(initial.arrived_at) : nowLocalInput())
    setExpectedUntil(initial?.expected_until ? utcIsoToLocalInput(initial.expected_until) : '')
    setNote(initial?.note ?? '')
  }, [isOpen, initial])

  // Arrival is mandatory; "until" is optional.
  const canSubmit = apartmentId !== null && arrivedAt.trim().length > 0 && !submitting

  const handleSubmit = () => {
    if (!canSubmit || apartmentId === null) return
    const arrivedIso = localInputToUtcIso(arrivedAt)
    if (!arrivedIso) return
    onSubmit({
      apartment_id: apartmentId,
      name: name.trim() || null,
      arrived_at: arrivedIso,
      expected_until: localInputToUtcIso(expectedUntil),
      note: note.trim() || null,
    })
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      icon={UserRound}
      title={isEditing ? 'עריכת הגעת לקוח' : 'הגעת לקוח'}
      subtitle="רישום לקוח שמגיע לדירה"
      footer={
        <>
          <SecondaryButton onClick={onClose}>ביטול</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={!canSubmit} icon={Check}>
            {isEditing ? 'שמור' : 'רישום הגעה'}
          </PrimaryButton>
        </>
      }
    >
      <LabeledField label="שם הלקוח (אופציונלי)">
        <TextField value={name} onChange={setName} placeholder="לדוגמה: ישראל ישראלי" />
      </LabeledField>

      <div className="flex gap-3">
        <div className="flex-1">
          <LabeledField label="מתי מגיע">
            <DateTimeField value={arrivedAt} onChange={setArrivedAt} />
          </LabeledField>
        </div>
        <div className="flex-1">
          <LabeledField label="עד מתי (אופציונלי)">
            <DateTimeField value={expectedUntil} onChange={setExpectedUntil} />
          </LabeledField>
        </div>
      </div>

      <LabeledField label="הערות">
        <TextArea value={note} onChange={setNote} placeholder="סיבת ההגעה / פרטים" />
      </LabeledField>
    </ModalShell>
  )
}
