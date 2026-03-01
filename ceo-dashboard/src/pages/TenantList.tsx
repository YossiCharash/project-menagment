import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus, Eye, Pause, Play, Trash2 } from 'lucide-react';
import { useTenants, updateTenantStatus, deleteTenant } from '../hooks/useTenants';
import StatusBadge from '../components/StatusBadge';
import ConfirmDialog from '../components/ConfirmDialog';
import Spinner from '../components/Spinner';
import ErrorMessage from '../components/ErrorMessage';
import type { TenantStatus } from '../types';

type StatusFilter = 'all' | TenantStatus;

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'הכל' },
  { value: 'active', label: 'פעיל' },
  { value: 'suspended', label: 'מושהה' },
];

export default function TenantList() {
  const navigate = useNavigate();
  const { tenants, loading, error, refresh } = useTenants();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [confirmAction, setConfirmAction] = useState<{
    type: 'suspend' | 'activate' | 'delete';
    slug: string;
    name: string;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const filteredTenants =
    filter === 'all'
      ? tenants
      : tenants.filter((t) => t.status === filter);

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    setActionLoading(true);

    try {
      if (confirmAction.type === 'delete') {
        await deleteTenant(confirmAction.slug);
      } else {
        const status = confirmAction.type === 'suspend' ? 'suspended' : 'active';
        await updateTenantStatus(confirmAction.slug, status);
      }
      await refresh();
    } catch {
      /* refresh will show current state */
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  if (loading) return <Spinner size="lg" />;
  if (error) return <ErrorMessage message={error} onRetry={refresh} />;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">מנהלי פרויקטים</h1>
        <button
          onClick={() => navigate('/tenants/new')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <UserPlus size={18} />
          הוסף מנהל פרויקטים
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => setFilter(option.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === option.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {filteredTenants.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">לא נמצאו מנהלי פרויקטים</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-right px-6 py-3 font-medium text-gray-500">
                    שם
                  </th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">
                    אימייל
                  </th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">
                    Slug
                  </th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">
                    סטטוס
                  </th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">
                    תאריך יצירה
                  </th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">
                    פעולות
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredTenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {tenant.name}
                    </td>
                    <td className="px-6 py-4 text-gray-600" dir="ltr">
                      {tenant.email}
                    </td>
                    <td className="px-6 py-4 text-gray-600 font-mono text-xs" dir="ltr">
                      {tenant.slug}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={tenant.status} />
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {new Date(tenant.created_at).toLocaleDateString('he-IL')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <Link
                          to={`/tenants/${tenant.slug}`}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="צפה בפרטים"
                        >
                          <Eye size={16} />
                        </Link>
                        {tenant.status !== 'deleted' && (
                          <>
                            <button
                              onClick={() =>
                                setConfirmAction({
                                  type:
                                    tenant.status === 'active'
                                      ? 'suspend'
                                      : 'activate',
                                  slug: tenant.slug,
                                  name: tenant.name,
                                })
                              }
                              className={`p-1.5 rounded-lg transition-colors ${
                                tenant.status === 'active'
                                  ? 'text-yellow-600 hover:bg-yellow-50'
                                  : 'text-green-600 hover:bg-green-50'
                              }`}
                              title={
                                tenant.status === 'active' ? 'השהה' : 'הפעל'
                              }
                            >
                              {tenant.status === 'active' ? (
                                <Pause size={16} />
                              ) : (
                                <Play size={16} />
                              )}
                            </button>
                            <button
                              onClick={() =>
                                setConfirmAction({
                                  type: 'delete',
                                  slug: tenant.slug,
                                  name: tenant.name,
                                })
                              }
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="מחק"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmAction && (
        <ConfirmDialog
          isOpen={true}
          title={
            confirmAction.type === 'delete'
              ? 'מחיקת מנהל פרויקטים'
              : confirmAction.type === 'suspend'
                ? 'השהיית מנהל פרויקטים'
                : 'הפעלת מנהל פרויקטים'
          }
          message={
            confirmAction.type === 'delete'
              ? `האם אתה בטוח שברצונך למחוק את ${confirmAction.name}? פעולה זו אינה הפיכה.`
              : confirmAction.type === 'suspend'
                ? `האם אתה בטוח שברצונך להשהות את ${confirmAction.name}?`
                : `האם אתה בטוח שברצונך להפעיל מחדש את ${confirmAction.name}?`
          }
          confirmLabel={
            actionLoading
              ? 'מעבד...'
              : confirmAction.type === 'delete'
                ? 'מחק'
                : confirmAction.type === 'suspend'
                  ? 'השהה'
                  : 'הפעל'
          }
          variant={confirmAction.type === 'delete' ? 'danger' : 'warning'}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
