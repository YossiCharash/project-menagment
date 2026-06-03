import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Package, X, Filter, ChevronDown, Check } from 'lucide-react'
import {
  cemsApi,
  type FixedAsset,
  type ConsumableItem,
  type AssetCategory,
  type AssetStatus,
  type Warehouse,
} from '../../lib/cemsApi'
import { fileAttachmentUrl } from '../../lib/api'
import { StatusBadge } from '../../pages/inventory/InventoryDashboard'

// ─── Public Types ────────────────────────────────────────────────────────────

/** Which underlying inventory domain(s) the modal browses. */
export type BrowserMode = 'all' | 'fixed' | 'consumable'

/**
 * Server-side or client-side predicates applied on top of the base mode.
 * - 'expiring_warranty' : fixed assets only — uses a dedicated backend endpoint.
 * - 'low_stock'         : consumables only — items at/below their threshold.
 * - 'active_reorder'    : consumables only — items with PENDING/ORDERED reorders.
 */
export type BrowserPredicate = 'expiring_warranty' | 'low_stock' | 'active_reorder'

/**
 * Declarative specification of what the modal should browse.
 * The mode chooses the data source (Strategy); the optional filters narrow it.
 */
export interface BrowserSpec {
  mode: BrowserMode
  /** Restrict fixed-asset results to a single status (e.g. ACTIVE, IN_TRANSFER). */
  statusFilter?: AssetStatus
  /** Apply a domain predicate on top of the base mode. */
  predicate?: BrowserPredicate
  /** Header title (Hebrew) shown in the modal — overrides the strategy default. */
  title?: string
}

interface BrowserFilters {
  warehouseIds: string[]
  categoryId?: string
  statusFilter?: AssetStatus
  predicate?: BrowserPredicate
}

interface TotalAssetsBrowserModalProps {
  open: boolean
  /** Declarative spec describing what to browse. Falls back to "all" when omitted. */
  spec?: BrowserSpec
  warehouses: Warehouse[]
  categories: AssetCategory[]
  onClose: () => void
  /** Invoked when a fixed-asset card is clicked. */
  onSelectAsset?: (asset: FixedAsset) => void
  /** Invoked when a consumable card is clicked. */
  onSelectConsumable?: (item: ConsumableItem) => void
}

// ─── Normalized View-Model (Adapter target) ──────────────────────────────────

