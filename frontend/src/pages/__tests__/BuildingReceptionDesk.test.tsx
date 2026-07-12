/**
 * Tests for the Building Reception Desk page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import BuildingReceptionDesk from '../BuildingReceptionDesk'
import buildingReception from '../../store/slices/buildingReceptionSlice'

const buildingListItem = {
  id: 1,
  name: 'בניין A',
  address: 'יערות ישראל, מודיעין',
  compound_name: 'מתחם יערות',
  project_id: 5,
  floors_count: 1,
  units_per_floor: 2,
  has_common_areas: false,
  created_at: '2024-01-01T00:00:00',
  apartments_count: 2,
}

const building = {
  ...buildingListItem,
  apartments: [
    {
      id: 11,
      building_id: 1,
      floor: 1,
      unit_number: '101',
      label: null,
      is_common_area: false,
      created_at: '2024-01-01T00:00:00',
      current_tenant: null,
      keys_count: 0,
      vehicles_count: 0,
      pending_deliveries_count: 0,
      open_tasks_count: 0,
    },
  ],
}

// Mock the transport layer so the slice thunks resolve without real HTTP.
vi.mock('../../lib/buildingReceptionApi', () => {
  const api = {
    listBuildings: vi.fn(),
    getBuilding: vi.fn(),
    createBuilding: vi.fn(),
    updateBuilding: vi.fn(),
    getApartment: vi.fn(),
    listTaskAssignees: vi.fn(),
    createTask: vi.fn(),
    listProjects: vi.fn(),
  }
  return { default: api, BuildingReceptionAPI: api }
})

import BuildingReceptionAPI from '../../lib/buildingReceptionApi'

const mockedApi = BuildingReceptionAPI as unknown as {
  listBuildings: ReturnType<typeof vi.fn>
  getBuilding: ReturnType<typeof vi.fn>
  createBuilding: ReturnType<typeof vi.fn>
  updateBuilding: ReturnType<typeof vi.fn>
  getApartment: ReturnType<typeof vi.fn>
  listTaskAssignees: ReturnType<typeof vi.fn>
  createTask: ReturnType<typeof vi.fn>
  listProjects: ReturnType<typeof vi.fn>
}

const renderPage = () => {
  const store = configureStore({ reducer: { buildingReception } })
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <BuildingReceptionDesk />
      </BrowserRouter>
    </Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.listProjects.mockResolvedValue([
    { id: 5, name: 'בדיקה', description: null, created_at: '2024-01-01T00:00:00', buildings_count: 1 },
  ])
  mockedApi.listBuildings.mockResolvedValue([buildingListItem])
  mockedApi.getBuilding.mockResolvedValue(building)
  mockedApi.createBuilding.mockResolvedValue({ ...building, id: 2, name: 'בניין חדש' })
  mockedApi.listTaskAssignees.mockResolvedValue([])
})

describe('BuildingReceptionDesk', () => {
  it('renders the desk header and building overview', async () => {
    renderPage()
    expect(screen.getByText('דלפק הבניין')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/מבט-על מתחם/)).toBeInTheDocument()
    })
    expect(mockedApi.listBuildings).toHaveBeenCalled()
  })

  it('clears the building grid when an empty project is selected', async () => {
    mockedApi.listProjects.mockResolvedValue([
      { id: 5, name: 'בדיקה', description: null, created_at: '2024-01-01T00:00:00', buildings_count: 1 },
      { id: 6, name: 'ריק', description: null, created_at: '2024-01-01T00:00:00', buildings_count: 0 },
    ])
    renderPage()
    // The first project (with the building) is selected by default and opens it.
    await waitFor(() => expect(mockedApi.getBuilding).toHaveBeenCalled())
    await screen.findByText(/מבט-על מתחם/)

    fireEvent.click(screen.getByText('ריק'))

    await waitFor(() => {
      expect(screen.getByText(/אין בניינים בפרויקט/)).toBeInTheDocument()
    })
  })

  it('assigns a project-less building to a project instead of hiding it forever', async () => {
    const orphan = { ...buildingListItem, id: 9, name: 'בניין יתום', project_id: null }
    mockedApi.listBuildings.mockResolvedValue([buildingListItem, orphan])
    mockedApi.updateBuilding.mockResolvedValue({ ...orphan, project_id: 5, apartments: [] })
    renderPage()

    // The orphan is surfaced in the recovery panel with an "שייך" action.
    const assignButton = await screen.findByRole('button', { name: 'שייך' })
    fireEvent.click(assignButton)

    await waitFor(() => {
      expect(mockedApi.updateBuilding).toHaveBeenCalledWith(9, { project_id: 5 })
    })
  })

  it('creates a building through the wizard', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.getBuilding).toHaveBeenCalled())

    fireEvent.click(screen.getByText('בניין'))
    const nameInput = await screen.findByPlaceholderText('לדוגמה: בניין D')
    fireEvent.change(nameInput, { target: { value: 'בניין חדש' } })
    fireEvent.click(screen.getByText('הקם בניין'))

    await waitFor(() => {
      expect(mockedApi.createBuilding).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'בניין חדש' }),
      )
    })
  })
})
