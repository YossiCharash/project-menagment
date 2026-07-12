import { createAsyncThunk, createSlice, isRejected, type PayloadAction } from '@reduxjs/toolkit'
import BuildingReceptionAPI from '../../lib/buildingReceptionApi'
import type {
  ApartmentCreate,
  ApartmentDetail,
  ApartmentTask,
  ApartmentKeyCreate,
  ApartmentKeyUpdate,
  ApartmentUpdate,
  AuthorizedVehicleCreate,
  AuthorizedVehicleUpdate,
  Building,
  BuildingCreate,
  BuildingListItem,
  BuildingProjectCreate,
  BuildingProjectListItem,
  BuildingProjectUpdate,
  DeliveryCreate,
  DeliveryUpdate,
  KeyTransferCreate,
  TechnicianVisitCreate,
  TechnicianVisitUpdate,
  TenantCreate,
  TenantUpdate,
} from '../../types/api'

interface BuildingReceptionState {
  projects: BuildingProjectListItem[]
  buildings: BuildingListItem[]
  /** Fully-loaded building currently shown in the overview. */
  activeBuilding: Building | null
  /** Fully-loaded apartment currently shown in the side panel. */
  activeApartment: ApartmentDetail | null
  /** Tasks linked to the active apartment (loaded alongside it). */
  activeApartmentTasks: ApartmentTask[]
  loadingBuildings: boolean
  loadingBuilding: boolean
  loadingApartment: boolean
  error: string | null
}

const initialState: BuildingReceptionState = {
  projects: [],
  buildings: [],
  activeBuilding: null,
  activeApartment: null,
  activeApartmentTasks: [],
  loadingBuildings: false,
  loadingBuilding: false,
  loadingApartment: false,
  error: null,
}

/**
 * Small helper that funnels every thunk through the same error-unwrapping
 * logic (DRY): rejected thunks always carry a human-readable Hebrew message.
 */
const asMessage = (error: unknown, fallback: string): string => {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' ? detail : fallback
}

// ---- Thunks -----------------------------------------------------------------

export const fetchProjects = createAsyncThunk(
  'buildingReception/fetchProjects',
  async (_: void, { rejectWithValue }) => {
    try {
      return await BuildingReceptionAPI.listProjects()
    } catch (error) {
      return rejectWithValue(asMessage(error, 'טעינת הפרויקטים נכשלה'))
    }
  },
)

export const createProject = createAsyncThunk(
  'buildingReception/createProject',
  async (payload: BuildingProjectCreate, { dispatch, rejectWithValue }) => {
    try {
      const project = await BuildingReceptionAPI.createProject(payload)
      void dispatch(fetchProjects())
      return project
    } catch (error) {
      return rejectWithValue(asMessage(error, 'הקמת הפרויקט נכשלה'))
    }
  },
)

export const updateProject = createAsyncThunk(
  'buildingReception/updateProject',
  async (
    { projectId, changes }: { projectId: number; changes: BuildingProjectUpdate },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const project = await BuildingReceptionAPI.updateProject(projectId, changes)
      void dispatch(fetchProjects())
      return project
    } catch (error) {
      return rejectWithValue(asMessage(error, 'עדכון הפרויקט נכשל'))
    }
  },
)

export const deleteProject = createAsyncThunk(
  'buildingReception/deleteProject',
  async (projectId: number, { dispatch, rejectWithValue }) => {
    try {
      await BuildingReceptionAPI.deleteProject(projectId)
      void dispatch(fetchProjects())
      void dispatch(fetchBuildings())
      return projectId
    } catch (error) {
      return rejectWithValue(asMessage(error, 'מחיקת הפרויקט נכשלה'))
    }
  },
)

export const fetchBuildings = createAsyncThunk(
  'buildingReception/fetchBuildings',
  async (_: void, { rejectWithValue }) => {
    try {
      return await BuildingReceptionAPI.listBuildings()
    } catch (error) {
      return rejectWithValue(asMessage(error, 'טעינת רשימת הבניינים נכשלה'))
    }
  },
)

