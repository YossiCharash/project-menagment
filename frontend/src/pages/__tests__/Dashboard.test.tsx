/**
 * Tests for Dashboard page
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import Dashboard from '../Dashboard'
import authSlice from '../../store/slices/authSlice'
import projectsSlice from '../../store/slices/projectsSlice'

const createTestStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      auth: authSlice,
      projects: projectsSlice,
    },
    preloadedState: {
      auth: {
        token: 'test-token',
        me: {
          id: 1,
          email: 'test@example.com',
          role: 'Admin',
        },
        loading: false,
        requiresPasswordChange: false,
      },
      ...initialState,
    },
  })
}

// Mock API calls
vi.mock('../../lib/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

describe('Dashboard Page', () => {
  it('renders dashboard when authenticated', async () => {
    const store = createTestStore()
    
    render(
      <Provider store={store}>
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      </Provider>
    )

    // Wait for dashboard to load
    await waitFor(() => {
      expect(screen.getByText(/dashboard/i)).toBeInTheDocument()
    })
  })

  it('displays loading state initially', () => {
    const store = createTestStore({
      projects: {
        loading: true,
        projects: [],
      },
    })
    
    render(
      <Provider store={store}>
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      </Provider>
    )

    // Should show loading indicator
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })
})
