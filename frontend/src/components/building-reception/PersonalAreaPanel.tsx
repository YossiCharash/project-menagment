import React, { useEffect, useRef, useState } from 'react'
import {
  Lock,
  LockKeyhole,
  ShieldCheck,
  StickyNote,
  FileText,
  Upload,
  Trash2,
  ExternalLink,
  Loader2,
  Save,
} from 'lucide-react'
import type { PersonalArea, ApartmentDocument } from '../../types/api'
import BuildingReceptionAPI from '../../lib/buildingReceptionApi'
import { extractErrorMessage } from '../../lib/apiError'
import { ACCENT, formatDateTime } from './constants'

interface PersonalAreaPanelProps {
  apartmentId: number
}

function docLabel(doc: ApartmentDocument): string {
  if (doc.description) return doc.description
  if (doc.filename) return doc.filename
  const parts = doc.file_path.split('/')
  return parts[parts.length - 1] || 'קובץ'
}

/**
 * The apartment "personal area" (אזור אישי): private details, private notes and
 * documents, all gated behind the admin password. The panel owns the whole
 * lock/unlock lifecycle — the verified password is kept only in local state and
 * re-sent to the server on every mutation (the server re-verifies each time), so
 * navigating away (unmount) re-locks the area.
 */
export default function PersonalAreaPanel({ apartmentId }: PersonalAreaPanelProps) {
  // The verified admin password, held in memory only while the area is unlocked.
  const [password, setPassword] = useState<string | null>(null)
  const [passwordInput, setPasswordInput] = useState('')
  const [data, setData] = useState<PersonalArea | null>(null)
  const [details, setDetails] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Re-lock whenever we switch to a different apartment.
  useEffect(() => {
    setPassword(null)
    setPasswordInput('')
    setData(null)
    setDetails('')
    setNotes('')
    setError(null)
  }, [apartmentId])

  const applyData = (area: PersonalArea) => {
    setData(area)
    setDetails(area.private_details ?? '')
    setNotes(area.private_notes ?? '')
  }

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!passwordInput.trim()) return
    setBusy(true)
    setError(null)
    try {
      const area = await BuildingReceptionAPI.unlockPersonalArea(apartmentId, passwordInput)
      setPassword(passwordInput)
      applyData(area)
      setPasswordInput('')
    } catch (err) {
      setError(extractErrorMessage(err, 'סיסמת המנהל שגויה'))
    } finally {
      setBusy(false)
    }
  }

  const handleLock = () => {
    setPassword(null)
    setData(null)
    setDetails('')
    setNotes('')
    setError(null)
  }

  const handleSave = async () => {
    if (!password) return
    setSaving(true)
    setError(null)
    try {
      const area = await BuildingReceptionAPI.updatePersonalArea(apartmentId, password, {
        private_details: details,
        private_notes: notes,
      })
      applyData(area)
    } catch (err) {
      setError(extractErrorMessage(err, 'שמירת הפרטים נכשלה'))
    } finally {
      setSaving(false)
    }
  }

  const handleUploadClick = () => fileInputRef.current?.click()

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file || !password) return
    // Cancelling the prompt (returns null) aborts the whole upload; an empty
    // string is a deliberate "no description" and proceeds.
    const description = window.prompt('תיאור המסמך (לא חובה):', file.name)
    if (description === null) return
    setUploading(true)
    setError(null)
    try {
      const doc = await BuildingReceptionAPI.uploadPersonalAreaDocument(
        apartmentId,
        password,
        file,
        description,
      )
      setData((prev) => (prev ? { ...prev, documents: [doc, ...prev.documents] } : prev))
    } catch (err) {
      setError(extractErrorMessage(err, 'העלאת המסמך נכשלה'))
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteDocument = async (documentId: number) => {
    if (!password) return
    if (!window.confirm('למחוק את המסמך?')) return
    setError(null)
    try {
      await BuildingReceptionAPI.deletePersonalAreaDocument(apartmentId, documentId, password)
      setData((prev) =>
        prev ? { ...prev, documents: prev.documents.filter((d) => d.id !== documentId) } : prev,
      )
    } catch (err) {
      setError(extractErrorMessage(err, 'מחיקת המסמך נכשלה'))
    }
  }

  const dirty = data !== null && (details !== (data.private_details ?? '') || notes !== (data.private_notes ?? ''))

  // ── Locked view ────────────────────────────────────────────────────────────
  if (!password || !data) {
    return (
      <form
        onSubmit={handleUnlock}
        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-8 flex flex-col items-center text-center"
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: `${ACCENT}1F`, color: ACCENT }}
        >
          <LockKeyhole className="w-7 h-7" />
        </div>
        <div className="text-lg font-extrabold text-gray-900 dark:text-white">אזור אישי</div>
        <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 mt-1 mb-5 max-w-[280px]">
          פרטים, הערות ומסמכים מוגנים. נדרשת סיסמת המנהל כדי לצפות.
        </div>
        <input
          type="password"
          autoFocus
          value={passwordInput}
          onChange={(e) => setPasswordInput(e.target.value)}
          placeholder="סיסמת המנהל"
          className="w-full max-w-[280px] rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-4 py-2.5 text-sm font-semibold text-gray-900 dark:text-white text-center focus:outline-none focus:ring-2"
          style={{ ['--tw-ring-color' as string]: `${ACCENT}80` }}
        />
        {error && <div className="text-sm font-bold text-red-500 mt-2">{error}</div>}
        <button
          type="submit"
          disabled={busy || !passwordInput.trim()}
          className="w-full max-w-[280px] mt-4 rounded-xl py-2.5 text-sm font-bold flex items-center justify-center gap-2 text-white disabled:opacity-60"
          style={{ background: ACCENT }}
        >
          {busy ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <ShieldCheck className="w-[18px] h-[18px]" />}
          פתיחת האזור האישי
        </button>
      </form>
    )
  }

  // ── Unlocked view ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-extrabold" style={{ color: ACCENT }}>
          <ShieldCheck className="w-[18px] h-[18px]" />
          אזור אישי פתוח
        </div>
        <button
          type="button"
          onClick={handleLock}
          className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-300 rounded-lg px-2.5 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          <Lock className="w-4 h-4" />
          נעילה
        </button>
      </div>

      {error && (
        <div className="text-sm font-bold text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
        <label className="text-sm font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2 mb-2">
          <FileText className="w-[18px] h-[18px] text-gray-400" />
          פרטים
        </label>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={3}
          placeholder="פרטים פרטיים על הדירה…"
          className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-white resize-y focus:outline-none focus:ring-2"
          style={{ ['--tw-ring-color' as string]: `${ACCENT}80` }}
        />
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
        <label className="text-sm font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2 mb-2">
          <StickyNote className="w-[18px] h-[18px] text-gray-400" />
          הערות
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="הערות פרטיות…"
          className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-white resize-y focus:outline-none focus:ring-2"
          style={{ ['--tw-ring-color' as string]: `${ACCENT}80` }}
        />
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={!dirty || saving}
        className="w-full rounded-xl py-2.5 text-sm font-bold flex items-center justify-center gap-2 text-white disabled:opacity-50"
        style={{ background: ACCENT }}
      >
        {saving ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <Save className="w-[18px] h-[18px]" />}
        שמירת פרטים והערות
      </button>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <FileText className="w-[18px] h-[18px] text-gray-400" />
            מסמכים
            {data.documents.length > 0 && (
              <span className="text-[11px] font-extrabold text-gray-400">({data.documents.length})</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleUploadClick}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs font-bold rounded-lg px-2.5 py-1.5 disabled:opacity-60"
            style={{ color: ACCENT, background: `${ACCENT}14` }}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            העלאת מסמך
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelected}
          />
        </div>

        {data.documents.length === 0 ? (
          <div className="text-sm font-semibold text-gray-400 text-center py-4">אין מסמכים עדיין</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {data.documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-2 py-2.5">
                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
                    {docLabel(doc)}
                  </div>
                  <div className="text-[11px] font-medium text-gray-400">
                    {formatDateTime(doc.uploaded_at)}
                  </div>
                </div>
                <a
                  href={doc.file_path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                  aria-label="פתיחת מסמך"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => handleDeleteDocument(doc.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                  aria-label="מחיקת מסמך"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
