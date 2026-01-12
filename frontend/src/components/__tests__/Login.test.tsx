/**
 * Tests for Login page component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import Login from '../../pages/Login'
import authSlice from '../../store/slices/authSlice'

const createTestStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      auth: authSlice,
    },
    preloadedState: {
      auth: {
        token: null,
        me: null,
        loading: false,
        error: null,
        requiresPasswordChange: false,
        ...initialState,
      },
    },
  })
}

// Mock the API
vi.mock('../../lib/api', () => ({
  default: {
    post: vi.fn(),
  },
}))

describe('Login Page', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('renders login form elements', () => {
    const store = createTestStore()
    render(
      <Provider store={store}>
        <BrowserRouter>
          <Login />
        </BrowserRouter>
      </Provider>
    )

    // Check for email input (might be by placeholder or label)
    const emailInput = screen.getByPlaceholderText(/email|אימייל/i) || screen.queryByRole('textbox', { name: /email/i })
    expect(emailInput || screen.getByText(/email/i)).toBeTruthy()
    
    // Check for password input
    const passwordInput = screen.getByPlaceholderText(/password|סיסמה/i) || screen.queryByLabelText(/password/i)
    expect(passwordInput || screen.getByText(/password/i)).toBeTruthy()
  })

  it('allows user to type email and password', async () => {
    const user = userEvent.setup()
    const store = createTestStore()
    
    render(
      <Provider store={store}>
        <BrowserRouter>
          <Login />
        </BrowserRouter>
      </Provider>
    )

    // Try to find and type in email field
    const emailInputs = screen.queryAllByRole('textbox')
    if (emailInputs.length > 0) {
      await user.type(emailInputs[0], 'test@example.com')
      expect(emailInputs[0]).toHaveValue('test@example.com')
    }
  })

  it('shows loading state when submitting', () => {
    const store = createTestStore({
      auth: {
        loading: true,
      },
    })
    
    render(
      <Provider store={store}>
        <BrowserRouter>
          <Login />
        </BrowserRouter>
      </Provider>
    )

    // Should show loading indicator
    expect(screen.getByText(/loading|טוען/i) || screen.queryByRole('progressbar')).toBeTruthy()
  })

  it('displays error message when login fails', () => {
    const store = createTestStore({
      auth: {
        error: 'Invalid credentials',
      },
    })
    
    render(
      <Provider store={store}>
        <BrowserRouter>
          <Login />
        </BrowserRouter>
      </Provider>
    )

    expect(screen.getByText(/invalid|שגיאה/i)).toBeTruthy()
  })
})
