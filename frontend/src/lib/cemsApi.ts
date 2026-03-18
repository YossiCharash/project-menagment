import api from './api'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CemsUser {
  id: number
  full_name: string
  email: string
  cems_role: string | null
}

export interface Warehouse {
  id: string
  name: string
  location: string | null
  current_manager_id: number | null
  project_ids: string[]
  project_names: string[]
}

export interface AssetCategory {
  id: string
  name: string
  description?: string
}

export interface CemsProject {
  id: string
  name: string
  code: string
  is_active: boolean
}

export type AssetStatus = 'ACTIVE' | 'IN_TRANSFER' | 'IN_WAREHOUSE' | 'RETIRED'

export interface FixedAsset {
  id: string
  name: string
  serial_number: string
  status: AssetStatus
  category_id: string
  current_custodian_id: number | null
  current_warehouse_id: string | null
  project_id: number | null
  purchase_date: string | null
  warranty_expiry: string | null
  notes: string | null
}

export interface AssetHistory {
  id: string
  asset_id: string
  action: string
  actor_id: number | null
  from_custodian_id: number | null
  to_custodian_id: number | null
  notes: string | null
  timestamp: string
}

export interface ConsumableItem {
  id: string
  name: string
  category_id: string
  warehouse_id: string
  quantity: string
  unit: string
  low_stock_threshold: string
  reorder_quantity: string
}

export type AlertType = 'LOW_STOCK' | 'OUT_OF_STOCK'

export interface StockAlert {
  id: string
  item_id: string
  alert_type: AlertType
  quantity_at_alert: string
  resolved: boolean
  created_at: string
}

export type TransferStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED'

export interface Transfer {
  id: string
  asset_id: string
  from_user_id: number
  to_user_id: number
  status: TransferStatus
  initiated_at: string
  notes: string | null
}

export interface InventoryReport {
  total_assets: number
  active_assets: number
  in_warehouse: number
  in_transfer: number
  retired: number
  low_stock_count: number
}

// ─── Query Parameter Interfaces ──────────────────────────────────────────────

interface AssetQueryParams {
  status?: string
  skip?: number
  limit?: number
}

interface ConsumableQueryParams {
  warehouse_id?: string
  skip?: number
  limit?: number
}

interface TransferQueryParams {
  status?: string
}

interface InitiateTransferPayload {
  asset_id: string
  to_user_id: number
  to_warehouse_id?: string
  notes?: string
}

interface CompleteTransferPayload {
  signature_hash: string
  ip_address?: string
}

interface ConsumeStockPayload {
  quantity: number
  notes?: string
}

interface CreateWarehousePayload {
  name: string
  location?: string
}

// ─── API Client ──────────────────────────────────────────────────────────────

const CEMS_BASE = '/cems'

export const cemsApi = {
  // ── Assets ──────────────────────────────────────────────────────────────
  getAssets: (params?: AssetQueryParams) =>
    api.get<FixedAsset[]>(`${CEMS_BASE}/assets`, { params }),

  getAsset: (id: string) =>
    api.get<FixedAsset>(`${CEMS_BASE}/assets/${id}`),

  createAsset: (data: Partial<FixedAsset>) =>
    api.post<FixedAsset>(`${CEMS_BASE}/assets`, data),

  getAssetHistory: (id: string) =>
    api.get<AssetHistory[]>(`${CEMS_BASE}/assets/${id}/history`),

  moveAsset: (assetId: string, toWarehouseId: string, notes?: string) =>
    api.post<FixedAsset>(`${CEMS_BASE}/assets/${assetId}/move`, { to_warehouse_id: toWarehouseId, notes }),

  getExpiringWarranties: () =>
    api.get<FixedAsset[]>(`${CEMS_BASE}/assets/expiring-warranties`),

  // ── Consumables ─────────────────────────────────────────────────────────
  getConsumables: (params?: ConsumableQueryParams) =>
    api.get<ConsumableItem[]>(`${CEMS_BASE}/consumables`, { params }),

  createConsumable: (data: Partial<ConsumableItem>) =>
    api.post<ConsumableItem>(`${CEMS_BASE}/consumables`, data),

  consumeStock: (id: string, data: ConsumeStockPayload) =>
    api.post(`${CEMS_BASE}/consumables/${id}/consume`, data),

  moveConsumable: (itemId: string, toWarehouseId: string) =>
    api.post<ConsumableItem>(`${CEMS_BASE}/consumables/${itemId}/move`, { to_warehouse_id: toWarehouseId }),

  getLowStock: () =>
    api.get<ConsumableItem[]>(`${CEMS_BASE}/consumables/low-stock`),

  // ── Transfers ───────────────────────────────────────────────────────────
  getTransfers: (params?: TransferQueryParams) =>
    api.get<Transfer[]>(`${CEMS_BASE}/transfers`, { params }),

  initiateTransfer: (data: InitiateTransferPayload) =>
    api.post<Transfer>(`${CEMS_BASE}/transfers`, data),

  completeTransfer: (id: string, data: CompleteTransferPayload) =>
    api.post(`${CEMS_BASE}/transfers/${id}/complete`, data),

  rejectTransfer: (id: string, data: { reason: string }) =>
    api.post(`${CEMS_BASE}/transfers/${id}/reject`, data),

  // ── Warehouses ──────────────────────────────────────────────────────────
  getWarehouses: () =>
    api.get<Warehouse[]>(`${CEMS_BASE}/warehouses`),

  createWarehouse: (data: CreateWarehousePayload) =>
    api.post<Warehouse>(`${CEMS_BASE}/warehouses`, data),

  getWarehouseInventory: (id: string) =>
    api.get(`${CEMS_BASE}/warehouses/${id}/inventory`),

  updateWarehouseProjects: (id: string, projectIds: string[]) =>
    api.put<Warehouse>(`${CEMS_BASE}/warehouses/${id}/projects`, { project_ids: projectIds }),

  // ── Users ───────────────────────────────────────────────────────────────
  getUsers: () =>
    api.get<CemsUser[]>(`${CEMS_BASE}/users`),

  // ── Categories ──────────────────────────────────────────────────────────
  getCategories: () =>
    api.get<AssetCategory[]>(`${CEMS_BASE}/categories`),

  createCategory: (data: { name: string; description?: string }) =>
    api.post<AssetCategory>(`${CEMS_BASE}/categories`, data),

  deleteCategory: (id: string) =>
    api.delete(`${CEMS_BASE}/categories/${id}`),

  // ── Projects (read-only — managed in main system) ──────────────────────
  getProjects: () =>
    api.get<CemsProject[]>(`${CEMS_BASE}/projects`),

  // ── Reports ─────────────────────────────────────────────────────────────
  getDashboard: () =>
    api.get<InventoryReport>(`${CEMS_BASE}/reports/dashboard`),

  getAlerts: () =>
    api.get<StockAlert[]>(`${CEMS_BASE}/reports/alerts`),
}
