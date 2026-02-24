import { usePermission } from '../../hooks/usePermission'

interface PermissionGuardProps {
  action: string
  resource: string
  children: React.ReactNode
}

/**
 * Renders children only if the current user has the required permission.
 * Renders nothing (null) if permission is denied.
 *
 * Usage:
 *   <PermissionGuard action="write" resource="supplier">
 *     <button>הוסף ספק</button>
 *   </PermissionGuard>
 */
export function PermissionGuard({ action, resource, children }: PermissionGuardProps) {
  const allowed = usePermission(action, resource)
  if (!allowed) return null
  return <>{children}</>
}
