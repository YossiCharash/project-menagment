import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import api from '../../lib/api'

export interface Project {
  id: number
  name: string
  description?: string | null
  budget_monthly: number
  budget_annual: number
  num_residents?: number | null
  monthly_price_per_apartment?: number | null
  address?: string | null
  city?: string | null
  // @ts-ignore optional backend fields
  is_active?: boolean
  // optional dates
  // @ts-ignore
  start_date?: string | null
  // @ts-ignore
  end_date?: string | null
}

interface ProjectsState {
  items: Project[]
  loading: boolean
  error: string | null
}

const initialState: ProjectsState = { items: [], loading: false, error: null }

export const fetchProjects = createAsyncThunk('projects/fetchAll', async () => {
  const { data } = await api.get<Project[]>('/projects')
  return data
})

export const fetchProjectsWithArchived = createAsyncThunk('projects/fetchAllWithArchived', async (include_archived: boolean | { include_archived?: boolean; only_archived?: boolean }) => {
  const inc = typeof include_archived === 'boolean' ? include_archived : include_archived.include_archived
  const only = typeof include_archived === 'boolean' ? false : (include_archived.only_archived ?? false)
  const { data } = await api.get<Project[]>(`/projects?include_archived=${inc ? 'true' : 'false'}&only_archived=${only ? 'true' : 'false'}`)
  return data
})

export const createProject = createAsyncThunk(
  'projects/create',
  async (payload: Partial<Project>, { rejectWithValue }) => {
    try {
      const { data } = await api.post<Project>('/projects/', payload)
      return data
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.detail ?? 'Create failed')
    }
  }
)

export const updateProject = createAsyncThunk(
  'projects/update',
  async ({ id, changes }: { id: number; changes: Partial<Project> }, { rejectWithValue }) => {
    try {
      const { data } = await api.put<Project>(`/projects/${id}`, changes)
      return data
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.detail ?? 'Update failed')
    }
  }
)

export const hardDeleteProject = createAsyncThunk(
  'projects/hardDelete',
  async ({ id, password }: { id: number; password: string }, { rejectWithValue }) => {
    try {
      await api.delete(`/projects/${id}`, { data: { password } })
      return id
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.detail ?? 'Delete failed')
    }
  }
)

export const archiveProject = createAsyncThunk(
  'projects/archive',
  async (id: number, { rejectWithValue }) => {
    try {
      const { data } = await api.post<Project>(`/projects/${id}/archive`)
      return data
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.detail ?? 'Archive failed')
    }
  }
)

export const restoreProject = createAsyncThunk(
  'projects/restore',
  async (id: number, { rejectWithValue }) => {
    try {
      const { data } = await api.post<Project>(`/projects/${id}/restore`)
      return data
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.detail ?? 'Restore failed')
    }
  }
)

const slice = createSlice({
  name: 'projects',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchProjects.pending, (state) => { state.loading = true; state.error = null })
      .addCase(fetchProjects.fulfilled, (state, action) => { state.loading = false; state.items = action.payload })
      .addCase(fetchProjects.rejected, (state, action) => { state.loading = false; state.error = (action.error.message ?? 'Failed to load') })
      .addCase(fetchProjectsWithArchived.pending, (state) => { state.loading = true; state.error = null })
      .addCase(fetchProjectsWithArchived.fulfilled, (state, action) => { state.loading = false; state.items = action.payload })
      .addCase(fetchProjectsWithArchived.rejected, (state, action) => { state.loading = false; state.error = (action.error.message ?? 'Failed to load') })
      .addCase(createProject.fulfilled, (state, action) => { state.items.unshift(action.payload) })
      .addCase(updateProject.fulfilled, (state, action) => {
        const idx = state.items.findIndex(p => p.id === action.payload.id)
        if (idx >= 0) state.items[idx] = action.payload
      })
      .addCase(hardDeleteProject.fulfilled, (state, action) => {
        state.items = state.items.filter(p => p.id !== action.payload)
      })
      .addCase(archiveProject.fulfilled, (state, action) => {
        const idx = state.items.findIndex(p => p.id === action.payload.id)
        if (idx >= 0) state.items[idx] = action.payload
      })
      .addCase(restoreProject.fulfilled, (state, action) => {
        const idx = state.items.findIndex(p => p.id === action.payload.id)
        if (idx >= 0) state.items[idx] = action.payload
      })
  },
})

export default slice.reducer
