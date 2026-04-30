/**
 * CSRF Token Generation and Validation
 *
 * Protege mutations sensíveis contra Cross-Site Request Forgery.
 * Token armazenado em cookie httpOnly + validado via header X-CSRF-Token.
 */

import crypto from 'crypto';

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Gera um CSRF token criptograficamente seguro
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Valida o CSRF token comparando header com cookie
 *
 * @param headerToken - Token enviado no header X-CSRF-Token
 * @param cookieToken - Token armazenado no cookie csrf_token
 * @returns true se tokens são iguais e válidos
 */
export function validateCsrfToken(headerToken: string | null, cookieToken: string | null): boolean {
  if (!headerToken || !cookieToken) return false;
  if (headerToken.length !== 64 || cookieToken.length !== 64) return false;

  // Comparação timing-safe para prevenir timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(headerToken, 'hex'),
      Buffer.from(cookieToken, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Extrai CSRF token do header da request
 */
export function getCsrfTokenFromHeader(request: { headers: { get: (key: string) => string | null } }): string | null {
  return request.headers.get(CSRF_HEADER_NAME);
}

/**
 * Extrai CSRF token do cookie da request
 */
export function getCsrfTokenFromCookie(request: { headers: { get: (key: string) => string | null } }): string | null {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader
    .split(';')
    .map((c: string) => c.trim())
    .find((c: string) => c.startsWith(`${CSRF_COOKIE_NAME}=`));

  if (!match) return null;
  return match.split('=').slice(1).join('=');
}

/**
 * Define o cookie CSRF na response do Igniter
 */
export function setCsrfCookie(response: any, token: string): void {
  response.setCookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Client precisa ler para enviar no header
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 86400, // 24h — rotacionado no login/refresh
    secure: isProduction,
  });
}

/**
 * Limpa o cookie CSRF
 */
export function clearCsrfCookie(response: any): void {
  response.setCookie(CSRF_COOKIE_NAME, '', {
    httpOnly: false,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 0,
    secure: isProduction,
  });
}

export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME };
