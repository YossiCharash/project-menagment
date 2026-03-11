import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, ArrowLeft, Plus, Trash2, Building2, ChevronDown } from 'lucide-react'
import { QuoteProjectsAPI, QuoteSubjectsAPI, QuoteStructureAPI } from '../lib/apiClient'
import type { QuoteSubject, QuoteCalculationMethod } from '../lib/apiClient'
import type { CreateSubjectInput } from '../components/QuoteViewModal'
import QuoteMonthlyProjectionTable from './QuoteDetail/components/QuoteMonthlyProjectionTable'

// ── Types ────────────────────────────────────────────────────────────────────

interface ApartmentGroup {
  size_sqm: string
  count: string
}

interface BuildingInput {
  address: string
  num_residents: string
  calculation_method: QuoteCalculationMethod
  apartment_groups: ApartmentGroup[]
}

interface LineInput {
  structure_item_id: number
  structure_item_name: string
  amount: string
}

type Step = 1 | 2 | 3

// ── Helpers ──────────────────────────────────────────────────────────────────

function calcTotalSqm(groups: ApartmentGroup[]): number {
  return groups.reduce((sum, g) => {
    const sqm = parseFloat(g.size_sqm)
    const cnt = parseInt(g.count, 10)
    return sum + (isNaN(sqm) || isNaN(cnt) ? 0 : sqm * cnt)
  }, 0)
}

