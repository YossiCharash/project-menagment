import { useEffect, useState, useCallback } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../../store'
import {
  Warehouse as WarehouseIcon,
  Plus,
  MapPin,
  User,
  ChevronDown,
  ChevronUp,
  X,
  AlertTriangle,
  Package,
  Pencil,
  FolderKanban,
} from 'lucide-react'
import {
  cemsApi,
  type Warehouse,
  type CemsProject,
} from '../../lib/cemsApi'

// ─── Constants ───────────────────────────────────────────────────────────────

const MODAL_OVERLAY = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4'
const MODAL_PANEL = 'bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto'
const INPUT_CLASS = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const LABEL_CLASS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'
const BTN_PRIMARY = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'
const BTN_SECONDARY = 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors'

// ─── Main Component ──────────────────────────────────────────────────────────

export default function WarehousesPage() {
  const me = useSelector((s: RootState) => s.auth.me)
  const isAdmin = me?.role === 'Admin' || (me as any)?.cems_role === 'Admin'

  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseInventory, setWarehouseInventory] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Expanded warehouse
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)

  // Modals
  const [showAddWarehouseModal, setShowAddWarehouseModal] = useState(false)
  const [editProjectsWarehouseId, setEditProjectsWarehouseId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await cemsApi.getWarehouses()
      setWarehouses(res.data)
    } catch {
      setError('שגיאה בטעינת רשימת המחסנים')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function toggleWarehouse(warehouseId: string) {
    if (expandedId === warehouseId) {
      setExpandedId(null)
      return
    }
    setExpandedId(warehouseId)

    // Load inventory if not already cached
    if (!warehouseInventory[warehouseId]) {
      setDetailsLoading(true)
      try {
        const inventoryRes = await cemsApi.getWarehouseInventory(warehouseId)
        setWarehouseInventory((prev) => ({ ...prev, [warehouseId]: inventoryRes.data }))
      } catch {
        // silent
      } finally {
        setDetailsLoading(false)
      }
    }
  }

  function handleProjectsUpdated(warehouseId: string) {
    setEditProjectsWarehouseId(null)
    loadData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 dark:text-gray-400 text-lg">טוען...</p>
      </div>
    )
  }

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">מחסנים</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">ניהול מחסנים, פרויקטים ומלאי</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowAddWarehouseModal(true)} className={BTN_PRIMARY}>
            <span className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              הוסף מחסן
            </span>
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <p className="text-red-800 dark:text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Warehouses Grid */}
      {warehouses.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <WarehouseIcon className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400 text-lg">לא נמצאו מחסנים</p>
          {isAdmin && (
            <button
              onClick={() => setShowAddWarehouseModal(true)}
              className={`${BTN_PRIMARY} mt-4`}
            >
              הוסף מחסן ראשון
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {warehouses.map((warehouse) => {
            const isExpanded = expandedId === warehouse.id
            const inventory = warehouseInventory[warehouse.id]
            const isManagerOrAdmin = isAdmin || warehouse.current_manager_id === me?.id

            return (
              <div
                key={warehouse.id}
                className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border transition-all ${
                  isExpanded
                    ? 'border-blue-300 dark:border-blue-700 md:col-span-2 lg:col-span-3'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                {/* Warehouse Card Header */}
                <div
                  className="p-6 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 rounded-t-xl transition-colors"
                  onClick={() => toggleWarehouse(warehouse.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                        <WarehouseIcon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {warehouse.name}
                        </h3>
                        {warehouse.location && (
                          <div className="flex items-center gap-1 mt-1 text-sm text-gray-500 dark:text-gray-400">
                            <MapPin className="w-3.5 h-3.5" />
                            {warehouse.location}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Summary Stats */}
                  <div className="flex items-center gap-4 mt-4 text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      <span>מנהל: {warehouse.current_manager_id || 'לא הוגדר'}</span>
                    </div>
                    {warehouse.project_names.length > 0 && (
                      <div className="flex items-center gap-1">
                        <FolderKanban className="w-4 h-4" />
                        <span>{warehouse.project_names.length} פרויקטים</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-gray-200 dark:border-gray-700 p-6 space-y-4">
                    {detailsLoading ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">טוען פרטים...</p>
                    ) : (
                      <>
                        {/* Inventory Summary */}
                        {inventory && (
                          <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-4">
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                              <Package className="w-4 h-4" />
                              סיכום מלאי
                            </h4>
                            {typeof inventory === 'object' && !Array.isArray(inventory) ? (
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {Object.entries(inventory).map(([key, value]) => (
                                  <div key={key} className="text-center">
                                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                                      {String(value)}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{key}</p>
                                  </div>
                                ))}
                              </div>
                            ) : Array.isArray(inventory) ? (
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {inventory.length} פריטים במחסן
                              </p>
                            ) : (
                              <p className="text-sm text-gray-500 dark:text-gray-400">אין נתוני מלאי</p>
                            )}
                          </div>
                        )}

                        {/* Projects List */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                              <FolderKanban className="w-4 h-4" />
                              פרויקטים משויכים ({warehouse.project_names.length})
                            </h4>
                            {isManagerOrAdmin && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditProjectsWarehouseId(warehouse.id)
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/40 transition-colors"
                              >
                                <Pencil className="w-3 h-3" />
                                ערוך פרויקטים
                              </button>
                            )}
                          </div>
                          {warehouse.project_names.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">אין פרויקטים משויכים</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {warehouse.project_names.map((pName, idx) => (
                                <span
                                  key={warehouse.project_ids[idx]}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                                >
                                  <FolderKanban className="w-3 h-3" />
                                  {pName}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {showAddWarehouseModal && (
        <AddWarehouseModal
          onClose={() => setShowAddWarehouseModal(false)}
          onCreated={loadData}
        />
      )}
      {editProjectsWarehouseId && (
        <EditProjectsModal
          warehouseId={editProjectsWarehouseId}
          currentProjectIds={
            warehouses.find((w) => w.id === editProjectsWarehouseId)?.project_ids ?? []
          }
          onClose={() => setEditProjectsWarehouseId(null)}
          onUpdated={() => handleProjectsUpdated(editProjectsWarehouseId)}
        />
      )}
    </div>
  )
}

// ─── Add Warehouse Modal ─────────────────────────────────────────────────────

interface AddWarehouseModalProps {
  onClose: () => void
  onCreated: () => void
}

function AddWarehouseModal({ onClose, onCreated }: AddWarehouseModalProps) {
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('שם המחסן הוא שדה חובה')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await cemsApi.createWarehouse({
        name: name.trim(),
        location: location.trim() || undefined,
      })
      onCreated()
      onClose()
    } catch {
      setError('שגיאה ביצירת מחסן')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_PANEL} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">הוספת מחסן חדש</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4" dir="rtl">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-800 dark:text-red-300">
              {error}
            </div>
          )}
          <div>
            <label className={LABEL_CLASS}>שם המחסן *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} required />
          </div>
          <div>
            <label className={LABEL_CLASS}>מיקום</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className={INPUT_CLASS} placeholder="כתובת או תיאור מיקום" />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>ביטול</button>
            <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
              {submitting ? 'שומר...' : 'הוסף מחסן'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Edit Projects Modal ─────────────────────────────────────────────────────

interface EditProjectsModalProps {
  warehouseId: string
  currentProjectIds: string[]
  onClose: () => void
  onUpdated: () => void
}

function EditProjectsModal({ warehouseId, currentProjectIds, onClose, onUpdated }: EditProjectsModalProps) {
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>(currentProjectIds)
  const [projects, setProjects] = useState<CemsProject[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    cemsApi.getProjects()
      .then((res) => setProjects(res.data))
      .catch(() => { /* silent */ })
      .finally(() => setProjectsLoading(false))
  }, [])

  function toggleProject(pid: string) {
    setSelectedProjectIds((prev) =>
      prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    setSubmitting(true)
    setError(null)
    try {
      await cemsApi.updateWarehouseProjects(warehouseId, selectedProjectIds)
      onUpdated()
      onClose()
    } catch {
      setError('שגיאה בעדכון פרויקטים')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_PANEL} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">עריכת פרויקטים משויכים</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4" dir="rtl">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-800 dark:text-red-300">
              {error}
            </div>
          )}
          <div>
            <label className={LABEL_CLASS}>פרויקטים משויכים</label>
            {projectsLoading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">טוען פרויקטים...</p>
            ) : (
              <div className="max-h-60 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 p-2 space-y-1">
                {projects.filter((p) => p.is_active).length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 p-1">אין פרויקטים זמינים</p>
                ) : (
                  projects.filter((p) => p.is_active).map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedProjectIds.includes(p.id)}
                        onChange={() => toggleProject(p.id)}
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-500 text-blue-600 focus:ring-blue-500 dark:bg-gray-600"
                      />
                      <span className="text-sm text-gray-900 dark:text-white">{p.name}</span>
                    </label>
                  ))
                )}
              </div>
            )}
            {selectedProjectIds.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {selectedProjectIds.length} פרויקטים נבחרו
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>ביטול</button>
            <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
              {submitting ? 'שומר...' : 'עדכן פרויקטים'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
