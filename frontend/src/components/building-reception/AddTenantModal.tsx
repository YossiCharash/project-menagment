import { useEffect, useState } from 'react'
import { UserPlus, Check } from 'lucide-react'
import type { TenantCreate } from '../../types/api'
import ModalShell from './ModalShell'
import { LabeledField, PrimaryButton, SecondaryButton, TextField } from './FormControls'

interface AddTenantModalProps {
  isOpen: boolean
  onClose: () => void
  /** Whether the apartment already has a current tenant (affects the copy). */
  hasCurrentTenant: boolean
  onSubmit: (payload: TenantCreate) => void
  submitting?: boolean
}

/**
 * Modal for moving a resident into an apartment. When a current tenant already
 * exists the backend moves them to history automatically (החלפת דייר).
 */
export default function AddTenantModal({ isOpen, onClose, hasCurrentTenant, onSubmit, submitting }: AddTenantModalProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [moveIn, setMoveIn] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setName('')
    setPhone('')
    setEmail('')
    setMoveIn('')
  }, [isOpen])

  const canSubmit = name.trim().length > 0 && !submitting

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit({
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      move_in_date: moveIn || null,
    })
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      icon={UserPlus}
      title={hasCurrentTenant ? 'החלפת דייר' : 'הוספת דייר'}
      subtitle={hasCurrentTenant ? 'הדייר הנוכחי יעבור להיסטוריה' : 'רישום דייר חדש לדירה'}
      footer={
        <>
          <SecondaryButton onClick={onClose}>ביטול</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={!canSubmit} icon={Check}>
            {hasCurrentTenant ? 'החלף דייר' : 'הוסף דייר'}
          </PrimaryButton>
        </>
      }
    >
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

      <LabeledField label="תחילת חוזה">
        <TextField value={moveIn} onChange={setMoveIn} type="date" />
      </LabeledField>
    </ModalShell>
  )
}
