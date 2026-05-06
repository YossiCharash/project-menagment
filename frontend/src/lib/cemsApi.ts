import api from './api'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CemsUser {
  id: number
  full_name: string
  email: string
  cems_role: string | null
  cems_warehouse_id: string | null
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
  warehouse_id: string | null
  warehouse_name: string | null
  parent_id: string | null
  image_url?: string
  position: number
  children_count: number
  items_count: number
}

export interface AssetCategoryTreeNode {
  id: string
  name: string
  description?: string
  image_url?: string
  position: number
  parent_id: string | null
  children_count: number
  items_count: number
  children: AssetCategoryTreeNode[]
}

export interface CategoryItemRead {
  id: string
  name: string
  type: 'asset' | 'consumable'
  status?: string
  quantity?: string
  unit?: string
  photo_url?: string
  warehouse_name?: string
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
  photo_url: string | null
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

export type RetirementStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface AssetRetirement {
  id: string
  asset_id: string
  requested_by_id: number
  approved_by_id: number | null
  reason: string
  disposal_method: string
  status: RetirementStatus
  requested_at: string
  approved_at: string | null
  notes: string | null
}

export type ReorderStatus = 'PENDING' | 'ORDERED' | 'RECEIVED' | 'CANCELLED'

export interface ReorderRequest {
  id: string
  item_id: string
  item_name: string
  requested_by_id: number
  quantity_requested: string
  supplier: string | null
  notes: string | null
  status: ReorderStatus
  requested_at: string
  ordered_at: string | null
  received_at: string | null
  received_by_id: number | null
  quantity_received: string | null
}

export interface ManagerHistoryEntry {
  id: string
  warehouse_id: string
  previous_manager_id: number | null
  new_manager_id: number
  changed_by_id: number
  changed_at: string
  reason: string | null
  previous_manager_name: string | null
  new_manager_name: string
  changed_by_name: string
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

export type DocumentType = 'WARRANTY' | 'INVOICE' | 'OTHER' | 'PHOTO'

export interface CemsDocument {
  id: string
  entity_type: string
  entity_id: string
  document_type: DocumentType
  filename: string
  file_url: string
  uploaded_by_id: number
  uploaded_at: string
  expiry_date: string | null
  created_at: string
}

// ─── Query Parameter Interfaces ──────────────────────────────────────────────

export interface AssetQueryParams {
  warehouse_id?: string
  project_id?: string
  status?: string
  category_id?: string
  custodian_id?: number
  search?: string
  skip?: number
  limit?: number
}

export interface ConsumableQueryParams {
  warehouse_id?: string
  category_id?: string
  low_stock?: boolean
  search?: string
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

interface TransferConsumablePayload {
  to_warehouse_id: string
  quantity: string
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

  updateAsset: (id: string, data: { name?: string; category_id?: string; project_id?: number | null; purchase_date?: string | null; warranty_expiry?: string | null; notes?: string | null }) =>
    api.put<FixedAsset>(`${CEMS_BASE}/assets/${id}`, data),

  getAssetHistory: (id: string) =>
    api.get<AssetHistory[]>(`${CEMS_BASE}/assets/${id}/history`),

  moveAsset: (assetId: string, toWarehouseId: string, notes?: string) =>
    api.post<FixedAsset>(`${CEMS_BASE}/assets/${assetId}/move`, { to_warehouse_id: toWarehouseId, notes }),

  assignAsset: (assetId: string, toUserId: number, notes?: string) =>
    api.post<FixedAsset>(`${CEMS_BASE}/assets/${assetId}/assign`, { to_user_id: toUserId, notes }),

  getExpiringWarranties: () =>
    api.get<FixedAsset[]>(`${CEMS_BASE}/assets/expiring-warranties`),

  // ── Retirements ────────────────────────────────────────────────────────
  retireAsset: (assetId: string, reason: string, disposalMethod: string) =>
    api.post<AssetRetirement>(`${CEMS_BASE}/assets/${assetId}/retire`, {
      reason,
      disposal_method: disposalMethod,
    }),

  getRetirements: (status?: string) =>
    api.get<AssetRetirement[]>(`${CEMS_BASE}/assets/retirements`, {
      params: status ? { status } : undefined,
    }),

  approveRetirement: (id: string, notes?: string) =>
    api.post<AssetRetirement>(
      `${CEMS_BASE}/assets/retirements/${id}/approve`,
      { notes },
    ),

  rejectRetirement: (id: string, reason: string) =>
    api.post<AssetRetirement>(
      `${CEMS_BASE}/assets/retirements/${id}/reject`,
      { reason },
    ),

  // ── Consumables ─────────────────────────────────────────────────────────
  getConsumables: (params?: ConsumableQueryParams) =>
    api.get<ConsumableItem[]>(`${CEMS_BASE}/consumables`, { params }),

  createConsumable: (data: Partial<ConsumableItem>) =>
    api.post<ConsumableItem>(`${CEMS_BASE}/consumables`, data),

