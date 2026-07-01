import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import BuildingReceptionAPI from '../../lib/buildingReceptionApi'
import type {
  ApartmentDetail,
  ApartmentKeyCreate,
  AuthorizedVehicleCreate,
  Building,
  BuildingCreate,
  BuildingListItem,
  DeliveryCreate,
  KeyTransferCreate,
  TenantCreate,
} from '../../types/api'

interface BuildingReceptionState {
  buildings: BuildingListItem[]
  /** Fully-loaded building currently shown in the overview. */
  activeBuilding: Building | null
  /** Fully-loaded apartment currently shown in the side panel. */
  activeApartment: ApartmentDetail | null
  loadingBuildings: boolean
  loadingBuilding: boolean
  loadingApartment: boolean
  error: string | null
}

const initialState: BuildingReceptionState = {
  buildings: [],
  activeBuilding: null,
  activeApartment: null,
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

// ---- Slice ------------------------------------------------------------------

const slice = createSlice({
  name: 'buildingReception',
  initialState,
  reducers: {
    closeApartment(state) {
      state.activeApartment = null
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

      .addCase(fetchApartment.pending, (state) => {
        state.loadingApartment = true
        state.error = null
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
      .addCase(createKey.fulfilled, applyApartment)
      .addCase(transferKey.fulfilled, applyApartment)
      .addCase(createVehicle.fulfilled, applyApartment)
      .addCase(deleteVehicle.fulfilled, applyApartment)
      .addCase(createDelivery.fulfilled, applyApartment)
      .addCase(markDelivered.fulfilled, applyApartment)
  },
})

export const { closeApartment, clearError } = slice.actions
export default slice.reducer
