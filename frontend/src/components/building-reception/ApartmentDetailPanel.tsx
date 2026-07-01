import React, { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Home, Users, Phone, Mail, CalendarDays } from 'lucide-react'
import type { ApartmentDetail } from '../../types/api'
import { ACCENT, PALETTE, apartmentTitle, formatDate } from './constants'
import KeyStatusList from './KeyStatusList'
import DeliveryList from './DeliveryList'
import VehicleList from './VehicleList'
import TenantHistory from './TenantHistory'

type TabId = 'details' | 'keys' | 'vehicles' | 'deliveries' | 'history'

interface ApartmentDetailPanelProps {
  apartment: ApartmentDetail | null
  loading: boolean
  onClose: () => void
  onTransferKey: () => void
  onAddVehicle: () => void
  onDeleteVehicle: (vehicleId: number) => void
  onMarkDelivered: (deliveryId: number) => void
}

interface TabDef {
  id: TabId
  label: string
  count?: number | '!'
}

/** A single label/value row in the details tab. */
function DetailRow({
  icon: Icon,
  label,
  value,
  last,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  last?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between py-3 ${last ? '' : 'border-b border-gray-100 dark:border-gray-700'}`}
    >
      <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2">
        <Icon className="w-[18px] h-[18px] text-gray-400" />
        {label}
      </span>
      <span className="text-sm font-bold text-gray-900 dark:text-white">{value}</span>
    </div>
  )
}

/**
 * The apartment side panel. It owns only the active-tab UI state; every data
 * mutation is delegated to callbacks from the page (Single Responsibility).
 */
export default function ApartmentDetailPanel({
  apartment,
  loading,
  onClose,
  onTransferKey,
  onAddVehicle,
  onDeleteVehicle,
  onMarkDelivered,
}: ApartmentDetailPanelProps) {
  const [tab, setTab] = useState<TabId>('details')
  const isOpen = apartment !== null || loading

  const keyAlert = apartment?.keys.some((key) => key.holder === 'out') ?? false
  const pendingDeliveries = apartment?.deliveries.filter((delivery) => delivery.status === 'pending').length ?? 0

  const tabs: TabDef[] = [
    { id: 'details', label: 'פרטים' },
    { id: 'keys', label: 'מפתחות', count: keyAlert ? '!' : undefined },
    { id: 'vehicles', label: 'רכבים', count: apartment?.vehicles.length || undefined },
    { id: 'deliveries', label: 'משלוחים', count: pendingDeliveries || undefined },
    { id: 'history', label: 'היסטוריה' },
  ]

  const tenant = apartment?.current_tenant ?? null
  const isVacant = apartment !== null && tenant === null && !apartment.is_common_area
  const statusColor = apartment?.is_common_area ? PALETTE.common : isVacant ? PALETTE.vacant : PALETTE.occupied
  const statusLabel = apartment?.is_common_area ? 'תקין' : isVacant ? 'פנויה' : 'מאוכלסת'

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="apt-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-40"
            onClick={onClose}
          />
          <motion.aside
            key="apt-panel"
            dir="rtl"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'tween', duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
            className="fixed top-0 bottom-0 left-0 w-[476px] max-w-[94vw] bg-gray-50 dark:bg-gray-900 z-50 flex flex-col shadow-2xl"
          >
            {loading || !apartment ? (
              <div className="flex-1 flex items-center justify-center text-sm font-semibold text-gray-400">
                טוען פרטי דירה…
              </div>
            ) : (
              <>
                <div className="bg-white dark:bg-gray-800 px-5 pt-5 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3 items-center">
                      <div
                        className="w-[50px] h-[50px] rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${statusColor}1F`, color: statusColor }}
                      >
                        <Home className="w-6 h-6" />
                      </div>
                      <div className="leading-tight">
                        <div className="text-xl font-extrabold text-gray-900 dark:text-white">
                          {apartmentTitle(apartment)}
                        </div>
                        <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 mt-0.5">
                          קומה {apartment.floor}
                        </div>
                        <div
                          className="inline-flex items-center gap-1.5 mt-1.5 text-[11.5px] font-bold px-2.5 py-1 rounded-full"
                          style={{ color: statusColor, background: `${statusColor}1F` }}
                        >
                          <span className="w-[7px] h-[7px] rounded-full" style={{ background: statusColor }} />
                          {statusLabel}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                      aria-label="סגירה"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex gap-0.5 mt-4 overflow-x-auto">
                    {tabs.map((tabDef) => {
                      const active = tabDef.id === tab
                      return (
                        <button
                          key={tabDef.id}
                          type="button"
                          onClick={() => setTab(tabDef.id)}
                          className="text-sm font-bold px-3 py-2.5 whitespace-nowrap flex items-center gap-1.5"
                          style={{
                            color: active ? ACCENT : '#9A9AA8',
                            borderBottom: `2.5px solid ${active ? ACCENT : 'transparent'}`,
                          }}
                        >
                          {tabDef.label}
                          {tabDef.count !== undefined && (
                            <span
                              className="text-[11px] font-extrabold min-w-[18px] h-[18px] rounded-full inline-flex items-center justify-center px-1"
                              style={
                                tabDef.count === '!'
                                  ? { color: PALETTE.task, background: `${PALETTE.task}1F` }
                                  : { color: active ? ACCENT : '#9A9AA8', background: active ? `${ACCENT}1F` : '#F1F1F4' }
                              }
                            >
                              {tabDef.count}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-5">
                  {tab === 'details' && (
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-1">
                      <div className="px-0">
                        <DetailRow
                          icon={Users}
                          label="דיירים"
                          value={isVacant ? 'דירה פנויה' : (tenant?.name ?? apartment.label ?? '—')}
                        />
                        <DetailRow icon={Phone} label="טלפון" value={tenant?.phone ?? '—'} />
                        <DetailRow icon={Mail} label="דוא״ל" value={tenant?.email ?? '—'} />
                        <DetailRow icon={CalendarDays} label="תחילת חוזה" value={formatDate(tenant?.move_in_date ?? null)} />
                        <DetailRow
                          icon={CalendarDays}
                          label="סיום חוזה"
                          value={formatDate(tenant?.move_out_date ?? null)}
                          last
                        />
                      </div>
                    </div>
                  )}

                  {tab === 'keys' && <KeyStatusList keys={apartment.keys} onTransfer={onTransferKey} />}

                  {tab === 'vehicles' && (
                    <VehicleList vehicles={apartment.vehicles} onAdd={onAddVehicle} onDelete={onDeleteVehicle} />
                  )}

                  {tab === 'deliveries' && (
                    <DeliveryList deliveries={apartment.deliveries} onMarkDelivered={onMarkDelivered} />
                  )}

                  {tab === 'history' && <TenantHistory activities={apartment.activities} />}
                </div>
              </>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
