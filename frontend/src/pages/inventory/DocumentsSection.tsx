import { useCallback, useEffect, useState } from 'react'
import { FileText, Download, Upload, Trash2 } from 'lucide-react'
import { cemsApi, type CemsDocument, type DocumentType } from '../../lib/cemsApi'
import { fileAttachmentUrl } from '../../lib/api'

// ─── Constants ───────────────────────────────────────────────────────────────

const INPUT_CLASS = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const LABEL_CLASS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'
const BTN_PRIMARY = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'

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
  return ['jpg', 'jpeg', 'png'].includes(ext)
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
 * uploads (multiple files supported, one at a time) and deletes documents for a
 * given entity. Shared by the asset and consumable view modals (DRY).
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
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

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

  async function handleDocumentUpload() {
    if (!uploadFile) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('entity_type', entityType)
      formData.append('entity_id', entityId)
      formData.append('document_type', uploadDocType)
      if (uploadExpiry) formData.append('expiry_date', uploadExpiry)
      await cemsApi.uploadDocument(formData)
      setUploadFile(null)
      setUploadExpiry('')
      setUploadDocType(docTypeOptions[0]?.value ?? 'OTHER')
      await loadDocuments()
    } catch {
      // Error is handled silently; the user will see no new document appear
    } finally {
      setUploading(false)
    }
  }

  async function handleDocumentDelete(docId: string) {
    try {
      await cemsApi.deleteDocument(docId)
      await loadDocuments()
    } catch {
      // silent
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
              <span className="text-lg flex-shrink-0">
                {isImageFile(doc.filename) ? (
                  <FileText className="w-5 h-5 text-purple-500" />
                ) : (
                  <FileText className="w-5 h-5 text-blue-500" />
                )}
              </span>

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
            העלאת מסמך חדש
          </h5>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className={LABEL_CLASS}>קובץ</label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className={`${INPUT_CLASS} text-xs`}
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
              disabled={!uploadFile || uploading}
              className={`${BTN_PRIMARY} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {uploading ? 'מעלה...' : 'העלאה'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
