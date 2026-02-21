import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import api from '../../lib/api'

export interface Permission {
  resource_type: string
  action: string
  source: string
  resource_id?: string
  effect?: string
}

interface PermissionsState {
  permissions: Permission[]
  loading: boolean
  loaded: boolean
  error: string | null
}

const initialState: PermissionsState = {
  permissions: [],
  loading: false,
  loaded: false,
  error: null,
}

export const fetchUserPermissions = createAsyncThunk(
  'permissions/fetchUserPermissions',
  async (userId: number) => {
    const { data } = await api.get<Permission[] | { permissions: Permission[] }>(
      `/iam/users/${userId}/permissions`
    )
    // Backend may return either a direct array or an object with a .permissions field
    if (Array.isArray(data)) {
      return data
    }
    return (data as { permissions: Permission[] }).permissions ?? []
  }
)

const permissionsSlice = createSlice({
  name: 'permissions',
  initialState,
  reducers: {
    clearPermissions(state) {
      state.permissions = []
      state.loaded = false
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUserPermissions.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchUserPermissions.fulfilled, (state, action: PayloadAction<Permission[]>) => {
        state.permissions = action.payload
        state.loading = false
        state.loaded = true
      })
      .addCase(fetchUserPermissions.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message ?? 'Failed to load permissions'
      })
  },
})

export const { clearPermissions } = permissionsSlice.actions
export default permissionsSlice.reducer
