import { randomBytes, timingSafeEqual } from 'crypto'

interface RequestLike {
  headers: { get(name: string): string | null }
}

const isProduction = process.env.NODE_ENV === 'production'

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Constant-time comparison to prevent timing-based token oracle attacks.
 * Both tokens must be the same byte length before comparison.
 */
export function validateCsrfToken(headerToken: string | null, cookieToken: string | null): boolean {
  if (!headerToken || !cookieToken) return false
  if (headerToken.length !== cookieToken.length) return false
  try {
    return timingSafeEqual(Buffer.from(headerToken), Buffer.from(cookieToken))
  } catch {
    return false
  }
}

export function getCsrfTokenFromHeader(request: RequestLike): string | null {
  return request.headers.get('x-csrf-token')
}

export function getCsrfTokenFromCookie(request: RequestLike): string | null {
  const cookie = request.headers.get('cookie') ?? ''
  const match = cookie.match(/csrf_token=([^;]+)/)
  return match ? match[1] : null
}

/**
 * Set the CSRF cookie on the Igniter response object.
 * httpOnly: false — double-submit pattern requires JS readability so the
 * frontend can include the token value in the x-csrf-token request header.
 */
export function setCsrfCookie(response: any, token: string): void {
  response.setCookie('csrf_token', token, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 86400, // 24 h
  })
}

/**
 * Clear the CSRF cookie (Max-Age=0 invalidates immediately).
 */
export function clearCsrfCookie(response: any): void {
  response.setCookie('csrf_token', '', {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 0,
  })
}
