import { useEffect, useState } from 'react'
import {
  X,
  ArrowLeftRight,
  MapPin,
  Trash2,
  UserCheck,
  FileText,
  Download,
  Upload,
  Pencil,
} from 'lucide-react'
import {
  cemsApi,
  type FixedAsset,
  type AssetCategory,
  type AssetHistory,
  type CemsDocument,
  type DocumentType,
} from '../../lib/cemsApi'
import { fileAttachmentUrl } from '../../lib/api'
import { StatusBadge } from './InventoryDashboard'

// ─── Constants ───────────────────────────────────────────────────────────────

const MODAL_OVERLAY = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4'
const INPUT_CLASS = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const LABEL_CLASS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'
const BTN_PRIMARY = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  WARRANTY: 'תעודת אחריות',
  INVOICE: 'חשבונית',
  OTHER: 'אחר',
  PHOTO: 'תמונה',
}

const DOC_TYPE_OPTIONS: { value: DocumentType; label: string }[] = [
  { value: 'INVOICE', label: 'חשבונית' },
  { value: 'WARRANTY', label: 'תעודת אחריות' },
  { value: 'OTHER', label: 'אחר' },
]

function isImageFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return ['jpg', 'jpeg', 'png'].includes(ext)
}

export function translateNote(note: string): string {
  const FIELD_LABELS: Record<string, string> = {
    name: 'שם',
    category_id: 'קטגוריה',
    purchase_date: 'תאריך רכישה',
    warranty_expiry: 'תפוגת אחריות',
    notes: 'הערות',
    serial_number: "מס' סידורי",
    status: 'סטטוס',
    photo_url: 'תמונה',
    project_id: 'פרויקט',
  }

  return note
    .replace(/^Asset '(.+?)' created with serial '(.+?)'\.?$/, "נכס '$1' נוצר עם מס' סידורי '$2'.")
    .replace(/^Updated fields:\s*(.+)$/, 'שדות שעודכנו: $1')
    .replace(/^Transfer .+ completed with signature\.?$/, 'העברה הושלמה עם חתימה.')
    .replace(/^Transfer .+ rejected\. Reason: (.+)$/, 'העברה נדחתה. סיבה: $1')
    .replace(/^Reason: (.+?)\. Disposal: (.+?)\.?$/, 'סיבה: $1. שיטת סילוק: $2.')
    .replace(/^Approved retirement\. Reason: (.+?)\. Disposal: (.+?)\. Notes: (.+?)\.?$/, 'פרישה אושרה. סיבה: $1. שיטת סילוק: $2. הערות: $3.')
    .replace(/^Rejected retirement\. Reason: (.+)$/, 'פרישה נדחתה. סיבה: $1')
    .replace(/^Return to warehouse requested\. Reason: (.+)$/, 'בקשת החזרה למחסן. סיבה: $1')
    .replace(/^Return approved by manager\. Return reason: (.+)$/, 'החזרה אושרה על ידי מנהל. סיבת החזרה: $1')
    .replace(/שדות שעודכנו:\s*(.+)/, (_, fields) => {
      const translated = fields.replace(/'([^']+)'/g, (_: string, f: string) =>
        `'${FIELD_LABELS[f] ?? f}'`
      )
      return `שדות שעודכנו: ${translated}`
    })
}

