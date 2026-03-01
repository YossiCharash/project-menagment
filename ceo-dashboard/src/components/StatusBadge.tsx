import type { TenantStatus } from '../types';

interface StatusBadgeProps {
  status: TenantStatus;
}

const STATUS_CONFIG: Record<TenantStatus, { label: string; classes: string }> = {
  active: {
    label: 'פעיל',
    classes: 'bg-green-100 text-green-800',
  },
  suspended: {
    label: 'מושהה',
    classes: 'bg-yellow-100 text-yellow-800',
  },
  deleted: {
    label: 'נמחק',
    classes: 'bg-red-100 text-red-800',
  },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.classes}`}
    >
      {config.label}
    </span>
  );
}
