import { useSelector } from 'react-redux'
import type { RootState } from '../store'

/**
 * Returns true if the current user has the given permission.
 *
 * Usage:
 *   const canDelete = usePermission('delete', 'transaction')
 *   const canCreate = usePermission('create', 'project')
 */
export function usePermission(action: string, resourceType: string): boolean {
  const permissions = useSelector((state: RootState) => state.permissions.permissions)
  const permissionsLoaded = useSelector((state: RootState) => state.permissions.loaded)

  // If permissions haven't loaded yet, default to false (safe default)
  if (!permissionsLoaded) return false

  return permissions.some(
    (p) =>
      p.action === action &&
      p.resource_type === resourceType &&
      (p.effect == null || p.effect === 'allow')
  )
}

/**
 * Returns true if the user has ANY of the given permissions.
 *
 * Usage:
 *   const canModify = useAnyPermission([
 *     { action: 'update', resourceType: 'transaction' },
 *     { action: 'delete', resourceType: 'transaction' },
 *   ])
 */
export function useAnyPermission(checks: Array<{ action: string; resourceType: string }>): boolean {
  const permissions = useSelector((state: RootState) => state.permissions.permissions)
  const permissionsLoaded = useSelector((state: RootState) => state.permissions.loaded)

  if (!permissionsLoaded) return false

  return checks.some(({ action, resourceType }) =>
    permissions.some(
      (p) =>
        p.action === action &&
        p.resource_type === resourceType &&
        (p.effect == null || p.effect === 'allow')
    )
  )
}
