import { useEffect, useState } from 'react'
import { Search, Plus, RefreshCw, Bell, ChevronLeft, AlertTriangle, X } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import type { RootState } from '../store'
import type {
  Apartment,
  ApartmentCreate,
  ApartmentDetail,
  ApartmentKey,
  AuthorizedVehicle,
  AuthorizedVehicleCreate,
  BuildingCreate,
  BuildingReceptionTaskCreate,
  Delivery,
  DeliveryCreate,
  KeyTransferCreate,
  Tenant,
  TenantCreate,
} from '../types/api'
import BuildingReceptionAPI from '../lib/buildingReceptionApi'
import {
  fetchBuildings,
  fetchBuilding,
  createBuilding,
  fetchApartment,
  closeApartment,
  clearError,
  createApartment,
  updateApartment,
  deleteApartment,
  swapTenant,
  updateTenant,
  deleteTenant,
  createKey,
  transferKey,
  updateKey,
  deleteKey,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  createDelivery,
  markDelivered,
  updateDelivery,
  deleteDelivery,
} from '../store/slices/buildingReceptionSlice'
import { ACCENT, apartmentTitle } from '../components/building-reception/constants'
import BuildingOverview from '../components/building-reception/BuildingOverview'
import ApartmentDetailPanel from '../components/building-reception/ApartmentDetailPanel'
import CreateBuildingModal from '../components/building-reception/CreateBuildingModal'
import NewTaskModal from '../components/building-reception/NewTaskModal'
import KeyTransferModal from '../components/building-reception/KeyTransferModal'
import AddVehicleModal from '../components/building-reception/AddVehicleModal'
import AddTenantModal from '../components/building-reception/AddTenantModal'
import AddDeliveryModal from '../components/building-reception/AddDeliveryModal'
import AddApartmentModal from '../components/building-reception/AddApartmentModal'
import AddKeyModal from '../components/building-reception/AddKeyModal'

/**
 * Building Reception Desk (דלפק הבניין).
 *
 * Top-level page for the reception module. It owns the cross-cutting UI state
 * (which modal is open, which building is active) and wires every child action
 * to a Redux thunk; the presentational work lives in the building-reception
 * component folder (Single Responsibility / composition).
 */
