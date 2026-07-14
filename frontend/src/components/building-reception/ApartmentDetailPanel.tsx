import React, { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Home, Users, Phone, Mail, CalendarDays, Trash2, UserPlus, UserMinus, Pencil, UserCheck, Building2, Wrench, KeyRound, StickyNote } from 'lucide-react'
import type {
  ApartmentDetail,
  ApartmentTask,
  AuthorizedVehicle,
  Delivery,
  ApartmentKey,
  Tenant,
  TechnicianVisit,
  ClientVisit,
} from '../../types/api'
import { ACCENT, PALETTE, apartmentTitle, formatDate, isApartmentVacant } from './constants'
import KeyStatusList from './KeyStatusList'
import DeliveryList from './DeliveryList'
import VehicleList from './VehicleList'
import TenantHistory from './TenantHistory'
import ApartmentTaskList from './ApartmentTaskList'
import TechnicianVisitList from './TechnicianVisitList'
import ClientVisitList from './ClientVisitList'

type TabId = 'details' | 'tasks' | 'keys' | 'vehicles' | 'deliveries' | 'technicians' | 'clients' | 'history'

interface ApartmentDetailPanelProps {
  apartment: ApartmentDetail | null
  tasks: ApartmentTask[]
  loading: boolean
  onClose: () => void
  onAddTask: () => void
  onSelectTask: (taskId: number) => void
  onEditApartment: (apartment: ApartmentDetail) => void
  onDeleteApartment: (apartmentId: number) => void
  onAddTenant: () => void
  onEditTenant: (tenant: Tenant) => void
  onDeleteTenant: (tenantId: number) => void
  onTransferKey: () => void
  onAddKey: () => void
  onEditKey: (key: ApartmentKey) => void
  onDeleteKey: (keyId: number) => void
  onAddVehicle: () => void
  onEditVehicle: (vehicle: AuthorizedVehicle) => void
  onDeleteVehicle: (vehicleId: number) => void
  onAddDelivery: () => void
  onMarkDelivered: (deliveryId: number) => void
  onEditDelivery: (delivery: Delivery) => void
  onDeleteDelivery: (deliveryId: number) => void
  onAddTechnicianVisit: () => void
  onMarkTechnicianLeft: (visitId: number) => void
  onEditTechnicianVisit: (visit: TechnicianVisit) => void
  onDeleteTechnicianVisit: (visitId: number) => void
  onAddClientVisit: () => void
  onMarkClientLeft: (visitId: number) => void
  onEditClientVisit: (visit: ClientVisit) => void
  onDeleteClientVisit: (visitId: number) => void
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

/** A block-style section for multi-line free text (label above, wrapped value). */
function DetailSection({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="mt-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
      <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2 mb-2">
        <Icon className="w-[18px] h-[18px] text-gray-400" />
        {label}
      </div>
      <div className="text-sm font-bold text-gray-900 dark:text-white whitespace-pre-line leading-relaxed">
        {value}
      </div>
    </div>
  )
}

/**
 * The apartment side panel. It owns only the active-tab UI state; every data
 * mutation is delegated to callbacks from the page (Single Responsibility).
 */
export default function ApartmentDetailPanel({
  apartment,
  tasks,
  loading,
  onClose,
  onAddTask,
  onSelectTask,
  onEditApartment,
  onDeleteApartment,
  onAddTenant,
  onEditTenant,
  onDeleteTenant,
  onTransferKey,
  onAddKey,
  onEditKey,
  onDeleteKey,
  onAddVehicle,
  onEditVehicle,
  onDeleteVehicle,
  onAddDelivery,
  onMarkDelivered,
  onEditDelivery,
  onDeleteDelivery,
  onAddTechnicianVisit,
  onMarkTechnicianLeft,
  onEditTechnicianVisit,
  onDeleteTechnicianVisit,
  onAddClientVisit,
  onMarkClientLeft,
  onEditClientVisit,
  onDeleteClientVisit,
}: ApartmentDetailPanelProps) {
  const [tab, setTab] = useState<TabId>('details')
  const isOpen = apartment !== null || loading

  const keyAlert = apartment?.keys.some((key) => key.holder === 'out') ?? false
  const deskHeldKeysCount = apartment?.keys.filter((key) => key.holder === 'in_desk').length ?? 0
  const pendingDeliveries = apartment?.deliveries.filter((delivery) => delivery.status === 'pending').length ?? 0
  const insideTechniciansCount = apartment?.technician_visits.filter((visit) => visit.status === 'inside').length ?? 0
  const activeClientsCount = apartment?.client_visits.filter((visit) => visit.status === 'present').length ?? 0

  const openTasksCount = tasks.filter((task) => task.status !== 'completed').length

  const tabs: TabDef[] = [
    { id: 'details', label: 'פרטים' },
    { id: 'tasks', label: 'משימות', count: openTasksCount || undefined },
    { id: 'keys', label: 'מפתחות', count: keyAlert ? '!' : undefined },
    { id: 'vehicles', label: 'רכבים', count: apartment?.vehicles.length || undefined },
    { id: 'deliveries', label: 'משלוחים', count: pendingDeliveries || undefined },
    { id: 'technicians', label: 'טכנאים', count: insideTechniciansCount || undefined },
    { id: 'clients', label: 'לקוחות', count: activeClientsCount || undefined },
    { id: 'history', label: 'היסטוריה' },
  ]

  const tenant = apartment?.current_tenant ?? null
  // Occupancy (מאוכלסת/פנויה) follows the resident record via the shared rule;
  // client arrivals are transient and shown in the "לקוחות" tab, not here.
  const isVacant = apartment !== null && isApartmentVacant(apartment)
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
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onEditApartment(apartment)}
                        className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                        aria-label="עריכת דירה"
                      >
                        <Pencil className="w-[17px] h-[17px]" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteApartment(apartment.id)}
                        className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                        aria-label="מחיקת דירה"
                      >
                        <Trash2 className="w-[18px] h-[18px]" />
                      </button>
                      <button
                        type="button"
                        onClick={onClose}
                        className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                        aria-label="סגירה"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
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
                          value={
                            !tenant && !apartment.is_common_area
                              ? 'דירה פנויה'
                              : (tenant?.name ?? apartment.label ?? '—')
                          }
                        />
                        <DetailRow icon={Phone} label="טלפון" value={tenant?.phone ?? '—'} />
                        <DetailRow icon={Mail} label="דוא״ל" value={tenant?.email ?? '—'} />
                        <DetailRow icon={CalendarDays} label="תחילת חוזה" value={formatDate(tenant?.move_in_date ?? null)} />
                        <DetailRow
                          icon={CalendarDays}
                          label="סיום חוזה"
                          value={formatDate(tenant?.move_out_date ?? null)}
                        />
                        <DetailRow icon={UserCheck} label="בעלי הדירה" value={apartment.owner_name ?? '—'} />
                        <DetailRow icon={Phone} label="טלפון בעלים" value={apartment.owner_phone ?? '—'} />
                        {apartment.management_company_name && (
                          <DetailRow
                            icon={Building2}
                            label="חברת ניהול"
                            value={apartment.management_company_name}
                          />
                        )}
                        {apartment.management_company_phone && (
                          <DetailRow
                            icon={Phone}
                            label="טלפון חברת ניהול"
                            value={apartment.management_company_phone}
                          />
                        )}
                        <DetailRow
                          icon={KeyRound}
                          label="מפתחות אצלנו"
                          value={deskHeldKeysCount > 0 ? `כן (${deskHeldKeysCount})` : 'לא'}
                          last
                        />
                      </div>
                    </div>
                  )}

                  {tab === 'details' && apartment.attorneys && (
                    <DetailSection icon={Users} label="מיופי כח" value={apartment.attorneys} />
                  )}

                  {tab === 'details' && apartment.equipment && (
                    <DetailSection icon={Wrench} label="ציוד בדירה" value={apartment.equipment} />
                  )}

                  {tab === 'details' && apartment.notes && (
                    <DetailSection icon={StickyNote} label="הערות" value={apartment.notes} />
                  )}

                  {tab === 'details' && (
                    <>
                      <div className="flex gap-2 mt-3">
                        {tenant && (
                          <button
                            type="button"
                            onClick={() => onEditTenant(tenant)}
                            className="flex-1 rounded-xl py-2.5 text-sm font-bold flex items-center justify-center gap-1.5 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-200"
                          >
                            <Pencil className="w-[16px] h-[16px]" />
                            עריכת דייר
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={onAddTenant}
                          className="flex-1 rounded-xl py-2.5 text-sm font-bold flex items-center justify-center gap-1.5 border"
                          style={{ color: ACCENT, borderColor: `${ACCENT}73`, background: `${ACCENT}12` }}
                        >
                          <UserPlus className="w-[18px] h-[18px]" />
                          {tenant ? 'החלפת דייר' : 'הוספת דייר'}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={onAddTechnicianVisit}
                        className="w-full mt-2 rounded-xl py-2.5 text-sm font-bold flex items-center justify-center gap-1.5 border"
                        style={{
                          color: PALETTE.technician,
                          borderColor: `${PALETTE.technician}73`,
                          background: `${PALETTE.technician}12`,
                        }}
                      >
                        <Wrench className="w-[18px] h-[18px]" />
                        כניסת טכנאי
                      </button>

                      {(apartment.tenants ?? []).some((entry) => !entry.is_current) && (
                        <div className="mt-4">
                          <div className="text-xs font-extrabold text-gray-500 dark:text-gray-400 px-0.5 mb-2">
                            דיירים קודמים
                          </div>
                          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 divide-y divide-gray-100 dark:divide-gray-700">
                            {apartment.tenants
                              .filter((entry) => !entry.is_current)
                              .map((entry) => (
                                <div key={entry.id} className="flex items-center gap-2 py-2.5">
                                  <UserMinus className="w-4 h-4 text-gray-400" />
                                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex-1">
                                    {entry.name}
                                  </span>
                                  <span className="text-[11px] font-medium text-gray-400">
                                    {formatDate(entry.move_out_date ?? entry.move_in_date ?? null)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => onEditTenant(entry)}
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                                    aria-label="עריכת דייר"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onDeleteTenant(entry.id)}
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                    aria-label="מחיקת דייר"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {tab === 'tasks' && <ApartmentTaskList tasks={tasks} onAddTask={onAddTask} onSelectTask={onSelectTask} />}

                  {tab === 'keys' && (
                    <KeyStatusList
                      keys={apartment.keys}
                      onTransfer={onTransferKey}
                      onAddKey={onAddKey}
                      onEditKey={onEditKey}
                      onDeleteKey={onDeleteKey}
                    />
                  )}

                  {tab === 'vehicles' && (
                    <VehicleList
                      vehicles={apartment.vehicles}
                      onAdd={onAddVehicle}
                      onEdit={onEditVehicle}
                      onDelete={onDeleteVehicle}
                    />
                  )}

                  {tab === 'deliveries' && (
                    <DeliveryList
                      deliveries={apartment.deliveries}
                      onMarkDelivered={onMarkDelivered}
                      onAddDelivery={onAddDelivery}
                      onEditDelivery={onEditDelivery}
                      onDeleteDelivery={onDeleteDelivery}
                    />
                  )}

                  {tab === 'technicians' && (
                    <TechnicianVisitList
                      visits={apartment.technician_visits}
                      onMarkLeft={onMarkTechnicianLeft}
                      onAddVisit={onAddTechnicianVisit}
                      onEditVisit={onEditTechnicianVisit}
                      onDeleteVisit={onDeleteTechnicianVisit}
                    />
                  )}

                  {tab === 'clients' && (
                    <ClientVisitList
                      visits={apartment.client_visits}
                      onMarkLeft={onMarkClientLeft}
                      onAddVisit={onAddClientVisit}
                      onEditVisit={onEditClientVisit}
                      onDeleteVisit={onDeleteClientVisit}
                    />
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
