type IgniterEnvelope<T> = {
  data?: T | { success?: boolean; data?: T }
}

/**
 * Igniter's HTTP adapter wraps route JSON in an outer `{ data: ... }`. Most
 * builder routes also return the app envelope `{ success, data }` inside it.
 * E2E specs want the actual route payload, independent of either envelope.
 */
export function unwrapIgniterData<T>(body: unknown): T | undefined {
  const outer = (body as IgniterEnvelope<T> | null)?.data
  if (
    outer &&
    typeof outer === 'object' &&
    'success' in outer &&
    'data' in outer
  ) {
    return (outer as { data?: T }).data
  }
  return outer as T | undefined
}
