import api from './api'
import type {
  ApartmentCreate,
  ApartmentDetail,
  ApartmentTask,
  ApartmentKey,
  ApartmentKeyCreate,
  ApartmentKeyUpdate,
  ApartmentUpdate,
  AuthorizedVehicle,
  AuthorizedVehicleCreate,
  AuthorizedVehicleUpdate,
  Building,
  BuildingCreate,
  BuildingListItem,
  BuildingProject,
  BuildingProjectCreate,
  BuildingProjectListItem,
  BuildingProjectUpdate,
  BuildingReceptionTaskCreate,
  BuildingUpdate,
  Delivery,
  DeliveryCreate,
  DeliveryUpdate,
  KeyTransferCreate,
  TechnicianVisit,
  TechnicianVisitCreate,
  TechnicianVisitUpdate,
  Tenant,
  TenantCreate,
  TenantUpdate,
} from '../types/api'

const BASE = '/building-reception'

/**
 * Thin, strongly-typed transport layer for the Building Reception Desk module.
 *
 * Single Responsibility: the ONLY job of this class is to translate typed
 * domain calls into HTTP requests. It holds no state and contains no business
 * logic — that lives in the Redux slice / components. Mirrors the static-class
 * convention already established by `apiClient.ts`.
 */
export class BuildingReceptionAPI {
  // ---- Projects -------------------------------------------------------------

  static async listProjects(): Promise<BuildingProjectListItem[]> {
    const { data } = await api.get<BuildingProjectListItem[]>(`${BASE}/projects`)
    return data
  }

  static async createProject(payload: BuildingProjectCreate): Promise<BuildingProject> {
    const { data } = await api.post<BuildingProject>(`${BASE}/projects`, payload)
    return data
  }

  static async updateProject(projectId: number, changes: BuildingProjectUpdate): Promise<BuildingProject> {
    const { data } = await api.put<BuildingProject>(`${BASE}/projects/${projectId}`, changes)
    return data
  }

  static async deleteProject(projectId: number): Promise<void> {
    await api.delete(`${BASE}/projects/${projectId}`)
  }

  // ---- Buildings ------------------------------------------------------------

  static async listBuildings(): Promise<BuildingListItem[]> {
    const { data } = await api.get<BuildingListItem[]>(`${BASE}/buildings`)
    return data
  }

  static async getBuilding(buildingId: number): Promise<Building> {
    const { data } = await api.get<Building>(`${BASE}/buildings/${buildingId}`)
    return data
  }

  static async createBuilding(payload: BuildingCreate): Promise<Building> {
    const { data } = await api.post<Building>(`${BASE}/buildings`, payload)
    return data
  }

  static async updateBuilding(buildingId: number, changes: BuildingUpdate): Promise<Building> {
    const { data } = await api.put<Building>(`${BASE}/buildings/${buildingId}`, changes)
    return data
  }

  static async deleteBuilding(buildingId: number): Promise<void> {
    await api.delete(`${BASE}/buildings/${buildingId}`)
  }

  // ---- Apartments -----------------------------------------------------------

  static async getApartment(apartmentId: number): Promise<ApartmentDetail> {
    const { data } = await api.get<ApartmentDetail>(`${BASE}/apartments/${apartmentId}`)
    return data
  }

  static async listApartmentTasks(apartmentId: number): Promise<ApartmentTask[]> {
    const { data } = await api.get<ApartmentTask[]>(`${BASE}/apartments/${apartmentId}/tasks`)
    return data
  }

  static async createApartment(payload: ApartmentCreate): Promise<ApartmentDetail> {
    const { data } = await api.post<ApartmentDetail>(`${BASE}/apartments`, payload)
    return data
  }

  static async deleteApartment(apartmentId: number): Promise<void> {
    await api.delete(`${BASE}/apartments/${apartmentId}`)
  }

  static async updateApartment(apartmentId: number, changes: ApartmentUpdate): Promise<ApartmentDetail> {
    const { data } = await api.put<ApartmentDetail>(`${BASE}/apartments/${apartmentId}`, changes)
    return data
  }

  static async setTenant(apartmentId: number, payload: TenantCreate): Promise<Tenant> {
    const { data } = await api.post<Tenant>(`${BASE}/apartments/${apartmentId}/tenant`, payload)
    return data
  }

  static async updateTenant(tenantId: number, changes: TenantUpdate): Promise<Tenant> {
    const { data } = await api.put<Tenant>(`${BASE}/tenants/${tenantId}`, changes)
    return data
  }

  static async deleteTenant(tenantId: number): Promise<void> {
    await api.delete(`${BASE}/tenants/${tenantId}`)
  }

  // ---- Keys -----------------------------------------------------------------

