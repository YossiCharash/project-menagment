/**
 * Pull a human-readable Hebrew message out of an axios error's `response.data.detail`,
 * falling back to a caller-supplied default. Shared so every caller unwraps API
 * errors the same way (Redux thunks, components, etc.).
 */
export function extractErrorMessage(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' ? detail : fallback
}