export const fetchBuilding = createAsyncThunk(
  'buildingReception/fetchBuilding',
  async (buildingId: number, { rejectWithValue }) => {
    try {
      return await BuildingReceptionAPI.getBuilding(buildingId)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'טעינת נתוני הבניין נכשלה'))
    }
  },
)

export const createBuilding = createAsyncThunk(
  'buildingReception/createBuilding',
  async (payload: BuildingCreate, { rejectWithValue }) => {
    try {
      return await BuildingReceptionAPI.createBuilding(payload)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'הקמת הבניין נכשלה'))
    }
  },
)

/**
 * Permanently delete a building and everything under it. Refreshes both the
 * buildings list and the project tabs so the counts stay in sync.
 */
export const deleteBuilding = createAsyncThunk(
  'buildingReception/deleteBuilding',
  async (buildingId: number, { dispatch, rejectWithValue }) => {
    try {
      await BuildingReceptionAPI.deleteBuilding(buildingId)
      void dispatch(fetchBuildings())
      void dispatch(fetchProjects())
      return buildingId
    } catch (error) {
      return rejectWithValue(asMessage(error, 'מחיקת הבניין נכשלה'))
    }
  },
)

export const fetchApartment = createAsyncThunk(
  'buildingReception/fetchApartment',
  async (apartmentId: number, { rejectWithValue }) => {
    try {
      return await BuildingReceptionAPI.getApartment(apartmentId)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'טעינת פרטי הדירה נכשלה'))
    }
  },
)

export const fetchApartmentTasks = createAsyncThunk(
  'buildingReception/fetchApartmentTasks',
  async (apartmentId: number, { rejectWithValue }) => {
    try {
      return await BuildingReceptionAPI.listApartmentTasks(apartmentId)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'טעינת משימות הדירה נכשלה'))
    }
  },
)

export const swapTenant = createAsyncThunk(
  'buildingReception/swapTenant',
  async ({ apartmentId, payload }: { apartmentId: number; payload: TenantCreate }, { rejectWithValue }) => {
    try {
      await BuildingReceptionAPI.setTenant(apartmentId, payload)
      return await BuildingReceptionAPI.getApartment(apartmentId)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'החלפת הדייר נכשלה'))
    }
  },
)

export const createKey = createAsyncThunk(
  'buildingReception/createKey',
  async (payload: ApartmentKeyCreate, { rejectWithValue }) => {
    try {
      await BuildingReceptionAPI.createKey(payload)
      return await BuildingReceptionAPI.getApartment(payload.apartment_id)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'יצירת המפתח נכשלה'))
    }
  },
)

export const transferKey = createAsyncThunk(
  'buildingReception/transferKey',
  async (
    { keyId, apartmentId, payload }: { keyId: number; apartmentId: number; payload: KeyTransferCreate },
    { rejectWithValue },
  ) => {
    try {
      await BuildingReceptionAPI.transferKey(keyId, payload)
      return await BuildingReceptionAPI.getApartment(apartmentId)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'העברת המפתח נכשלה'))
    }
  },
)

export const createVehicle = createAsyncThunk(
  'buildingReception/createVehicle',
  async (payload: AuthorizedVehicleCreate, { rejectWithValue }) => {
    try {
      await BuildingReceptionAPI.createVehicle(payload)
      return await BuildingReceptionAPI.getApartment(payload.apartment_id)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'הוספת הרכב נכשלה'))
    }
  },
)

export const deleteVehicle = createAsyncThunk(
  'buildingReception/deleteVehicle',
  async ({ vehicleId, apartmentId }: { vehicleId: number; apartmentId: number }, { rejectWithValue }) => {
    try {
      await BuildingReceptionAPI.deleteVehicle(vehicleId)
      return await BuildingReceptionAPI.getApartment(apartmentId)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'מחיקת הרכב נכשלה'))
    }
  },
)

