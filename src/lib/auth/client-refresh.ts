"use client"

export const AUTH_SESSION_EXPIRED_EVENT = "quayer:auth-session-expired"

const REFRESH_ENDPOINT = "/api/v1/auth/refresh"

let refreshInFlight: Promise<boolean> | null = null

function isRefreshRequest(input: RequestInfo | URL): boolean {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.pathname
        : input.url

  try {
    const url = new URL(raw, window.location.origin)
    return url.pathname === REFRESH_ENDPOINT
  } catch {
    return raw === REFRESH_ENDPOINT
  }
}

function withSameOriginCredentials(init?: RequestInit): RequestInit {
  return {
    ...init,
    credentials: init?.credentials ?? "same-origin",
  }
}

export function notifyAuthSessionExpired(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT))
}

export async function refreshAuthSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = fetch(REFRESH_ENDPOINT, {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null
    })

  return refreshInFlight
}

export async function fetchWithAuthRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: { notifyOnAuthFailure?: boolean } = {},
): Promise<Response> {
  const requestInit = withSameOriginCredentials(init)
  const first = await fetch(input, requestInit)

  if (first.status !== 401 || isRefreshRequest(input)) {
    return first
  }

  const refreshed = await refreshAuthSession()
  if (!refreshed) {
    if (options.notifyOnAuthFailure) notifyAuthSessionExpired()
    return first
  }

  return fetch(input, requestInit)
}
