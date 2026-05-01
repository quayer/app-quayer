import { randomBytes } from 'crypto'

interface RequestLike {
  headers: { get(name: string): string | null }
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex')
}

export function validateCsrfToken(headerToken: string | null, cookieToken: string | null): boolean {
  if (!headerToken || !cookieToken) return false
  return headerToken === cookieToken
}

export function getCsrfTokenFromHeader(request: RequestLike): string | null {
  return request.headers.get('x-csrf-token')
}

export function getCsrfTokenFromCookie(request: RequestLike): string | null {
  const cookie = request.headers.get('cookie') ?? ''
  const match = cookie.match(/csrf_token=([^;]+)/)
  return match ? match[1] : null
}

export function setCsrfCookie(_response: unknown, _token: string): void {
  // Cookie setting is handled by the Igniter framework via response headers
}

export function clearCsrfCookie(_response: unknown): void {
  // Cookie clearing is handled by the Igniter framework via response headers
}