export const createDelivery = createAsyncThunk(
  'buildingReception/createDelivery',
  async (payload: DeliveryCreate, { rejectWithValue }) => {
    try {
      await BuildingReceptionAPI.createDelivery(payload)
      return await BuildingReceptionAPI.getApartment(payload.apartment_id)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'הוספת המשלוח נכשלה'))
    }
  },
)

export const markDelivered = createAsyncThunk(
  'buildingReception/markDelivered',
  async ({ deliveryId, apartmentId }: { deliveryId: number; apartmentId: number }, { rejectWithValue }) => {
    try {
      await BuildingReceptionAPI.markDelivered(deliveryId)
      return await BuildingReceptionAPI.getApartment(apartmentId)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'סימון המשלוח כנמסר נכשל'))
    }
  },
)

export const createTechnicianVisit = createAsyncThunk(
  'buildingReception/createTechnicianVisit',
  async (payload: TechnicianVisitCreate, { rejectWithValue }) => {
    try {
      await BuildingReceptionAPI.createTechnicianVisit(payload)
      return await BuildingReceptionAPI.getApartment(payload.apartment_id)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'רישום כניסת הטכנאי נכשל'))
    }
  },
)

export const markTechnicianLeft = createAsyncThunk(
  'buildingReception/markTechnicianLeft',
  async ({ visitId, apartmentId }: { visitId: number; apartmentId: number }, { rejectWithValue }) => {
    try {
      await BuildingReceptionAPI.markTechnicianLeft(visitId)
      return await BuildingReceptionAPI.getApartment(apartmentId)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'רישום יציאת הטכנאי נכשל'))
    }
  },
)

export const createApartment = createAsyncThunk(
  'buildingReception/createApartment',
  async (payload: ApartmentCreate, { rejectWithValue }) => {
    try {
      await BuildingReceptionAPI.createApartment(payload)
      return await BuildingReceptionAPI.getBuilding(payload.building_id)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'הוספת הדירה נכשלה'))
    }
  },
)

export const deleteApartment = createAsyncThunk(
  'buildingReception/deleteApartment',
  async ({ apartmentId, buildingId }: { apartmentId: number; buildingId: number }, { rejectWithValue }) => {
    try {
      await BuildingReceptionAPI.deleteApartment(apartmentId)
      return await BuildingReceptionAPI.getBuilding(buildingId)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'מחיקת הדירה נכשלה'))
    }
  },
)

export const deleteTenant = createAsyncThunk(
  'buildingReception/deleteTenant',
  async ({ tenantId, apartmentId }: { tenantId: number; apartmentId: number }, { rejectWithValue }) => {
    try {
      await BuildingReceptionAPI.deleteTenant(tenantId)
      return await BuildingReceptionAPI.getApartment(apartmentId)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'מחיקת הדייר נכשלה'))
    }
  },
)

export const deleteKey = createAsyncThunk(
  'buildingReception/deleteKey',
  async ({ keyId, apartmentId }: { keyId: number; apartmentId: number }, { rejectWithValue }) => {
    try {
      await BuildingReceptionAPI.deleteKey(keyId)
      return await BuildingReceptionAPI.getApartment(apartmentId)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'מחיקת המפתח נכשלה'))
    }
  },
)

export const deleteDelivery = createAsyncThunk(
  'buildingReception/deleteDelivery',
  async ({ deliveryId, apartmentId }: { deliveryId: number; apartmentId: number }, { rejectWithValue }) => {
    try {
      await BuildingReceptionAPI.deleteDelivery(deliveryId)
      return await BuildingReceptionAPI.getApartment(apartmentId)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'מחיקת המשלוח נכשלה'))
    }
  },
)

export const deleteTechnicianVisit = createAsyncThunk(
  'buildingReception/deleteTechnicianVisit',
  async ({ visitId, apartmentId }: { visitId: number; apartmentId: number }, { rejectWithValue }) => {
    try {
      await BuildingReceptionAPI.deleteTechnicianVisit(visitId)
      return await BuildingReceptionAPI.getApartment(apartmentId)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'מחיקת ביקור הטכנאי נכשלה'))
    }
  },
)

