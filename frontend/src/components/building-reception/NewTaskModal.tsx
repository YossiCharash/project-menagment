import { useEffect, useMemo, useState } from 'react'
import { ClipboardPlus, Plus, CalendarCheck } from 'lucide-react'
import type { Apartment, BuildingReceptionTaskCreate } from '../../types/api'
import BuildingReceptionAPI from '../../lib/buildingReceptionApi'
import { ACCENT, apartmentTitle } from './constants'
import ModalShell from './ModalShell'
import { LabeledField, PrimaryButton, SecondaryButton, TextField } from './FormControls'

interface NewTaskModalProps {
  isOpen: boolean
  onClose: () => void
  /** Apartments available to link the task to (from the active building). */
  apartments: Apartment[]
  /** Pre-selected apartment when opened from a specific apartment context. */
  defaultApartmentId?: number | null
  onSubmit: (payload: BuildingReceptionTaskCreate) => void
  submitting?: boolean
}

const CATEGORIES = ['תחזוקה', 'ניקיון', 'משלוח', 'מפתחות', 'ביקורת'] as const

/** Combines a yyyy-mm-dd date and hh:mm time into a local ISO string, or null. */
function toIso(date: string, time: string): string | null {
  if (!date) return null
  const value = new Date(`${date}T${time || '12:00'}`)
  return Number.isNaN(value.getTime()) ? null : value.toISOString()
}

/**
 * Modal for creating a task against the existing global task endpoint, with
 * the reception-desk niceties (apartment linkage, category, assignee).
 */
export default function NewTaskModal({
  isOpen,
  onClose,
  apartments,
  defaultApartmentId,
  onSubmit,
  submitting,
}: NewTaskModalProps) {
  const [title, setTitle] = useState('')
  const [apartmentId, setApartmentId] = useState<number | null>(defaultApartmentId ?? null)
  const [category, setCategory] = useState<string>(CATEGORIES[0])
  const [date, setDate] = useState('')
  const [time, setTime] = useState('12:00')
  const [assigneeId, setAssigneeId] = useState<number | null>(null)
  const [assignees, setAssignees] = useState<Array<{ id: number; full_name: string }>>([])

  useEffect(() => {
    if (!isOpen) return
    setApartmentId(defaultApartmentId ?? null)
    let active = true
    BuildingReceptionAPI.listTaskAssignees()
      .then((list) => {
        if (!active) return
        setAssignees(list)
        setAssigneeId((current) => current ?? list[0]?.id ?? null)
      })
      .catch(() => {
        /* directory is optional; submit stays disabled until an assignee exists */
      })
    return () => {
      active = false
    }
  }, [isOpen, defaultApartmentId])

  const assigneeName = useMemo(
    () => assignees.find((person) => person.id === assigneeId)?.full_name ?? '',
    [assignees, assigneeId],
  )

  const canSubmit = title.trim().length > 0 && assigneeId !== null && !submitting

  const handleSubmit = () => {
    if (!canSubmit || assigneeId === null) return
    const start = toIso(date, time)
    onSubmit({
      title: title.trim(),
      assigned_to_user_id: assigneeId,
      apartment_id: apartmentId,
      start_time: start,
      end_time: start,
      description: category,
    })
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      icon={ClipboardPlus}
      title="משימה חדשה"
      subtitle="תופיע בדשבורד הדלפק וביומן האישי של מי שמשויך"
      footer={
        <>
          <SecondaryButton onClick={onClose}>ביטול</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={!canSubmit} icon={Plus}>
            צור משימה
          </PrimaryButton>
        </>
      }
    >
      <LabeledField label="מה צריך לעשות?">
        <TextField value={title} onChange={setTitle} placeholder="כותרת המשימה" />
      </LabeledField>

      <LabeledField label="שיוך — דירה / אזור">
        <select
          value={apartmentId ?? ''}
          onChange={(event) => setApartmentId(event.target.value ? Number(event.target.value) : null)}
          dir="rtl"
          className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm font-semibold bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none"
        >
          <option value="">ללא שיוך</option>
          {apartments.map((apartment) => (
            <option key={apartment.id} value={apartment.id}>
              {apartmentTitle(apartment)}
            </option>
          ))}
        </select>
      </LabeledField>

      <LabeledField label="קטגוריה">
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map((name) => {
            const selected = category === name
            return (
              <button
                key={name}
                type="button"
                onClick={() => setCategory(name)}
                className="text-xs font-bold px-3 py-1.5 rounded-full border transition-colors"
                style={{
                  color: selected ? '#fff' : '#6B6B7B',
                  background: selected ? ACCENT : 'transparent',
                  borderColor: selected ? ACCENT : '#E2E2E8',
                }}
              >
                {name}
              </button>
            )
          })}
        </div>
      </LabeledField>

      <div className="flex gap-3">
        <div className="flex-1">
          <LabeledField label="תאריך">
            <TextField value={date} onChange={setDate} type="date" />
          </LabeledField>
        </div>
        <div className="flex-1">
          <LabeledField label="שעה">
            <TextField value={time} onChange={setTime} type="time" />
          </LabeledField>
        </div>
      </div>

      <LabeledField label="משויך ל — יופיע ביומן האישי שלו">
        <select
          value={assigneeId ?? ''}
          onChange={(event) => setAssigneeId(event.target.value ? Number(event.target.value) : null)}
          dir="rtl"
          className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm font-semibold bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none"
        >
          <option value="" disabled>
            בחר עובד
          </option>
          {assignees.map((person) => (
            <option key={person.id} value={person.id}>
              {person.full_name}
            </option>
          ))}
        </select>
      </LabeledField>

      {assigneeName && (
        <div className="text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30 rounded-xl px-3.5 py-2.5 leading-relaxed flex items-center gap-2">
          <CalendarCheck className="w-[18px] h-[18px]" />
          המשימה תסונכרן אוטומטית ליומן האישי של {assigneeName}.
        </div>
      )}
    </ModalShell>
  )
}
