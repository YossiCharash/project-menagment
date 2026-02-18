import { useState, useCallback, useRef, useEffect } from 'react'

/**
 * Extracts a user-friendly error message from API errors.
 */
export function extractApiError(err: unknown, fallback = 'אירעה שגיאה'): string {
  if (!err) return fallback
  if (typeof err === 'string') return err

  const error = err as any
  return (
    error.response?.data?.detail ||
    error.message ||
    fallback
  )
}

interface AsyncOperationResult<T> {
  /** Execute the async operation */
  execute: (...args: any[]) => Promise<T | undefined>
  /** Whether the operation is currently running */
  loading: boolean
  /** Error message from the last failed operation, or null */
  error: string | null
  /** Clear the error manually */
  clearError: () => void
}

/**
 * Hook for managing async operations with loading and error states.
 * Reduces boilerplate for common try/catch/finally patterns in forms.
 *
 * @example
 * const { execute: save, loading, error, clearError } = useAsyncOperation(
 *   async (data: FormData) => {
 *     const result = await api.save(data)
 *     onSuccess(result)
 *   },
 *   'שגיאה בשמירה'
 * )
 */
export function useAsyncOperation<T = void>(
  operation: (...args: any[]) => Promise<T>,
  errorFallback = 'אירעה שגיאה'
): AsyncOperationResult<T> {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const operationRef = useRef(operation)
  useEffect(() => { operationRef.current = operation })

  const clearError = useCallback(() => setError(null), [])

  const execute = useCallback(
    async (...args: any[]): Promise<T | undefined> => {
      setLoading(true)
      setError(null)
      try {
        const result = await operationRef.current(...args)
        return result
      } catch (err) {
        setError(extractApiError(err, errorFallback))
        return undefined
      } finally {
        setLoading(false)
      }
    },
    [errorFallback]
  )

  return { execute, loading, error, clearError }
}
