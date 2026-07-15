import { useEffect, useState } from 'react'
import { DoorOpen, Check, CheckSquare, Square } from 'lucide-react'
import type { ApartmentCreate } from '../../types/api'
import { ACCENT } from './constants'
import ModalShell from './ModalShell'
import { LabeledField, PrimaryButton, SecondaryButton, Stepper, TextArea, TextField } from './FormControls'

interface ApartmentInitial {
  floor: number
  unit_number: string
  label: string | null
  is_common_area: boolean
  parking_number: string | null
  storage_number: string | null
  owner_name: string | null
  owner_phone: string | null
  owner_email: string | null
  owner_name_2: string | null
  owner_phone_2: string | null
  owner_email_2: string | null
  management_company_name: string | null
  management_company_phone: string | null
  attorneys: string | null
  equipment: string | null
  notes: string | null
}

interface AddApartmentModalProps {
  isOpen: boolean
  onClose: () => void
  buildingId: number | null
  /** Floor to pre-fill when opened from a specific floor row. */
  defaultFloor?: number
  /** When set, the modal edits this apartment instead of creating one. */
  initial?: ApartmentInitial | null
  onSubmit: (payload: ApartmentCreate) => void
  submitting?: boolean
}

/** Modal for adding a single apartment / common area to a building, or editing one. */
export default function AddApartmentModal({
  isOpen,
  onClose,
  buildingId,
  defaultFloor = 1,
  initial,
  onSubmit,
  submitting,
}: AddApartmentModalProps) {
  const isEditing = initial != null
  const [floor, setFloor] = useState(defaultFloor)
  const [unitNumber, setUnitNumber] = useState('')
  const [label, setLabel] = useState('')
  const [isCommon, setIsCommon] = useState(false)
  const [parkingNumber, setParkingNumber] = useState('')
  const [storageNumber, setStorageNumber] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerName2, setOwnerName2] = useState('')
  const [ownerPhone2, setOwnerPhone2] = useState('')
  const [ownerEmail2, setOwnerEmail2] = useState('')
  const [managementCompanyName, setManagementCompanyName] = useState('')
  const [managementCompanyPhone, setManagementCompanyPhone] = useState('')
  const [attorneys, setAttorneys] = useState('')
  const [equipment, setEquipment] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setFloor(initial?.floor ?? defaultFloor)
    setUnitNumber(initial?.unit_number ?? '')
    setLabel(initial?.label ?? '')
    setIsCommon(initial?.is_common_area ?? false)
    setParkingNumber(initial?.parking_number ?? '')
    setStorageNumber(initial?.storage_number ?? '')
    setOwnerName(initial?.owner_name ?? '')
    setOwnerPhone(initial?.owner_phone ?? '')
    setOwnerEmail(initial?.owner_email ?? '')
    setOwnerName2(initial?.owner_name_2 ?? '')
    setOwnerPhone2(initial?.owner_phone_2 ?? '')
    setOwnerEmail2(initial?.owner_email_2 ?? '')
    setManagementCompanyName(initial?.management_company_name ?? '')
    setManagementCompanyPhone(initial?.management_company_phone ?? '')
    setAttorneys(initial?.attorneys ?? '')
    setEquipment(initial?.equipment ?? '')
    setNotes(initial?.notes ?? '')
  }, [isOpen, defaultFloor, initial])

  const canSubmit = buildingId !== null && unitNumber.trim().length > 0 && !submitting

  const handleSubmit = () => {
    if (!canSubmit || buildingId === null) return
    onSubmit({
      building_id: buildingId,
      floor,
      unit_number: unitNumber.trim(),
      label: label.trim() || null,
      is_common_area: isCommon,
      parking_number: parkingNumber.trim() || null,
      storage_number: storageNumber.trim() || null,
      owner_name: ownerName.trim() || null,
      owner_phone: ownerPhone.trim() || null,
      owner_email: ownerEmail.trim() || null,
      owner_name_2: ownerName2.trim() || null,
      owner_phone_2: ownerPhone2.trim() || null,
      owner_email_2: ownerEmail2.trim() || null,
      management_company_name: managementCompanyName.trim() || null,
      management_company_phone: managementCompanyPhone.trim() || null,
      attorneys: attorneys.trim() || null,
      equipment: equipment.trim() || null,
      notes: notes.trim() || null,
    })
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      icon={DoorOpen}
      title={isEditing ? 'עריכת דירה' : 'הוספת דירה'}
      subtitle={isEditing ? 'עדכון פרטי הדירה' : 'הוספת דירה או שטח משותף לבניין קיים'}
      footer={
        <>
          <SecondaryButton onClick={onClose}>ביטול</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={!canSubmit} icon={Check}>
            {isEditing ? 'שמור' : 'הוסף דירה'}
          </PrimaryButton>
        </>
      }
    >
      <div className="flex gap-3">
        <div className="flex-1">
          <LabeledField label="קומה (אפשר מינוס)">
            <Stepper value={floor} min={-5} max={60} onChange={setFloor} />
          </LabeledField>
        </div>
        <div className="flex-1">
          <LabeledField label="מספר דירה">
            <TextField value={unitNumber} onChange={setUnitNumber} placeholder="לדוגמה: 305" />
          </LabeledField>
        </div>
      </div>

      <LabeledField label="תווית (לא חובה)">
        <TextField value={label} onChange={setLabel} placeholder="לדוגמה: פנטהאוז" />
      </LabeledField>

      <div className="flex gap-3">
        <div className="flex-1">
          <LabeledField label="מספר חניה">
            <TextField value={parkingNumber} onChange={setParkingNumber} placeholder="לדוגמה: -1/42" />
          </LabeledField>
        </div>
        <div className="flex-1">
          <LabeledField label="מספר מחסן">
            <TextField value={storageNumber} onChange={setStorageNumber} placeholder="לדוגמה: מ-17" />
          </LabeledField>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setIsCommon((current) => !current)}
        dir="rtl"
        className="text-right rounded-xl px-3.5 py-3 flex items-center gap-3 border transition-colors"
        style={{
          borderColor: isCommon ? ACCENT : '#E2E2E8',
          background: isCommon ? `${ACCENT}12` : 'transparent',
        }}
      >
        {isCommon ? (
          <CheckSquare className="w-5 h-5" style={{ color: ACCENT }} />
        ) : (
          <Square className="w-5 h-5 text-gray-400" />
        )}
        <span className="flex-1 leading-tight">
          <span className="block text-sm font-bold text-gray-900 dark:text-white">שטח משותף</span>
          <span className="block text-xs font-semibold text-gray-500 dark:text-gray-400">לובי, חניון או מחסן — לא נכס מגורים</span>
        </span>
      </button>

      <div className="text-xs font-extrabold text-gray-500 dark:text-gray-400 pt-1">בעלי הנכס — איש קשר 1</div>
      <div className="flex gap-3">
        <div className="flex-1">
          <LabeledField label="שם בעלים">
            <TextField value={ownerName} onChange={setOwnerName} placeholder="שם הבעלים" />
          </LabeledField>
        </div>
        <div className="flex-1">
          <LabeledField label="טלפון בעלים">
            <TextField value={ownerPhone} onChange={setOwnerPhone} placeholder="לדוגמה: 050-1234567" type="tel" />
          </LabeledField>
        </div>
      </div>
      <LabeledField label="דוא״ל בעלים">
        <TextField value={ownerEmail} onChange={setOwnerEmail} placeholder="name@example.com" type="email" />
      </LabeledField>

      <div className="text-xs font-extrabold text-gray-500 dark:text-gray-400 pt-1">בעלי הנכס — איש קשר 2</div>
      <div className="flex gap-3">
        <div className="flex-1">
          <LabeledField label="שם בעלים 2">
            <TextField value={ownerName2} onChange={setOwnerName2} placeholder="שם הבעלים הנוסף" />
          </LabeledField>
        </div>
        <div className="flex-1">
          <LabeledField label="טלפון בעלים 2">
            <TextField value={ownerPhone2} onChange={setOwnerPhone2} placeholder="לדוגמה: 050-1234567" type="tel" />
          </LabeledField>
        </div>
      </div>
      <LabeledField label="דוא״ל בעלים 2">
        <TextField value={ownerEmail2} onChange={setOwnerEmail2} placeholder="name@example.com" type="email" />
      </LabeledField>

      <div className="flex gap-3">
        <div className="flex-1">
          <LabeledField label="חברת ניהול">
            <TextField value={managementCompanyName} onChange={setManagementCompanyName} placeholder="שם חברת הניהול" />
          </LabeledField>
        </div>
        <div className="flex-1">
          <LabeledField label="טלפון איש קשר — חברת ניהול">
            <TextField value={managementCompanyPhone} onChange={setManagementCompanyPhone} placeholder="לדוגמה: 03-1234567" type="tel" />
          </LabeledField>
        </div>
      </div>

      <LabeledField label="מיופי כח נוספים">
        <TextArea value={attorneys} onChange={setAttorneys} placeholder="שם + טלפון, שורה לכל מיופה כח" />
      </LabeledField>

      <LabeledField label="ציוד בדירה">
        <TextArea value={equipment} onChange={setEquipment} placeholder="פירוט הציוד שנמצא בדירה" />
      </LabeledField>

      <LabeledField label="הערות">
        <TextArea value={notes} onChange={setNotes} placeholder="הערות על הדירה" />
      </LabeledField>
    </ModalShell>
  )
}
