import { useEffect } from 'react'

/**
 * Listens for `permission-denied` events dispatched by the Axios interceptor
 * and calls the provided callback with the error message.
 *
 * Usage:
 *   usePermissionDenied((message) => toast.error(message))
 */
export function usePermissionDenied(onDenied?: (message: string) => void): void {
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string }>).detail
      if (onDenied) {
        onDenied(detail.message)
      }
    }
    window.addEventListener('permission-denied', handler)
    return () => window.removeEventListener('permission-denied', handler)
  }, [onDenied])
}
