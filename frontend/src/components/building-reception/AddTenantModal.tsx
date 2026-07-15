import { useEffect, useState } from 'react'
import { UserPlus, Check } from 'lucide-react'
import type { TenantCreate } from '../../types/api'
import ModalShell from './ModalShell'
import { LabeledField, PrimaryButton, SecondaryButton, TextField } from './FormControls'

interface TenantInitial {
  name: string
  phone: string | null
  email: string | null
  name_2: string | null
  phone_2: string | null
  email_2: string | null
  move_in_date: string | null
}

interface AddTenantModalProps {
  isOpen: boolean
  onClose: () => void
  /** Whether the apartment already has a current tenant (affects the copy). */
  hasCurrentTenant: boolean
  /** When set, the modal edits this tenant instead of adding/replacing. */
  initial?: TenantInitial | null
  onSubmit: (payload: TenantCreate) => void
  submitting?: boolean
}

/**
 * Modal for moving a resident into an apartment, or editing an existing tenant.
 * When adding and a current tenant already exists the backend moves them to
 * history automatically (החלפת דייר).
 */
export default function AddTenantModal({
  isOpen,
  onClose,
  hasCurrentTenant,
  initial,
  onSubmit,
  submitting,
}: AddTenantModalProps) {
  const isEditing = initial != null
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [name2, setName2] = useState('')
  const [phone2, setPhone2] = useState('')
  const [email2, setEmail2] = useState('')
  const [moveIn, setMoveIn] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setName(initial?.name ?? '')
    setPhone(initial?.phone ?? '')
    setEmail(initial?.email ?? '')
    setName2(initial?.name_2 ?? '')
    setPhone2(initial?.phone_2 ?? '')
    setEmail2(initial?.email_2 ?? '')
    setMoveIn(initial?.move_in_date ?? '')
  }, [isOpen, initial])

  const canSubmit = name.trim().length > 0 && !submitting

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit({
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      name_2: name2.trim() || null,
      phone_2: phone2.trim() || null,
      email_2: email2.trim() || null,
      move_in_date: moveIn || null,
    })
  }

  const title = isEditing ? 'עריכת דייר' : hasCurrentTenant ? 'החלפת דייר' : 'הוספת דייר'
  const subtitle = isEditing
    ? 'עדכון פרטי הדייר'
    : hasCurrentTenant
      ? 'הדייר הנוכחי יעבור להיסטוריה'
      : 'רישום דייר חדש לדירה'
  const cta = isEditing ? 'שמור' : hasCurrentTenant ? 'החלף דייר' : 'הוסף דייר'

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      icon={UserPlus}
      title={title}
      subtitle={subtitle}
      footer={
        <>
          <SecondaryButton onClick={onClose}>ביטול</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={!canSubmit} icon={Check}>
            {cta}
          </PrimaryButton>
        </>
      }
    >
      <div className="text-xs font-extrabold text-gray-500 dark:text-gray-400">איש קשר 1</div>
      <LabeledField label="שם הדייר">
        <TextField value={name} onChange={setName} placeholder="שם מלא" />
      </LabeledField>

      <div className="flex gap-3">
        <div className="flex-1">
          <LabeledField label="טלפון">
            <TextField value={phone} onChange={setPhone} placeholder="050-0000000" />
          </LabeledField>
        </div>
        <div className="flex-1">
          <LabeledField label="דוא״ל">
            <TextField value={email} onChange={setEmail} placeholder="name@example.com" />
          </LabeledField>
        </div>
      </div>

      <div className="text-xs font-extrabold text-gray-500 dark:text-gray-400 pt-1">איש קשר 2</div>
      <LabeledField label="שם איש קשר נוסף">
        <TextField value={name2} onChange={setName2} placeholder="שם מלא" />
      </LabeledField>

      <div className="flex gap-3">
        <div className="flex-1">
          <LabeledField label="טלפון">
            <TextField value={phone2} onChange={setPhone2} placeholder="050-0000000" />
          </LabeledField>
        </div>
        <div className="flex-1">
          <LabeledField label="דוא״ל">
            <TextField value={email2} onChange={setEmail2} placeholder="name@example.com" />
          </LabeledField>
        </div>
      </div>

      <LabeledField label="תחילת חוזה">
        <TextField value={moveIn} onChange={setMoveIn} type="date" />
      </LabeledField>
    </ModalShell>
  )
}
