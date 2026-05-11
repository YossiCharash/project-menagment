import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Package, X, Filter } from 'lucide-react'
import {
  cemsApi,
  type FixedAsset,
  type ConsumableItem,
  type AssetCategory,
  type Warehouse,
} from '../../lib/cemsApi'
import { fileAttachmentUrl } from '../../lib/api'
import { StatusBadge } from '../../pages/inventory/InventoryDashboard'

// ─── Public Types ────────────────────────────────────────────────────────────

/** Which underlying inventory domain(s) the modal browses. */
export type BrowserMode = 'all' | 'fixed' | 'consumable'

interface BrowserFilters {
  warehouseIds: string[]
  categoryId?: string
}

interface TotalAssetsBrowserModalProps {
  open: boolean
  mode?: BrowserMode
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

/** Fan-out helper: backend takes a single warehouse_id; we parallelize when multiple are picked. */
async function fanOutFetch<T extends { id: string }>(
  warehouseIds: string[],
  fetcher: (params: { warehouse_id?: string; category_id?: string }) => Promise<{ data: T[] }>,
  categoryId?: string,
): Promise<T[]> {
  const requests = warehouseIds.length === 0
    ? [fetcher({ category_id: categoryId })]
    : warehouseIds.map(id => fetcher({ warehouse_id: id, category_id: categoryId }))
  const results = await Promise.allSettled(requests)
  const merged = new Map<string, T>()
  for (const r of results) {
    if (r.status === 'fulfilled') for (const it of r.value.data) merged.set(it.id, it)
  }
  return Array.from(merged.values())
}

const fixedStrategy: BrowserStrategy = {
  title: 'ציוד קבוע',
  async fetch(filters, ctx) {
    const items = await fanOutFetch(filters.warehouseIds, cemsApi.getAssets, filters.categoryId)
    return items.map(a => adaptAsset(a, ctx.categoriesById, ctx.warehousesById))
  },
}

const consumableStrategy: BrowserStrategy = {
  title: 'מתכלים',
  async fetch(filters, ctx) {
    const items = await fanOutFetch(filters.warehouseIds, cemsApi.getConsumables, filters.categoryId)
    return items.map(c => adaptConsumable(c, ctx.categoriesById, ctx.warehousesById))
  },
}

const allStrategy: BrowserStrategy = {
  title: 'כל הציוד',
  async fetch(filters, ctx) {
    const [assets, consumables] = await Promise.all([
      fixedStrategy.fetch(filters, ctx),
      consumableStrategy.fetch(filters, ctx),
    ])
    return [...assets, ...consumables]
  },
}

const STRATEGIES: Record<BrowserMode, BrowserStrategy> = {
  all: allStrategy,
  fixed: fixedStrategy,
  consumable: consumableStrategy,
}

// ─── Sub-components (SRP) ────────────────────────────────────────────────────

interface WarehouseMultiSelectProps {
  warehouses: Warehouse[]
  selected: Set<string>
  onToggle: (id: string) => void
  onClear: () => void
}

function WarehouseMultiSelect({ warehouses, selected, onToggle, onClear }: WarehouseMultiSelectProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">מחסנים</label>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            נקה
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700">
        {warehouses.length === 0 ? (
          <span className="text-xs text-gray-400 dark:text-gray-500 px-1">אין מחסנים</span>
        ) : (
          warehouses.map(w => {
            const active = selected.has(w.id)
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => onToggle(w.id)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {w.name}
              </button>
            )
          })
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
          <Package className="w-10 h-10 text-gray-300 dark:text-gray-600" />
        </div>
        {item.badge && (
          <div className="absolute top-2 right-2">{item.badge}</div>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 min-h-[2.5rem]" title={item.name}>
          {item.name}
        </p>
        {item.secondary && (
          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate" title={item.secondary}>
            {item.secondary}
          </p>
        )}
        {item.tertiary && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={item.tertiary}>
            {item.tertiary}
          </p>
        )}
      </div>
    </button>
  )
}

// ─── Main Modal ──────────────────────────────────────────────────────────────

export default function TotalAssetsBrowserModal({
  open,
  mode = 'all',
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

  const strategy = STRATEGIES[mode]

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

  // Reset state when modal closes or mode changes
  useEffect(() => {
    if (!open) {
      setSelectedWarehouses(new Set())
      setParentCategoryId(null)
      setSubCategoryId(null)
      setItems([])
    }
  }, [open, mode])

  // Fetch items whenever filters change while open
  useEffect(() => {
    if (!open) return
    const effectiveCategoryId = subCategoryId ?? parentCategoryId ?? undefined
    const filters: BrowserFilters = {
      warehouseIds: Array.from(selectedWarehouses),
      categoryId: effectiveCategoryId,
    }

    let cancelled = false
    setLoading(true)
    strategy
      .fetch(filters, { categoriesById, warehousesById })
      .then(result => { if (!cancelled) setItems(result) })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [open, strategy, selectedWarehouses, parentCategoryId, subCategoryId, categoriesById, warehousesById])

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
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {strategy.title}
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
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