export const updateApartment = createAsyncThunk(
  'buildingReception/updateApartment',
  async ({ apartmentId, changes }: { apartmentId: number; changes: ApartmentUpdate }, { rejectWithValue }) => {
    try {
      return await BuildingReceptionAPI.updateApartment(apartmentId, changes)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'עדכון הדירה נכשל'))
    }
  },
)

export const updateTenant = createAsyncThunk(
  'buildingReception/updateTenant',
  async (
    { tenantId, apartmentId, changes }: { tenantId: number; apartmentId: number; changes: TenantUpdate },
    { rejectWithValue },
  ) => {
    try {
      await BuildingReceptionAPI.updateTenant(tenantId, changes)
      return await BuildingReceptionAPI.getApartment(apartmentId)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'עדכון הדייר נכשל'))
    }
  },
)

export const updateKey = createAsyncThunk(
  'buildingReception/updateKey',
  async (
    { keyId, apartmentId, changes }: { keyId: number; apartmentId: number; changes: ApartmentKeyUpdate },
    { rejectWithValue },
  ) => {
    try {
      await BuildingReceptionAPI.updateKey(keyId, changes)
      return await BuildingReceptionAPI.getApartment(apartmentId)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'עדכון המפתח נכשל'))
    }
  },
)

export const updateVehicle = createAsyncThunk(
  'buildingReception/updateVehicle',
  async (
    { vehicleId, apartmentId, changes }: { vehicleId: number; apartmentId: number; changes: AuthorizedVehicleUpdate },
    { rejectWithValue },
  ) => {
    try {
      await BuildingReceptionAPI.updateVehicle(vehicleId, changes)
      return await BuildingReceptionAPI.getApartment(apartmentId)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'עדכון הרכב נכשל'))
    }
  },
)

export const updateDelivery = createAsyncThunk(
  'buildingReception/updateDelivery',
  async (
    { deliveryId, apartmentId, changes }: { deliveryId: number; apartmentId: number; changes: DeliveryUpdate },
    { rejectWithValue },
  ) => {
    try {
      await BuildingReceptionAPI.updateDelivery(deliveryId, changes)
      return await BuildingReceptionAPI.getApartment(apartmentId)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'עדכון המשלוח נכשל'))
    }
  },
)

export const updateTechnicianVisit = createAsyncThunk(
  'buildingReception/updateTechnicianVisit',
  async (
    { visitId, apartmentId, changes }: { visitId: number; apartmentId: number; changes: TechnicianVisitUpdate },
    { rejectWithValue },
  ) => {
    try {
      await BuildingReceptionAPI.updateTechnicianVisit(visitId, changes)
      return await BuildingReceptionAPI.getApartment(apartmentId)
    } catch (error) {
      return rejectWithValue(asMessage(error, 'עדכון ביקור הטכנאי נכשל'))
    }
  },
)

// ---- Slice ------------------------------------------------------------------

