import { useSelector } from 'react-redux'
import { selectCanAccess } from '../store/slices/permissionsSlice'
import type { RootState } from '../store'

/**
 * Returns true if the current user has the given (action, resource) permission.
 *
 * Admin users always receive true.
 * For other users, checks the loaded permissions from the IAM system.
 *
 * @param action   - "read" | "write" | "update" | "delete"
 * @param resource - resource type, e.g. "supplier", "transaction", "project"
 */
export function usePermission(action: string, resource: string): boolean {
  return useSelector((state: RootState) => selectCanAccess(action, resource)(state))
}
