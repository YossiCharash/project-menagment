import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, CheckCircle, Trash2, Pencil, X } from 'lucide-react'
import {
  QuoteProjectsAPI,
  QuoteStructureAPI,
  QuoteProject,
  QuoteLine,
  QuoteBuilding,
  QuoteApartment,
  type QuoteCalculationMethod,
} from '../lib/apiClient'
import type { Project } from '../types/api'
import CreateProjectModal from '../components/CreateProjectModal'
import QuoteBuildingsPanel from '../components/QuoteBuildingsPanel'

interface QuoteDetailProps {
  quoteId?: number | null
  embedMode?: boolean
  onClose?: () => void
}

export default function QuoteDetail({ quoteId: quoteIdProp, embedMode, onClose }: QuoteDetailProps = {}) {
  const navigate = useNavigate()
  const { id } = useParams()
  const quoteId = quoteIdProp != null ? quoteIdProp : (id ? parseInt(id, 10) : null)

  const goBack = embedMode && onClose ? onClose : () => navigate('/price-quotes')

  const [quote, setQuote] = useState<QuoteProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [structureItems, setStructureItems] = useState<Array<{ id: number; name: string }>>([])
  const [selectedStructureId, setSelectedStructureId] = useState<number | null>(null)
  const [addLineAmount, setAddLineAmount] = useState('')
  const [editingLineId, setEditingLineId] = useState<number | null>(null)
  const [editingAmount, setEditingAmount] = useState<string>('')
  const [numResidents, setNumResidents] = useState<string>('')
  const [savingNumResidents, setSavingNumResidents] = useState(false)
  const [approving, setApproving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [approveCurrentQuote, setApproveCurrentQuote] = useState<QuoteProject | null>(null)
  const [addSuccessMessage, setAddSuccessMessage] = useState<string | null>(null)
  const [editingQuoteName, setEditingQuoteName] = useState(false)
  const [quoteNameInput, setQuoteNameInput] = useState('')
  const [savingQuoteName, setSavingQuoteName] = useState(false)
  const addLineSelectRef = useRef<HTMLSelectElement>(null)
  /** באותו פרויקט כבר אושרה הצעה אחרת – אז לא להציג כפתור אישור */
  const [projectHasOtherApprovedQuote, setProjectHasOtherApprovedQuote] = useState(false)
  /** טאב בניין נבחר (0-based) */
  const [activeBuildingIndex, setActiveBuildingIndex] = useState(0)
  const [addingBuilding, setAddingBuilding] = useState(false)
  const [newApartmentSize, setNewApartmentSize] = useState('')
  const [editingApartmentId, setEditingApartmentId] = useState<number | null>(null)
  const [editingApartmentSize, setEditingApartmentSize] = useState('')

  useEffect(() => {
    if (!quoteId || isNaN(quoteId)) return
    let cancelled = false
    setLoading(true)
    setError(null)
    QuoteProjectsAPI.get(quoteId)
      .then((data) => {
        if (!cancelled) {
          setQuote(data)
          setNumResidents(data.num_residents != null ? String(data.num_residents) : '')
          setQuoteNameInput(data.name ?? '')
          setActiveBuildingIndex((i) => {
            const len = data.quote_buildings?.length ?? 0
            return len > 0 ? Math.min(i, len - 1) : 0
          })
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.detail || err.message || 'שגיאה בטעינת ההצעה')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [quoteId])

  const buildings: QuoteBuilding[] = quote?.quote_buildings ?? []
  const hasBuildings = buildings.length > 0
  const currentBuilding: QuoteBuilding | null = hasBuildings && activeBuildingIndex < buildings.length ? buildings[activeBuildingIndex]! : null
  const currentLines: QuoteLine[] = currentBuilding ? currentBuilding.quote_lines : (quote?.quote_lines ?? [])
  const currentNumResidentsStr = currentBuilding != null
    ? (currentBuilding.num_residents != null ? String(currentBuilding.num_residents) : '')
    : numResidents
  const setCurrentNumResidentsStr = (v: string) => {
    if (currentBuilding != null) {
      const next = quote ? {
        ...quote,
        quote_buildings: quote.quote_buildings.map((b, i) =>
          i === activeBuildingIndex ? { ...b, num_residents: v === '' ? null : parseInt(v, 10) || null } : b
        ) as QuoteBuilding[],
      } : quote
      setQuote(next)
    } else setNumResidents(v)
  }

  useEffect(() => {
    if (!quote?.project_id || !quoteId) {
      setProjectHasOtherApprovedQuote(false)
      return
    }
    let cancelled = false
    QuoteProjectsAPI.list(undefined, quote.project_id, undefined)
      .then((list) => {
        if (!cancelled) {
          const hasOther = list.some((q) => q.id !== quoteId && q.status === 'approved')
          setProjectHasOtherApprovedQuote(hasOther)
        }
      })
      .catch(() => {
        if (!cancelled) setProjectHasOtherApprovedQuote(false)
      })
    return () => { cancelled = true }
  }, [quote?.project_id, quoteId])

  useEffect(() => {
    QuoteStructureAPI.list(true).then((items) => {
      setStructureItems(items.map((i) => ({ id: i.id, name: i.name })))
    }).catch(() => {})
  }, [])

  const handleAddLine = async (structureIdOverride?: number) => {
    const idToAdd = structureIdOverride ?? selectedStructureId
    if (!quoteId || idToAdd == null) return
    const amountVal = addLineAmount.trim() === '' ? null : parseFloat(addLineAmount.trim())
    const amount = amountVal != null && !isNaN(amountVal) && amountVal >= 0 ? amountVal : null
    const addedItemName = structureItems.find((i) => i.id === idToAdd)?.name ?? ''
    try {
      await QuoteProjectsAPI.addLine(quoteId, {
        quote_structure_item_id: idToAdd,
        amount,
        sort_order: currentLines.length,
        quote_building_id: currentBuilding?.id ?? undefined,
      })
      const updated = await QuoteProjectsAPI.get(quoteId)
      setQuote(updated)
      setSelectedStructureId(null)
      setAddLineAmount('')
      setAddSuccessMessage(addedItemName ? `"${addedItemName}" נוסף בהצלחה` : 'הפריט נוסף בהצלחה')
      setTimeout(() => setAddSuccessMessage(null), 2500)
      addLineSelectRef.current?.focus()
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה בהוספת פריט')
    }
  }

  const handleSaveQuoteName = async () => {
    if (!quoteId || quote?.status !== 'draft') return
    const trimmed = quoteNameInput.trim()
    if (trimmed === '' || trimmed === quote?.name) {
      setEditingQuoteName(false)
      setQuoteNameInput(quote?.name ?? '')
      return
    }
    setSavingQuoteName(true)
    try {
      await QuoteProjectsAPI.update(quoteId, { name: trimmed })
      const updated = await QuoteProjectsAPI.get(quoteId)
      setQuote(updated)
      setEditingQuoteName(false)
      setQuoteNameInput(trimmed)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה בעדכון השם')
    } finally {
      setSavingQuoteName(false)
    }
  }

  const handleDeleteLine = async (lineId: number) => {
    if (!quoteId || quote?.status !== 'draft') return
    try {
      await QuoteProjectsAPI.deleteLine(quoteId, lineId)
      const updated = await QuoteProjectsAPI.get(quoteId)
      setQuote(updated)
      setEditingLineId(null)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה במחיקה')
    }
  }

  const handleUpdateLineAmount = async (lineId: number, amountStr: string) => {
    if (!quoteId) return
    const amountNum = amountStr === '' ? null : parseFloat(amountStr)
    if (amountNum !== null && isNaN(amountNum)) return
    try {
      await QuoteProjectsAPI.updateLine(quoteId, lineId, { amount: amountNum ?? undefined })
      const updated = await QuoteProjectsAPI.get(quoteId)
      setQuote(updated)
      setEditingLineId(null)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה בעדכון')
    }
  }

  const effectiveResidents = (() => {
    const str = currentBuilding != null ? currentNumResidentsStr : numResidents
    if (str !== '' && !isNaN(parseFloat(str)) && parseFloat(str) > 0) return parseFloat(str)
    if (currentBuilding != null && currentBuilding.num_residents != null && currentBuilding.num_residents > 0)
      return currentBuilding.num_residents
    return quote?.num_residents != null && quote.num_residents > 0 ? quote.num_residents : 1
  })()

  const buildingTotal = currentLines.reduce((sum, l) => sum + (l.amount ?? 0), 0)
  const apartments = currentBuilding?.quote_apartments ?? []
  const totalSqm = apartments.reduce((s, a) => s + a.size_sqm, 0)
  const costPerSqm = totalSqm > 0 ? buildingTotal / totalSqm : 0

  const handleSaveNumResidents = async () => {
    if (!quoteId || quote?.status !== 'draft') return
    const str = currentBuilding != null ? currentNumResidentsStr : numResidents
    const num = str.trim() === '' ? null : parseInt(str.trim(), 10)
    const value = num != null && !isNaN(num) && num > 0 ? num : null
    setSavingNumResidents(true)
    try {
      if (currentBuilding != null) {
        await QuoteProjectsAPI.updateBuilding(quoteId, currentBuilding.id, { num_residents: value ?? undefined })
      } else {
        await QuoteProjectsAPI.update(quoteId, { num_residents: value ?? undefined })
      }
      const updated = await QuoteProjectsAPI.get(quoteId)
      setQuote(updated)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה בעדכון מספר דיירים')
    } finally {
      setSavingNumResidents(false)
    }
  }

  const handleSaveBuildingAddress = async (address: string | null) => {
    if (!quoteId || currentBuilding == null || quote?.status !== 'draft') return
    try {
      await QuoteProjectsAPI.updateBuilding(quoteId, currentBuilding.id, { address: address || undefined })
      const updated = await QuoteProjectsAPI.get(quoteId)
      setQuote(updated)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה בעדכון כתובת')
    }
  }

  const handleSaveBuildingCalculationMethod = async (method: QuoteCalculationMethod) => {
    if (!quoteId || currentBuilding == null || quote?.status !== 'draft') return
    try {
      await QuoteProjectsAPI.updateBuilding(quoteId, currentBuilding.id, { calculation_method: method })
      const updated = await QuoteProjectsAPI.get(quoteId)
      setQuote(updated)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה בעדכון צורת חישוב')
    }
  }

  const handleAddBuilding = async () => {
    if (!quoteId || quote?.status !== 'draft') return
    setAddingBuilding(true)
    try {
      await QuoteProjectsAPI.addBuilding(quoteId, { calculation_method: 'by_residents', sort_order: buildings.length })
      const updated = await QuoteProjectsAPI.get(quoteId)
      setQuote(updated)
      setActiveBuildingIndex((updated.quote_buildings?.length ?? 1) - 1)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה בהוספת בניין')
    } finally {
      setAddingBuilding(false)
    }
  }

  const handleDeleteBuilding = async (buildingId: number) => {
    if (!quoteId || quote?.status !== 'draft') return
    if (!confirm('למחוק בניין זה? כל ההוצאות והדירות בו יימחקו.')) return
    try {
      await QuoteProjectsAPI.deleteBuilding(quoteId, buildingId)
      const updated = await QuoteProjectsAPI.get(quoteId)
      setQuote(updated)
      setActiveBuildingIndex((i) => Math.max(0, Math.min(i, (updated.quote_buildings?.length ?? 1) - 1)))
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה במחיקת בניין')
    }
  }

  const handleAddApartment = async () => {
    if (!quoteId || currentBuilding == null) return
    const size = parseFloat(newApartmentSize.trim())
    if (isNaN(size) || size <= 0) return
    try {
      await QuoteProjectsAPI.addApartment(quoteId, currentBuilding.id, {
        size_sqm: size,
        sort_order: currentBuilding.quote_apartments?.length ?? 0,
      })
      const updated = await QuoteProjectsAPI.get(quoteId)
      setQuote(updated)
      setNewApartmentSize('')
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה בהוספת דירה')
    }
  }

  const handleUpdateApartment = async (apartmentId: number, sizeSqm: number) => {
    if (!quoteId || currentBuilding == null) return
    try {
      await QuoteProjectsAPI.updateApartment(quoteId, currentBuilding.id, apartmentId, { size_sqm: sizeSqm })
      const updated = await QuoteProjectsAPI.get(quoteId)
      setQuote(updated)
      setEditingApartmentId(null)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה בעדכון דירה')
    }
  }

  const handleDeleteApartment = async (apartmentId: number) => {
    if (!quoteId || currentBuilding == null) return
    try {
      await QuoteProjectsAPI.deleteApartment(quoteId, currentBuilding.id, apartmentId)
      const updated = await QuoteProjectsAPI.get(quoteId)
      setQuote(updated)
      setEditingApartmentId(null)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה במחיקת דירה')
    }
  }

  const quoteToInitialFormData = (q: QuoteProject) => {
    const totalFromLines = (q.quote_lines ?? []).reduce((s, l) => s + (l.amount ?? 0), 0)
    const monthly = totalFromLines > 0 ? totalFromLines : 0
    const today = new Date().toISOString().slice(0, 10)
    return {
      name: q.name,
      description: q.description || undefined,
      num_residents: q.num_residents ?? undefined,
      budget_monthly: monthly,
      budget_annual: monthly * 12,
      contract_duration_months: 12,
      start_date: today,
    }
  }

  const handleApproveClick = () => {
    if (!quote || quote.status !== 'draft') return
    setApproveCurrentQuote(quote)
  }

  const handleApproveSuccess = async (project: Project) => {
    if (!approveCurrentQuote) return
    setApproving(true)
    try {
      await QuoteProjectsAPI.approve(approveCurrentQuote.id, project.id)
      setApproveCurrentQuote(null)
      const updated = await QuoteProjectsAPI.get(approveCurrentQuote.id)
      setQuote(updated)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה באישור')
    } finally {
      setApproving(false)
    }
  }

  const handleDeleteQuote = async () => {
    if (!quoteId) return
    if (!confirm('למחוק הצעת מחיר זו? לא ניתן לשחזר.')) return
    setDeleting(true)
    try {
      await QuoteProjectsAPI.delete(quoteId)
      setDeleting(false)
      goBack()
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה במחיקה')
      setDeleting(false)
    }
  }

  const alreadyAddedIds = new Set((currentLines ?? []).map((l) => l.quote_structure_item_id))

  if (!quoteId || isNaN(quoteId)) {
    return (
      <div className="p-6 text-center text-gray-500 dark:text-gray-400">
        לא נמצא מזהה הצעה
      </div>
    )
  }

  if (loading && !quote) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-600 border-t-transparent" />
        <p className="text-gray-500 dark:text-gray-400">טוען הצעת מחיר...</p>
      </div>
    )
  }

  if (error && !quote) {
    return (
      <div className="p-6">
        <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
        <button
          type="button"
          onClick={goBack}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          {embedMode ? 'סגור' : 'חזרה להצעות מחיר'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {!embedMode && (
              <button
                type="button"
                onClick={goBack}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            )}
            <div>
              {quote?.status === 'draft' && editingQuoteName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={quoteNameInput}
                    onChange={(e) => setQuoteNameInput(e.target.value)}
                    onBlur={handleSaveQuoteName}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveQuoteName()
                      if (e.key === 'Escape') {
                        setEditingQuoteName(false)
                        setQuoteNameInput(quote?.name ?? '')
                      }
                    }}
                    className="text-2xl font-bold px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-w-[200px]"
                    autoFocus
                  />
                  {savingQuoteName && <span className="text-xs text-gray-500">שומר...</span>}
                </div>
              ) : (
                <h1
                  className={`text-2xl font-bold text-gray-900 dark:text-white ${quote?.status === 'draft' ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-2 py-1 -mx-2 -my-1' : ''}`}
                  onClick={() => quote?.status === 'draft' && setEditingQuoteName(true)}
                  title={quote?.status === 'draft' ? 'לחץ לעריכת השם' : undefined}
                >
                  {quote?.name ?? 'הצעת מחיר'}
                </h1>
              )}
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-sm font-medium ${
                  quote?.status === 'approved'
                    ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                    : 'bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300'
                }`}
              >
                {quote?.status === 'approved' ? 'אושרה' : 'טיוטה'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {quote?.status === 'draft' && !projectHasOtherApprovedQuote && (
              <>
                <button
                  type="button"
                  onClick={handleApproveClick}
                  disabled={approving}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50"
                >
                  {approving ? 'מאשר...' : 'אשר הצעת מחיר'}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteQuote}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? 'מוחק...' : 'מחק הצעת מחיר'}
                </button>
              </>
            )}
            {quote?.status === 'approved' && quote?.converted_project_id && (
              <button
                type="button"
                onClick={() => navigate(`/projects/${quote.converted_project_id}`)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700"
              >
                מעבר לפרויקט
              </button>
            )}
            {embedMode && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {quote?.description && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">תיאור</h3>
            <p className="text-gray-900 dark:text-white">{quote.description}</p>
          </div>
        )}

        <QuoteBuildingsPanel
          buildings={buildings}
          activeBuildingIndex={activeBuildingIndex}
          onSelectBuilding={setActiveBuildingIndex}
          onAddBuilding={quote?.status === 'draft' ? handleAddBuilding : undefined}
          onDeleteBuilding={quote?.status === 'draft' ? handleDeleteBuilding : undefined}
          onSaveAddress={handleSaveBuildingAddress}
          onSaveCalculationMethod={handleSaveBuildingCalculationMethod}
          isDraft={quote?.status === 'draft'}
          addingBuilding={addingBuilding}
        />

        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-700 dark:bg-gray-600">
                <th className="text-right py-3 px-4 font-semibold text-white">הוצאות הצעת המחיר</th>
                <th className="text-right py-3 px-4 font-semibold text-white w-28">סכום לחיוב (₪)</th>
                {quote?.status === 'draft' && <th className="w-20" />}
              </tr>
            </thead>
            <tbody>
              {quote?.status === 'draft' && (
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                  <td colSpan={3} className="py-3 px-4">
                    <div className="flex flex-wrap items-end gap-3">
                      <select
                        ref={addLineSelectRef}
                        value={selectedStructureId ?? ''}
                        onChange={(e) => {
                          const val = e.target.value
                          if (val) {
                            const id = parseInt(val, 10)
                            handleAddLine(id)
                          } else {
                            setSelectedStructureId(null)
                          }
                        }}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">בחר פריט להוספה...</option>
                        {structureItems
                          .filter((item) => !alreadyAddedIds.has(item.id))
                          .map((item) => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                          ))}
                      </select>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={addLineAmount}
                          onChange={(e) => setAddLineAmount(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); selectedStructureId != null && handleAddLine(); } }}
                          placeholder="סכום לחיוב (₪) – אופציונלי"
                          className="w-40 px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                      <span className="text-xs text-gray-500">בחר קטגוריה ותווסף מיד. סכום ריק = ניתן לערוך אחר כך</span>
                    </div>
                  </td>
                </tr>
              )}
              {addSuccessMessage && (
                <tr>
                  <td colSpan={3} className="py-2 px-4">
                    <div className="p-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5" /> {addSuccessMessage}
                    </div>
                  </td>
                </tr>
              )}
              {(!currentLines || currentLines.length === 0) && !addSuccessMessage ? (
                <tr>
                  <td colSpan={3} className="py-8 px-4 text-center text-gray-500 dark:text-gray-400">
                    אין פריטים. בחר פריט מהרשימה למעלה והוא יתווסף אוטומטית. להגדרת פריטים: הגדרות → חלוקת הצעת מחיר.
                  </td>
                </tr>
              ) : (
                currentLines.map((line: QuoteLine) => (
                  <tr key={line.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <td className="py-2.5 px-4 text-gray-900 dark:text-white">
                      {line.quote_structure_item_name}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-gray-900 dark:text-white">
                      {quote?.status === 'draft' && editingLineId === line.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editingAmount}
                            onChange={(e) => setEditingAmount(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUpdateLineAmount(line.id, editingAmount)}
                            className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                          <button type="button" onClick={() => handleUpdateLineAmount(line.id, editingAmount)} className="p-1 text-green-600"><CheckCircle className="w-4 h-4" /></button>
                          <button type="button" onClick={() => setEditingLineId(null)} className="p-1 text-gray-500"><X className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <span
                          className={`tabular-nums ${quote?.status === 'draft' ? 'cursor-pointer hover:text-blue-600' : ''}`}
                          onClick={() => quote?.status === 'draft' && (setEditingLineId(line.id), setEditingAmount(line.amount != null ? String(line.amount) : ''))}
                        >
                          {line.amount != null ? line.amount.toLocaleString('he-IL') + ' ₪' : '–'}
                        </span>
                      )}
                    </td>
                    {quote?.status === 'draft' && (
                      <td className="py-2.5 px-2">
                        {editingLineId !== line.id && (
                          <div className="flex gap-0.5">
                            <button type="button" onClick={() => { setEditingLineId(line.id); setEditingAmount(line.amount != null ? String(line.amount) : ''); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded" title="ערוך"><Pencil className="w-4 h-4" /></button>
                            <button type="button" onClick={() => handleDeleteLine(line.id)} className="p-1.5 text-red-500 hover:text-red-600 rounded" title="מחק"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
            {quote && (
              <tfoot>
                <tr className="bg-blue-50 dark:bg-blue-900/20 border-t-2 border-gray-200 dark:border-gray-700">
                  <td className="py-2.5 px-4 font-semibold text-gray-800 dark:text-gray-200">סה&quot;כ הוצאות הצעת מחיר</td>
                  <td className="py-2.5 px-4 text-right font-semibold tabular-nums text-gray-900 dark:text-white">
                    {buildingTotal.toLocaleString('he-IL')} ₪
                  </td>
                  {quote?.status === 'draft' && <td />}
                </tr>
                {currentBuilding?.calculation_method !== 'by_apartment_size' && (
                  <>
                    <tr className={`border-t border-gray-200 dark:border-gray-700 ${quote?.status === 'draft' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-green-50/50 dark:bg-green-900/10'}`}>
                      <td className="py-2.5 px-4 font-semibold text-gray-800 dark:text-gray-200">מספר דיירים</td>
                      <td className="py-2.5 px-4 text-right">
                        {quote?.status === 'draft' ? (
                          <div className="flex items-center justify-end gap-2">
                            <input
                              type="number"
                              min="1"
                              value={currentNumResidentsStr}
                              onChange={(e) => setCurrentNumResidentsStr(e.target.value)}
                              onBlur={handleSaveNumResidents}
                              className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white tabular-nums"
                            />
                            {savingNumResidents && <span className="text-xs text-gray-500">שומר...</span>}
                          </div>
                        ) : (
                          <span className="tabular-nums font-semibold">{effectiveResidents.toLocaleString('he-IL')}</span>
                        )}
                      </td>
                      {quote?.status === 'draft' && <td />}
                    </tr>
                    <tr className="bg-amber-50 dark:bg-amber-900/20 border-t border-gray-200 dark:border-gray-700 font-semibold">
                      <td className="py-2.5 px-4 text-gray-800 dark:text-gray-200">סה&quot;כ הוצאה לכל דייר</td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-gray-900 dark:text-white">
                        {effectiveResidents > 0
                          ? (buildingTotal / effectiveResidents).toLocaleString('he-IL', { minimumFractionDigits: 2 })
                          : '0.00'}{' '}
                        ₪
                      </td>
                      {quote?.status === 'draft' && <td />}
                    </tr>
                  </>
                )}
              </tfoot>
            )}
          </table>
        </div>

        {/* לפי גודל הדירה: רשימת דירות + תשלום לכל דירה */}
        {currentBuilding?.calculation_method === 'by_apartment_size' && (
          <div className="mt-6 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-amber-50/30 dark:bg-amber-900/10">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">חישוב לפי גודל הדירה</h3>
            {quote?.status === 'draft' && (
              <div className="flex flex-wrap items-end gap-2 mb-4">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={newApartmentSize}
                  onChange={(e) => setNewApartmentSize(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddApartment()}
                  placeholder="גודל דירה (מ&quot;ר)"
                  className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleAddApartment}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  הוסף דירה
                </button>
              </div>
            )}
            {apartments.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">הוסף דירות עם גודל (מ&quot;ר) כדי לראות תשלום לכל דירה.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  סה&quot;כ שטח: {totalSqm.toLocaleString('he-IL')} מ&quot;ר · מחיר למ&quot;ר: {costPerSqm.toLocaleString('he-IL', { minimumFractionDigits: 2 })} ₪
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300">דירה</th>
                      <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300">גודל (מ&quot;ר)</th>
                      <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300">תשלום (₪)</th>
                      {quote?.status === 'draft' && <th className="w-16" />}
                    </tr>
                  </thead>
                  <tbody>
                    {apartments.map((apt, idx) => (
                      <tr key={apt.id} className="border-b border-gray-100 dark:border-gray-700">
                        <td className="py-2 px-2 text-gray-900 dark:text-white">דירה {idx + 1}</td>
                        <td className="py-2 px-2 text-right tabular-nums">
                          {editingApartmentId === apt.id ? (
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={editingApartmentSize}
                              onChange={(e) => setEditingApartmentSize(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleUpdateApartment(apt.id, parseFloat(editingApartmentSize) || apt.size_sqm)
                                if (e.key === 'Escape') setEditingApartmentId(null)
                              }}
                              className="w-20 px-2 py-1 border rounded bg-white dark:bg-gray-700"
                            />
                          ) : (
                            <span
                              className={quote?.status === 'draft' ? 'cursor-pointer hover:text-blue-600' : ''}
                              onClick={() => quote?.status === 'draft' && (setEditingApartmentId(apt.id), setEditingApartmentSize(String(apt.size_sqm)))}
                            >
                              {apt.size_sqm.toLocaleString('he-IL')}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums font-medium text-gray-900 dark:text-white">
                          {(costPerSqm * apt.size_sqm).toLocaleString('he-IL', { minimumFractionDigits: 2 })} ₪
                        </td>
                        {quote?.status === 'draft' && (
                          <td className="py-2 px-2">
                            {editingApartmentId === apt.id ? (
                              <div className="flex gap-1">
                                <button type="button" onClick={() => handleUpdateApartment(apt.id, parseFloat(editingApartmentSize) || apt.size_sqm)} className="p-1 text-green-600"><CheckCircle className="w-4 h-4" /></button>
                                <button type="button" onClick={() => setEditingApartmentId(null)} className="p-1 text-gray-500"><X className="w-4 h-4" /></button>
                              </div>
                            ) : (
                              <button type="button" onClick={() => handleDeleteApartment(apt.id)} className="p-1 text-red-500 hover:text-red-600" title="מחק"><Trash2 className="w-4 h-4" /></button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {approveCurrentQuote && (
        <CreateProjectModal
          isOpen={true}
          onClose={() => setApproveCurrentQuote(null)}
          onSuccess={handleApproveSuccess}
          parentProjectId={undefined}
          initialFormData={quoteToInitialFormData(approveCurrentQuote)}
          titleOverride="אשר הצעת מחיר – צור פרויקט חדש"
          projectType="regular"
          nameReadOnly={true}
        />
      )}
    </div>
  )
}
