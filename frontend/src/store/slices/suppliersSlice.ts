import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import api from '../../lib/api'

export interface Supplier {
  id: number
  name: string
  contact_email?: string | null
  phone?: string | null
  category?: string | null
  annual_budget?: number | null
  is_active?: boolean
}

interface SuppliersState {
  items: Supplier[]
  loading: boolean
  error: string | null
}

const initialState: SuppliersState = { items: [], loading: false, error: null }

export const fetchSuppliers = createAsyncThunk('suppliers/fetchAll', async () => {
  const { data } = await api.get<Supplier[]>('/suppliers')
  return data
})

export const createSupplier = createAsyncThunk('suppliers/create', async (payload: Partial<Supplier>, { rejectWithValue }) => {
  try { const { data } = await api.post<Supplier>('/suppliers/', payload); return data } catch (e: any) { return rejectWithValue(e.response?.data?.detail ?? 'Create failed') }
})

export const updateSupplier = createAsyncThunk('suppliers/update', async ({ id, changes }: { id: number; changes: Partial<Supplier> }, { rejectWithValue }) => {
  try { const { data } = await api.put<Supplier>(`/suppliers/${id}`, changes); return data } catch (e: any) { return rejectWithValue(e.response?.data?.detail ?? 'Update failed') }
})

export const deleteSupplier = createAsyncThunk('suppliers/delete', async (id: number, { rejectWithValue }) => {
  try { await api.delete(`/suppliers/${id}`); return id } catch (e: any) { return rejectWithValue(e.response?.data?.detail ?? 'Delete failed') }
})

export const uploadSupplierDocument = createAsyncThunk('suppliers/uploadDoc', async ({ id, file, description }: { id: number; file: File; description?: string }, { rejectWithValue }) => {
  try {
    const form = new FormData()
    form.append('file', file)
    if (description && description.trim()) {
      form.append('description', description.trim())
    }
    const { data } = await api.post(`/suppliers/${id}/documents`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
    return { id, ...data }
  } catch (e: any) {
    return rejectWithValue(e.response?.data?.detail ?? 'Upload failed')
  }
})

const slice = createSlice({
  name: 'suppliers',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSuppliers.pending, (state)=>{ state.loading=true; state.error=null })
      .addCase(fetchSuppliers.fulfilled, (state, action)=>{ state.loading=false; state.items=action.payload })
      .addCase(fetchSuppliers.rejected, (state, action)=>{ state.loading=false; state.error=action.error.message ?? 'Failed to load' })
      .addCase(createSupplier.pending, (state)=>{ state.error=null })
      .addCase(createSupplier.fulfilled, (state, action)=>{ state.items.unshift(action.payload); state.error=null })
      .addCase(createSupplier.rejected, (state, action)=>{ state.error=action.payload as string ?? 'Failed to create supplier' })
      .addCase(updateSupplier.fulfilled, (state, action)=>{
        const idx = state.items.findIndex(s => s.id === action.payload.id)
        if (idx>=0) state.items[idx] = action.payload
      })
      .addCase(deleteSupplier.fulfilled, (state, action)=>{ state.items = state.items.filter(s=>s.id!==action.payload) })
  },
})

export default slice.reducer
