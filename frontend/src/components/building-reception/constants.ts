/**
 * Shared design tokens and small pure helpers for the Building Reception Desk.
 *
 * Centralising these here keeps every component DRY and gives the module a
 * single source of truth for its accent colour, status palette and the
 * heuristics that turn raw API data into visual state.
 */
import type { Apartment, ApartmentDetail } from '../../types/api'

/** Purple accent used across the whole module (matches the design mockup). */
export const ACCENT = '#7B5BF5'

/** Semantic colours reused by dots, chips and indicators. */
export const PALETTE = {
  key: ACCENT,
  delivery: '#3B82F6',
  technician: '#F79009',
  task: '#E5544B',
  vacant: '#9CA3AF',
  occupied: '#12B76A',
  common: ACCENT,
} as const

export interface ApartmentIndicators {
  hasKeys: boolean
  hasPendingDelivery: boolean
  hasOpenTask: boolean
  isVacant: boolean
}

/**
 * Derives the little indicator icons shown on an apartment cell from the
 * summary counts carried by the list payload. (Per-key holder state is only
 * available in the full ApartmentDetail, so the cell shows "has keys on file"
 * rather than "key currently out".)
 */
export function deriveIndicators(apartment: Apartment): ApartmentIndicators {
  return {
    hasKeys: apartment.keys_count > 0,
    hasPendingDelivery: apartment.pending_deliveries_count > 0,
    hasOpenTask: apartment.open_tasks_count > 0,
    isVacant: apartment.current_tenant === null && !apartment.is_common_area,
  }
}

/** Groups a building's apartments into descending floors (physical order). */
export function groupByFloor(apartments: Apartment[]): Array<{ floor: number; units: Apartment[] }> {
  const byFloor = new Map<number, Apartment[]>()
  for (const apartment of apartments) {
    const bucket = byFloor.get(apartment.floor) ?? []
    bucket.push(apartment)
    byFloor.set(apartment.floor, bucket)
  }
  return Array.from(byFloor.entries())
    .sort((first, second) => second[0] - first[0])
    .map(([floor, units]) => ({
      floor,
      units: units.sort((first, second) => first.unit_number.localeCompare(second.unit_number, 'he')),
    }))
}

/** True when an apartment currently has at least one key handed out. */
export function hasKeyOut(apartment: ApartmentDetail): boolean {
  return apartment.keys.some((key) => key.holder === 'out')
}

/** True when an apartment has at least one delivery still waiting for pickup. */
export function hasPendingDelivery(apartment: Pick<Apartment, 'pending_deliveries_count'>): boolean {
  return apartment.pending_deliveries_count > 0
}

/** Human-readable Hebrew title for an apartment / common area. */
export function apartmentTitle(apartment: Pick<Apartment, 'unit_number' | 'is_common_area' | 'label'>): string {
  if (apartment.is_common_area) return apartment.label ?? apartment.unit_number
  return `דירה ${apartment.unit_number}`
}

/** Formats an ISO date string as a short Hebrew-locale date (dd/mm/yyyy). */
export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
