import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ExternalLink,
  Pause,
  Play,
  Trash2,
  Users,
  FolderKanban,
  Mail,
  Database,
  Calendar,
  Globe,
} from 'lucide-react';
import { useTenantDetail, updateTenantStatus, deleteTenant } from '../hooks/useTenants';
import StatusBadge from '../components/StatusBadge';
import ConfirmDialog from '../components/ConfirmDialog';
import Spinner from '../components/Spinner';
import ErrorMessage from '../components/ErrorMessage';

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: string | React.ReactNode;
  dir?: 'ltr' | 'rtl';
}

function InfoRow({ icon, label, value, dir }: InfoRowProps) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="text-gray-400">{icon}</div>
      <div className="flex-1">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-900" dir={dir}>
          {value}
        </p>
      </div>
    </div>
  );
}

export default function TenantDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { tenant, loading, error, refresh } = useTenantDetail(slug!);
  const [confirmAction, setConfirmAction] = useState<'suspend' | 'activate' | 'delete' | null>(
    null
  );
  const [actionLoading, setActionLoading] = useState(false);

  const handleAction = async () => {
    if (!confirmAction || !tenant) return;
    setActionLoading(true);

    try {
      if (confirmAction === 'delete') {
        await deleteTenant(tenant.slug);
        navigate('/tenants');
        return;
      }
      const status = confirmAction === 'suspend' ? 'suspended' : 'active';
      await updateTenantStatus(tenant.slug, status);
      await refresh();
    } catch {
      /* state shown via refresh */
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  if (loading) return <Spinner size="lg" />;
  if (error) return <ErrorMessage message={error} onRetry={refresh} />;
  if (!tenant) return <ErrorMessage message="Tenant not found" />;

  const isActive = tenant.status === 'active';

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/tenants')}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowRight size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{tenant.name}</h1>
            <StatusBadge status={tenant.status} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info Card */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            פרטי מנהל
          </h2>
          <InfoRow
            icon={<Mail size={18} />}
            label="אימייל"
            value={tenant.email}
            dir="ltr"
          />
          <InfoRow
            icon={<Globe size={18} />}
            label="Slug"
            value={<span className="font-mono">{tenant.slug}</span>}
            dir="ltr"
          />
          <InfoRow
            icon={<Database size={18} />}
            label="Database"
            value={<span className="font-mono">{tenant.db_name}</span>}
            dir="ltr"
          />
          <InfoRow
            icon={<Calendar size={18} />}
            label="תאריך יצירה"
            value={new Date(tenant.created_at).toLocaleDateString('he-IL', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          />
          {tenant.last_accessed && (
            <InfoRow
              icon={<Calendar size={18} />}
              label="גישה אחרונה"
              value={new Date(tenant.last_accessed).toLocaleDateString('he-IL', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            />
          )}
        </div>

        {/* Stats & Actions */}
        <div className="space-y-6">
          {/* Stats */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              סטטיסטיקות
            </h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Users size={20} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {tenant.user_count}
                  </p>
                  <p className="text-xs text-gray-500">משתמשים</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-50 rounded-lg">
                  <FolderKanban size={20} className="text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {tenant.project_count}
                  </p>
                  <p className="text-xs text-gray-500">פרויקטים</p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              פעולות
            </h2>
            <div className="space-y-3">
              <a
                href={`http://${tenant.slug}.localhost:5173`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <ExternalLink size={16} />
                פתח מערכת
              </a>

              {tenant.status !== 'deleted' && (
                <>
                  <button
                    onClick={() =>
                      setConfirmAction(isActive ? 'suspend' : 'activate')
                    }
                    className={`flex items-center justify-center gap-2 w-full py-2.5 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? 'text-yellow-700 bg-yellow-50 hover:bg-yellow-100'
                        : 'text-green-700 bg-green-50 hover:bg-green-100'
                    }`}
                  >
                    {isActive ? <Pause size={16} /> : <Play size={16} />}
                    {isActive ? 'השהה מנהל' : 'הפעל מנהל'}
                  </button>

                  <button
                    onClick={() => setConfirmAction('delete')}
                    className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    <Trash2 size={16} />
                    מחק מנהל
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Dialog */}
      {confirmAction && (
        <ConfirmDialog
          isOpen={true}
          title={
            confirmAction === 'delete'
              ? 'מחיקת מנהל פרויקטים'
              : confirmAction === 'suspend'
                ? 'השהיית מנהל פרויקטים'
                : 'הפעלת מנהל פרויקטים'
          }
          message={
            confirmAction === 'delete'
              ? `האם אתה בטוח שברצונך למחוק את ${tenant.name}? כל הנתונים יימחקו לצמיתות.`
              : confirmAction === 'suspend'
                ? `האם אתה בטוח שברצונך להשהות את ${tenant.name}?`
                : `האם אתה בטוח שברצונך להפעיל מחדש את ${tenant.name}?`
          }
          confirmLabel={
            actionLoading
              ? 'מעבד...'
              : confirmAction === 'delete'
                ? 'מחק'
                : confirmAction === 'suspend'
                  ? 'השהה'
                  : 'הפעל'
          }
          variant={confirmAction === 'delete' ? 'danger' : 'warning'}
          onConfirm={handleAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
