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
  UserCog,
  ClipboardList,
  Box,
  TrendingDown,
  ArrowLeftRight,
  CheckCircle,
} from 'lucide-react'
import {
  cemsApi,
  type Warehouse,
  type CemsProject,
  type CemsUser,
  type FixedAsset,
  type ConsumableItem,
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

  const [users, setUsers] = useState<CemsUser[]>([])
  const [changeManagerWarehouseId, setChangeManagerWarehouseId] = useState<string | null>(null)

  // Modals
  const [showAddWarehouseModal, setShowAddWarehouseModal] = useState(false)
  const [editProjectsWarehouseId, setEditProjectsWarehouseId] = useState<string | null>(null)
  const [inventoryModalWarehouse, setInventoryModalWarehouse] = useState<Warehouse | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [warehousesRes] = await Promise.all([
        cemsApi.getWarehouses(),
        cemsApi.getUsers().then((res) => setUsers(res.data)).catch(() => {}),
      ])
      setWarehouses(warehousesRes.data)
    } catch {
      setError('שגיאה בטעינת רשימת המחסנים')
    } finally {
      setLoading(false)
    }
  }, [])

  function getUserName(id: number | null): string {
    if (!id) return 'לא הוגדר'
    const user = users.find((u) => u.id === id)
    return user ? user.full_name : `#${id}`
  }

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
                      <span>מנהל: {getUserName(warehouse.current_manager_id)}</span>
                    </div>
                    {warehouse.project_names.length > 0 && (
                      <div className="flex items-center gap-1">
                        <FolderKanban className="w-4 h-4" />
                        <span>{warehouse.project_names.length} פרויקטים</span>
                      </div>
                    )}
                  </div>

                  {/* Inventory Button */}
                  <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setInventoryModalWarehouse(warehouse)
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-800/40 transition-colors border border-indigo-200 dark:border-indigo-700"
                    >
                      <ClipboardList className="w-4 h-4" />
                      סיכום מלאי ופריטים
                    </button>
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
                        {isAdmin && (
                          <div className="flex justify-end">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setChangeManagerWarehouseId(warehouse.id)
                              }}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/40 transition-colors"
                            >
                              <UserCog className="w-3 h-3" />
                              שנה מנהל
                            </button>
                          </div>
                        )}
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
      {changeManagerWarehouseId && (
        <ChangeManagerModal
          warehouseId={changeManagerWarehouseId}
          currentManagerId={warehouses.find((w) => w.id === changeManagerWarehouseId)?.current_manager_id ?? null}
          users={users}
          onClose={() => setChangeManagerWarehouseId(null)}
          onChanged={loadData}
        />
      )}
      {inventoryModalWarehouse && (
        <InventoryModal
          warehouse={inventoryModalWarehouse}
          allWarehouses={warehouses}
          onClose={() => setInventoryModalWarehouse(null)}
        />
      )}
    </div>
  )
}

// ─── Inventory Modal ──────────────────────────────────────────────────────────

interface InventoryModalProps {
  warehouse: Warehouse
  allWarehouses: Warehouse[]
  onClose: () => void
}

