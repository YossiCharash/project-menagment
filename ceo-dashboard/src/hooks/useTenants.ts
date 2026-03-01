import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import type { Tenant, TenantStats, CreateTenantRequest } from '../types';

interface UseTenantsReturn {
  tenants: Tenant[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useTenants(): UseTenantsReturn {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<Tenant[]>('/tenants');
      setTenants(response.data);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tenants, loading, error, refresh };
}

interface UseTenantDetailReturn {
  tenant: TenantStats | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useTenantDetail(slug: string): UseTenantDetailReturn {
  const [tenant, setTenant] = useState<TenantStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<TenantStats>(`/tenants/${slug}/stats`);
      setTenant(response.data);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tenant, loading, error, refresh };
}

export async function createTenant(data: CreateTenantRequest): Promise<Tenant> {
  const response = await api.post<Tenant>('/tenants', data);
  return response.data;
}

export async function updateTenantStatus(
  slug: string,
  status: 'active' | 'suspended'
): Promise<Tenant> {
  const response = await api.put<Tenant>(`/tenants/${slug}`, { status });
  return response.data;
}

export async function deleteTenant(slug: string): Promise<void> {
  await api.delete(`/tenants/${slug}`);
}

function extractError(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const axiosErr = err as { response?: { data?: { detail?: string } } };
    if (axiosErr.response?.data?.detail) {
      return axiosErr.response.data.detail;
    }
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'An unexpected error occurred';
}