  consumeStock: (id: string, data: ConsumeStockPayload) =>
    api.post(`${CEMS_BASE}/consumables/${id}/consume`, data),

  moveConsumable: (itemId: string, toWarehouseId: string) =>
    api.post<ConsumableItem>(`${CEMS_BASE}/consumables/${itemId}/move`, { to_warehouse_id: toWarehouseId }),

  transferConsumable: (itemId: string, data: TransferConsumablePayload) =>
    api.post<ConsumableItem>(`${CEMS_BASE}/consumables/${itemId}/transfer`, data),

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

  changeWarehouseManager: (id: string, newManagerId: number, reason?: string) =>
    api.post<Warehouse>(`${CEMS_BASE}/warehouses/${id}/change-manager`, {
      new_manager_id: newManagerId,
      reason: reason || undefined,
    }),

  getWarehouseManagerHistory: (warehouseId: string) =>
    api.get<ManagerHistoryEntry[]>(`${CEMS_BASE}/warehouses/${warehouseId}/manager-history`),

  deleteWarehouse: (id: string) =>
    api.delete(`${CEMS_BASE}/warehouses/${id}`),

  // ── Users ───────────────────────────────────────────────────────────────
  getUsers: () =>
    api.get<CemsUser[]>(`${CEMS_BASE}/users`),

  assignEmployeeWarehouse: (userId: number, warehouseId: string | null) =>
    api.put<CemsUser>(`${CEMS_BASE}/users/${userId}/warehouse`, { warehouse_id: warehouseId }),

  // ── Categories ──────────────────────────────────────────────────────────
  getCategories: (warehouseId?: string) =>
    api.get<AssetCategory[]>(`${CEMS_BASE}/categories`, {
      params: warehouseId ? { warehouse_id: warehouseId } : undefined,
    }),

  createCategory: (data: { name: string; description?: string; warehouse_id?: string; parent_id?: string }) =>
    api.post<AssetCategory>(`${CEMS_BASE}/categories`, data),

  deleteCategory: (id: string) =>
    api.delete(`${CEMS_BASE}/categories/${id}`),

  getCategoryTree: () =>
    api.get<AssetCategoryTreeNode[]>(`${CEMS_BASE}/categories/tree`),

  getCategoryItems: (categoryId: string, includeDescendants?: boolean) =>
    api.get<CategoryItemRead[]>(`${CEMS_BASE}/categories/${categoryId}/items`, {
      params: includeDescendants ? { include_descendants: true } : undefined,
    }),

  uploadCategoryImage: (categoryId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<AssetCategory>(`${CEMS_BASE}/categories/${categoryId}/upload-image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  updateCategory: (id: string, data: { name?: string; description?: string; parent_id?: string | null; position?: number }) =>
    api.put<AssetCategory>(`${CEMS_BASE}/categories/${id}`, data),

  // ── Projects (read-only — managed in main system) ──────────────────────
  getProjects: () =>
    api.get<CemsProject[]>(`${CEMS_BASE}/projects`),

  // ── Reports ─────────────────────────────────────────────────────────────
  getDashboard: () =>
    api.get<InventoryReport>(`${CEMS_BASE}/reports/dashboard`),

  getAlerts: () =>
    api.get<StockAlert[]>(`${CEMS_BASE}/reports/alerts`),

  // ── Documents ─────────────────────────────────────────────────────────
  getDocuments: (entityType: string, entityId: string) =>
    api.get<CemsDocument[]>(`${CEMS_BASE}/documents`, { params: { entity_type: entityType, entity_id: entityId } }),

  uploadAssetPhoto: (assetId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<FixedAsset>(`${CEMS_BASE}/assets/${assetId}/upload-photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  uploadDocument: (formData: FormData) =>
    api.post<CemsDocument>(`${CEMS_BASE}/documents/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  deleteDocument: (id: string) =>
    api.delete(`${CEMS_BASE}/documents/${id}`),

  // ── Reorders ───────────────────────────────────────────────────────────
  createReorderRequest: (data: { item_id: string; quantity_requested: number; supplier?: string; notes?: string }) =>
    api.post<ReorderRequest>(`${CEMS_BASE}/reorders`, data),

  getReorderRequests: (params?: { status?: string; item_id?: string }) =>
    api.get<ReorderRequest[]>(`${CEMS_BASE}/reorders`, { params }),

  markReorderOrdered: (id: string, data?: { supplier?: string; notes?: string }) =>
    api.post<ReorderRequest>(`${CEMS_BASE}/reorders/${id}/mark-ordered`, data ?? {}),

  markReorderReceived: (id: string, quantityReceived: number, notes?: string) =>
    api.post<ReorderRequest>(`${CEMS_BASE}/reorders/${id}/mark-received`, { quantity_received: quantityReceived, notes }),

  cancelReorder: (id: string) =>
    api.post<ReorderRequest>(`${CEMS_BASE}/reorders/${id}/cancel`, {}),
}
