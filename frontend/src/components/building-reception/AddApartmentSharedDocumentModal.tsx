import { useEffect, useRef, useState } from 'react'
import { FileText, Plus, Upload } from 'lucide-react'
import ModalShell from './ModalShell'
import { LabeledField, PrimaryButton, SecondaryButton, TextField } from './FormControls'

interface AddApartmentSharedDocumentModalProps {
  isOpen: boolean
  onClose: () => void
  apartmentId: number | null
  onSubmit: (file: File, description: string) => void
  submitting?: boolean
}

/**
 * Modal for attaching a document (any file type) to an apartment, with an
 * optional free-text description. Owns only its own draft state; the upload
 * itself is delegated to `onSubmit`.
 */
export default function AddApartmentSharedDocumentModal({
  isOpen,
  onClose,
  apartmentId,
  onSubmit,
  submitting,
}: AddApartmentSharedDocumentModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [description, setDescription] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setFile(null)
    setDescription('')
    if (inputRef.current) inputRef.current.value = ''
  }, [isOpen])

  const canSubmit = apartmentId !== null && file !== null && !submitting

  const handleSubmit = () => {
    if (!canSubmit || file === null) return
    onSubmit(file, description.trim())
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      icon={FileText}
      title="הוספת מסמך"
      subtitle="מסמכים הקשורים לדירה — נשמרים באחסון מאובטח (S3)"
      footer={
        <>
          <SecondaryButton onClick={onClose}>ביטול</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={!canSubmit} icon={Plus}>
            {submitting ? 'מעלה…' : 'הוסף מסמך'}
          </PrimaryButton>
        </>
      }
    >
      <LabeledField label="קובץ">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full border border-dashed border-gray-300 dark:border-gray-600 rounded-xl px-3 py-3 text-sm font-semibold text-gray-500 dark:text-gray-300 flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <Upload className="w-4 h-4" />
          {file ? file.name : 'בחירת קובץ להעלאה'}
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </LabeledField>

      <LabeledField label="תיאור (אופציונלי)">
        <TextField value={description} onChange={setDescription} placeholder="לדוגמה: חוזה שכירות, תעודת זהות" />
      </LabeledField>
    </ModalShell>
  )
}