function calcTotalLines(lines: LineInput[]): number {
  return lines.reduce((sum, l) => {
    const v = parseFloat(l.amount)
    return sum + (isNaN(v) ? 0 : v)
  }, 0)
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CreateQuotePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const projectIdParam = searchParams.get('projectId')
  const subjectIdParam = searchParams.get('subjectId')

  const projectId = projectIdParam ? parseInt(projectIdParam, 10) : null
  const initialSubjectId = subjectIdParam ? parseInt(subjectIdParam, 10) : null
  const subjectFromContext = initialSubjectId != null

  // ── step ──
  const [step, setStep] = useState<Step>(1)

  // ── step 1 ──
  const [quoteSubjects, setQuoteSubjects] = useState<QuoteSubject[]>([])
  const [createSubjectMode, setCreateSubjectMode] = useState<'existing' | 'new'>('existing')
  const [createSubjectId, setCreateSubjectId] = useState<number | null>(initialSubjectId)
  const [createAddress, setCreateAddress] = useState('')
  const [createNumApartments, setCreateNumApartments] = useState('')
  const [createNumBuildings, setCreateNumBuildings] = useState('')
  const [createNotes, setCreateNotes] = useState('')
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')

  // ── step 2 ──
  const [buildings, setBuildings] = useState<BuildingInput[]>([
    { address: '', num_residents: '', calculation_method: 'by_residents', apartment_groups: [{ size_sqm: '', count: '' }] }
  ])

  // ── step 3 ──
  const [structureItems, setStructureItems] = useState<{ id: number; name: string }[]>([])
  const [buildingLines, setBuildingLines] = useState<LineInput[][]>([[]])
  const [activeBuildingTab, setActiveBuildingTab] = useState(0)
  const [addLineItemIds, setAddLineItemIds] = useState<Set<number>>(new Set())
  const [addLineDropdownOpen, setAddLineDropdownOpen] = useState(false)
  const addLineDropdownRef = useRef<HTMLDivElement>(null)

  // ── global ──
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    QuoteSubjectsAPI.list().then(setQuoteSubjects).catch(() => setQuoteSubjects([]))
  }, [])

  useEffect(() => {
    if (initialSubjectId != null) {
      setCreateSubjectId(initialSubjectId)
      setCreateSubjectMode('existing')
    }
  }, [initialSubjectId])

  // Fetch structure items when entering step 3
  useEffect(() => {
    if (step !== 3) return
    QuoteStructureAPI.list(false).then(items =>
      setStructureItems(items.map(i => ({ id: i.id, name: i.name })))
    ).catch(() => {})
    // Sync buildingLines size to buildings count
    setBuildingLines(prev => {
      if (prev.length === buildings.length) return prev
      return Array.from({ length: buildings.length }, (_, i) => prev[i] ?? [])
    })
  }, [step])

  useEffect(() => {
    if (!addLineDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (addLineDropdownRef.current && !addLineDropdownRef.current.contains(e.target as Node)) {
        setAddLineDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [addLineDropdownOpen])

  // ── step 1 validation ──
  const canGoToStep2 =
    newName.trim() &&
    (subjectFromContext || (createSubjectMode === 'existing' ? createSubjectId != null : true))

  // ── step 2 handlers ──
  const handleAddBuilding = () =>
    setBuildings(prev => [...prev, { address: '', num_residents: '', calculation_method: 'by_residents', apartment_groups: [{ size_sqm: '', count: '' }] }])

  const handleRemoveBuilding = (i: number) => {
    if (buildings.length <= 1) return
    setBuildings(prev => prev.filter((_, idx) => idx !== i))
    setBuildingLines(prev => prev.filter((_, idx) => idx !== i))
    setActiveBuildingTab(t => Math.min(t, buildings.length - 2))
  }

  const setBuildingField = (i: number, field: keyof BuildingInput, value: string | QuoteCalculationMethod) =>
    setBuildings(prev => prev.map((b, idx) => idx === i ? { ...b, [field]: value } : b))

  const handleAddAptGroup = (bi: number) =>
    setBuildings(prev => prev.map((b, i) => i === bi ? { ...b, apartment_groups: [...b.apartment_groups, { size_sqm: '', count: '' }] } : b))

  const handleRemoveAptGroup = (bi: number, gi: number) =>
    setBuildings(prev => prev.map((b, i) => i === bi ? { ...b, apartment_groups: b.apartment_groups.filter((_, j) => j !== gi) } : b))

  const setAptGroupField = (bi: number, gi: number, field: keyof ApartmentGroup, value: string) =>
    setBuildings(prev => prev.map((b, i) => i === bi ? {
      ...b,
      apartment_groups: b.apartment_groups.map((g, j) => j === gi ? { ...g, [field]: value } : g)
    } : b))

  // ── step 3 handlers ──
  const handleAddLines = () => {
    const idsToAdd = [...addLineItemIds]
    if (idsToAdd.length === 0) return
    setBuildingLines(prev => {
      const next = [...prev]
      const existingIds = new Set((next[activeBuildingTab] ?? []).map(l => l.structure_item_id))
      const newLines = idsToAdd
        .filter(id => !existingIds.has(id))
        .map(id => {
          const item = structureItems.find(s => s.id === id)!
          return { structure_item_id: item.id, structure_item_name: item.name, amount: '' }
        })
      next[activeBuildingTab] = [...(next[activeBuildingTab] ?? []), ...newLines]
      return next
    })
    setAddLineItemIds(new Set())
  }

  const handleRemoveLine = (lineIdx: number) => {
    setBuildingLines(prev => {
      const next = [...prev]
      next[activeBuildingTab] = (next[activeBuildingTab] ?? []).filter((_, i) => i !== lineIdx)
      return next
    })
  }

  const handleLineAmountChange = (lineIdx: number, value: string) => {
    setBuildingLines(prev => {
      const next = [...prev]
      next[activeBuildingTab] = (next[activeBuildingTab] ?? []).map((l, i) =>
        i === lineIdx ? { ...l, amount: value } : l
      )
      return next
    })
  }

  // ── navigation ──
  const handleNext1 = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canGoToStep2) return
    setCreateError(null)
    setStep(2)
  }

  const handleNext2 = (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)
    // Sync buildingLines length
    setBuildingLines(prev => Array.from({ length: buildings.length }, (_, i) => prev[i] ?? []))
    setActiveBuildingTab(0)
    setStep(3)
  }

  const handleBack = () => {
    setCreateError(null)
    setStep(s => (s - 1) as Step)
  }

  // ── final submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      // Resolve subject
      let quoteSubjectId: number
      const subject: CreateSubjectInput = subjectFromContext
        ? { type: 'existing', id: initialSubjectId! }
        : createSubjectMode === 'existing' && createSubjectId != null
          ? { type: 'existing', id: createSubjectId }
          : {
              type: 'new',
              address: createAddress.trim() || null,
              num_apartments: createNumApartments.trim() ? parseInt(createNumApartments.trim(), 10) || null : null,
              num_buildings: createNumBuildings.trim() ? parseInt(createNumBuildings.trim(), 10) || null : null,
              notes: createNotes.trim() || null,
            }

      if (subject.type === 'existing') {
        quoteSubjectId = subject.id
      } else {
        const sub = await QuoteSubjectsAPI.create({
          address: subject.address ?? undefined,
          num_apartments: subject.num_apartments ?? undefined,
          num_buildings: subject.num_buildings ?? undefined,
          notes: subject.notes ?? undefined,
        })
        quoteSubjectId = sub.id
      }

      // Create quote
      const created = await QuoteProjectsAPI.create({
        quote_subject_id: quoteSubjectId,
        name: newName.trim(),
        description: newDescription.trim() || null,
        project_id: projectId ?? undefined,
      })

      // Create each building with its lines
      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i]

        // 1. Create building
        const building = await QuoteProjectsAPI.addBuilding(created.id, {
          calculation_method: b.calculation_method,
          sort_order: i,
        })

        // 2. Update address / residents
        const addr = b.address.trim()
        const residents = parseInt(b.num_residents.trim(), 10)
        const hasResidents = b.calculation_method === 'by_residents' && residents > 0 && !isNaN(residents)
        if (addr || hasResidents) {
          await QuoteProjectsAPI.updateBuilding(created.id, building.id, {
            address: addr || undefined,
            num_residents: hasResidents ? residents : undefined,
          })
        }

        // 3. Add apartment groups if by_apartment_size
        if (b.calculation_method === 'by_apartment_size') {
          for (const group of b.apartment_groups) {
            const count = parseInt(group.count, 10)
            const sizeSqm = parseFloat(group.size_sqm)
            if (count > 0 && !isNaN(count) && sizeSqm > 0 && !isNaN(sizeSqm)) {
              await QuoteProjectsAPI.addApartmentsBulk(created.id, building.id, { count, size_sqm: sizeSqm })
            }
          }
        }

        // 4. Add expense lines for this building
        const lines = buildingLines[i] ?? []
        for (let li = 0; li < lines.length; li++) {
          const line = lines[li]
          const amount = parseFloat(line.amount)
          await QuoteProjectsAPI.addLine(created.id, {
            quote_structure_item_id: line.structure_item_id,
            amount: !isNaN(amount) && amount > 0 ? amount : null,
            sort_order: li,
            quote_building_id: building.id,
          })
        }
      }

      navigate(`/price-quotes/${created.id}`)
    } catch (err: any) {
      setCreateError(err.response?.data?.detail || err.message || 'שגיאה ביצירת הצעת מחיר')
    } finally {
      setCreating(false)
    }
  }

  // ── render helpers ──
  const activeBuilding = buildings[activeBuildingTab]
  const activeLines = buildingLines[activeBuildingTab] ?? []
  const totalLines = calcTotalLines(activeLines)
  const alreadyAddedIds = new Set(activeLines.map(l => l.structure_item_id))
  const availableItems = structureItems.filter(s => !alreadyAddedIds.has(s.id))

  const residentCount = activeBuilding
    ? parseInt(activeBuilding.num_residents, 10)
    : 0
  const totalSqm = activeBuilding ? calcTotalSqm(activeBuilding.apartment_groups) : 0

  const costPerUnit = activeBuilding?.calculation_method === 'by_residents'
    ? (residentCount > 0 ? totalLines / residentCount : null)
    : (totalSqm > 0 ? totalLines / totalSqm : null)

  const unitLabel = activeBuilding?.calculation_method === 'by_residents' ? 'דייר' : 'מ"ר'

  // ── step indicator ──
  const stepLabels = ['פרטי ההצעה', 'בניינים', 'תשלומים']

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          type="button"
          onClick={() => navigate('/price-quotes')}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-8 transition-colors"
        >
          <ArrowRight className="w-5 h-5" />
          חזרה להצעות מחיר
        </button>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">הצעת מחיר חדשה</h1>

          {/* ── Step indicator ── */}
          <div className="flex items-center gap-2 mb-8">
            {stepLabels.map((label, idx) => {
              const n = idx + 1 as Step
              const done = step > n
              const active = step === n
              return (
                <React.Fragment key={n}>
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    active ? 'bg-blue-600 text-white' :
                    done ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                    'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                  }`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      active ? 'bg-white/30 text-white' :
                      done ? 'bg-green-500 text-white' :
                      'bg-gray-300 dark:bg-gray-600 text-gray-500'
                    }`}>
                      {done ? '✓' : n}
                    </span>
                    {label}
                  </div>
                  {idx < stepLabels.length - 1 && (
                    <div className="h-px flex-1 bg-gray-200 dark:bg-gray-600" />
                  )}
                </React.Fragment>
              )
            })}
          </div>

          {/* ════════════════════════════════════
              STEP 1 — פרטי ההצעה
          ════════════════════════════════════ */}
          {step === 1 && (
            <form onSubmit={handleNext1} className="space-y-6">
              {!subjectFromContext && (
                <>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">פרויקט (נושא ההצעה) *</p>
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={createSubjectMode === 'existing'} onChange={() => setCreateSubjectMode('existing')} />
                      <span className="text-sm">בחר פרויקט קיים</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={createSubjectMode === 'new'} onChange={() => setCreateSubjectMode('new')} />
                      <span className="text-sm">פרויקט חדש</span>
                    </label>
                  </div>

                  {createSubjectMode === 'existing' ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">פרויקט *</label>
                      <select
                        value={createSubjectId ?? ''}
                        onChange={e => setCreateSubjectId(e.target.value === '' ? null : parseInt(e.target.value, 10))}
                        className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="">בחר פרויקט...</option>
                        {quoteSubjects.map(s => {
                          const parts = [s.address, s.num_apartments != null ? s.num_apartments + ' דירות' : null, s.num_buildings != null ? s.num_buildings + ' בניינים' : null].filter(Boolean) as string[]
                          return <option key={s.id} value={s.id}>{parts.length ? parts.join(' • ') : 'פרויקט #' + s.id}</option>
                        })}
                      </select>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">כתובת</label>
                        <input type="text" value={createAddress} onChange={e => setCreateAddress(e.target.value)} placeholder="כתובת הפרויקט"
                          className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מספר דירות</label>
                          <input type="number" min="0" value={createNumApartments} onChange={e => setCreateNumApartments(e.target.value)} placeholder="—"
                            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">כמות בניינים</label>
                          <input type="number" min="0" value={createNumBuildings} onChange={e => setCreateNumBuildings(e.target.value)} placeholder="—"
                            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">הערות</label>
                        <textarea value={createNotes} onChange={e => setCreateNotes(e.target.value)} rows={2} placeholder="הערות על הפרויקט"
                          className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                      </div>
                    </>
                  )}
                </>
              )}
              {subjectFromContext && (
                <p className="text-sm text-gray-500 dark:text-gray-400">הצעת המחיר תתווסף לפרויקט שנבחר.</p>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">שם ההצעה *</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="לדוגמה: הצעת מחיר לשיפוץ לובי"
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תיאור (אופציונלי)</label>
                <textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => navigate('/price-quotes')} className="px-6 py-2.5 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                  ביטול
                </button>
                <button type="submit" disabled={!canGoToStep2} className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  הבא <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* ════════════════════════════════════
              STEP 2 — בניינים
          ════════════════════════════════════ */}
          {step === 2 && (
            <form onSubmit={handleNext2} className="space-y-5">
              <p className="text-sm text-gray-500 dark:text-gray-400">הגדר כל בניין — כתובת, שיטת חישוב ומספר דיירים / דירות.</p>

              {buildings.map((b, bi) => (
                <div key={bi} className="border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
                  {/* Building header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/50">
                    <span className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                      <Building2 className="w-4 h-4 text-blue-500" />
                      בניין {bi + 1}
                    </span>
                    {buildings.length > 1 && (
                      <button type="button" onClick={() => handleRemoveBuilding(bi)} className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="p-4 space-y-4">
                    {/* Address */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">כתובת הבניין</label>
                      <input type="text" value={b.address} onChange={e => setBuildingField(bi, 'address', e.target.value)} placeholder="רחוב, מספר"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>

                    {/* Calculation method */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">שיטת חישוב תשלום</label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name={`calc-${bi}`} checked={b.calculation_method === 'by_residents'}
                            onChange={() => setBuildingField(bi, 'calculation_method', 'by_residents')} className="accent-blue-600" />
                          <span className="text-sm">שווה בשווה (לפי דיירים)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name={`calc-${bi}`} checked={b.calculation_method === 'by_apartment_size'}
                            onChange={() => setBuildingField(bi, 'calculation_method', 'by_apartment_size')} className="accent-blue-600" />
                          <span className="text-sm">לפי גודל הדירה</span>
                        </label>
                      </div>
                    </div>

                    {/* by_residents: num_residents */}
                    {b.calculation_method === 'by_residents' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">מספר דיירים</label>
                        <input type="number" min="0" value={b.num_residents} onChange={e => setBuildingField(bi, 'num_residents', e.target.value)} placeholder="—"
                          className="w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                      </div>
                    )}

                    {/* by_apartment_size: apartment groups */}
                    {b.calculation_method === 'by_apartment_size' && (
                      <div className="space-y-2">
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">דירות לפי גודל</label>
                        {b.apartment_groups.map((g, gi) => (
                          <div key={gi} className="flex items-center gap-2">
                            <input type="number" min="0" step="0.01" value={g.size_sqm}
                              onChange={e => setAptGroupField(bi, gi, 'size_sqm', e.target.value)}
                              placeholder='גודל מ"ר' className="w-28 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                            <span className="text-xs text-gray-400">×</span>
                            <input type="number" min="1" value={g.count}
                              onChange={e => setAptGroupField(bi, gi, 'count', e.target.value)}
                              placeholder="כמות" className="w-20 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                            <span className="text-xs text-gray-500">דירות</span>
                            {b.apartment_groups.length > 1 && (
                              <button type="button" onClick={() => handleRemoveAptGroup(bi, gi)} className="p-1 text-red-400 hover:text-red-600 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                        <button type="button" onClick={() => handleAddAptGroup(bi)}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1">
                          <Plus className="w-3 h-3" /> הוסף גודל דירה
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <button type="button" onClick={handleAddBuilding}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 transition-colors text-sm w-full justify-center">
                <Plus className="w-4 h-4" /> הוסף בניין נוסף
              </button>

              <div className="flex justify-between gap-3 pt-2">
                <button type="button" onClick={handleBack} className="inline-flex items-center gap-2 px-5 py-2.5 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                  <ArrowRight className="w-4 h-4" /> חזרה
                </button>
                <button type="submit" className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors">
                  הבא <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* ════════════════════════════════════
              STEP 3 — תשלומים לפי בניין
          ════════════════════════════════════ */}
          {step === 3 && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                בחר את סעיפי התשלום לכל בניין והזן סכומים. ניתן לדלג ולהוסיף לאחר מכן.
              </p>

              {/* Building tabs */}
              {buildings.length > 1 && (
                <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-3">
                  {buildings.map((b, i) => (
                    <button key={i} type="button" onClick={() => { setActiveBuildingTab(i); setAddLineItemIds(new Set()); setAddLineDropdownOpen(false) }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        i === activeBuildingTab
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}>
                      <Building2 className="w-3.5 h-3.5" />
                      {b.address.trim() || `בניין ${i + 1}`}
                    </button>
                  ))}
                </div>
              )}

              {/* Active building info */}
              {activeBuilding && (
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-sm">
                  <div className="flex flex-wrap gap-4 text-blue-800 dark:text-blue-200">
                    {activeBuilding.address && <span>כתובת: <strong>{activeBuilding.address}</strong></span>}
                    <span>חישוב: <strong>{activeBuilding.calculation_method === 'by_residents' ? 'שווה בשווה' : 'לפי גודל דירה'}</strong></span>
                    {activeBuilding.calculation_method === 'by_residents' && parseInt(activeBuilding.num_residents, 10) > 0 && (
                      <span>דיירים: <strong>{activeBuilding.num_residents}</strong></span>
                    )}
                    {activeBuilding.calculation_method === 'by_apartment_size' && totalSqm > 0 && (
                      <span>סה"כ מ"ר: <strong>{totalSqm.toLocaleString('he-IL')}</strong></span>
                    )}
                  </div>
                </div>
              )}

              {/* Lines table */}
              {activeLines.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                      <tr>
                        <th className="px-4 py-2.5 text-right font-medium text-gray-600 dark:text-gray-300">שירות / סעיף</th>
                        <th className="px-4 py-2.5 text-right font-medium text-gray-600 dark:text-gray-300">סכום חודשי (₪)</th>
                        {costPerUnit !== null && (
                          <th className="px-4 py-2.5 text-right font-medium text-gray-600 dark:text-gray-300">לכל {unitLabel}</th>
                        )}
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {activeLines.map((line, li) => {
                        const lineAmt = parseFloat(line.amount)
                        const perUnit = (() => {
                          if (isNaN(lineAmt)) return null
                          if (activeBuilding?.calculation_method === 'by_residents') {
                            const r = parseInt(activeBuilding.num_residents, 10)
                            return r > 0 ? lineAmt / r : null
                          } else {
                            return totalSqm > 0 ? lineAmt / totalSqm : null
                          }
                        })()
                        return (
                          <tr key={li} className="bg-white dark:bg-gray-800">
                            <td className="px-4 py-2.5 text-gray-900 dark:text-white">{line.structure_item_name}</td>
                            <td className="px-4 py-2.5">
                              <input
                                type="number" min="0" step="0.01" value={line.amount}
                                onChange={e => handleLineAmountChange(li, e.target.value)}
                                placeholder="0"
                                className="w-32 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                              />
                            </td>
                            {costPerUnit !== null && (
                              <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 font-mono">
                                {perUnit != null ? `₪${perUnit.toFixed(2)}` : '—'}
                              </td>
                            )}
                            <td className="px-2 py-2.5">
                              <button type="button" onClick={() => handleRemoveLine(li)} className="p-1 text-red-400 hover:text-red-600 transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    {/* Totals row */}
                    <tfoot className="bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
                      <tr>
                        <td className="px-4 py-2.5 font-semibold text-gray-800 dark:text-gray-200">סה"כ</td>
                        <td className="px-4 py-2.5 font-semibold text-gray-800 dark:text-gray-200">
                          ₪{totalLines.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                        {costPerUnit !== null && (
                          <td className="px-4 py-2.5 font-semibold text-gray-800 dark:text-gray-200 font-mono">
                            ₪{costPerUnit.toFixed(2)}
                          </td>
                        )}
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {activeLines.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                  לא נוספו סעיפים עדיין לבניין זה
                </p>
              )}

              {activeLines.length > 0 && totalLines > 0 && (
                <QuoteMonthlyProjectionTable
                  lines={activeLines.map((l) => ({ name: l.structure_item_name, amount: parseFloat(l.amount) || 0 }))}
                  totalAmount={totalLines}
                />
              )}

              {/* Add categories */}
              {structureItems.length > 0 && (
                <div ref={addLineDropdownRef} style={{position: 'relative'}} className="flex items-center gap-2">
                  {availableItems.length > 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setAddLineDropdownOpen(o => !o)}
                        className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm min-w-[180px] justify-between"
                      >
                        <span>
                          {addLineItemIds.size > 0 ? `${addLineItemIds.size} קטגוריות נבחרו` : 'בחר קטגוריות'}
                        </span>
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      </button>

                      {/* Add button — always visible */}
                      <button
                        type="button"
                        onClick={handleAddLines}
                        disabled={addLineItemIds.size === 0}
                        className="inline-flex items-center gap-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        {addLineItemIds.size > 0 ? `הוסף ${addLineItemIds.size} קטגוריות` : 'הוסף'}
                      </button>

                      {addLineDropdownOpen && (
                        <div className="absolute top-full mt-1 right-0 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg min-w-[220px] py-1 max-h-56 overflow-y-auto">
                          {availableItems.map(item => (
                            <label
                              key={item.id}
                              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={addLineItemIds.has(item.id)}
                                onChange={() => setAddLineItemIds(prev => {
                                  const next = new Set(prev)
                                  next.has(item.id) ? next.delete(item.id) : next.add(item.id)
                                  return next
                                })}
                                className="accent-blue-600"
                              />
                              <span className="text-sm text-gray-900 dark:text-white">{item.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">כל הקטגוריות כבר נוספו</p>
                  )}
                </div>
              )}

              {createError && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-xl border border-red-100 dark:border-red-800">
                  {createError}
                </div>
              )}

              <div className="flex justify-between gap-3 pt-2">
                <button type="button" onClick={handleBack} disabled={creating}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                  <ArrowRight className="w-4 h-4" /> חזרה
                </button>
                <button type="submit" disabled={creating}
                  className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {creating ? 'שומר טיוטה...' : 'שמור כטיוטה'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
