/**
 * Tests for CreateProjectModal component
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import CreateProjectModal from '../CreateProjectModal'
import authSlice from '../../store/slices/authSlice'
import projectsSlice from '../../store/slices/projectsSlice'

const createTestStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      auth: authSlice,
      projects: projectsSlice,
    },
    preloadedState: initialState,
  })
}

describe('CreateProjectModal Component', () => {
  const mockOnClose = vi.fn()
  const mockOnSuccess = vi.fn()

  it('renders modal when open', () => {
    const store = createTestStore()
    
    render(
      <Provider store={store}>
        <BrowserRouter>
          <CreateProjectModal
            isOpen={true}
            onClose={mockOnClose}
            onSuccess={mockOnSuccess}
          />
        </BrowserRouter>
      </Provider>
    )

    expect(screen.getByText(/create project/i)).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    const store = createTestStore()
    
    render(
      <Provider store={store}>
        <BrowserRouter>
          <CreateProjectModal
            isOpen={false}
            onClose={mockOnClose}
            onSuccess={mockOnSuccess}
          />
        </BrowserRouter>
      </Provider>
    )

    expect(screen.queryByText(/create project/i)).not.toBeInTheDocument()
  })

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup()
    const store = createTestStore()
    
    render(
      <Provider store={store}>
        <BrowserRouter>
          <CreateProjectModal
            isOpen={true}
            onClose={mockOnClose}
            onSuccess={mockOnSuccess}
          />
        </BrowserRouter>
      </Provider>
    )

    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    await user.click(cancelButton)

    expect(mockOnClose).toHaveBeenCalled()
  })
})
