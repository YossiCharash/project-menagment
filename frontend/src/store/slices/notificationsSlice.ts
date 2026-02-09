import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import api from '../../lib/api'

interface NotificationsState {
  unreadCount: number
}

const initialState: NotificationsState = {
  unreadCount: 0,
}

export const fetchUnreadCount = createAsyncThunk(
  'notifications/fetchUnreadCount',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get<{ count: number }>('/notifications/unread-count')
      return data.count
    } catch {
      return rejectWithValue(0)
    }
  }
)

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    setUnreadCount(state, action: { payload: number }) {
      state.unreadCount = action.payload
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchUnreadCount.fulfilled, (state, action) => {
      state.unreadCount = action.payload
    })
    builder.addCase(fetchUnreadCount.rejected, (state) => {
      state.unreadCount = 0
    })
  },
})

export const { setUnreadCount } = notificationsSlice.actions
export default notificationsSlice.reducer
