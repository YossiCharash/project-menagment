export interface Tenant {
  id: number;
  slug: string;
  name: string;
  email: string;
  db_name: string;
  status: TenantStatus;
  created_at: string;
  last_accessed: string | null;
}

export interface TenantStats extends Tenant {
  user_count: number;
  project_count: number;
}

export interface CEOUser {
  id: number;
  email: string;
}

export interface CreateTenantRequest {
  name: string;
  email: string;
  password: string;
}

export type TenantStatus = 'active' | 'suspended' | 'deleted';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface ApiError {
  detail: string;
}
