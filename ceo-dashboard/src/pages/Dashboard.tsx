import { Users, UserCheck, UserX } from 'lucide-react';
import { useTenants } from '../hooks/useTenants';
import TenantCard from '../components/TenantCard';
import Spinner from '../components/Spinner';
import ErrorMessage from '../components/ErrorMessage';
import type { Tenant } from '../types';

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-xl ${color}`}>{icon}</div>
      </div>
    </div>
  );
}

const RECENT_TENANTS_LIMIT = 5;

function getRecentTenants(tenants: Tenant[]): Tenant[] {
  return [...tenants]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, RECENT_TENANTS_LIMIT);
}

export default function Dashboard() {
  const { tenants, loading, error, refresh } = useTenants();

  if (loading) return <Spinner size="lg" />;
  if (error) return <ErrorMessage message={error} onRetry={refresh} />;

  const totalCount = tenants.length;
  const activeCount = tenants.filter((t) => t.status === 'active').length;
  const suspendedCount = tenants.filter((t) => t.status === 'suspended').length;
  const recentTenants = getRecentTenants(tenants);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        לוח בקרה - מנכ״ל
      </h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard
          title="סה״כ מנהלים"
          value={totalCount}
          icon={<Users size={24} className="text-blue-600" />}
          color="bg-blue-50"
        />
        <StatCard
          title="פעילים"
          value={activeCount}
          icon={<UserCheck size={24} className="text-green-600" />}
          color="bg-green-50"
        />
        <StatCard
          title="מושהים"
          value={suspendedCount}
          icon={<UserX size={24} className="text-yellow-600" />}
          color="bg-yellow-50"
        />
      </div>

      {/* Recent Tenants */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          מנהלים אחרונים
        </h2>
        {recentTenants.length === 0 ? (
          <p className="text-gray-500 text-sm">אין מנהלי פרויקטים עדיין.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentTenants.map((tenant) => (
              <TenantCard
                key={tenant.id}
                tenant={tenant}
                onStatusChange={refresh}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