export default function BuildingReceptionDesk() {
  const dispatch = useAppDispatch()
  const buildings = useAppSelector((state: RootState) => state.buildingReception.buildings)
  const activeBuilding = useAppSelector((state: RootState) => state.buildingReception.activeBuilding)
  const activeApartment = useAppSelector((state: RootState) => state.buildingReception.activeApartment)
  const loadingBuilding = useAppSelector((state: RootState) => state.buildingReception.loadingBuilding)
  const loadingApartment = useAppSelector((state: RootState) => state.buildingReception.loadingApartment)
  const error = useAppSelector((state: RootState) => state.buildingReception.error)

  const [createBuildingOpen, setCreateBuildingOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [keyTransferOpen, setKeyTransferOpen] = useState(false)
  const [addVehicleOpen, setAddVehicleOpen] = useState(false)
  const [addTenantOpen, setAddTenantOpen] = useState(false)
  const [addDeliveryOpen, setAddDeliveryOpen] = useState(false)
  const [addApartmentFloor, setAddApartmentFloor] = useState<number | null>(null)
  const [keyModalOpen, setKeyModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // Edit targets: non-null means the matching modal is in edit mode.
  const [editingApartment, setEditingApartment] = useState<ApartmentDetail | null>(null)
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)
  const [editingKey, setEditingKey] = useState<ApartmentKey | null>(null)
  const [editingVehicle, setEditingVehicle] = useState<AuthorizedVehicle | null>(null)
  const [editingDelivery, setEditingDelivery] = useState<Delivery | null>(null)

  // Load the building list once; then open the first building automatically.
  useEffect(() => {
    void dispatch(fetchBuildings())
  }, [dispatch])

  useEffect(() => {
    if (!activeBuilding && buildings.length > 0) {
      void dispatch(fetchBuilding(buildings[0].id))
    }
  }, [dispatch, activeBuilding, buildings])

  const apartments: Apartment[] = activeBuilding?.apartments ?? []
  const activeApartmentId = activeApartment?.id ?? null

  const runSubmit = async (action: () => Promise<unknown>, onDone: () => void) => {
    setSubmitting(true)
    try {
      await action()
      onDone()
    } finally {
      setSubmitting(false)
    }
  }

  const handleSelectBuilding = (buildingId: number) => {
    dispatch(closeApartment())
    void dispatch(fetchBuilding(buildingId))
  }

  const handleSelectApartment = (apartment: Apartment) => {
    void dispatch(fetchApartment(apartment.id))
  }

  const handleCreateBuilding = (payload: BuildingCreate) =>
    runSubmit(
      () => dispatch(createBuilding(payload)).unwrap(),
      () => setCreateBuildingOpen(false),
    )

  const handleCreateTask = (payload: BuildingReceptionTaskCreate) =>
    runSubmit(
      () => BuildingReceptionAPI.createTask(payload),
      () => setTaskOpen(false),
    )

  const handleTransferKey = (keyId: number, payload: KeyTransferCreate) => {
    if (activeApartmentId === null) return
    void runSubmit(
      () => dispatch(transferKey({ keyId, apartmentId: activeApartmentId, payload })).unwrap(),
      () => setKeyTransferOpen(false),
    )
  }

  const closeVehicleModal = () => {
    setAddVehicleOpen(false)
    setEditingVehicle(null)
  }

  const handleSubmitVehicle = (payload: AuthorizedVehicleCreate) => {
    if (editingVehicle && activeApartmentId !== null) {
      void runSubmit(
        () => dispatch(updateVehicle({ vehicleId: editingVehicle.id, apartmentId: activeApartmentId, changes: payload })).unwrap(),
        closeVehicleModal,
      )
      return
    }
    void runSubmit(() => dispatch(createVehicle(payload)).unwrap(), closeVehicleModal)
  }

  const handleDeleteVehicle = (vehicleId: number) => {
    if (activeApartmentId === null) return
    void dispatch(deleteVehicle({ vehicleId, apartmentId: activeApartmentId }))
  }

  const handleMarkDelivered = (deliveryId: number) => {
    if (activeApartmentId === null) return
    void dispatch(markDelivered({ deliveryId, apartmentId: activeApartmentId }))
  }

  // --- Apartments ---
  const closeApartmentModal = () => {
    setAddApartmentFloor(null)
    setEditingApartment(null)
  }

  const handleSubmitApartment = (payload: ApartmentCreate) => {
    if (editingApartment) {
      const buildingId = activeBuilding?.id
      void runSubmit(async () => {
        await dispatch(
          updateApartment({
            apartmentId: editingApartment.id,
            changes: {
              floor: payload.floor,
              unit_number: payload.unit_number,
              label: payload.label,
              is_common_area: payload.is_common_area,
            },
          }),
        ).unwrap()
        if (buildingId) await dispatch(fetchBuilding(buildingId))
      }, closeApartmentModal)
      return
    }
    void runSubmit(() => dispatch(createApartment(payload)).unwrap(), closeApartmentModal)
  }

  const handleDeleteApartment = (apartmentId: number) => {
    if (!activeBuilding) return
    if (!window.confirm('למחוק את הדירה וכל הרשומות המשויכות אליה?')) return
    void dispatch(deleteApartment({ apartmentId, buildingId: activeBuilding.id }))
  }

  // --- Tenants ---
  const closeTenantModal = () => {
    setAddTenantOpen(false)
    setEditingTenant(null)
  }

  const handleSubmitTenant = (payload: TenantCreate) => {
    if (activeApartmentId === null) return
    if (editingTenant) {
      void runSubmit(
        () => dispatch(updateTenant({ tenantId: editingTenant.id, apartmentId: activeApartmentId, changes: payload })).unwrap(),
        closeTenantModal,
      )
      return
    }
    void runSubmit(() => dispatch(swapTenant({ apartmentId: activeApartmentId, payload })).unwrap(), closeTenantModal)
  }

  const handleDeleteTenant = (tenantId: number) => {
    if (activeApartmentId === null) return
    if (!window.confirm('למחוק את רשומת הדייר מההיסטוריה?')) return
    void dispatch(deleteTenant({ tenantId, apartmentId: activeApartmentId }))
  }

  // --- Keys ---
  const closeKeyModal = () => {
    setKeyModalOpen(false)
    setEditingKey(null)
  }

  const handleSubmitKey = (label: string) => {
    if (activeApartmentId === null) return
    if (editingKey) {
      void runSubmit(
        () => dispatch(updateKey({ keyId: editingKey.id, apartmentId: activeApartmentId, changes: { label } })).unwrap(),
        closeKeyModal,
      )
      return
    }
    void runSubmit(() => dispatch(createKey({ apartment_id: activeApartmentId, label })).unwrap(), closeKeyModal)
  }

  const handleDeleteKey = (keyId: number) => {
    if (activeApartmentId === null) return
    if (!window.confirm('למחוק את המפתח ואת יומן ההעברות שלו?')) return
    void dispatch(deleteKey({ keyId, apartmentId: activeApartmentId }))
  }

  // --- Deliveries ---
  const closeDeliveryModal = () => {
    setAddDeliveryOpen(false)
    setEditingDelivery(null)
  }

  const handleSubmitDelivery = (payload: DeliveryCreate) => {
    if (editingDelivery && activeApartmentId !== null) {
      void runSubmit(
        () =>
          dispatch(
            updateDelivery({
              deliveryId: editingDelivery.id,
              apartmentId: activeApartmentId,
              changes: { title: payload.title, kind: payload.kind, meta: payload.meta },
            }),
          ).unwrap(),
        closeDeliveryModal,
      )
      return
    }
    void runSubmit(() => dispatch(createDelivery(payload)).unwrap(), closeDeliveryModal)
  }

  const handleDeleteDelivery = (deliveryId: number) => {
    if (activeApartmentId === null) return
    if (!window.confirm('למחוק את רשומת המשלוח?')) return
    void dispatch(deleteDelivery({ deliveryId, apartmentId: activeApartmentId }))
  }

  // When an apartment has no keys yet, seed a default one so a hand-out can be
  // recorded immediately from the transfer modal.
  const handleOpenKeyTransfer = async () => {
    if (activeApartmentId === null) return
    if ((activeApartment?.keys.length ?? 0) === 0) {
      await dispatch(createKey({ apartment_id: activeApartmentId, label: 'מפתח ראשי' })).unwrap().catch(() => undefined)
    }
    setKeyTransferOpen(true)
  }

  return (
    <div dir="rtl" className="flex flex-col h-full min-h-0">
      <header className="flex items-center gap-4 flex-wrap px-1 pb-4">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 dark:text-gray-400">
          <span>מערכת ניהול נכסים</span>
          <ChevronLeft className="w-4 h-4" />
          <span className="text-gray-900 dark:text-white font-bold">דלפק הבניין</span>
        </div>
        <div className="flex-1" />
        <div className="hidden md:flex items-center gap-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 w-[280px] text-gray-400">
          <Search className="w-[18px] h-[18px]" />
          <span className="text-sm">חיפוש דירה, דייר, משימה…</span>
        </div>
        <button
          type="button"
          onClick={() => setTaskOpen(true)}
          className="text-sm font-bold text-white px-4 py-2.5 rounded-xl flex items-center gap-1.5"
          style={{ background: ACCENT }}
        >
          <Plus className="w-[18px] h-[18px]" />
          משימה חדשה
        </button>
        <button
          type="button"
          className="text-sm font-bold text-gray-600 dark:text-gray-200 px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
        >
          <RefreshCw className="w-[18px] h-[18px] text-teal-500" />
          סנכרון Outlook
        </button>
        <button
          type="button"
          className="relative w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          aria-label="התראות"
        >
          <Bell className="w-[19px] h-[19px]" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 border-2 border-white dark:border-gray-800" />
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="mx-1 mb-3 flex items-center gap-2.5 rounded-xl px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
        >
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-500" />
          <span className="flex-1 text-sm font-semibold text-red-800 dark:text-red-300">{error}</span>
          <button
            type="button"
            onClick={() => dispatch(clearError())}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40"
            aria-label="סגירת ההודעה"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-1 pb-10">
        <BuildingOverview
          buildings={buildings}
          activeBuilding={activeBuilding}
          loading={loadingBuilding}
          onSelectBuilding={handleSelectBuilding}
          onCreateBuilding={() => setCreateBuildingOpen(true)}
          onSelectApartment={handleSelectApartment}
          onAddApartment={(floor) => {
            setEditingApartment(null)
            setAddApartmentFloor(floor)
          }}
        />
      </div>

      <ApartmentDetailPanel
        apartment={activeApartment}
        loading={loadingApartment}
        onClose={() => dispatch(closeApartment())}
        onEditApartment={(apartment) => setEditingApartment(apartment)}
        onDeleteApartment={handleDeleteApartment}
        onAddTenant={() => {
          setEditingTenant(null)
          setAddTenantOpen(true)
        }}
        onEditTenant={(tenant) => {
          setEditingTenant(tenant)
          setAddTenantOpen(true)
        }}
        onDeleteTenant={handleDeleteTenant}
        onTransferKey={() => void handleOpenKeyTransfer()}
        onAddKey={() => {
          setEditingKey(null)
          setKeyModalOpen(true)
        }}
        onEditKey={(key) => {
          setEditingKey(key)
          setKeyModalOpen(true)
        }}
        onDeleteKey={handleDeleteKey}
        onAddVehicle={() => {
          setEditingVehicle(null)
          setAddVehicleOpen(true)
        }}
        onEditVehicle={(vehicle) => {
          setEditingVehicle(vehicle)
          setAddVehicleOpen(true)
        }}
        onDeleteVehicle={handleDeleteVehicle}
        onAddDelivery={() => {
          setEditingDelivery(null)
          setAddDeliveryOpen(true)
        }}
        onMarkDelivered={handleMarkDelivered}
        onEditDelivery={(delivery) => {
          setEditingDelivery(delivery)
          setAddDeliveryOpen(true)
        }}
        onDeleteDelivery={handleDeleteDelivery}
      />

      <CreateBuildingModal
        isOpen={createBuildingOpen}
        onClose={() => setCreateBuildingOpen(false)}
        onSubmit={handleCreateBuilding}
        submitting={submitting}
      />

      <NewTaskModal
        isOpen={taskOpen}
        onClose={() => setTaskOpen(false)}
        apartments={apartments}
        defaultApartmentId={activeApartmentId}
        onSubmit={handleCreateTask}
        submitting={submitting}
      />

      <KeyTransferModal
        isOpen={keyTransferOpen}
        onClose={() => setKeyTransferOpen(false)}
        subtitle={activeApartment ? apartmentTitle(activeApartment) : ''}
        keys={activeApartment?.keys ?? []}
        onSubmit={handleTransferKey}
        submitting={submitting}
      />

      <AddVehicleModal
        isOpen={addVehicleOpen}
        onClose={closeVehicleModal}
        apartmentId={activeApartmentId}
        initial={
          editingVehicle
            ? {
                plate: editingVehicle.plate,
                model: editingVehicle.model,
                owner_name: editingVehicle.owner_name,
                parking_spot: editingVehicle.parking_spot,
              }
            : null
        }
        onSubmit={handleSubmitVehicle}
        submitting={submitting}
      />

      <AddTenantModal
        isOpen={addTenantOpen}
        onClose={closeTenantModal}
        hasCurrentTenant={activeApartment?.current_tenant != null}
        initial={
          editingTenant
            ? {
                name: editingTenant.name,
                phone: editingTenant.phone,
                email: editingTenant.email,
                move_in_date: editingTenant.move_in_date,
              }
            : null
        }
        onSubmit={handleSubmitTenant}
        submitting={submitting}
      />

      <AddDeliveryModal
        isOpen={addDeliveryOpen}
        onClose={closeDeliveryModal}
        apartmentId={activeApartmentId}
        initial={
          editingDelivery
            ? { title: editingDelivery.title, kind: editingDelivery.kind, meta: editingDelivery.meta }
            : null
        }
        onSubmit={handleSubmitDelivery}
        submitting={submitting}
      />

      <AddApartmentModal
        isOpen={addApartmentFloor !== null || editingApartment !== null}
        onClose={closeApartmentModal}
        buildingId={activeBuilding?.id ?? null}
        defaultFloor={addApartmentFloor ?? 1}
        initial={
          editingApartment
            ? {
                floor: editingApartment.floor,
                unit_number: editingApartment.unit_number,
                label: editingApartment.label,
                is_common_area: editingApartment.is_common_area,
              }
            : null
        }
        onSubmit={handleSubmitApartment}
        submitting={submitting}
      />

      <AddKeyModal
        isOpen={keyModalOpen}
        onClose={closeKeyModal}
        initialLabel={editingKey ? editingKey.label : null}
        onSubmit={handleSubmitKey}
        submitting={submitting}
      />
    </div>
  )
}
