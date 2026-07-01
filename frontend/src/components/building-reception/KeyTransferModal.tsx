import { useEffect, useState } from 'react'
import { KeyRound, LogOut, LogIn, Check } from 'lucide-react'
import type { ApartmentKey, KeyTransferCreate, KeyTransferDirection } from '../../types/api'
import { ACCENT } from './constants'
import ModalShell from './ModalShell'
import { LabeledField, PrimaryButton, SecondaryButton, TextField } from './FormControls'

interface KeyTransferModalProps {
  isOpen: boolean
  onClose: () => void
  subtitle: string
  keys: ApartmentKey[]
  onSubmit: (keyId: number, payload: KeyTransferCreate) => void
  submitting?: boolean
}

const OCCUPIED_GREEN = '#12B76A'

/** Suggestion chips differ slightly by direction. */
const SUGGESTIONS: Record<KeyTransferDirection, string[]> = {
  out: ['דייר', 'אינסטלטור', 'חברת ניקיון', 'בעל מקצוע'],
  return: ['דייר', 'אינסטלטור', 'חברת ניקיון'],
}

/**
 * Modal for handing a key out of the desk or receiving it back. It selects a
 * sensible default direction/key from the apartment's current key state, then
 * delegates the transfer to `onSubmit`.
 */
export default function KeyTransferModal({
  isOpen,
  onClose,
  subtitle,
  keys,
  onSubmit,
  submitting,
}: KeyTransferModalProps) {
  const [direction, setDirection] = useState<KeyTransferDirection>('out')
  const [keyId, setKeyId] = useState<number | null>(null)
  const [counterparty, setCounterparty] = useState('')

  useEffect(() => {
    if (!isOpen) return
    const keyOut = keys.find((key) => key.holder === 'out')
    setDirection(keyOut ? 'return' : 'out')
    setKeyId(keyOut?.id ?? keys[0]?.id ?? null)
    setCounterparty('')
  }, [isOpen, keys])

  const isOut = direction === 'out'
  const canSubmit = keyId !== null && counterparty.trim().length > 0 && !submitting

  const handleSubmit = () => {
    if (!canSubmit || keyId === null) return
    onSubmit(keyId, { direction, counterparty_name: counterparty.trim() })
  }

  const directionButtonStyle = (active: boolean, activeColor: string) => ({
    borderColor: active ? activeColor : '#E2E2E8',
    background: active ? `${activeColor}14` : 'transparent',
    color: active ? activeColor : '#6B6B7B',
  })

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      icon={KeyRound}
      title="העברת מפתח"
      subtitle={subtitle}
      footer={
        <>
          <SecondaryButton onClick={onClose}>ביטול</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={!canSubmit} icon={Check}>
            {isOut ? 'אשר מסירה' : 'אשר החזרה'}
          </PrimaryButton>
        </>
      }
    >
      <LabeledField label="סוג הפעולה">
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => setDirection('out')}
            className="flex-1 rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-1.5 border"
            style={directionButtonStyle(isOut, ACCENT)}
          >
            <LogOut className="w-5 h-5" />
            מסירה החוצה
          </button>
          <button
            type="button"
            onClick={() => setDirection('return')}
            className="flex-1 rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-1.5 border"
            style={directionButtonStyle(!isOut, OCCUPIED_GREEN)}
          >
            <LogIn className="w-5 h-5" />
            החזרה לדלפק
          </button>
        </div>
      </LabeledField>

      <LabeledField label="איזה מפתח">
        <div className="flex gap-1.5 flex-wrap">
          {keys.map((key) => {
            const selected = key.id === keyId
            return (
              <button
                key={key.id}
                type="button"
                onClick={() => setKeyId(key.id)}
                className="text-xs font-bold px-3 py-2 rounded-lg border flex items-center gap-1.5"
                style={{
                  color: selected ? ACCENT : '#6B6B7B',
                  background: selected ? `${ACCENT}14` : 'transparent',
                  borderColor: selected ? ACCENT : '#E2E2E8',
                }}
              >
                <KeyRound className="w-4 h-4" />
                {key.label}
              </button>
            )
          })}
          {keys.length === 0 && (
            <span className="text-xs font-semibold text-gray-400">לא הוגדרו מפתחות לדירה זו</span>
          )}
        </div>
      </LabeledField>

      <LabeledField label={isOut ? 'נמסר ל…' : 'הוחזר מ…'}>
        <TextField
          value={counterparty}
          onChange={setCounterparty}
          placeholder={isOut ? 'שם מקבל המפתח' : 'ממי הוחזר המפתח'}
        />
        <div className="flex gap-1.5 flex-wrap mt-2">
          {SUGGESTIONS[direction].map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setCounterparty(suggestion)}
              className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-300"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </LabeledField>
    </ModalShell>
  )
}