const slice = createSlice({
  name: 'buildingReception',
  initialState,
  reducers: {
    closeApartment(state) {
      state.activeApartment = null
      state.activeApartmentTasks = []
    },
    clearActiveBuilding(state) {
      state.activeBuilding = null
      state.activeApartment = null
      state.activeApartmentTasks = []
    },
    clearError(state) {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    // Every apartment-mutating thunk resolves to a fresh ApartmentDetail, so we
    // share one fulfilled handler across all of them (DRY / Open-Closed).
    const applyApartment = (state: BuildingReceptionState, action: PayloadAction<ApartmentDetail>) => {
      state.activeApartment = action.payload
      state.error = null
    }

    builder
      .addCase(fetchProjects.fulfilled, (state, action) => {
        state.projects = action.payload
      })

      .addCase(fetchBuildings.pending, (state) => {
        state.loadingBuildings = true
        state.error = null
      })
      .addCase(fetchBuildings.fulfilled, (state, action) => {
        state.loadingBuildings = false
        state.buildings = action.payload
      })
      .addCase(fetchBuildings.rejected, (state, action) => {
        state.loadingBuildings = false
        state.error = action.payload as string
      })

      .addCase(fetchBuilding.pending, (state) => {
        state.loadingBuilding = true
        state.error = null
      })
      .addCase(fetchBuilding.fulfilled, (state, action) => {
        state.loadingBuilding = false
        state.activeBuilding = action.payload
      })
      .addCase(fetchBuilding.rejected, (state, action) => {
        state.loadingBuilding = false
        state.error = action.payload as string
      })

      .addCase(createBuilding.fulfilled, (state, action) => {
        state.activeBuilding = action.payload
        state.buildings.unshift({
          id: action.payload.id,
          name: action.payload.name,
          address: action.payload.address,
          compound_name: action.payload.compound_name,
          project_id: action.payload.project_id,
          floors_count: action.payload.floors_count,
          units_per_floor: action.payload.units_per_floor,
          has_common_areas: action.payload.has_common_areas,
          created_at: action.payload.created_at,
          apartments_count: action.payload.apartments.length,
        })
        state.error = null
      })
      .addCase(createBuilding.rejected, (state, action) => {
        state.error = action.payload as string
      })

      .addCase(deleteBuilding.fulfilled, (state, action) => {
        state.buildings = state.buildings.filter((building) => building.id !== action.payload)
        // Drop the open building/apartment if they belonged to the deleted one.
        if (state.activeBuilding?.id === action.payload) {
          state.activeBuilding = null
          state.activeApartment = null
          state.activeApartmentTasks = []
        }
        state.error = null
      })

      .addCase(fetchApartment.pending, (state) => {
        state.loadingApartment = true
        state.error = null
        state.activeApartmentTasks = []
      })
      .addCase(fetchApartmentTasks.fulfilled, (state, action) => {
        state.activeApartmentTasks = action.payload
      })
      .addCase(fetchApartment.fulfilled, (state, action) => {
        state.loadingApartment = false
        state.activeApartment = action.payload
      })
      .addCase(fetchApartment.rejected, (state, action) => {
        state.loadingApartment = false
        state.error = action.payload as string
      })

      .addCase(swapTenant.fulfilled, applyApartment)
      .addCase(deleteTenant.fulfilled, applyApartment)
      .addCase(createKey.fulfilled, applyApartment)
      .addCase(transferKey.fulfilled, applyApartment)
      .addCase(deleteKey.fulfilled, applyApartment)
      .addCase(createVehicle.fulfilled, applyApartment)
      .addCase(deleteVehicle.fulfilled, applyApartment)
      .addCase(createDelivery.fulfilled, applyApartment)
      .addCase(markDelivered.fulfilled, applyApartment)
      .addCase(deleteDelivery.fulfilled, applyApartment)
      .addCase(updateTenant.fulfilled, applyApartment)
      .addCase(updateKey.fulfilled, applyApartment)
      .addCase(updateVehicle.fulfilled, applyApartment)
      .addCase(updateDelivery.fulfilled, applyApartment)
      .addCase(createTechnicianVisit.fulfilled, applyApartment)
      .addCase(markTechnicianLeft.fulfilled, applyApartment)
      .addCase(updateTechnicianVisit.fulfilled, applyApartment)
      .addCase(deleteTechnicianVisit.fulfilled, applyApartment)
      .addCase(updateApartment.fulfilled, applyApartment)

      .addCase(createApartment.fulfilled, (state, action) => {
        state.activeBuilding = action.payload
        state.error = null
      })
      .addCase(deleteApartment.fulfilled, (state, action) => {
        state.activeBuilding = action.payload
        state.activeApartment = null
        state.error = null
      })

      // Any rejected building-reception thunk (create/update/delete/transfer)
      // surfaces its Hebrew message so the page's error banner can show it.
      .addMatcher(isRejected, (state, action) => {
        if (!action.type.startsWith('buildingReception/')) return
        state.error = (action.payload as string) || action.error?.message || 'הפעולה נכשלה'
      })
  },
})

export const { closeApartment, clearActiveBuilding, clearError } = slice.actions
export default slice.reducer