const ACTION_LABELS: Record<string, string> = {
  ASSET_CREATED: 'נכס נוצר',
  ASSET_UPDATED: 'נכס עודכן',
  WAREHOUSE_MOVE: 'הועבר למחסן',
  ASSIGNED_TO_EMPLOYEE: 'הוקצה לעובד',
  TRANSFER_INITIATED: 'העברה יזומה',
  TRANSFER_COMPLETED: 'העברה הושלמה',
  TRANSFER_REJECTED: 'העברה נדחתה',
  RETIREMENT_REQUESTED: 'בקשת פרישה',
  ASSET_RETIRED: 'נכס פרש',
  RETIREMENT_REJECTED: 'פרישה נדחתה',
  RETURN_REQUESTED: 'בקשת החזרה למחסן',
  RETURNED_TO_WAREHOUSE: 'הוחזר למחסן',
  PHOTO_UPDATED: 'תמונת ציוד עודכנה',
  DOCUMENT_UPLOADED: 'מסמך הועלה',
  DOCUMENT_DELETED: 'מסמך נמחק',
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface AssetViewModalProps {
  asset: FixedAsset
  categoryName: string
  custodianName: string
  categories: AssetCategory[]
  isManager: boolean
  onClose: () => void
  onUpdated: (updated: FixedAsset) => void
  onTransfer: () => void
  onRetire: () => void
  onMoveToWarehouse: () => void
  onAssignToEmployee: () => void
}

type TabKey = 'history' | 'docs'

// ─── Component ───────────────────────────────────────────────────────────────

export function AssetViewModal({
  asset,
  categoryName,
  custodianName,
  categories,
  isManager,
  onClose,
  onUpdated,
  onTransfer,
  onRetire,
  onMoveToWarehouse,
  onAssignToEmployee,
}: AssetViewModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('history')
  const [showEdit, setShowEdit] = useState(false)

  // History state
  const [history, setHistory] = useState<AssetHistory[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  // Documents state
  const [documents, setDocuments] = useState<CemsDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [uploadDocType, setUploadDocType] = useState<DocumentType>('INVOICE')
  const [uploadExpiry, setUploadExpiry] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  // Derived action visibility
  const canTransfer = asset.status === 'ACTIVE' && asset.current_custodian_id !== null
  const canMoveToWarehouse = asset.status === 'ACTIVE' && asset.current_custodian_id !== null
  const canAssignToEmployee = asset.status === 'IN_WAREHOUSE' || (asset.status === 'ACTIVE' && asset.current_custodian_id === null)
  const canRetire = asset.status === 'ACTIVE' || asset.status === 'IN_WAREHOUSE'

  // Load history on mount
  useEffect(() => {
    async function fetchHistory() {
      setHistoryLoading(true)
      try {
        const res = await cemsApi.getAssetHistory(asset.id)
        setHistory(res.data)
      } catch {
        setHistory([])
      } finally {
        setHistoryLoading(false)
      }
    }
    fetchHistory()
  }, [asset.id])

  async function loadDocuments() {
    setDocsLoading(true)
    try {
      const res = await cemsApi.getDocuments('fixed_asset', asset.id)
      setDocuments(res.data)
    } catch {
      setDocuments([])
    } finally {
      setDocsLoading(false)
    }
  }

  function handleTabSwitch(tab: TabKey) {
    setActiveTab(tab)
    if (tab === 'docs') {
      loadDocuments()
    }
  }

  async function handleDocumentUpload() {
    if (!uploadFile) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('entity_type', 'fixed_asset')
      formData.append('entity_id', asset.id)
      formData.append('document_type', uploadDocType)
      if (uploadExpiry) formData.append('expiry_date', uploadExpiry)
      await cemsApi.uploadDocument(formData)
      setUploadFile(null)
      setUploadExpiry('')
      setUploadDocType('INVOICE')
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

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{asset.name}</h3>
          <div className="flex items-center gap-1">
            {isManager && (
              <button
                onClick={() => setShowEdit(true)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                title="עריכה"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Asset photo */}
          {asset.photo_url && (
            <div className="flex justify-center">
              <img
                src={asset.photo_url.startsWith('http') ? asset.photo_url : `/uploads/${asset.photo_url}`}
                alt={asset.name}
                className="max-h-[200px] max-w-full object-contain rounded-lg border border-gray-200 dark:border-gray-700"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>
          )}

          {/* Detail fields — 2-column grid */}
          <div className="grid grid-cols-2 gap-4">
            <DetailField label="שם" value={asset.name} />
            <DetailField label="קטגוריה" value={categoryName} />
            <DetailField label="מחזיק" value={custodianName} />
            <div>
              <span className="block text-sm font-medium text-gray-500 dark:text-gray-400">סטטוס</span>
              <div className="mt-1"><StatusBadge status={asset.status} /></div>
            </div>
            <DetailField
              label="אחריות"
              value={asset.warranty_expiry ? new Date(asset.warranty_expiry).toLocaleDateString('he-IL') : '-'}
            />
            <div className="col-span-2">
              <DetailField label="הערות" value={asset.notes || '-'} />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {canTransfer && (
              <button
                onClick={onTransfer}
                className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 transition-colors"
                title="העבר ציוד"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>
            )}
            {canMoveToWarehouse && (
              <button
                onClick={onMoveToWarehouse}
                className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 dark:text-green-400 transition-colors"
                title="החזר למחסן"
              >
                <MapPin className="w-4 h-4" />
              </button>
            )}
            {canAssignToEmployee && (
              <button
                onClick={onAssignToEmployee}
                className="p-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 text-purple-600 dark:text-purple-400 transition-colors"
                title="הקצה לעובד"
              >
                <UserCheck className="w-4 h-4" />
              </button>
            )}
            {canRetire && (
              <button
                onClick={onRetire}
                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
                title="פרישה"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-4 border-b border-gray-200 dark:border-gray-700">
            <TabButton
              label="היסטוריה"
              isActive={activeTab === 'history'}
              onClick={() => handleTabSwitch('history')}
            />
            <TabButton
              label="מסמכים"
              isActive={activeTab === 'docs'}
              onClick={() => handleTabSwitch('docs')}
            />
          </div>

          {/* Tab content */}
          {activeTab === 'history' ? (
            <HistoryTabContent history={history} loading={historyLoading} />
          ) : (
            <DocumentsTabContent
              documents={documents}
              docsLoading={docsLoading}
              uploadFile={uploadFile}
              uploadDocType={uploadDocType}
              uploadExpiry={uploadExpiry}
              uploading={uploading}
              isManager={isManager}
              onUploadFileChange={setUploadFile}
              onUploadDocTypeChange={setUploadDocType}
              onUploadExpiryChange={setUploadExpiry}
              onDocumentUpload={handleDocumentUpload}
              onDocumentDelete={handleDocumentDelete}
            />
          )}
        </div>

        {showEdit && (
          <EditAssetModal
            asset={asset}
            categories={categories}
            onClose={() => setShowEdit(false)}
            onUpdated={(updated) => { onUpdated(updated); setShowEdit(false) }}
          />
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
      <span className="block text-sm text-gray-900 dark:text-white mt-1">{value}</span>
    </div>
  )
}

function TabButton({ label, isActive, onClick }: { label: string; isActive: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
        isActive
          ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
      }`}
    >
      {label}
    </button>
  )
}

function HistoryTabContent({ history, loading }: { history: AssetHistory[]; loading: boolean }) {
  if (loading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">טוען היסטוריה...</p>
  }

  if (history.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">אין היסטוריה זמינה</p>
  }

  return (
    <div className="space-y-2">
      {history.map((entry) => (
        <div
          key={entry.id}
          className="flex items-start gap-3 p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
        >
          <div className="flex-1">
            <p className="text-sm text-gray-900 dark:text-white font-medium">
              {ACTION_LABELS[entry.action] ?? entry.action}
            </p>
            {entry.from_custodian_id && entry.to_custodian_id && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                מ: {entry.from_custodian_id} &larr; ל: {entry.to_custodian_id}
              </p>
            )}
            {entry.notes && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{translateNote(entry.notes)}</p>
            )}
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {new Date(entry.timestamp).toLocaleString('he-IL')}
          </span>
        </div>
      ))}
    </div>
  )
}

interface DocumentsTabContentProps {
  documents: CemsDocument[]
  docsLoading: boolean
  uploadFile: File | null
  uploadDocType: DocumentType
  uploadExpiry: string
  uploading: boolean
  isManager: boolean
  onUploadFileChange: (f: File | null) => void
  onUploadDocTypeChange: (t: DocumentType) => void
  onUploadExpiryChange: (d: string) => void
  onDocumentUpload: () => void
  onDocumentDelete: (docId: string) => void
}

function DocumentsTabContent({
  documents,
  docsLoading,
  uploadFile,
  uploadDocType,
  uploadExpiry,
  uploading,
  isManager,
  onUploadFileChange,
  onUploadDocTypeChange,
  onUploadExpiryChange,
  onDocumentUpload,
  onDocumentDelete,
}: DocumentsTabContentProps) {
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
                    onClick={() => onDocumentDelete(doc.id)}
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

      {/* Upload form */}
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
              onChange={(e) => onUploadFileChange(e.target.files?.[0] || null)}
              className={`${INPUT_CLASS} text-xs`}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>סוג מסמך</label>
            <select
              value={uploadDocType}
              onChange={(e) => onUploadDocTypeChange(e.target.value as DocumentType)}
              className={INPUT_CLASS}
            >
              {DOC_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>תאריך תוקף</label>
            <input
              type="date"
              value={uploadExpiry}
              onChange={(e) => onUploadExpiryChange(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <button
            onClick={onDocumentUpload}
            disabled={!uploadFile || uploading}
            className={`${BTN_PRIMARY} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {uploading ? 'מעלה...' : 'העלאה'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Asset Modal ─────────────────────────────────────────────────────────

interface EditAssetModalProps {
  asset: FixedAsset
  categories: AssetCategory[]
  onClose: () => void
  onUpdated: (updated: FixedAsset) => void
}

function EditAssetModal({ asset, categories, onClose, onUpdated }: EditAssetModalProps) {
  const [name, setName] = useState(asset.name)
  const [categoryId, setCategoryId] = useState(asset.category_id ?? '')
  const [purchaseDate, setPurchaseDate] = useState(asset.purchase_date ?? '')
  const [warrantyExpiry, setWarrantyExpiry] = useState(asset.warranty_expiry ?? '')
  const [notes, setNotes] = useState(asset.notes ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('שם הוא שדה חובה'); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await cemsApi.updateAsset(asset.id, {
        name: name.trim(),
        category_id: categoryId || undefined,
        purchase_date: purchaseDate || null,
        warranty_expiry: warrantyExpiry || null,
        notes: notes.trim() || null,
      })
      onUpdated(res.data)
    } catch {
      setError('שגיאה בעדכון הציוד')
    } finally {
      setSubmitting(false)
    }
  }

  const MODAL_OVERLAY_EDIT = 'fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4'
  const MODAL_PANEL_EDIT = 'bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto'

  return (
    <div className={MODAL_OVERLAY_EDIT} onClick={onClose}>
      <div className={MODAL_PANEL_EDIT} dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">עריכת ציוד</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-800 dark:text-red-300">
              {error}
            </div>
          )}
          <div>
            <label className={LABEL_CLASS}>שם *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} required />
          </div>
          <div>
            <label className={LABEL_CLASS}>קטגוריה</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={INPUT_CLASS}>
              <option value="">בחר קטגוריה</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>תאריך רכישה</label>
              <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={INPUT_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>תאריך אחריות</label>
              <input type="date" value={warrantyExpiry} onChange={(e) => setWarrantyExpiry(e.target.value)} className={INPUT_CLASS} />
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS}>הערות</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT_CLASS} rows={3} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              ביטול
            </button>
            <button type="submit" disabled={submitting} className={`${BTN_PRIMARY} disabled:opacity-50`}>
              {submitting ? 'שומר...' : 'שמור שינויים'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}