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
import auth from '../../store/slices/authSlice'

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
      current_tenant: {
        id: 71,
        apartment_id: 11,
        name: 'דייר נוכחי',
        phone: null,
        email: null,
        move_in_date: null,
        move_out_date: null,
        is_current: true,
        created_at: '2024-01-01T00:00:00',
      },
      has_active_client_visit: false,
      keys_count: 0,
      keys_in_desk_count: 0,
      keys_out_count: 0,
      vehicles_count: 0,
      pending_deliveries_count: 0,
      open_tasks_count: 0,
    },
  ],
}

// Full ApartmentDetail returned when the side panel opens. Occupancy reads
// מאוכלסת from the current tenant; a client is also present so the לקוחות tab
// has a row.
const apartmentDetail = {
  ...building.apartments[0],
  has_active_client_visit: true,
  tenants: [building.apartments[0].current_tenant],
  keys: [],
  vehicles: [],
  deliveries: [],
  technician_visits: [],
  client_visits: [
    {
      id: 91,
      apartment_id: 11,
      name: 'לקוח בדיקה',
      arrived_at: '2026-07-13T09:00:00',
      expected_until: null,
      note: null,
      status: 'present',
      left_at: null,
      created_at: '2026-07-13T09:00:00',
    },
  ],
  activities: [],
  documents: [],
}

// Mock the transport layer so the slice thunks resolve without real HTTP.
vi.mock('../../lib/buildingReceptionApi', () => {
  const api = {
    listBuildings: vi.fn(),
    getBuilding: vi.fn(),
    createBuilding: vi.fn(),
    deleteBuilding: vi.fn(),
    getApartment: vi.fn(),
    listApartmentTasks: vi.fn(),
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
  deleteBuilding: ReturnType<typeof vi.fn>
  getApartment: ReturnType<typeof vi.fn>
  listApartmentTasks: ReturnType<typeof vi.fn>
  listTaskAssignees: ReturnType<typeof vi.fn>
  createTask: ReturnType<typeof vi.fn>
  listProjects: ReturnType<typeof vi.fn>
}

const renderPage = (role: 'Admin' | 'Member' = 'Admin') => {
  // The desk gates building/project management on an Admin role, so the store
  // must expose the current user's role for the create/delete controls.
  const store = configureStore({
    reducer: { buildingReception, auth },
    preloadedState: {
      auth: {
        token: 'test-token',
        loading: false,
        error: null,
        registered: false,
        me: {
          id: 1,
          email: 'user@test.com',
          full_name: 'Test User',
          role,
          is_active: true,
        },
        requiresPasswordChange: false,
      },
    },
  })
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
  mockedApi.getApartment.mockResolvedValue(apartmentDetail)
  mockedApi.listApartmentTasks.mockResolvedValue([])
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

  it('deletes the active building after an explicit confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockedApi.deleteBuilding.mockResolvedValue(undefined)
    renderPage()

    // The first project is selected by default and its building opens.
    await waitFor(() => expect(mockedApi.getBuilding).toHaveBeenCalled())
    const deleteButton = await screen.findByRole('button', { name: /מחיקת הבניין/ })
    fireEvent.click(deleteButton)

    expect(confirmSpy).toHaveBeenCalled()
    await waitFor(() => {
      expect(mockedApi.deleteBuilding).toHaveBeenCalledWith(1)
    })
  })

  it('hides the building/project controls from a non-admin desk operator', async () => {
    renderPage('Member')
    await waitFor(() => expect(mockedApi.getBuilding).toHaveBeenCalled())
    await screen.findByText(/מבט-על מתחם/)

    // The "add building", "add project" and delete controls are admin-only.
    expect(screen.queryByText('בניין')).not.toBeInTheDocument()
    expect(screen.queryByText('פרויקט')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /מחיקת הבניין/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /מחיקת פרויקט/ })).not.toBeInTheDocument()
  })

  it('shows tenant-driven occupancy and the לקוחות tab in the apartment panel', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.getBuilding).toHaveBeenCalled())

    // Open the apartment side panel.
    fireEvent.click(await screen.findByText('דירה 101'))
    await waitFor(() => expect(mockedApi.getApartment).toHaveBeenCalledWith(11))

    // Occupancy is driven by the current tenant. Both the grid tile and the
    // panel badge read מאוכלסת while a resident lives in the apartment.
    const occupied = await screen.findAllByText('מאוכלסת')
    expect(occupied.length).toBeGreaterThan(0)

    // The לקוחות tab lists the present client.
    fireEvent.click(screen.getAllByText('לקוחות')[0])
    expect(await screen.findByText('לקוח בדיקה')).toBeInTheDocument()
    expect(screen.getByText('יציאה מיידית')).toBeInTheDocument()
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
