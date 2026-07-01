import { useEffect, useState } from 'react'
import { Search, Plus, RefreshCw, Bell, ChevronLeft } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import type { RootState } from '../store'
import type {
  Apartment,
  ApartmentCreate,
  AuthorizedVehicleCreate,
  BuildingCreate,
  BuildingReceptionTaskCreate,
  DeliveryCreate,
  KeyTransferCreate,
  TenantCreate,
} from '../types/api'
import BuildingReceptionAPI from '../lib/buildingReceptionApi'
import {
  fetchBuildings,
  fetchBuilding,
  createBuilding,
  fetchApartment,
  closeApartment,
  createApartment,
  deleteApartment,
  swapTenant,
  deleteTenant,
  createKey,
  transferKey,
  deleteKey,
  createVehicle,
  deleteVehicle,
  createDelivery,
  markDelivered,
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

  const [createBuildingOpen, setCreateBuildingOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [keyTransferOpen, setKeyTransferOpen] = useState(false)
  const [addVehicleOpen, setAddVehicleOpen] = useState(false)
  const [addTenantOpen, setAddTenantOpen] = useState(false)
  const [addDeliveryOpen, setAddDeliveryOpen] = useState(false)
  const [addApartmentFloor, setAddApartmentFloor] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

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

  const handleAddVehicle = (payload: AuthorizedVehicleCreate) =>
    runSubmit(
      () => dispatch(createVehicle(payload)).unwrap(),
      () => setAddVehicleOpen(false),
    )

  const handleDeleteVehicle = (vehicleId: number) => {
    if (activeApartmentId === null) return
    void dispatch(deleteVehicle({ vehicleId, apartmentId: activeApartmentId }))
  }

  const handleMarkDelivered = (deliveryId: number) => {
    if (activeApartmentId === null) return
    void dispatch(markDelivered({ deliveryId, apartmentId: activeApartmentId }))
  }

  const handleAddApartment = (payload: ApartmentCreate) =>
    runSubmit(
      () => dispatch(createApartment(payload)).unwrap(),
      () => setAddApartmentFloor(null),
    )

  const handleDeleteApartment = (apartmentId: number) => {
    if (!activeBuilding) return
    if (!window.confirm('למחוק את הדירה וכל הרשומות המשויכות אליה?')) return
    void dispatch(deleteApartment({ apartmentId, buildingId: activeBuilding.id }))
  }

  const handleAddTenant = (payload: TenantCreate) => {
    if (activeApartmentId === null) return
    void runSubmit(
      () => dispatch(swapTenant({ apartmentId: activeApartmentId, payload })).unwrap(),
      () => setAddTenantOpen(false),
    )
  }

  const handleDeleteTenant = (tenantId: number) => {
    if (activeApartmentId === null) return
    if (!window.confirm('למחוק את רשומת הדייר מההיסטוריה?')) return
    void dispatch(deleteTenant({ tenantId, apartmentId: activeApartmentId }))
  }

  const handleAddKey = () => {
    if (activeApartmentId === null) return
    const nextLabel = `מפתח ${(activeApartment?.keys.length ?? 0) + 1}`
    void dispatch(createKey({ apartment_id: activeApartmentId, label: nextLabel }))
  }

  const handleDeleteKey = (keyId: number) => {
    if (activeApartmentId === null) return
    if (!window.confirm('למחוק את המפתח ואת יומן ההעברות שלו?')) return
    void dispatch(deleteKey({ keyId, apartmentId: activeApartmentId }))
  }

  const handleAddDelivery = (payload: DeliveryCreate) =>
    runSubmit(
      () => dispatch(createDelivery(payload)).unwrap(),
      () => setAddDeliveryOpen(false),
    )

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

      <div className="flex-1 min-h-0 overflow-y-auto px-1 pb-10">
        <BuildingOverview
          buildings={buildings}
          activeBuilding={activeBuilding}
          loading={loadingBuilding}
          onSelectBuilding={handleSelectBuilding}
          onCreateBuilding={() => setCreateBuildingOpen(true)}
          onSelectApartment={handleSelectApartment}
          onAddApartment={(floor) => setAddApartmentFloor(floor)}
        />
      </div>

      <ApartmentDetailPanel
        apartment={activeApartment}
        loading={loadingApartment}
        onClose={() => dispatch(closeApartment())}
        onDeleteApartment={handleDeleteApartment}
        onAddTenant={() => setAddTenantOpen(true)}
        onDeleteTenant={handleDeleteTenant}
        onTransferKey={() => void handleOpenKeyTransfer()}
        onAddKey={handleAddKey}
        onDeleteKey={handleDeleteKey}
        onAddVehicle={() => setAddVehicleOpen(true)}
        onDeleteVehicle={handleDeleteVehicle}
        onAddDelivery={() => setAddDeliveryOpen(true)}
        onMarkDelivered={handleMarkDelivered}
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
        onClose={() => setAddVehicleOpen(false)}
        apartmentId={activeApartmentId}
        onSubmit={handleAddVehicle}
        submitting={submitting}
      />

      <AddTenantModal
        isOpen={addTenantOpen}
        onClose={() => setAddTenantOpen(false)}
        hasCurrentTenant={activeApartment?.current_tenant != null}
        onSubmit={handleAddTenant}
        submitting={submitting}
      />

      <AddDeliveryModal
        isOpen={addDeliveryOpen}
        onClose={() => setAddDeliveryOpen(false)}
        apartmentId={activeApartmentId}
        onSubmit={handleAddDelivery}
        submitting={submitting}
      />

      <AddApartmentModal
        isOpen={addApartmentFloor !== null}
        onClose={() => setAddApartmentFloor(null)}
        buildingId={activeBuilding?.id ?? null}
        defaultFloor={addApartmentFloor ?? 1}
        onSubmit={handleAddApartment}
        submitting={submitting}
      />
    </div>
  )
}
