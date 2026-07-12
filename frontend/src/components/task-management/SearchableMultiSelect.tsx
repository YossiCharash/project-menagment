import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, X, Check, Plus } from 'lucide-react'
import { cn } from '../../lib/utils'

/** A single selectable entry. `color` renders a colored dot / chip background. */
export interface ComboOption {
  id: number
  label: string
  color?: string
}

export interface SearchableMultiSelectProps {
  /** Field label shown above the control. */
  label: string
  /** Marks the field as required (red asterisk). */
  required?: boolean
  /** All selectable options. */
  options: ComboOption[]
  /** Currently selected ids, ordered (first is treated as primary by callers). */
  selectedIds: number[]
  /** Emit the next ordered set of selected ids. */
  onChange: (ids: number[]) => void
  /** Placeholder for the search input when nothing is selected. */
  placeholder?: string
  /** Message shown when there are no options at all. */
  emptyText?: string
  /**
   * When provided, an unmatched search term offers a "create" row; picking it
   * calls this with the typed name. The parent creates + selects the option.
   */
  onCreateOption?: (name: string) => Promise<void> | void
  /** Builds the create-row text from the typed name (e.g. `צור לייבל "X"`). */
  createLabel?: (name: string) => string
  /** Controlled color for the create row's swatch (labels). */
  createColor?: string
  /** Emitted when the create-row color swatch changes. */
  onCreateColorChange?: (color: string) => void
  /** True while a create request is in flight (disables the create row). */
  creating?: boolean
  /** Optional per-selected-chip badge, e.g. "ראשי" for the primary assignee. */
  badgeForSelected?: (id: number, index: number) => string | undefined
  /** When provided, each option row shows a delete button (e.g. remove a label). */
  onDeleteOption?: (id: number) => void
  /** Id currently being deleted (its delete button is disabled). */
  deletingId?: number | null
}

/**
 * Generic searchable, type-to-filter multi-select combobox (Single
 * Responsibility: selection UI only — it never fetches or persists). The
 * dropdown renders IN FLOW (pushing content down) rather than as an absolute
 * overlay, so it never gets clipped by the task modal's scrollable body.
 *
 * Selected entries appear as removable chips inside the control; the panel
 * lists every matching option with a check mark for the selected ones. When
 * `onCreateOption` is supplied and the typed text matches no existing option,
 * a "create new" row lets the user add it on the spot.
 */
export default function SearchableMultiSelect({
  label,
  required,
  options,
  selectedIds,
  onChange,
  placeholder,
  emptyText = 'אין פריטים זמינים',
  onCreateOption,
  createLabel,
  createColor,
  onCreateColorChange,
  creating,
  badgeForSelected,
  onDeleteOption,
  deletingId,
}: SearchableMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const optionById = useMemo(() => {
    const map = new Map<number, ComboOption>()
    for (const option of options) map.set(option.id, option)
    return map
  }, [options])

  const trimmedQuery = query.trim()
  const filtered = useMemo(() => {
    const needle = trimmedQuery.toLowerCase()
    if (!needle) return options
    return options.filter((option) => option.label.toLowerCase().includes(needle))
  }, [options, trimmedQuery])

  const hasExactMatch = useMemo(
    () => options.some((option) => option.label.trim().toLowerCase() === trimmedQuery.toLowerCase()),
    [options, trimmedQuery]
  )
  const canCreate = !!onCreateOption && trimmedQuery.length > 0 && !hasExactMatch

  // Close when clicking anywhere outside the control.
  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  const toggle = (id: number) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((selected) => selected !== id))
    else onChange([...selectedIds, id])
  }

  const remove = (id: number) => onChange(selectedIds.filter((selected) => selected !== id))

  const handleCreate = async () => {
    if (!canCreate || creating) return
    await onCreateOption!(trimmedQuery)
    setQuery('')
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (canCreate) {
        void handleCreate()
      } else if (filtered.length === 1) {
        toggle(filtered[0].id)
        setQuery('')
      }
    }
  }

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
      )}

      <div ref={containerRef} className="relative">
        <div
          className={cn(
            'flex flex-wrap items-center gap-1 min-h-[38px] w-full px-2 py-1 border rounded-lg text-sm cursor-text',
            'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
          )}
          onClick={() => {
            setOpen(true)
            inputRef.current?.focus()
          }}
        >
          {selectedIds.map((id, index) => {
            const option = optionById.get(id)
            if (!option) return null
            const badge = badgeForSelected?.(id, index)
            return (
              <span
                key={id}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-white',
                  !option.color && 'bg-blue-600'
                )}
                style={option.color ? { backgroundColor: option.color } : undefined}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white/80 flex-shrink-0" />
                {option.label}
                {badge && <span className="px-1 rounded bg-white/25 text-[10px] leading-4">{badge}</span>}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    remove(id)
                  }}
                  className="p-0.5 rounded-full hover:bg-white/25"
                  aria-label={`הסר ${option.label}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )
          })}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={selectedIds.length === 0 ? (placeholder ?? 'חפש...') : ''}
            className="flex-1 min-w-[6rem] bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
          />
          <ChevronDown
            className={cn('w-4 h-4 flex-shrink-0 text-gray-400 transition-transform', open && 'rotate-180')}
            onClick={(event) => {
              event.stopPropagation()
              setOpen((prev) => !prev)
              inputRef.current?.focus()
            }}
          />
        </div>

        {open && (
          <div
            className={cn(
              'mt-1 w-full max-h-56 overflow-y-auto rounded-lg border shadow-sm',
              'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
            )}
          >
            {options.length === 0 && !canCreate ? (
              <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{emptyText}</p>
            ) : (
              <>
                {filtered.map((option) => {
                  const isSelected = selectedIds.includes(option.id)
                  return (
                    <div
                      key={option.id}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-1.5',
                        'hover:bg-gray-100 dark:hover:bg-gray-600',
                        isSelected && 'bg-gray-50 dark:bg-gray-600/50'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(option.id)}
                        className="flex flex-1 items-center gap-2 text-sm text-right"
                      >
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: option.color ?? '#9CA3AF' }}
                        />
                        <span className="flex-1 text-gray-900 dark:text-gray-100">{option.label}</span>
                        {isSelected && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
                      </button>
                      {onDeleteOption && (
                        <button
                          type="button"
                          onClick={() => onDeleteOption(option.id)}
                          disabled={deletingId === option.id}
                          title="מחק לייבל"
                          aria-label={`מחק ${option.label}`}
                          className="p-0.5 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 flex-shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}

                {filtered.length === 0 && !canCreate && (
                  <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">אין תוצאות</p>
                )}

                {canCreate && (
                  <div className="flex items-center gap-2 px-3 py-1.5 border-t border-gray-200 dark:border-gray-600">
                    {createColor !== undefined && (
                      <input
                        type="color"
                        value={createColor}
                        onChange={(event) => onCreateColorChange?.(event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        className="w-5 h-5 rounded border border-gray-300 dark:border-gray-600 cursor-pointer bg-transparent flex-shrink-0"
                        aria-label="צבע פריט חדש"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => void handleCreate()}
                      disabled={creating}
                      className="flex flex-1 items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 text-right"
                    >
                      <Plus className="w-4 h-4 flex-shrink-0" />
                      {creating ? 'יוצר...' : (createLabel?.(trimmedQuery) ?? `צור "${trimmedQuery}"`)}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
