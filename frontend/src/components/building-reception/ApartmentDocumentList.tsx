import { FileText, Plus, Trash2, ExternalLink } from 'lucide-react'
import type { ApartmentDocument } from '../../types/api'
import { ACCENT, formatDate } from './constants'

interface ApartmentDocumentListProps {
  documents: ApartmentDocument[]
  onAdd: () => void
  onDelete: (documentId: number) => void
}

/** Derives a human label for a document: its description, else the original file name. */
function documentLabel(document: ApartmentDocument): string {
  if (document.description) return document.description
  if (document.file_name) return document.file_name
  // Legacy rows (pre file_name) fall back to the last path segment of the S3 key.
  const parts = document.file_path.split('/')
  return decodeURIComponent(parts[parts.length - 1] || 'מסמך')
}

/** "מסמכי הדירה" — the documents section inside the apartment details tab. */
export default function ApartmentDocumentList({ documents, onAdd, onDelete }: ApartmentDocumentListProps) {
  return (
    <div className="mt-4 flex flex-col gap-2.5">
      <div className="text-xs font-extrabold text-gray-500 dark:text-gray-400 px-0.5">מסמכי הדירה</div>
      {documents.map((document) => (
        <div
          key={document.id}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-3 flex items-center gap-3"
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${ACCENT}1F`, color: ACCENT }}
          >
            <FileText className="w-5 h-5" />
          </div>
          <div className="flex-1 leading-tight min-w-0">
            <div className="text-sm font-extrabold text-gray-900 dark:text-white truncate">
              {documentLabel(document)}
            </div>
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              {formatDate(document.uploaded_at)}
            </div>
          </div>
          <a
            href={document.file_path}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-violet-500 transition-colors"
            aria-label="פתיחת מסמך"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <button
            type="button"
            onClick={() => onDelete(document.id)}
            className="text-gray-400 hover:text-red-500 transition-colors"
            aria-label="מחיקת מסמך"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      {documents.length === 0 && (
        <div className="text-xs font-semibold text-gray-400 text-center py-6">אין מסמכים לדירה זו</div>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="w-full mt-1 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl py-2.5 text-sm font-bold text-gray-500 dark:text-gray-300 flex items-center justify-center gap-1.5 hover:bg-gray-50 dark:hover:bg-gray-700"
      >
        <Plus className="w-5 h-5" />
        הוספת מסמך
      </button>
    </div>
  )
}
