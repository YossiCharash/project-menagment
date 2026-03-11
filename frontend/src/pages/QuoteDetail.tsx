import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  QuoteProjectsAPI,
  QuoteStructureAPI,
  QuoteProject,
  QuoteLine,
  QuoteBuilding,
  type QuoteCalculationMethod,
} from '../lib/apiClient'
import type { Project } from '../types/api'
import CreateProjectModal from '../components/CreateProjectModal'
import QuoteBuildingsPanel from '../components/QuoteBuildingsPanel'
import QuoteDetailHeader from './QuoteDetail/components/QuoteDetailHeader'
import QuoteExpenseLinesTable from './QuoteDetail/components/QuoteExpenseLinesTable'
import QuoteApartmentsBySize from './QuoteDetail/components/QuoteApartmentsBySize'
import QuoteMonthlyProjectionTable from './QuoteDetail/components/QuoteMonthlyProjectionTable'

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
  const [selectedStructureIds, setSelectedStructureIds] = useState<Set<number>>(new Set())
  const [editingAmounts, setEditingAmounts] = useState<Map<number, string>>(new Map())
  const [numResidents, setNumResidents] = useState<string>('')
  const [savingNumResidents, setSavingNumResidents] = useState(false)
  const [approving, setApproving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [approveCurrentQuote, setApproveCurrentQuote] = useState<QuoteProject | null>(null)
  const [addSuccessMessage, setAddSuccessMessage] = useState<string | null>(null)
  const [editingQuoteName, setEditingQuoteName] = useState(false)
  const [quoteNameInput, setQuoteNameInput] = useState('')
  const [savingQuoteName, setSavingQuoteName] = useState(false)
  /** באותו פרויקט כבר אושרה הצעה אחרת – אז לא להציג כפתור אישור */
  const [projectHasOtherApprovedQuote, setProjectHasOtherApprovedQuote] = useState(false)
  /** טאב בניין נבחר (0-based) */
  const [activeBuildingIndex, setActiveBuildingIndex] = useState(0)
  const [addingBuilding, setAddingBuilding] = useState(false)
  const [addApartmentCount, setAddApartmentCount] = useState('1')
  const [addApartmentSizeSqm, setAddApartmentSizeSqm] = useState('')
  const [addingApartments, setAddingApartments] = useState(false)
  const [deletingApartmentsSizeSqm, setDeletingApartmentsSizeSqm] = useState<number | null>(null)

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

  const handleAddLines = async () => {
    const idsToAdd = [...selectedStructureIds]
    if (!quoteId || idsToAdd.length === 0) return
    try {
      let sortOrder = currentLines.length
      for (const id of idsToAdd) {
        await QuoteProjectsAPI.addLine(quoteId, {
          quote_structure_item_id: id,
          amount: null,
          sort_order: sortOrder++,
          quote_building_id: currentBuilding?.id ?? undefined,
        })
      }
      const updated = await QuoteProjectsAPI.get(quoteId)
      setQuote(updated)
      setSelectedStructureIds(new Set())
      // פתח עריכת סכום לכל שורה שנוספה
      const addedStructureIds = new Set(idsToAdd)
      const currentBuildingId = currentBuilding?.id
      const updatedLines = currentBuildingId
        ? (updated.quote_buildings?.find((b) => b.id === currentBuildingId)?.quote_lines ?? [])
        : (updated.quote_lines ?? [])
      const newAmounts = new Map<number, string>()
      for (const line of updatedLines) {
        if (addedStructureIds.has(line.quote_structure_item_id)) {
          newAmounts.set(line.id, '')
        }
      }
      setEditingAmounts(newAmounts)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה בהוספת פריטים')
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
      setEditingAmounts(prev => { const next = new Map(prev); next.delete(lineId); return next })
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
      setEditingAmounts(prev => { const next = new Map(prev); next.delete(lineId); return next })
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

  const handleAddApartments = async (count: number, sizeSqm: number) => {
    if (!quoteId || currentBuilding == null) return
    if (count < 1 || sizeSqm <= 0) return
    setAddingApartments(true)
    try {
      await QuoteProjectsAPI.addApartmentsBulk(quoteId, currentBuilding.id, { count, size_sqm: sizeSqm })
      const updated = await QuoteProjectsAPI.get(quoteId)
      setQuote(updated)
      setAddApartmentSizeSqm('')
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה בהוספת דירות')
    } finally {
      setAddingApartments(false)
    }
  }

  const handleDeleteApartmentsOfSize = async (sizeSqm: number) => {
    if (!quoteId || currentBuilding == null) return
    const toDelete = (currentBuilding.quote_apartments ?? []).filter((a) => a.size_sqm === sizeSqm)
    if (toDelete.length === 0) return
    setDeletingApartmentsSizeSqm(sizeSqm)
    try {
      for (const apt of toDelete) {
        await QuoteProjectsAPI.deleteApartment(quoteId, currentBuilding.id, apt.id)
      }
      const updated = await QuoteProjectsAPI.get(quoteId)
      setQuote(updated)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה במחיקת דירות')
    } finally {
      setDeletingApartmentsSizeSqm(null)
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
      <QuoteDetailHeader
        quoteName={quote?.name ?? 'הצעת מחיר'}
        quoteStatus={quote?.status ?? 'draft'}
        convertedProjectId={quote?.converted_project_id ?? null}
        embedMode={embedMode}
        showApproveActions={!projectHasOtherApprovedQuote}
        approving={approving}
        deleting={deleting}
        editingQuoteName={editingQuoteName}
        quoteNameInput={quoteNameInput}
        savingQuoteName={savingQuoteName}
        onGoBack={goBack}
        onClose={onClose}
        onQuoteNameChange={setQuoteNameInput}
        onQuoteNameBlur={handleSaveQuoteName}
        onQuoteNameKeyDown={(e) => {
          if (e.key === 'Enter') handleSaveQuoteName()
          if (e.key === 'Escape') {
            setEditingQuoteName(false)
            setQuoteNameInput(quote?.name ?? '')
          }
        }}
        onStartEditQuoteName={() => quote?.status === 'draft' && setEditingQuoteName(true)}
        onApproveClick={handleApproveClick}
        onDeleteQuote={handleDeleteQuote}
        onNavigateToProject={(projectId) => navigate(`/projects/${projectId}`)}
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {quote?.quote_subject && (
          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 space-y-2">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">פרויקט (נושא ההצעה)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              {quote.quote_subject.address && (
                <p className="text-gray-900 dark:text-white"><span className="text-gray-500 dark:text-gray-400">כתובת:</span> {quote.quote_subject.address}</p>
              )}
              {quote.quote_subject.num_apartments != null && (
                <p className="text-gray-900 dark:text-white"><span className="text-gray-500 dark:text-gray-400">מספר דירות:</span> {quote.quote_subject.num_apartments}</p>
              )}
              {quote.quote_subject.num_buildings != null && (
                <p className="text-gray-900 dark:text-white"><span className="text-gray-500 dark:text-gray-400">כמות בניינים:</span> {quote.quote_subject.num_buildings}</p>
              )}
            </div>
            {quote.quote_subject.notes && (
              <p className="text-gray-900 dark:text-white text-sm mt-2"><span className="text-gray-500 dark:text-gray-400">הערות:</span> {quote.quote_subject.notes}</p>
            )}
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

        <QuoteExpenseLinesTable
          isDraft={quote?.status === 'draft'}
          currentLines={currentLines}
          structureItems={structureItems}
          alreadyAddedIds={alreadyAddedIds}
          selectedStructureIds={selectedStructureIds}
          editingAmounts={editingAmounts}
          addSuccessMessage={addSuccessMessage}
          buildingTotal={buildingTotal}
          showNumResidents={currentBuilding?.calculation_method !== 'by_apartment_size'}
          currentNumResidentsStr={currentNumResidentsStr}
          effectiveResidents={effectiveResidents}
          savingNumResidents={savingNumResidents}
          onToggleStructureId={(id) => setSelectedStructureIds(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
          })}
          onAddLines={handleAddLines}
          onEditLineAmount={(lineId, amount) => setEditingAmounts(prev => new Map(prev).set(lineId, amount))}
          onCancelEditLine={(lineId) => setEditingAmounts(prev => { const next = new Map(prev); next.delete(lineId); return next })}
          onUpdateLineAmount={handleUpdateLineAmount}
          onDeleteLine={handleDeleteLine}
          onNumResidentsChange={setCurrentNumResidentsStr}
          onNumResidentsBlur={handleSaveNumResidents}
        />

        {currentLines.length > 0 && buildingTotal > 0 && (
          <QuoteMonthlyProjectionTable
            lines={currentLines.map((l) => ({ name: l.quote_structure_item_name, amount: l.amount }))}
            totalAmount={buildingTotal}
          />
        )}

        {currentBuilding?.calculation_method === 'by_apartment_size' && (
          <QuoteApartmentsBySize
            isDraft={quote?.status === 'draft'}
            apartments={apartments}
            totalSqm={totalSqm}
            costPerSqm={costPerSqm}
            addCount={addApartmentCount}
            addSizeSqm={addApartmentSizeSqm}
            onAddCountChange={setAddApartmentCount}
            onAddSizeSqmChange={setAddApartmentSizeSqm}
            onAddApartments={handleAddApartments}
            adding={addingApartments}
            onDeleteApartmentsOfSize={handleDeleteApartmentsOfSize}
            deletingSizeSqm={deletingApartmentsSizeSqm}
          />
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
