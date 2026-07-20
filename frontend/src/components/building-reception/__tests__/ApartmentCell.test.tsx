/**
 * Tests for the apartment grid tile: the two key markers (מפתח אצל הדלפק /
 * הוצאנו מפתח), the technician-inside marker (טכנאי בדירה) and client-driven
 * occupancy (מאוכלסת / פנויה).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ApartmentCell from '../ApartmentCell'
import type { Apartment, Tenant } from '../../../types/api'

const currentTenant: Tenant = {
  id: 71,
  apartment_id: 11,
  name: 'דייר נוכחי',
  phone: null,
  email: null,
  name_2: null,
  phone_2: null,
  email_2: null,
  move_in_date: null,
  move_out_date: null,
  is_current: true,
  created_at: '2024-01-01T00:00:00',
}

/** Builds an Apartment summary, overriding only the fields a test cares about. */
function makeApartment(overrides: Partial<Apartment> = {}): Apartment {
  return {
    id: 11,
    building_id: 1,
    floor: 1,
    unit_number: '101',
    label: null,
    is_common_area: false,
    parking_number: null,
    storage_number: null,
    owner_name: null,
    owner_phone: null,
    owner_email: null,
    owner_name_2: null,
    owner_phone_2: null,
    owner_email_2: null,
    management_company_name: null,
    management_company_phone: null,
    attorneys: null,
    equipment: null,
    notes: null,
    created_at: '2024-01-01T00:00:00',
    current_tenant: null,
    has_active_client_visit: false,
    keys_count: 0,
    keys_in_desk_count: 0,
    keys_out_count: 0,
    vehicles_count: 0,
    pending_deliveries_count: 0,
    open_tasks_count: 0,
    technicians_inside_count: 0,
    ...overrides,
  }
}

describe('ApartmentCell key markers', () => {
  it('shows only the desk marker when every key sits at the desk', () => {
    render(<ApartmentCell apartment={makeApartment({ keys_count: 1, keys_in_desk_count: 1 })} onSelect={vi.fn()} />)
    expect(screen.getByLabelText('מפתח אצל הדלפק')).toBeInTheDocument()
    expect(screen.queryByLabelText('הוצאנו מפתח')).not.toBeInTheDocument()
  })

  it('shows only the handed-out marker when a key is out', () => {
    render(<ApartmentCell apartment={makeApartment({ keys_count: 1, keys_out_count: 1 })} onSelect={vi.fn()} />)
    expect(screen.getByLabelText('הוצאנו מפתח')).toBeInTheDocument()
    expect(screen.queryByLabelText('מפתח אצל הדלפק')).not.toBeInTheDocument()
  })

  it('shows both markers when one key is at the desk and another is out', () => {
    render(
      <ApartmentCell
        apartment={makeApartment({ keys_count: 2, keys_in_desk_count: 1, keys_out_count: 1 })}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('מפתח אצל הדלפק')).toBeInTheDocument()
    expect(screen.getByLabelText('הוצאנו מפתח')).toBeInTheDocument()
  })
})

describe('ApartmentCell technician marker', () => {
  it('shows the technician marker when a technician is inside the apartment', () => {
    render(<ApartmentCell apartment={makeApartment({ technicians_inside_count: 1 })} onSelect={vi.fn()} />)
    expect(screen.getByLabelText('טכנאי בדירה')).toBeInTheDocument()
  })

  it('hides the technician marker when no technician is inside', () => {
    render(<ApartmentCell apartment={makeApartment({ technicians_inside_count: 0 })} onSelect={vi.fn()} />)
    expect(screen.queryByLabelText('טכנאי בדירה')).not.toBeInTheDocument()
  })
})

describe('ApartmentCell occupancy', () => {
  it('reads מאוכלסת when a client is currently in the apartment', () => {
    render(<ApartmentCell apartment={makeApartment({ has_active_client_visit: true })} onSelect={vi.fn()} />)
    expect(screen.getByText('מאוכלסת')).toBeInTheDocument()
  })

  it('reads פנויה when a tenant is registered but no client has arrived', () => {
    render(
      <ApartmentCell
        apartment={makeApartment({ current_tenant: currentTenant, has_active_client_visit: false })}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText('פנויה')).toBeInTheDocument()
    // The registered tenant is still shown even though the unit reads vacant.
    expect(screen.getByText('דייר נוכחי')).toBeInTheDocument()
  })
})
