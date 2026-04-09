import { createContext, useContext, useState } from 'react'
import React from 'react'

interface InventorySettingsContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
}

const InventorySettingsContext = createContext<InventorySettingsContextValue>({
  isOpen: false,
  open: () => {},
  close: () => {},
})

export function InventorySettingsProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <InventorySettingsContext.Provider value={{ isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) }}>
      {children}
    </InventorySettingsContext.Provider>
  )
}

export function useInventorySettings() {
  return useContext(InventorySettingsContext)
}
