import React from 'react'
import { Minus, Plus } from 'lucide-react'
import { ACCENT } from './constants'

const FIELD_CLASS =
  'w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm font-semibold bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:border-[color:var(--br-accent)]'

interface LabeledFieldProps {
  label: string
  children: React.ReactNode
}

/** A form row: a bold label above its control. */
export function LabeledField({ label, children }: LabeledFieldProps) {
  return (
    <div>
      <div className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-1.5">{label}</div>
      {children}
    </div>
  )
}

interface TextFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}

/** Controlled single-line text input with the module's field styling. */
export function TextField({ value, onChange, placeholder, type = 'text' }: TextFieldProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={FIELD_CLASS}
      style={{ '--br-accent': ACCENT } as React.CSSProperties}
    />
  )
}

interface DateTimeFieldProps {
  value: string
  onChange: (value: string) => void
}

/** Controlled date+time picker (`datetime-local`) with the module's field styling. */
export function DateTimeField({ value, onChange }: DateTimeFieldProps) {
  return (
    <input
      type="datetime-local"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={FIELD_CLASS}
      style={{ '--br-accent': ACCENT } as React.CSSProperties}
    />
  )
}

interface TextAreaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}

/** Controlled multi-line text input sharing TextField's styling. */
export function TextArea({ value, onChange, placeholder, rows = 3 }: TextAreaProps) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={`${FIELD_CLASS} resize-y leading-relaxed`}
      style={{ '--br-accent': ACCENT } as React.CSSProperties}
    />
  )
}

interface StepperProps {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}

/** Numeric −/+ stepper used for floor and unit counts. */
export function Stepper({ value, min, max, onChange }: StepperProps) {
  const clamp = (next: number) => Math.max(min, Math.min(max, next))
  return (
    <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        className="w-10 h-[42px] bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-600"
        aria-label="הפחתה"
      >
        <Minus className="w-4 h-4" />
      </button>
      <div className="flex-1 text-center text-base font-extrabold text-gray-900 dark:text-white">{value}</div>
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        className="w-10 h-[42px] bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-600"
        aria-label="הוספה"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  )
}

interface PrimaryButtonProps {
  onClick: () => void
  disabled?: boolean
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}

/** Accent-filled primary action button (submit). */
export function PrimaryButton({ onClick, disabled, icon: Icon, children }: PrimaryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white flex items-center justify-center gap-1.5 transition-opacity disabled:cursor-not-allowed"
      style={{ background: ACCENT, opacity: disabled ? 0.6 : 1 }}
    >
      <Icon className="w-5 h-5" />
      {children}
    </button>
  )
}

interface SecondaryButtonProps {
  onClick: () => void
  children: React.ReactNode
}

/** Outlined secondary action button (cancel). */
export function SecondaryButton({ onClick, children }: SecondaryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl py-2.5 px-5 text-sm font-bold text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
    >
      {children}
    </button>
  )
}