interface BrowsableItem {
  id: string
  name: string
  /** Mono-spaced secondary line: serial for assets, unit/qty for consumables. */
  secondary: string | null
  /** Optional tertiary line — typically the warehouse name. */
  tertiary: string | null
  imageUrl: string | null
  badge: React.ReactNode | null
  kind: 'fixed' | 'consumable'
  source: FixedAsset | ConsumableItem
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveImage(rawUrl: string | null | undefined, fallback?: string | null): string | null {
  const raw = rawUrl ?? fallback ?? null
  if (!raw) return null
  return fileAttachmentUrl(raw.startsWith('http') ? raw : `/uploads/${raw}`) ?? null
}

function indexById<T extends { id: string }>(items: T[]): Map<string, T> {
  const map = new Map<string, T>()
  for (const it of items) map.set(it.id, it)
  return map
}

function fmtQty(val: string | number): string {
  const n = parseFloat(val as string)
  if (isNaN(n)) return String(val)
  return String(n % 1 === 0 ? Math.floor(n) : parseFloat(n.toFixed(2)))
}

// ─── Strategy Pattern: per-mode data sources ─────────────────────────────────

interface BrowserStrategy {
  /** Title shown in the modal header. */
  title: string
  /** Fetch items for the current filter and return normalized view-models. */
  fetch(
    filters: BrowserFilters,
    ctx: { categoriesById: Map<string, AssetCategory>; warehousesById: Map<string, Warehouse> },
  ): Promise<BrowsableItem[]>
}

function adaptAsset(
  asset: FixedAsset,
  categoriesById: Map<string, AssetCategory>,
  warehousesById: Map<string, Warehouse>,
): BrowsableItem {
  const categoryImage = categoriesById.get(asset.category_id)?.image_url
  return {
    id: `asset:${asset.id}`,
    name: asset.name,
    secondary: asset.serial_number,
    tertiary: asset.current_warehouse_id
      ? warehousesById.get(asset.current_warehouse_id)?.name ?? null
      : null,
    imageUrl: resolveImage(asset.photo_url, categoryImage),
    badge: <StatusBadge status={asset.status} />,
    kind: 'fixed',
    source: asset,
  }
}

function adaptConsumable(
  item: ConsumableItem,
  categoriesById: Map<string, AssetCategory>,
  warehousesById: Map<string, Warehouse>,
): BrowsableItem {
  const categoryImage = categoriesById.get(item.category_id)?.image_url
  const qty = fmtQty(item.quantity)
  return {
    id: `consumable:${item.id}`,
    name: item.name,
    secondary: `${qty} ${item.unit}`,
    tertiary: warehousesById.get(item.warehouse_id)?.name ?? null,
    imageUrl: resolveImage(item.image_url, categoryImage),
    badge: null,
    kind: 'consumable',
    source: item,
  }
}

/** Generic fetcher param shape that any of our list endpoints accepts. */
interface ListFetchParams {
  warehouse_id?: string
  category_id?: string
  status?: string
}

/** Fan-out helper: backend takes a single warehouse_id; we parallelize when multiple are picked. */
async function fanOutFetch<T extends { id: string }>(
  warehouseIds: string[],
  fetcher: (params: ListFetchParams) => Promise<{ data: T[] }>,
  extraParams: Omit<ListFetchParams, 'warehouse_id'> = {},
): Promise<T[]> {
  const requests = warehouseIds.length === 0
    ? [fetcher({ ...extraParams })]
    : warehouseIds.map(id => fetcher({ ...extraParams, warehouse_id: id }))
  const results = await Promise.allSettled(requests)
  const merged = new Map<string, T>()
  for (const r of results) {
    if (r.status === 'fulfilled') for (const it of r.value.data) merged.set(it.id, it)
  }
  return Array.from(merged.values())
}

/** Pure helper: apply client-side warehouse/category filters to a pre-fetched list. */
export function filterFixedAssets(
  assets: FixedAsset[],
  filters: BrowserFilters,
): FixedAsset[] {
  return assets.filter(asset => {
    if (filters.warehouseIds.length > 0) {
      if (!asset.current_warehouse_id) return false
      if (!filters.warehouseIds.includes(asset.current_warehouse_id)) return false
    }
    if (filters.categoryId && asset.category_id !== filters.categoryId) return false
    if (filters.statusFilter && asset.status !== filters.statusFilter) return false
    return true
  })
}

/** Pure helper: apply client-side warehouse/category filters to consumables. */
export function filterConsumables(
  items: ConsumableItem[],
  filters: BrowserFilters,
): ConsumableItem[] {
  return items.filter(item => {
    if (filters.warehouseIds.length > 0 && !filters.warehouseIds.includes(item.warehouse_id)) {
      return false
    }
    if (filters.categoryId && item.category_id !== filters.categoryId) return false
    return true
  })
}

/** Pure helper: identify consumables currently at/below their low-stock threshold. */
export function isLowStock(item: ConsumableItem): boolean {
  return parseFloat(item.quantity) <= parseFloat(item.low_stock_threshold)
}

// ─── Strategies for the base modes ───────────────────────────────────────────

const fixedStrategy: BrowserStrategy = {
  title: 'ציוד קבוע',
  async fetch(filters, ctx) {
    const items = await fanOutFetch(filters.warehouseIds, cemsApi.getAssets, {
      category_id: filters.categoryId,
      status: filters.statusFilter,
    })
    return items.map(a => adaptAsset(a, ctx.categoriesById, ctx.warehousesById))
  },
}

const consumableStrategy: BrowserStrategy = {
  title: 'מתכלים',
  async fetch(filters, ctx) {
    const items = await fanOutFetch(filters.warehouseIds, cemsApi.getConsumables, {
      category_id: filters.categoryId,
    })
    return items.map(c => adaptConsumable(c, ctx.categoriesById, ctx.warehousesById))
  },
}

const allStrategy: BrowserStrategy = {
  title: 'כל הציוד',
  async fetch(filters, ctx) {
    // For unions we deliberately skip status filtering on consumables (which lack a status field).
    // When a status filter is active in 'all' mode, consumables are dropped from the result set
    // because the filter conceptually only applies to fixed assets.
    const fetchAssets = fixedStrategy.fetch(filters, ctx)
    const fetchConsumables = filters.statusFilter
      ? Promise.resolve<BrowsableItem[]>([])
      : consumableStrategy.fetch(filters, ctx)
    const [assets, consumables] = await Promise.all([fetchAssets, fetchConsumables])
    return [...assets, ...consumables]
  },
}

const BASE_STRATEGIES: Record<BrowserMode, BrowserStrategy> = {
  all: allStrategy,
  fixed: fixedStrategy,
  consumable: consumableStrategy,
}

// ─── Predicate-decorated strategies ──────────────────────────────────────────
// Each predicate decorates a base strategy with a domain-specific data source.

const expiringWarrantyStrategy: BrowserStrategy = {
  title: 'אחריות פגה בקרוב',
  async fetch(filters, ctx) {
    const res = await cemsApi.getExpiringWarranties()
    const matching = filterFixedAssets(res.data, filters)
    return matching.map(a => adaptAsset(a, ctx.categoriesById, ctx.warehousesById))
  },
}

const lowStockStrategy: BrowserStrategy = {
  title: 'התראות מלאי',
  async fetch(filters, ctx) {
    const res = await cemsApi.getLowStock()
    const matching = filterConsumables(res.data, filters)
    return matching.map(c => adaptConsumable(c, ctx.categoriesById, ctx.warehousesById))
  },
}

const activeReorderStrategy: BrowserStrategy = {
  title: 'הזמנות מחדש פעילות',
  async fetch(filters, ctx) {
    // Fetch active reorders + the consumables list, then keep only consumables referenced
    // by a PENDING/ORDERED reorder. This honours the "show items, not requests" UX choice
    // while still surfacing exactly the set of items with open reorders.
    const [reordersRes, consumables] = await Promise.all([
      cemsApi.getReorderRequests(),
      fanOutFetch(filters.warehouseIds, cemsApi.getConsumables, {
        category_id: filters.categoryId,
      }),
    ])
    const activeItemIds = new Set(
      reordersRes.data
        .filter(r => r.status === 'PENDING' || r.status === 'ORDERED')
        .map(r => r.item_id),
    )
    return consumables
      .filter(c => activeItemIds.has(c.id))
      .map(c => adaptConsumable(c, ctx.categoriesById, ctx.warehousesById))
  },
}

const PREDICATE_STRATEGIES: Record<BrowserPredicate, BrowserStrategy> = {
  expiring_warranty: expiringWarrantyStrategy,
  low_stock: lowStockStrategy,
  active_reorder: activeReorderStrategy,
}

/**
 * Resolves a spec into the strategy that should fetch its data.
 * Predicate strategies take precedence over base mode strategies.
 */
function resolveStrategy(spec: BrowserSpec): BrowserStrategy {
  if (spec.predicate) return PREDICATE_STRATEGIES[spec.predicate]
  return BASE_STRATEGIES[spec.mode]
}

// ─── Sub-components (SRP) ────────────────────────────────────────────────────

interface WarehouseMultiSelectProps {
  warehouses: Warehouse[]
  selected: Set<string>
  onToggle: (id: string) => void
  onSelectAll: () => void
  onClear: () => void
}

/**
 * Multi-select dropdown for warehouses.
 * Encapsulates open/close lifecycle, outside-click + Escape handling, and
 * summary rendering. Pure presentational state — parent owns selection state.
 */
function WarehouseMultiSelect({
  warehouses,
  selected,
  onToggle,
  onSelectAll,
  onClear,
}: WarehouseMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointer = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const summary = useMemo(() => {
    if (selected.size === 0) return 'כל המחסנים'
    if (selected.size === 1) {
      const id = selected.values().next().value as string
      return warehouses.find(w => w.id === id)?.name ?? 'מחסן אחד נבחר'
    }
    return `${selected.size} מחסנים נבחרו`
  }, [selected, warehouses])

  const allSelected = warehouses.length > 0 && selected.size === warehouses.length

  return (
    <div className="flex flex-col gap-2" ref={containerRef}>
      <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">מחסנים</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 flex items-center justify-between gap-2"
        >
          <span className="truncate text-right flex-1">{summary}</span>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div
            role="listbox"
            aria-multiselectable
            className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg overflow-hidden"
          >
            {warehouses.length > 0 && (
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50">
                <button
                  type="button"
                  onClick={onSelectAll}
                  disabled={allSelected}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                >
                  בחר הכל
                </button>
                <button
                  type="button"
                  onClick={onClear}
                  disabled={selected.size === 0}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                >
                  נקה
                </button>
              </div>
            )}
            <ul className="max-h-64 overflow-y-auto py-1">
              {warehouses.length === 0 ? (
                <li className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">אין מחסנים</li>
              ) : (
                warehouses.map(w => {
                  const active = selected.has(w.id)
                  return (
                    <li key={w.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => onToggle(w.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-right hover:bg-gray-50 dark:hover:bg-gray-600/50 text-gray-800 dark:text-gray-100"
                      >
                        <span
                          className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center ${
                            active
                              ? 'bg-blue-600 border-blue-600'
                              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-500'
                          }`}
                        >
                          {active && <Check className="w-3 h-3 text-white" />}
                        </span>
                        <span className="flex-1 truncate">{w.name}</span>
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

interface CategorySelectProps {
  label: string
  value: string | null
  options: AssetCategory[]
  placeholder: string
  disabled?: boolean
  onChange: (id: string | null) => void
}

function CategorySelect({ label, value, options, placeholder, disabled, onChange }: CategorySelectProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">{label}</label>
      <select
        value={value ?? ''}
        disabled={disabled}
        onChange={e => onChange(e.target.value || null)}
        className="text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
      >
        <option value="">{placeholder}</option>
        {options.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  )
}

interface ItemCardProps {
  item: BrowsableItem
  onClick: () => void
}

function ItemCard({ item, onClick }: ItemCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col text-right bg-white dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all"
    >
      <div className="relative aspect-square w-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              target.nextElementSibling?.classList.remove('hidden')
            }}
          />
        ) : null}
        <div className={`${item.imageUrl ? 'hidden' : ''} absolute inset-0 flex items-center justify-center`}>
          <Package className="w-16 h-16 text-gray-300 dark:text-gray-600" />
        </div>
        {item.badge && (
          <div className="absolute top-2 right-2">{item.badge}</div>
        )}
      </div>
      <div className="p-4 flex flex-col gap-1.5">
        <p className="text-base font-semibold text-gray-900 dark:text-white line-clamp-2 min-h-[3rem]" title={item.name}>
          {item.name}
        </p>
        {item.secondary && (
          <p className="text-sm text-gray-500 dark:text-gray-400 font-mono truncate" title={item.secondary}>
            {item.secondary}
          </p>
        )}
        {item.tertiary && (
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate" title={item.tertiary}>
            {item.tertiary}
          </p>
        )}
      </div>
    </button>
  )
}

// ─── Main Modal ──────────────────────────────────────────────────────────────

const DEFAULT_SPEC: BrowserSpec = { mode: 'all' }

export default function TotalAssetsBrowserModal({
  open,
  spec = DEFAULT_SPEC,
  warehouses,
  categories,
  onClose,
  onSelectAsset,
  onSelectConsumable,
}: TotalAssetsBrowserModalProps) {
  const [selectedWarehouses, setSelectedWarehouses] = useState<Set<string>>(new Set())
  const [parentCategoryId, setParentCategoryId] = useState<string | null>(null)
  const [subCategoryId, setSubCategoryId] = useState<string | null>(null)
  const [items, setItems] = useState<BrowsableItem[]>([])
  const [loading, setLoading] = useState(false)

  const strategy = resolveStrategy(spec)
  const headerTitle = spec.title ?? strategy.title

  const categoriesById = useMemo(() => indexById(categories), [categories])
  const warehousesById = useMemo(() => indexById(warehouses), [warehouses])
  const parentCategories = useMemo(
    () => categories.filter(c => c.parent_id === null),
    [categories],
  )
  const subCategories = useMemo(
    () => (parentCategoryId ? categories.filter(c => c.parent_id === parentCategoryId) : []),
    [categories, parentCategoryId],
  )

  // Reset state when modal closes or spec changes (mode/predicate/status)
  useEffect(() => {
    if (!open) {
      setSelectedWarehouses(new Set())
      setParentCategoryId(null)
      setSubCategoryId(null)
      setItems([])
    }
  }, [open, spec.mode, spec.predicate, spec.statusFilter])

  // Fetch items whenever filters change while open
  useEffect(() => {
    if (!open) return
    const effectiveCategoryId = subCategoryId ?? parentCategoryId ?? undefined
    const filters: BrowserFilters = {
      warehouseIds: Array.from(selectedWarehouses),
      categoryId: effectiveCategoryId,
      statusFilter: spec.statusFilter,
      predicate: spec.predicate,
    }

    let cancelled = false
    setLoading(true)
    strategy
      .fetch(filters, { categoriesById, warehousesById })
      .then(result => { if (!cancelled) setItems(result) })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [open, strategy, selectedWarehouses, parentCategoryId, subCategoryId, categoriesById, warehousesById, spec.statusFilter, spec.predicate])

  if (!open) return null

  const toggleWarehouse = (id: string) => {
    setSelectedWarehouses(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleParentCategoryChange = (id: string | null) => {
    setParentCategoryId(id)
    setSubCategoryId(null)
  }

  const handleItemClick = (item: BrowsableItem) => {
    if (item.kind === 'fixed') onSelectAsset?.(item.source as FixedAsset)
    else onSelectConsumable?.(item.source as ConsumableItem)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-sm bg-black/40"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-[95vw] max-w-7xl h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {headerTitle}
              <span className="mr-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                ({items.length} פריטים)
              </span>
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters Bar */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">סינון</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <WarehouseMultiSelect
              warehouses={warehouses}
              selected={selectedWarehouses}
              onToggle={toggleWarehouse}
              onSelectAll={() => setSelectedWarehouses(new Set(warehouses.map(w => w.id)))}
              onClear={() => setSelectedWarehouses(new Set())}
            />
            <CategorySelect
              label="קטגוריה"
              value={parentCategoryId}
              options={parentCategories}
              placeholder="כל הקטגוריות"
              onChange={handleParentCategoryChange}
            />
            <CategorySelect
              label="תת-קטגוריה"
              value={subCategoryId}
              options={subCategories}
              placeholder={parentCategoryId ? 'כל התת-קטגוריות' : 'בחר קטגוריה תחילה'}
              disabled={!parentCategoryId || subCategories.length === 0}
              onChange={setSubCategoryId}
            />
          </div>
        </div>

        {/* Body — Product Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-12">טוען...</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Package className="w-12 h-12 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400">לא נמצאו פריטים התואמים את הסינון</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
              {items.map(item => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onClick={() => handleItemClick(item)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
