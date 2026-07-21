import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Download, Upload, Trash2, X, Image as ImageIcon } from 'lucide-react'
import { cemsApi, type CemsDocument, type DocumentType } from '../../lib/cemsApi'
import { fileAttachmentUrl } from '../../lib/api'
import { extractErrorMessage } from '../../lib/apiError'

// ─── Constants ───────────────────────────────────────────────────────────────

const INPUT_CLASS = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const LABEL_CLASS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'
const BTN_PRIMARY = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'

/** Extensions the documents API accepts; kept in sync with the backend. */
const ACCEPTED_FILE_TYPES = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx'

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png']

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  WARRANTY: 'תעודת אחריות',
  INVOICE: 'חשבונית',
  OTHER: 'אחר',
  PHOTO: 'תמונה',
}

/** Default upload type options. PHOTO is included so users can attach photos. */
const DEFAULT_DOC_TYPE_OPTIONS: { value: DocumentType; label: string }[] = [
  { value: 'INVOICE', label: 'חשבונית' },
  { value: 'WARRANTY', label: 'תעודת אחריות' },
  { value: 'PHOTO', label: 'תמונה' },
  { value: 'OTHER', label: 'אחר' },
]

function isImageFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return IMAGE_EXTENSIONS.includes(ext)
}

/** Join the names of the files that failed into one readable Hebrew message. */
function buildFailureMessage(failures: { name: string; reason: string }[]): string {
  return failures.map((failure) => `${failure.name}: ${failure.reason}`).join(' | ')
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface DocumentsSectionProps {
  /** Polymorphic entity type, e.g. 'fixed_asset' or 'consumable'. */
  entityType: string
  entityId: string
  /** Only managers may upload/delete documents. */
  isManager: boolean
  /** Optional override of the selectable upload types. */
  docTypeOptions?: { value: DocumentType; label: string }[]
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Reusable documents panel backed by the polymorphic documents API. Lists,
 * uploads and deletes documents for a given entity. Several files may be
 * picked at once — they are sent one request each and any that fail are
 * reported by name. Shared by the asset and consumable view modals (DRY).
 */
export function DocumentsSection({
  entityType,
  entityId,
  isManager,
  docTypeOptions = DEFAULT_DOC_TYPE_OPTIONS,
}: DocumentsSectionProps) {
  const [documents, setDocuments] = useState<CemsDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [uploadDocType, setUploadDocType] = useState<DocumentType>(docTypeOptions[0]?.value ?? 'OTHER')
  const [uploadExpiry, setUploadExpiry] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [uploadedCount, setUploadedCount] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDocuments = useCallback(async () => {
    setDocsLoading(true)
    try {
      const res = await cemsApi.getDocuments(entityType, entityId)
      setDocuments(res.data)
    } catch {
      setDocuments([])
    } finally {
      setDocsLoading(false)
    }
  }, [entityType, entityId])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  /** Append the newly picked files to the queue, keeping earlier picks. */
  function handleFilesPicked(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    setPendingFiles((prev) => [...prev, ...Array.from(fileList)])
    setError(null)
    // Reset the input so picking the same file again still fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleRemovePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  /** Send one file, returning its failure reason or null on success. */
  async function uploadSingleFile(file: File): Promise<string | null> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('entity_type', entityType)
    formData.append('entity_id', entityId)
    formData.append('document_type', uploadDocType)
    if (uploadExpiry) formData.append('expiry_date', uploadExpiry)
    try {
      await cemsApi.uploadDocument(formData)
      return null
    } catch (err) {
      return extractErrorMessage(err, 'ההעלאה נכשלה')
    }
  }

  function resetUploadForm() {
    setPendingFiles([])
    setUploadExpiry('')
    setUploadDocType(docTypeOptions[0]?.value ?? 'OTHER')
  }

  async function handleDocumentUpload() {
    if (pendingFiles.length === 0) return
    setUploading(true)
    setUploadedCount(0)
    setError(null)

    const failures: { name: string; reason: string }[] = []
    const succeeded: File[] = []
    for (const file of pendingFiles) {
      const reason = await uploadSingleFile(file)
      if (reason) {
        failures.push({ name: file.name, reason })
      } else {
        succeeded.push(file)
        setUploadedCount((count) => count + 1)
      }
    }

    if (failures.length === 0) {
      resetUploadForm()
    } else {
      // Keep only the files that failed so the user can retry or drop them.
      setPendingFiles(pendingFiles.filter((file) => !succeeded.includes(file)))
      setError(buildFailureMessage(failures))
    }

    await loadDocuments()
    setUploading(false)
  }

  async function handleDocumentDelete(docId: string) {
    try {
      await cemsApi.deleteDocument(docId)
      await loadDocuments()
    } catch (err) {
      setError(extractErrorMessage(err, 'מחיקת המסמך נכשלה'))
    }
  }

  if (docsLoading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">טוען מסמכים...</p>
  }

  return (
    <div className="space-y-4">
      {/* Document list */}
      {documents.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">אין מסמכים מצורפים</p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <DocumentPreview doc={doc} />

              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-white truncate">{doc.filename}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                    doc.document_type === 'WARRANTY'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      : doc.document_type === 'INVOICE'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                  }`}>
                    {DOC_TYPE_LABELS[doc.document_type]}
                  </span>
                  {doc.expiry_date && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      תוקף: {new Date(doc.expiry_date).toLocaleDateString('he-IL')}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => {
                    const url = fileAttachmentUrl(doc.file_url)
                    if (url) window.open(url, '_blank')
                  }}
                  className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 transition-colors"
                  title="הורדה"
                >
                  <Download className="w-4 h-4" />
                </button>
                {isManager && (
                  <button
                    onClick={() => handleDocumentDelete(doc.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
                    title="מחיקה"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload form — managers only */}
      {isManager && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <Upload className="w-4 h-4" />
            העלאת מסמכים חדשים
          </h5>

          {error && (
            <div className="mb-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-800 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className={LABEL_CLASS}>קבצים</label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_FILE_TYPES}
                onChange={(e) => handleFilesPicked(e.target.files)}
                className={`${INPUT_CLASS} text-xs`}
                aria-label="בחירת קבצים להעלאה"
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>סוג מסמך</label>
              <select
                value={uploadDocType}
                onChange={(e) => setUploadDocType(e.target.value as DocumentType)}
                className={INPUT_CLASS}
              >
                {docTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>תאריך תוקף</label>
              <input
                type="date"
                value={uploadExpiry}
                onChange={(e) => setUploadExpiry(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <button
              onClick={handleDocumentUpload}
              disabled={pendingFiles.length === 0 || uploading}
              className={`${BTN_PRIMARY} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {uploading
                ? `מעלה ${uploadedCount + 1} מתוך ${pendingFiles.length}...`
                : `העלאה${pendingFiles.length > 0 ? ` (${pendingFiles.length})` : ''}`}
            </button>
          </div>

          {pendingFiles.length > 0 && (
            <ul className="mt-3 space-y-2">
              {pendingFiles.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 border border-gray-200 dark:border-gray-600"
                >
                  {isImageFile(file.name)
                    ? <ImageIcon className="w-4 h-4 text-purple-500 flex-shrink-0" />
                    : <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemovePendingFile(index)}
                    disabled={uploading}
                    className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 disabled:opacity-50"
                    title={`הסרת ${file.name}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            ניתן לבחור כמה קבצים יחד. סוגים נתמכים: {ACCEPTED_FILE_TYPES.replace(/\./g, '').replace(/,/g, ', ')} · עד 20MB לקובץ.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Show a thumbnail for image documents and a type icon for everything else. */
function DocumentPreview({ doc }: { doc: CemsDocument }) {
  const thumbnailUrl = isImageFile(doc.filename) ? fileAttachmentUrl(doc.file_url) : null

  if (thumbnailUrl) {
    return (
      <img
        src={thumbnailUrl}
        alt={doc.filename}
        className="w-10 h-10 rounded object-cover flex-shrink-0 border border-gray-200 dark:border-gray-700"
      />
    )
  }

  return (
    <span className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0 bg-gray-100 dark:bg-gray-700">
      <FileText className="w-5 h-5 text-blue-500" />
    </span>
  )
}