  static async listKeys(apartmentId: number): Promise<ApartmentKey[]> {
    const { data } = await api.get<ApartmentKey[]>(`${BASE}/apartments/${apartmentId}/keys`)
    return data
  }

  static async createKey(payload: ApartmentKeyCreate): Promise<ApartmentKey> {
    const { data } = await api.post<ApartmentKey>(`${BASE}/keys`, payload)
    return data
  }

  static async transferKey(keyId: number, payload: KeyTransferCreate): Promise<ApartmentKey> {
    const { data } = await api.post<ApartmentKey>(`${BASE}/keys/${keyId}/transfer`, payload)
    return data
  }

  static async updateKey(keyId: number, changes: ApartmentKeyUpdate): Promise<ApartmentKey> {
    const { data } = await api.put<ApartmentKey>(`${BASE}/keys/${keyId}`, changes)
    return data
  }

  static async deleteKey(keyId: number): Promise<void> {
    await api.delete(`${BASE}/keys/${keyId}`)
  }

  // ---- Vehicles -------------------------------------------------------------

  static async listVehicles(apartmentId: number): Promise<AuthorizedVehicle[]> {
    const { data } = await api.get<AuthorizedVehicle[]>(`${BASE}/apartments/${apartmentId}/vehicles`)
    return data
  }

  static async createVehicle(payload: AuthorizedVehicleCreate): Promise<AuthorizedVehicle> {
    const { data } = await api.post<AuthorizedVehicle>(`${BASE}/vehicles`, payload)
    return data
  }

  static async updateVehicle(vehicleId: number, changes: AuthorizedVehicleUpdate): Promise<AuthorizedVehicle> {
    const { data } = await api.put<AuthorizedVehicle>(`${BASE}/vehicles/${vehicleId}`, changes)
    return data
  }

  static async deleteVehicle(vehicleId: number): Promise<void> {
    await api.delete(`${BASE}/vehicles/${vehicleId}`)
  }

  // ---- Deliveries -----------------------------------------------------------

  static async listDeliveries(apartmentId: number): Promise<Delivery[]> {
    const { data } = await api.get<Delivery[]>(`${BASE}/apartments/${apartmentId}/deliveries`)
    return data
  }

  static async createDelivery(payload: DeliveryCreate): Promise<Delivery> {
    const { data } = await api.post<Delivery>(`${BASE}/deliveries`, payload)
    return data
  }

  static async markDelivered(deliveryId: number): Promise<Delivery> {
    const { data } = await api.post<Delivery>(`${BASE}/deliveries/${deliveryId}/deliver`)
    return data
  }

  static async updateDelivery(deliveryId: number, changes: DeliveryUpdate): Promise<Delivery> {
    const { data } = await api.put<Delivery>(`${BASE}/deliveries/${deliveryId}`, changes)
    return data
  }

  static async deleteDelivery(deliveryId: number): Promise<void> {
    await api.delete(`${BASE}/deliveries/${deliveryId}`)
  }

  // ---- Technician visits ----------------------------------------------------

  static async listTechnicianVisits(apartmentId: number): Promise<TechnicianVisit[]> {
    const { data } = await api.get<TechnicianVisit[]>(`${BASE}/apartments/${apartmentId}/technician-visits`)
    return data
  }

  static async createTechnicianVisit(payload: TechnicianVisitCreate): Promise<TechnicianVisit> {
    const { data } = await api.post<TechnicianVisit>(`${BASE}/technician-visits`, payload)
    return data
  }

  static async markTechnicianLeft(visitId: number): Promise<TechnicianVisit> {
    const { data } = await api.post<TechnicianVisit>(`${BASE}/technician-visits/${visitId}/exit`)
    return data
  }

  static async updateTechnicianVisit(visitId: number, changes: TechnicianVisitUpdate): Promise<TechnicianVisit> {
    const { data } = await api.put<TechnicianVisit>(`${BASE}/technician-visits/${visitId}`, changes)
    return data
  }

  static async deleteTechnicianVisit(visitId: number): Promise<void> {
    await api.delete(`${BASE}/technician-visits/${visitId}`)
  }

  // ---- Tasks (reuses the existing global task endpoint) ---------------------

  static async createTask(payload: BuildingReceptionTaskCreate): Promise<{ id: number }> {
    const { data } = await api.post<{ id: number }>('/tasks/', payload)
    return data
  }

  // ---- Assignee directory (for the New Task modal) --------------------------

  static async listTaskAssignees(): Promise<Array<{ id: number; full_name: string }>> {
    const { data } = await api.get<Array<{ id: number; full_name: string }>>('/users/for-tasks')
    return data
  }
}

export default BuildingReceptionAPI
