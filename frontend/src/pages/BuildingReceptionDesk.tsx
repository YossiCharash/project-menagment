import { useEffect, useState, useCallback, useMemo } from 'react'
import { Search, Plus, ChevronLeft, AlertTriangle, X, Trash2 } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import type { RootState } from '../store'
import type {
  Apartment,
  ApartmentCreate,
  BuildingProjectCreate,
  BuildingProjectListItem,
  ApartmentDetail,
  ApartmentKey,
  AuthorizedVehicle,
  AuthorizedVehicleCreate,
  BuildingCreate,
  Delivery,
  DeliveryCreate,
  KeyTransferCreate,
  TechnicianVisit,
  TechnicianVisitCreate,
  ClientVisit,
  ClientVisitCreate,
  Tenant,
  TenantCreate,
} from '../types/api'
import api from '../lib/api'
import type { Task, TaskLabelType, UserForTask } from './TaskCalendar'
import CreateTaskModal from '../components/task-management/CreateTaskModal'
import TaskDetailModal from '../components/task-management/TaskDetailModal'
import TaskEditModal from '../components/task-management/TaskEditModal'
import {
  fetchProjects,
  createProject,
  updateProject,
  deleteProject,
  fetchBuildings,
  fetchBuilding,
  createBuilding,
  deleteBuilding,
  fetchApartment,
  fetchApartmentTasks,
  closeApartment,
  clearActiveBuilding,
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
  uploadApartmentSharedDocument,
  deleteApartmentSharedDocument,
  createDelivery,
  markDelivered,
  updateDelivery,
  deleteDelivery,
  createTechnicianVisit,
  markTechnicianLeft,
  updateTechnicianVisit,
  deleteTechnicianVisit,
  createClientVisit,
  markClientLeft,
  updateClientVisit,
  deleteClientVisit,
  refreshBuildingSilently,
  refreshApartmentSilently,
} from '../store/slices/buildingReceptionSlice'
import BuildingReceptionAPI from '../lib/buildingReceptionApi'
import { ACCENT, apartmentTitle } from '../components/building-reception/constants'
import BuildingOverview from '../components/building-reception/BuildingOverview'
import ApartmentDetailPanel from '../components/building-reception/ApartmentDetailPanel'
import CreateBuildingModal from '../components/building-reception/CreateBuildingModal'
import CreateProjectModal from '../components/building-reception/CreateProjectModal'
import KeyTransferModal from '../components/building-reception/KeyTransferModal'
import AddVehicleModal from '../components/building-reception/AddVehicleModal'
import AddTenantModal from '../components/building-reception/AddTenantModal'
import AddDeliveryModal from '../components/building-reception/AddDeliveryModal'
import AddTechnicianVisitModal from '../components/building-reception/AddTechnicianVisitModal'
import AddClientVisitModal from '../components/building-reception/AddClientVisitModal'
import AddApartmentModal from '../components/building-reception/AddApartmentModal'
import AddKeyModal from '../components/building-reception/AddKeyModal'
import AddApartmentSharedDocumentModal from '../components/building-reception/AddApartmentSharedDocumentModal'

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
  // Only admins may create/edit/delete whole buildings and projects; desk
  // operators keep managing the contents (apartments, tenants, keys, …).
  const me = useAppSelector((state: RootState) => state.auth.me)
  const canManageBuildings = me?.role === 'Admin' || me?.role === 'SuperAdmin'
  const buildings = useAppSelector((state: RootState) => state.buildingReception.buildings)
  const activeBuilding = useAppSelector((state: RootState) => state.buildingReception.activeBuilding)
  const activeApartment = useAppSelector((state: RootState) => state.buildingReception.activeApartment)
  const loadingBuilding = useAppSelector((state: RootState) => state.buildingReception.loadingBuilding)
  const loadingApartment = useAppSelector((state: RootState) => state.buildingReception.loadingApartment)
  const error = useAppSelector((state: RootState) => state.buildingReception.error)
  const apartmentTasks = useAppSelector((state: RootState) => state.buildingReception.activeApartmentTasks)
  const projects = useAppSelector((state: RootState) => state.buildingReception.projects)

  const [createBuildingOpen, setCreateBuildingOpen] = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  // Non-null means the project modal is open in edit mode for this project.
  const [editingProject, setEditingProject] = useState<BuildingProjectListItem | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [taskOpen, setTaskOpen] = useState(false)
  // Assignee directory + labels needed by the shared CreateTaskModal.
  const [taskUsers, setTaskUsers] = useState<UserForTask[]>([])
  const [taskLabels, setTaskLabels] = useState<TaskLabelType[]>([])
  // The task whose full-detail modal is open (fetched via GET /tasks/{id}).
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  // The task being edited via the shared TaskEditModal (opened from the detail modal).
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [keyTransferOpen, setKeyTransferOpen] = useState(false)
  const [addVehicleOpen, setAddVehicleOpen] = useState(false)
  const [addTenantOpen, setAddTenantOpen] = useState(false)
  const [addDeliveryOpen, setAddDeliveryOpen] = useState(false)
  const [addTechnicianOpen, setAddTechnicianOpen] = useState(false)
  const [addClientOpen, setAddClientOpen] = useState(false)
  const [addDocumentOpen, setAddDocumentOpen] = useState(false)
  const [addApartmentFloor, setAddApartmentFloor] = useState<number | null>(null)
  const [keyModalOpen, setKeyModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // Edit targets: non-null means the matching modal is in edit mode.
  const [editingApartment, setEditingApartment] = useState<ApartmentDetail | null>(null)
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)
  const [editingKey, setEditingKey] = useState<ApartmentKey | null>(null)
  const [editingVehicle, setEditingVehicle] = useState<AuthorizedVehicle | null>(null)
  const [editingDelivery, setEditingDelivery] = useState<Delivery | null>(null)
  const [editingTechnicianVisit, setEditingTechnicianVisit] = useState<TechnicianVisit | null>(null)
  const [editingClientVisit, setEditingClientVisit] = useState<ClientVisit | null>(null)

  // Load the building + project lists once; then open the first building.
  useEffect(() => {
    void dispatch(fetchBuildings())
    void dispatch(fetchProjects())
  }, [dispatch])

  // The shared CreateTaskModal needs the assignee directory and label set.
  const fetchTaskDirectory = useCallback(async () => {
    try {
      const [usersRes, labelsRes] = await Promise.all([
        api.get<UserForTask[]>('/users/for-tasks'),
        api.get<TaskLabelType[]>('/tasks/labels'),
      ])
      setTaskUsers(usersRes.data)
      setTaskLabels(labelsRes.data)
    } catch {
      /* the create modal simply stays empty until the directory loads */
    }
  }, [])

  useEffect(() => {
    void fetchTaskDirectory()
  }, [fetchTaskDirectory])

  // Buildings are always scoped to a project: only those belonging to the
  // selected project are shown (null = no project selected yet → nothing).
  const visibleBuildings =
    selectedProjectId === null ? [] : buildings.filter((building) => building.project_id === selectedProjectId)

  // Default the filter to the first project (and recover if the selected one was
  // deleted). Buildings only exist inside a project, so there is no "all" view.
  useEffect(() => {
    if (projects.length === 0) return
    const stillExists = selectedProjectId !== null && projects.some((project) => project.id === selectedProjectId)
    if (!stillExists) setSelectedProjectId(projects[0].id)
  }, [projects, selectedProjectId])

  // Keep the open building consistent with the project filter: if the active
  // building isn't in the visible set, open the first visible one — or clear it
  // when the selected project has no buildings.
  useEffect(() => {
    const activeIsVisible = visibleBuildings.some((building) => building.id === activeBuilding?.id)
    if (activeIsVisible) return
    if (visibleBuildings.length > 0) {
      void dispatch(fetchBuilding(visibleBuildings[0].id))
    } else if (activeBuilding) {
      dispatch(clearActiveBuilding())
    }
  }, [dispatch, activeBuilding, visibleBuildings])

  const activeApartmentId = activeApartment?.id ?? null

  // Live updates: silently re-fetch the open building + apartment every 10s so
  // occupancy and indicators stay current (and the auto-vacancy flip shows up)
  // without a manual reload. Silent thunks skip loading flags to avoid flicker.
  const activeBuildingId = activeBuilding?.id ?? null
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (activeBuildingId !== null) void dispatch(refreshBuildingSilently(activeBuildingId))
      if (activeApartmentId !== null) {
        void dispatch(refreshApartmentSilently(activeApartmentId))
        void dispatch(fetchApartmentTasks(activeApartmentId))
      }
    }, 10000)
    return () => window.clearInterval(intervalId)
  }, [dispatch, activeBuildingId, activeApartmentId])

  // The task modal's building → apartment cascade loads apartments on demand.
  const loadBuildingApartments = useCallback(
    async (buildingId: number) => (await BuildingReceptionAPI.getBuilding(buildingId)).apartments,
    [],
  )

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
    void dispatch(fetchApartmentTasks(apartment.id))
  }

  const handleCreateBuilding = (payload: BuildingCreate) =>
    runSubmit(
      () => dispatch(createBuilding(payload)).unwrap(),
      () => {
        setCreateBuildingOpen(false)
        void dispatch(fetchProjects())
      },
    )

  const closeProjectModal = () => {
    setCreateProjectOpen(false)
    setEditingProject(null)
  }

  // One handler for the project modal: update when an edit target is set,
  // otherwise create a new project.
  const handleSubmitProject = (payload: BuildingProjectCreate) => {
    if (editingProject) {
      void runSubmit(
        () => dispatch(updateProject({ projectId: editingProject.id, changes: payload })).unwrap(),
        closeProjectModal,
      )
      return
    }
    void runSubmit(() => dispatch(createProject(payload)).unwrap(), closeProjectModal)
  }

  // Delete a building after an explicit confirmation — it wipes the building and
  // every apartment/record beneath it.
  const handleDeleteBuilding = (buildingId: number) => {
    const target = buildings.find((building) => building.id === buildingId)
    const name = target?.name ?? 'הבניין'
    if (!window.confirm(`למחוק את "${name}" ואת כל הדירות והרשומות שתחתיו? פעולה זו אינה הפיכה.`)) return
    void dispatch(deleteBuilding(buildingId))
  }

  const handleDeleteProject = (projectId: number) => {
    if (!window.confirm('למחוק את הפרויקט? הבניינים יישארו אך לא ישויכו לפרויקט.')) return
    if (selectedProjectId === projectId) setSelectedProjectId(null)
    void dispatch(deleteProject(projectId))
  }

  // Refresh the apartment's task list and the building tile indicators after any
  // task create/update/delete performed through the shared task modals.
  const refreshTasksAndBuilding = useCallback(() => {
    if (activeApartmentId !== null) void dispatch(fetchApartmentTasks(activeApartmentId))
    if (activeBuilding) void dispatch(fetchBuilding(activeBuilding.id))
  }, [dispatch, activeApartmentId, activeBuilding])

  const handleTaskCreated = () => {
    refreshTasksAndBuilding()
  }

  // Open the full task-detail modal for a reception task card. The reception
  // list DTO is minimal, so fetch the complete task first.
  const handleSelectTask = async (taskId: number) => {
    try {
      const { data } = await api.get<Task>(`/tasks/${taskId}`)
      setSelectedTask(data)
    } catch {
      /* if the task can't be loaded, leave the modal closed */
    }
  }

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
              owner_name: payload.owner_name,
              owner_phone: payload.owner_phone,
              management_company_name: payload.management_company_name,
              management_company_phone: payload.management_company_phone,
              attorneys: payload.attorneys,
              equipment: payload.equipment,
              notes: payload.notes,
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

  // --- Technician visits ---
  const closeTechnicianModal = () => {
    setAddTechnicianOpen(false)
    setEditingTechnicianVisit(null)
  }

  const handleSubmitTechnicianVisit = (payload: TechnicianVisitCreate) => {
    if (editingTechnicianVisit && activeApartmentId !== null) {
      void runSubmit(
        () =>
          dispatch(
            updateTechnicianVisit({
              visitId: editingTechnicianVisit.id,
              apartmentId: activeApartmentId,
              changes: { name: payload.name, role: payload.role, phone: payload.phone, note: payload.note },
            }),
          ).unwrap(),
        closeTechnicianModal,
      )
      return
    }
    void runSubmit(() => dispatch(createTechnicianVisit(payload)).unwrap(), closeTechnicianModal)
  }

  const handleMarkTechnicianLeft = (visitId: number) => {
    if (activeApartmentId === null) return
    void dispatch(markTechnicianLeft({ visitId, apartmentId: activeApartmentId }))
  }

  const handleDeleteTechnicianVisit = (visitId: number) => {
    if (activeApartmentId === null) return
    if (!window.confirm('למחוק את רשומת ביקור הטכנאי?')) return
    void dispatch(deleteTechnicianVisit({ visitId, apartmentId: activeApartmentId }))
  }

  // --- Client visits ---
  const closeClientModal = () => {
    setAddClientOpen(false)
    setEditingClientVisit(null)
  }

  const handleSubmitClientVisit = (payload: ClientVisitCreate) => {
    if (editingClientVisit && activeApartmentId !== null) {
      void runSubmit(
        () =>
          dispatch(
            updateClientVisit({
              visitId: editingClientVisit.id,
              apartmentId: activeApartmentId,
              changes: {
                name: payload.name,
                arrived_at: payload.arrived_at,
                expected_until: payload.expected_until,
                note: payload.note,
              },
            }),
          ).unwrap(),
        closeClientModal,
      )
      return
    }
    void runSubmit(() => dispatch(createClientVisit(payload)).unwrap(), closeClientModal)
  }

  const handleMarkClientLeft = (visitId: number) => {
    if (activeApartmentId === null) return
    void dispatch(markClientLeft({ visitId, apartmentId: activeApartmentId }))
  }

  const handleDeleteClientVisit = (visitId: number) => {
    if (activeApartmentId === null) return
    if (!window.confirm('למחוק את רשומת הגעת הלקוח?')) return
    void dispatch(deleteClientVisit({ visitId, apartmentId: activeApartmentId }))
  }

  // --- Documents ---
  const handleUploadDocument = (file: File, description: string) => {
    if (activeApartmentId === null) return
    void runSubmit(
      () => dispatch(uploadApartmentSharedDocument({ apartmentId: activeApartmentId, file, description })).unwrap(),
      () => setAddDocumentOpen(false),
    )
  }

  const handleDeleteDocument = (documentId: number) => {
    if (activeApartmentId === null) return
    if (!window.confirm('למחוק את המסמך? הפעולה תמחק גם את הקובץ מהאחסון.')) return
    void dispatch(deleteApartmentSharedDocument({ documentId, apartmentId: activeApartmentId }))
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

  // Memoized edit-modal payloads. The 10s live refresh re-renders this page,
  // and an inline `initial={...}` object would get a new reference each render —
  // that would refire each open modal's seeding effect and wipe the user's
  // in-progress edits. Keying the memo on the editing target keeps the
  // reference stable across polls and only rebuilds when the target changes.
  const tenantInitial = useMemo(
    () =>
      editingTenant
        ? {
            name: editingTenant.name,
            phone: editingTenant.phone,
            email: editingTenant.email,
            move_in_date: editingTenant.move_in_date,
          }
        : null,
    [editingTenant],
  )
  const vehicleInitial = useMemo(
    () =>
      editingVehicle
        ? {
            plate: editingVehicle.plate,
            model: editingVehicle.model,
            owner_name: editingVehicle.owner_name,
            parking_spot: editingVehicle.parking_spot,
          }
        : null,
    [editingVehicle],
  )
  const deliveryInitial = useMemo(
    () =>
      editingDelivery
        ? { title: editingDelivery.title, kind: editingDelivery.kind, meta: editingDelivery.meta }
        : null,
    [editingDelivery],
  )
  const technicianInitial = useMemo(
    () =>
      editingTechnicianVisit
        ? {
            name: editingTechnicianVisit.name,
            role: editingTechnicianVisit.role,
            phone: editingTechnicianVisit.phone,
            note: editingTechnicianVisit.note,
          }
        : null,
    [editingTechnicianVisit],
  )
  const clientInitial = useMemo(
    () =>
      editingClientVisit
        ? {
            name: editingClientVisit.name,
            arrived_at: editingClientVisit.arrived_at,
            expected_until: editingClientVisit.expected_until,
            note: editingClientVisit.note,
          }
        : null,
    [editingClientVisit],
  )
  const apartmentInitial = useMemo(
    () =>
      editingApartment
        ? {
            floor: editingApartment.floor,
            unit_number: editingApartment.unit_number,
            label: editingApartment.label,
            is_common_area: editingApartment.is_common_area,
            owner_name: editingApartment.owner_name,
            owner_phone: editingApartment.owner_phone,
            management_company_name: editingApartment.management_company_name,
            management_company_phone: editingApartment.management_company_phone,
            attorneys: editingApartment.attorneys,
            equipment: editingApartment.equipment,
            notes: editingApartment.notes,
          }
        : null,
    [editingApartment],
  )
  const projectInitial = useMemo(
    () => (editingProject ? { name: editingProject.name, description: editingProject.description } : null),
    [editingProject],
  )

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
        {/* TEMP: one-off surface to delete legacy project-less buildings. */}
        {buildings.some((building) => building.project_id === null) && (
          <div
            dir="rtl"
            className="mb-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3"
          >
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300 mb-2">
              בניינים ישנים ללא פרויקט — למחיקה
            </p>
            <ul className="flex flex-col gap-2">
              {buildings
                .filter((building) => building.project_id === null)
                .map((building) => (
                  <li
                    key={building.id}
                    className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2"
                  >
                    <span className="flex-1 text-sm font-bold text-gray-900 dark:text-white">{building.name}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteBuilding(building.id)}
                      className="text-sm font-bold text-white px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 flex items-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                      מחק
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        )}
        <BuildingOverview
          projects={projects}
          selectedProjectId={selectedProjectId}
          buildings={buildings}
          activeBuilding={activeBuilding}
          loading={loadingBuilding}
          canManageBuildings={canManageBuildings}
          onSelectProject={setSelectedProjectId}
          onCreateProject={() => {
            setEditingProject(null)
            setCreateProjectOpen(true)
          }}
          onEditProject={(project) => setEditingProject(project)}
          onDeleteProject={handleDeleteProject}
          onSelectBuilding={handleSelectBuilding}
          onCreateBuilding={() => setCreateBuildingOpen(true)}
          onDeleteBuilding={handleDeleteBuilding}
          onSelectApartment={handleSelectApartment}
          onAddApartment={(floor) => {
            setEditingApartment(null)
            setAddApartmentFloor(floor)
          }}
        />
      </div>

      <ApartmentDetailPanel
        apartment={activeApartment}
        tasks={apartmentTasks}
        loading={loadingApartment}
        onClose={() => dispatch(closeApartment())}
        onAddTask={() => setTaskOpen(true)}
        onSelectTask={(taskId) => void handleSelectTask(taskId)}
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
        onAddTechnicianVisit={() => {
          setEditingTechnicianVisit(null)
          setAddTechnicianOpen(true)
        }}
        onMarkTechnicianLeft={handleMarkTechnicianLeft}
        onEditTechnicianVisit={(visit) => {
          setEditingTechnicianVisit(visit)
          setAddTechnicianOpen(true)
        }}
        onDeleteTechnicianVisit={handleDeleteTechnicianVisit}
        onAddClientVisit={() => {
          setEditingClientVisit(null)
          setAddClientOpen(true)
        }}
        onMarkClientLeft={handleMarkClientLeft}
        onEditClientVisit={(visit) => {
          setEditingClientVisit(visit)
          setAddClientOpen(true)
        }}
        onDeleteClientVisit={handleDeleteClientVisit}
        onAddDocument={() => setAddDocumentOpen(true)}
        onDeleteDocument={handleDeleteDocument}
      />

      <CreateBuildingModal
        isOpen={createBuildingOpen}
        onClose={() => setCreateBuildingOpen(false)}
        projects={projects}
        defaultProjectId={selectedProjectId}
        onSubmit={handleCreateBuilding}
        submitting={submitting}
      />

      <CreateProjectModal
        isOpen={createProjectOpen || editingProject !== null}
        onClose={closeProjectModal}
        initial={projectInitial}
        onSubmit={handleSubmitProject}
        submitting={submitting}
      />

      <CreateTaskModal
        isOpen={taskOpen}
        onClose={() => setTaskOpen(false)}
        users={taskUsers}
        taskLabels={taskLabels}
        projects={projects}
        buildings={buildings}
        loadApartments={loadBuildingApartments}
        defaultProjectId={activeBuilding?.project_id ?? selectedProjectId}
        defaultBuildingId={activeBuilding?.id ?? null}
        defaultApartmentId={activeApartmentId}
        onCreated={handleTaskCreated}
        onLabelsChanged={() => void fetchTaskDirectory()}
      />

      {selectedTask && (
        <TaskDetailModal
          taskId={selectedTask.id}
          initialTask={selectedTask}
          onClose={() => setSelectedTask(null)}
          onTaskUpdated={() => refreshTasksAndBuilding()}
          onTaskDeleted={() => { refreshTasksAndBuilding(); setSelectedTask(null) }}
          onTaskArchived={() => { refreshTasksAndBuilding(); setSelectedTask(null) }}
          onEdit={(task) => { setSelectedTask(null); setEditingTask(task) }}
        />
      )}

      <TaskEditModal
        task={editingTask}
        isOpen={!!editingTask}
        onClose={() => setEditingTask(null)}
        users={taskUsers}
        taskLabels={taskLabels}
        onSaved={() => { refreshTasksAndBuilding(); setEditingTask(null) }}
        onLabelsChanged={() => void fetchTaskDirectory()}
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
        initial={vehicleInitial}
        onSubmit={handleSubmitVehicle}
        submitting={submitting}
      />

      <AddTenantModal
        isOpen={addTenantOpen}
        onClose={closeTenantModal}
        hasCurrentTenant={activeApartment?.current_tenant != null}
        initial={tenantInitial}
        onSubmit={handleSubmitTenant}
        submitting={submitting}
      />

      <AddDeliveryModal
        isOpen={addDeliveryOpen}
        onClose={closeDeliveryModal}
        apartmentId={activeApartmentId}
        initial={deliveryInitial}
        onSubmit={handleSubmitDelivery}
        submitting={submitting}
      />

      <AddTechnicianVisitModal
        isOpen={addTechnicianOpen}
        onClose={closeTechnicianModal}
        apartmentId={activeApartmentId}
        initial={technicianInitial}
        onSubmit={handleSubmitTechnicianVisit}
        submitting={submitting}
      />

      <AddClientVisitModal
        isOpen={addClientOpen}
        onClose={closeClientModal}
        apartmentId={activeApartmentId}
        initial={clientInitial}
        onSubmit={handleSubmitClientVisit}
        submitting={submitting}
      />

      <AddApartmentModal
        isOpen={addApartmentFloor !== null || editingApartment !== null}
        onClose={closeApartmentModal}
        buildingId={activeBuilding?.id ?? null}
        defaultFloor={addApartmentFloor ?? 1}
        initial={apartmentInitial}
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

      <AddApartmentSharedDocumentModal
        isOpen={addDocumentOpen}
        onClose={() => setAddDocumentOpen(false)}
        apartmentId={activeApartmentId}
        onSubmit={handleUploadDocument}
        submitting={submitting}
      />
    </div>
  )
}