function InventoryModal({ warehouse, allWarehouses, onClose }: InventoryModalProps) {
  const [assets, setAssets] = useState<FixedAsset[]>([])
  const [consumables, setConsumables] = useState<ConsumableItem[]>([])
  const [loading, setLoading] = useState(true)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // ── Consumable transfer state ──────────────────────────────────────────────
  const [cTransferMode, setCTransferMode] = useState(false)
  const [transferQty, setTransferQty] = useState<Record<string, string>>({})
  const [cTargetWarehouseId, setCTargetWarehouseId] = useState('')
  const [cTransferring, setCTransferring] = useState(false)
  const [cTransferError, setCTransferError] = useState<string | null>(null)

  // ── Asset transfer state ───────────────────────────────────────────────────
  const [aTransferMode, setATransferMode] = useState(false)
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set())
  const [aTargetWarehouseId, setATargetWarehouseId] = useState('')
  const [aTransferring, setATransferring] = useState(false)
  const [aTransferError, setATransferError] = useState<string | null>(null)

  const otherWarehouses = allWarehouses.filter((w) => w.id !== warehouse.id)

  async function fetchInventory() {
    setLoading(true)
    try {
      const [assetsRes, consumablesRes] = await Promise.all([
        cemsApi.getWarehouseInventory(warehouse.id),
        cemsApi.getConsumables({ warehouse_id: warehouse.id }),
      ])
      setAssets(assetsRes.data)
      setConsumables(consumablesRes.data)
    } catch {
      // silent — errors shown via empty state
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInventory()
  }, [warehouse.id])

  const lowStockCount = consumables.filter(
    (c) => Number(c.quantity) <= Number(c.low_stock_threshold)
  ).length

  // ── Consumable transfer helpers ────────────────────────────────────────────

  function enterCTransferMode() {
    const initial: Record<string, string> = {}
    consumables.forEach((c) => { initial[c.id] = '' })
    setTransferQty(initial)
    setCTargetWarehouseId('')
    setCTransferError(null)
    setSuccessMessage(null)
    setCTransferMode(true)
  }

  function exitCTransferMode() {
    setCTransferMode(false)
    setCTransferError(null)
  }

  async function handleCTransfer() {
    if (!cTargetWarehouseId) {
      setCTransferError('יש לבחור מחסן יעד')
      return
    }
    const transfers = consumables.filter((c) => {
      const qty = parseFloat(transferQty[c.id] ?? '')
      return !isNaN(qty) && qty > 0
    })
    if (transfers.length === 0) {
      setCTransferError('יש להזין כמות לפחות לפריט אחד')
      return
    }
    for (const item of transfers) {
      const qty = parseFloat(transferQty[item.id])
      if (qty > Number(item.quantity)) {
        setCTransferError(`הכמות של "${item.name}" חורגת מהמלאי הזמין (${item.quantity} ${item.unit})`)
        return
      }
    }
    setCTransferring(true)
    setCTransferError(null)
    try {
      await Promise.all(
        transfers.map((item) =>
          cemsApi.transferConsumable(item.id, {
            to_warehouse_id: cTargetWarehouseId,
            quantity: parseFloat(transferQty[item.id]).toString(),
          })
        )
      )
      setCTransferMode(false)
      setSuccessMessage('העברת המתכלים בוצעה בהצלחה!')
      await fetchInventory()
    } catch {
      setCTransferError('שגיאה בביצוע ההעברה. ודא שיש לך הרשאת מנהל מחסן.')
    } finally {
      setCTransferring(false)
    }
  }

  // ── Asset transfer helpers ─────────────────────────────────────────────────

  function enterATransferMode() {
    setSelectedAssetIds(new Set())
    setATargetWarehouseId('')
    setATransferError(null)
    setSuccessMessage(null)
    setATransferMode(true)
  }

  function exitATransferMode() {
    setATransferMode(false)
    setATransferError(null)
  }

  function toggleAsset(id: string) {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllAssets() {
    const transferable = assets.filter((a) => a.status !== 'RETIRED')
    if (selectedAssetIds.size === transferable.length) {
      setSelectedAssetIds(new Set())
    } else {
      setSelectedAssetIds(new Set(transferable.map((a) => a.id)))
    }
  }

  async function handleATransfer() {
    if (!aTargetWarehouseId) {
      setATransferError('יש לבחור מחסן יעד')
      return
    }
    if (selectedAssetIds.size === 0) {
      setATransferError('יש לבחור לפחות נכס אחד להעברה')
      return
    }
    setATransferring(true)
    setATransferError(null)
    try {
      await Promise.all(
        [...selectedAssetIds].map((assetId) =>
          cemsApi.moveAsset(assetId, aTargetWarehouseId)
        )
      )
      setATransferMode(false)
      setSuccessMessage(`${selectedAssetIds.size} נכס/ים הועברו בהצלחה!`)
      await fetchInventory()
    } catch {
      setATransferError('שגיאה בהעברת הנכסים. ודא שיש לך הרשאת מנהל מחסן.')
    } finally {
      setATransferring(false)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function assetStatusLabel(statusVal: string): string {
    const map: Record<string, string> = {
      ACTIVE: 'פעיל',
      IN_TRANSFER: 'בהעברה',
      IN_WAREHOUSE: 'במחסן',
      RETIRED: 'יצא מכלל שימוש',
    }
    return map[statusVal] ?? statusVal
  }

  function assetStatusClass(statusVal: string): string {
    if (statusVal === 'ACTIVE') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
    if (statusVal === 'IN_TRANSFER') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
    return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
  }

  const transferableAssets = assets.filter((a) => a.status !== 'RETIRED')

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
              <ClipboardList className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                סיכום מלאי — {warehouse.name}
              </h3>
              {warehouse.location && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {warehouse.location}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-gray-500 dark:text-gray-400 text-sm">טוען מלאי...</p>
          </div>
        ) : (
          <div className="overflow-y-auto p-6 space-y-6" dir="rtl">

            {/* ── Success banner ── */}
            {successMessage && (
              <div className="flex items-center gap-2 px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg text-sm text-green-800 dark:text-green-300">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                {successMessage}
              </div>
            )}

            {/* ── Stats Row ── */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{assets.length}</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center justify-center gap-1">
                  <Box className="w-3 h-3" /> נכסים קבועים
                </p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">{consumables.length}</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center justify-center gap-1">
                  <Package className="w-3 h-3" /> פריטי מתכלה
                </p>
              </div>
              <div className={`border rounded-xl p-4 text-center ${
                lowStockCount > 0
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800'
                  : 'bg-gray-50 dark:bg-gray-750 border-gray-100 dark:border-gray-700'
              }`}>
                <p className={`text-2xl font-bold ${lowStockCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
                  {lowStockCount}
                </p>
                <p className={`text-xs mt-1 flex items-center justify-center gap-1 ${lowStockCount > 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                  <TrendingDown className="w-3 h-3" /> מלאי נמוך
                </p>
              </div>
            </div>

            {/* ── Fixed Assets ── */}
            <div>
              {/* Section header */}
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Box className="w-4 h-4 text-blue-500" />
                  נכסים קבועים ({assets.length})
                </h4>
                {transferableAssets.length > 0 && otherWarehouses.length > 0 && !aTransferMode && (
                  <button
                    onClick={enterATransferMode}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800/40 border border-blue-200 dark:border-blue-700 transition-colors"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    העבר נכסים
                  </button>
                )}
                {aTransferMode && (
                  <button
                    onClick={exitATransferMode}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  >
                    ביטול
                  </button>
                )}
              </div>

              {assets.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 px-1">אין נכסים קבועים במחסן</p>
              ) : aTransferMode ? (
                /* ── Asset Transfer Mode ── */
                <div className="space-y-3">
                  {aTransferError && (
                    <div className="flex items-start gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-xs text-red-800 dark:text-red-300">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      {aTransferError}
                    </div>
                  )}

                  {/* Select all row */}
                  {transferableAssets.length > 1 && (
                    <label className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg cursor-pointer text-xs text-blue-700 dark:text-blue-300 font-medium select-none">
                      <input
                        type="checkbox"
                        checked={selectedAssetIds.size === transferableAssets.length}
                        onChange={toggleAllAssets}
                        className="h-3.5 w-3.5 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                      />
                      בחר הכל ({transferableAssets.length} נכסים)
                    </label>
                  )}

                  {/* Asset checkboxes */}
                  <div className="space-y-1.5">
                    {assets.map((asset) => {
                      const isRetired = asset.status === 'RETIRED'
                      const isChecked = selectedAssetIds.has(asset.id)
                      return (
                        <label
                          key={asset.id}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                            isRetired
                              ? 'opacity-40 cursor-not-allowed bg-gray-50 dark:bg-gray-750'
                              : 'cursor-pointer bg-gray-50 dark:bg-gray-750 hover:bg-gray-100 dark:hover:bg-gray-700'
                          } ${isChecked ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isRetired}
                            onChange={() => toggleAsset(asset.id)}
                            className="h-4 w-4 rounded border-gray-300 dark:border-gray-500 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">{asset.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              מס׳ סידורי: {asset.serial_number}
                            </p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${assetStatusClass(asset.status)}`}>
                            {assetStatusLabel(asset.status)}
                          </span>
                        </label>
                      )
                    })}
                  </div>

                  {/* Target warehouse */}
                  <div className="pt-2 space-y-2">
                    <label className={LABEL_CLASS}>מחסן יעד *</label>
                    <select
                      value={aTargetWarehouseId}
                      onChange={(e) => setATargetWarehouseId(e.target.value)}
                      className={INPUT_CLASS}
                    >
                      <option value="">בחר מחסן יעד...</option>
                      {otherWarehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}{w.location ? ` — ${w.location}` : ''}
                        </option>
                      ))}
                    </select>
                    {selectedAssetIds.size > 0 && (
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        {selectedAssetIds.size} נכס/ים נבחרו להעברה
                      </p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleATransfer}
                      disabled={aTransferring}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white transition-colors"
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                      {aTransferring ? 'מעביר...' : 'בצע העברה'}
                    </button>
                    <button
                      onClick={exitATransferMode}
                      disabled={aTransferring}
                      className={BTN_SECONDARY}
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Normal asset view ── */
                <div className="space-y-1.5">
                  {assets.map((asset) => (
                    <div
                      key={asset.id}
                      className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-750 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm transition-colors"
                    >
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{asset.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          מס׳ סידורי: {asset.serial_number}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${assetStatusClass(asset.status)}`}>
                        {assetStatusLabel(asset.status)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Consumables ── */}
            <div>
              {/* Section header with transfer toggle */}
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Package className="w-4 h-4 text-green-500" />
                  פריטי מתכלה ({consumables.length})
                </h4>
                {consumables.length > 0 && otherWarehouses.length > 0 && !cTransferMode && (
                  <button
                    onClick={enterCTransferMode}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-800/40 border border-amber-200 dark:border-amber-700 transition-colors"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    העבר מלאי
                  </button>
                )}
                {cTransferMode && (
                  <button
                    onClick={exitCTransferMode}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  >
                    ביטול
                  </button>
                )}
              </div>

              {consumables.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 px-1">אין פריטי מתכלה במחסן</p>
              ) : cTransferMode ? (
                /* ── Consumable Transfer Mode ── */
                <div className="space-y-3">
                  {/* Error */}
                  {cTransferError && (
                    <div className="flex items-start gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-xs text-red-800 dark:text-red-300">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      {cTransferError}
                    </div>
                  )}

                  {/* Items with quantity inputs */}
                  <div className="space-y-1.5">
                    {consumables.map((item) => {
                      const qty = Number(item.quantity)
                      const threshold = Number(item.low_stock_threshold)
                      const isLow = qty <= threshold
                      const inputVal = transferQty[item.id] ?? ''

                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 dark:bg-gray-750 rounded-lg text-sm"
                        >
                          {/* Name & stock */}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">{item.name}</p>
                            <p className={`text-xs mt-0.5 ${isLow ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                              זמין: {item.quantity} {item.unit}
                            </p>
                          </div>

                          {/* Quantity input */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <input
                              type="number"
                              min="0"
                              max={item.quantity}
                              step="any"
                              value={inputVal}
                              placeholder="0"
                              onChange={(e) =>
                                setTransferQty((prev) => ({ ...prev, [item.id]: e.target.value }))
                              }
                              className="w-24 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm text-center focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                            />
                            <span className="text-xs text-gray-500 dark:text-gray-400 w-8">{item.unit}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Target warehouse selector */}
                  <div className="pt-2 space-y-2">
                    <label className={LABEL_CLASS}>מחסן יעד *</label>
                    <select
                      value={cTargetWarehouseId}
                      onChange={(e) => setCTargetWarehouseId(e.target.value)}
                      className={INPUT_CLASS}
                    >
                      <option value="">בחר מחסן יעד...</option>
                      {otherWarehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}{w.location ? ` — ${w.location}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleCTransfer}
                      disabled={cTransferring}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white transition-colors"
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                      {cTransferring ? 'מעביר...' : 'בצע העברה'}
                    </button>
                    <button
                      onClick={exitCTransferMode}
                      disabled={cTransferring}
                      className={BTN_SECONDARY}
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Normal view ── */
                <div className="space-y-1.5">
                  {consumables.map((item) => {
                    const qty = Number(item.quantity)
                    const threshold = Number(item.low_stock_threshold)
                    const isLow = qty <= threshold
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-750 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm transition-colors"
                      >
                        <p className="font-medium text-gray-900 dark:text-white">{item.name}</p>
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold tabular-nums ${isLow ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                            {item.quantity} {item.unit}
                          </span>
                          {isLow && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                              מלאי נמוך
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
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

// ─── Change Manager Modal ─────────────────────────────────────────────────────

interface ChangeManagerModalProps {
  warehouseId: string
  currentManagerId: number | null
  users: CemsUser[]
  onClose: () => void
  onChanged: () => void
}

function ChangeManagerModal({ warehouseId, currentManagerId, users, onClose, onChanged }: ChangeManagerModalProps) {
  const [selectedUserId, setSelectedUserId] = useState<number | ''>(currentManagerId ?? '')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUserId) {
      setError('יש לבחור מנהל')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await cemsApi.changeWarehouseManager(warehouseId, selectedUserId as number, reason.trim() || undefined)
      onChanged()
      onClose()
    } catch {
      setError('שגיאה בשינוי מנהל המחסן')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_PANEL} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">שינוי מנהל מחסן</h3>
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
            <label className={LABEL_CLASS}>מנהל חדש *</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : '')}
              className={INPUT_CLASS}
              required
            >
              <option value="">בחר מנהל...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.email})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>סיבה לשינוי (אופציונלי)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={INPUT_CLASS}
              placeholder="לדוגמה: סיום תפקיד, העברה..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>ביטול</button>
            <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
              {submitting ? 'שומר...' : 'עדכן מנהל'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
