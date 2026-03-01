import { useState } from 'react';
import { ExternalLink, Pause, Play } from 'lucide-react';
import StatusBadge from './StatusBadge';
import ConfirmDialog from './ConfirmDialog';
import { updateTenantStatus } from '../hooks/useTenants';
import type { Tenant } from '../types';

interface TenantCardProps {
  tenant: Tenant & { user_count?: number; project_count?: number };
  onStatusChange?: () => void;
}

export default function TenantCard({ tenant, onStatusChange }: TenantCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [updating, setUpdating] = useState(false);

  const isActive = tenant.status === 'active';
  const targetStatus = isActive ? 'suspended' : 'active';

  const handleToggleStatus = async () => {
    setUpdating(true);
    try {
      await updateTenantStatus(tenant.slug, targetStatus);
      onStatusChange?.();
    } catch {
      /* error handled at page level via refresh */
    } finally {
      setUpdating(false);
      setConfirming(false);
    }
  };

  const formattedDate = new Date(tenant.created_at).toLocaleDateString('he-IL');

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-900">{tenant.name}</h3>
            <p className="text-sm text-gray-500">{tenant.email}</p>
          </div>
          <StatusBadge status={tenant.status} />
        </div>

        <div className="text-xs text-gray-400 mb-4">
          <span>נוצר: {formattedDate}</span>
        </div>

        {(tenant.user_count !== undefined || tenant.project_count !== undefined) && (
          <div className="flex gap-4 mb-4 text-sm">
            {tenant.user_count !== undefined && (
              <span className="text-gray-600">
                <span className="font-medium">{tenant.user_count}</span> משתמשים
              </span>
            )}
            {tenant.project_count !== undefined && (
              <span className="text-gray-600">
                <span className="font-medium">{tenant.project_count}</span> פרויקטים
              </span>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <a
            href={`http://${tenant.slug}.localhost:5173`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <ExternalLink size={14} />
            פתח מערכת
          </a>
          {tenant.status !== 'deleted' && (
            <button
              onClick={() => setConfirming(true)}
              disabled={updating}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                isActive
                  ? 'text-yellow-700 bg-yellow-50 hover:bg-yellow-100'
                  : 'text-green-700 bg-green-50 hover:bg-green-100'
              }`}
            >
              {isActive ? <Pause size={14} /> : <Play size={14} />}
              {isActive ? 'השהה' : 'הפעל'}
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirming}
        title={isActive ? 'השהיית מנהל פרויקטים' : 'הפעלת מנהל פרויקטים'}
        message={
          isActive
            ? `האם אתה בטוח שברצונך להשהות את ${tenant.name}? המערכת שלו לא תהיה נגישה.`
            : `האם אתה בטוח שברצונך להפעיל מחדש את ${tenant.name}?`
        }
        confirmLabel={isActive ? 'השהה' : 'הפעל'}
        variant={isActive ? 'warning' : 'warning'}
        onConfirm={handleToggleStatus}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
