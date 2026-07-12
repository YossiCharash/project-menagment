import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { ComboOption } from './SearchableMultiSelect'

export interface SearchableSelectProps {
  /** All selectable options. */
  options: ComboOption[]
  /** Currently selected id, or null when nothing is chosen. */
  value: number | null
  /** Emit the next selected id (null when cleared). */
  onChange: (id: number | null) => void
  /** Text shown when nothing is selected. */
  placeholder: string
  /** Disables the control (e.g. a dependent cascade step not yet unlocked). */
  disabled?: boolean
  /** Accessible name for the control. */
  ariaLabel?: string
  /** When set, a clearable "none" row is offered with this label (e.g. "ללא דירה"). */
  clearLabel?: string
  /** Replaces the placeholder while options are loading. */
  loading?: boolean
}

/**
 * Generic searchable, type-to-filter SINGLE-select combobox (Single
 * Responsibility: selection UI only). Mirrors {@link SearchableMultiSelect}'s
 * in-flow dropdown so it is never clipped by a scrollable modal body. Used for
 * the reception cascade פרויקט → בניין → דירה.
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  ariaLabel,
  clearLabel,
  loading,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedOption = value != null ? options.find((option) => option.id === value) ?? null : null

  const trimmedQuery = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!trimmedQuery) return options
    return options.filter((option) => option.label.toLowerCase().includes(trimmedQuery))
  }, [options, trimmedQuery])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  const select = (id: number | null) => {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  const displayText = loading
    ? 'טוען…'
    : selectedOption
      ? selectedOption.label
      : placeholder

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={() => {
          setOpen((prev) => !prev)
          window.setTimeout(() => inputRef.current?.focus(), 0)
        }}
        className={cn(
          'flex w-full items-center gap-1 px-2 py-1.5 border rounded-lg text-sm text-right',
          'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 disabled:opacity-50',
          selectedOption ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'
        )}
      >
        <span className="flex-1 truncate">{displayText}</span>
        <ChevronDown className={cn('w-4 h-4 flex-shrink-0 text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && !disabled && (
        <div
          className={cn(
            'mt-1 w-full max-h-56 overflow-y-auto rounded-lg border shadow-sm',
            'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
          )}
        >
          <div className="p-1 border-b border-gray-200 dark:border-gray-600">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="חפש..."
              dir="rtl"
              className={cn(
                'w-full px-2 py-1 text-sm rounded outline-none',
                'bg-gray-50 dark:bg-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-400'
              )}
            />
          </div>

          {clearLabel && (
            <button
              type="button"
              onClick={() => select(null)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-right text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
            >
              <span className="flex-1">{clearLabel}</span>
              {value == null && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
            </button>
          )}

          {filtered.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => select(option.id)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-sm text-right',
                'hover:bg-gray-100 dark:hover:bg-gray-600',
                option.id === value && 'bg-gray-50 dark:bg-gray-600/50'
              )}
            >
              <span className="flex-1 text-gray-900 dark:text-gray-100">{option.label}</span>
              {option.id === value && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
            </button>
          ))}

          {filtered.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">אין תוצאות</p>
          )}
        </div>
      )}
    </div>
  )
}
