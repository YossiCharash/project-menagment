import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import api from '../../lib/api'

interface CurrentUser {
  id: number
  email: string
  full_name: string
  role: 'Admin' | 'Member'
  group_id?: number
  is_active: boolean
}

interface AuthState {
  token: string | null
  loading: boolean
  error: string | null
  registered: boolean
  me: CurrentUser | null
  requiresPasswordChange: boolean
}

// Helper functions for caching user data
const CACHE_KEY_USER = 'cached_user'
const CACHE_KEY_REQUIRES_PASSWORD_CHANGE = 'requires_password_change'

const getCachedUser = (): CurrentUser | null => {
  try {
    const cached = localStorage.getItem(CACHE_KEY_USER)
    if (cached) {
      return JSON.parse(cached) as CurrentUser
    }
  } catch (e) {
    console.error('Failed to parse cached user data:', e)
  }
  return null
}

const saveCachedUser = (user: CurrentUser | null) => {
  if (user) {
    localStorage.setItem(CACHE_KEY_USER, JSON.stringify(user))
  } else {
    localStorage.removeItem(CACHE_KEY_USER)
  }
}

const getCachedRequiresPasswordChange = (): boolean => {
  try {
    const cached = localStorage.getItem(CACHE_KEY_REQUIRES_PASSWORD_CHANGE)
    return cached === 'true'
  } catch (e) {
    return false
  }
}

const saveCachedRequiresPasswordChange = (requires: boolean) => {
  if (requires) {
    localStorage.setItem(CACHE_KEY_REQUIRES_PASSWORD_CHANGE, 'true')
  } else {
    localStorage.removeItem(CACHE_KEY_REQUIRES_PASSWORD_CHANGE)
  }
}

const initialState: AuthState = { 
  token: localStorage.getItem('token'), 
  loading: false, 
  error: null, 
  registered: false, 
  me: getCachedUser(), // Restore user data from cache
  requiresPasswordChange: getCachedRequiresPasswordChange()
}

export const login = createAsyncThunk(
  'auth/login',
  async (payload: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const { data } = await api.post('/auth/login', {
        email: payload.email,
        password: payload.password
      })
      return {
        token: data.access_token as string,
        requires_password_change: data.requires_password_change || false
      }
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.detail ?? 'Login failed')
    }
  }
)

export const register = createAsyncThunk(
  'auth/register',
  async (payload: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const form = new URLSearchParams()
      form.append('username', payload.email)
      form.append('password', payload.password)
      await api.post('/auth/register', form)
      return true
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.detail ?? 'Register failed')
    }
  }
)

export const registerAdmin = createAsyncThunk(
  'auth/registerAdmin',
  async (payload: { email: string; full_name: string; password: string }, { rejectWithValue, dispatch }) => {
    try {
      // First try to register as super admin (if no admin exists)
      // If that fails with 403, try regular admin registration (requires existing admin)
      let data
      try {
        data = (await api.post('/auth/register-super-admin', payload)).data
      } catch (superAdminError: any) {
        // If super admin registration fails because admin exists, try regular admin registration
        if (superAdminError.response?.status === 403) {
          // axios interceptor will automatically add the token from localStorage
          data = (await api.post('/auth/register-admin', payload)).data
        } else {
          throw superAdminError
        }
      }
      
      // Auto login after successful registration
      const loginResult = await dispatch(login({ 
        email: payload.email, 
        password: payload.password 
      }))
      
      if (loginResult.type === 'auth/login/fulfilled') {
        return data
      } else {
        throw new Error('Registration successful but auto-login failed')
      }
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.detail ?? 'Admin registration failed')
    }
  }
)

export const registerMember = createAsyncThunk(
  'auth/registerMember',
  async (payload: { email: string; full_name: string; password: string; group_id: number }, { rejectWithValue }) => {
    try {
      // axios interceptor will automatically add the token from localStorage
      const { data } = await api.post('/auth/register-member', payload)
      return data
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.detail ?? 'Member registration failed')
    }
  }
)

export const fetchMe = createAsyncThunk('auth/fetchMe', async (_, { rejectWithValue, dispatch }) => {
  try {
    // axios interceptor will automatically add the token from localStorage
    const { data } = await api.get<CurrentUser>('/auth/profile')
    return data
  } catch (e: any) {
    // If 401, clear token and redirect
    if (e.response?.status === 401) {
      dispatch(logout())
      // Save current location to redirect back after login
      const currentPath = window.location.pathname + window.location.search
      if (currentPath !== '/login' && currentPath !== '/register') {
        localStorage.setItem('redirectAfterLogin', currentPath)
      }
      window.location.href = '/login'
    }
    return rejectWithValue(e.response?.data?.detail ?? 'Failed to load user')
  }
})

const slice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      state.token = null
      state.me = null
      state.requiresPasswordChange = false
      localStorage.removeItem('token')
      saveCachedUser(null) // Clear cached user data
      saveCachedRequiresPasswordChange(false)
    },
    clearPasswordChangeRequirement(state) {
      state.requiresPasswordChange = false
      saveCachedRequiresPasswordChange(false)
    },
    clearAuthState(state){
      state.error = null
      state.registered = false
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false
        if (typeof action.payload === 'string') {
          // Backward compatibility
          state.token = action.payload
          localStorage.setItem('token', action.payload)
        } else {
          state.token = action.payload.token
          state.requiresPasswordChange = action.payload.requires_password_change || false
          localStorage.setItem('token', action.payload.token)
          saveCachedRequiresPasswordChange(state.requiresPasswordChange)
        }
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false
        state.error = (action.payload as string) ?? 'Login failed'
      })
      .addCase(register.pending, (state) => {
        state.loading = true
        state.error = null
        state.registered = false
      })
      .addCase(register.fulfilled, (state) => {
        state.loading = false
        state.registered = true
      })
      .addCase(register.rejected, (state, action) => {
        state.loading = false
        state.error = (action.payload as string) ?? 'Register failed'
        state.registered = false
      })
      .addCase(fetchMe.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.loading = false
        state.me = action.payload
        saveCachedUser(action.payload) // Cache user data
      })
      .addCase(fetchMe.rejected, (state, action) => {
        state.loading = false
        // Do not clear token on transient errors; allow app to stay authenticated
        state.error = (action.payload as string) ?? 'Failed to load user'
      })
      .addCase(registerAdmin.pending, (state) => {
        state.loading = true
        state.error = null
        state.registered = false
      })
      .addCase(registerAdmin.fulfilled, (state) => {
        state.loading = false
        state.registered = true
      })
      .addCase(registerAdmin.rejected, (state, action) => {
        state.loading = false
        state.error = (action.payload as string) ?? 'Admin registration failed'
        state.registered = false
      })
      .addCase(registerMember.pending, (state) => {
        state.loading = true
        state.error = null
        state.registered = false
      })
      .addCase(registerMember.fulfilled, (state) => {
        state.loading = false
        state.registered = true
      })
      .addCase(registerMember.rejected, (state, action) => {
        state.loading = false
        state.error = (action.payload as string) ?? 'Member registration failed'
        state.registered = false
      })
  },
})

export const { logout, clearAuthState, clearPasswordChangeRequirement } = slice.actions
export default slice.reducer
