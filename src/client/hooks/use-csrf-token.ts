'use client';

/**
 * CSRF Token Hook & Utilities
 *
 * Lê o CSRF token do cookie csrf_token (não-httpOnly)
 * e fornece utilities para incluir nas requests.
 */

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Lê o CSRF token do cookie (client-side)
 */
export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;

  const match = document.cookie
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(`${CSRF_COOKIE_NAME}=`));

  if (!match) return null;
  return match.split('=').slice(1).join('=');
}

/**
 * Retorna headers com CSRF token para uso em fetch/mutations
 */
export function getCsrfHeaders(): Record<string, string> {
  const token = getCsrfToken();
  if (!token) return {};
  return { [CSRF_HEADER_NAME]: token };
}

/**
 * Garante que o cookie csrf_token esteja presente fazendo uma chamada
 * GET /api/v1/auth/csrf se necessário. Retorna o token final (ou null).
 *
 * Use antes de chamar endpoints protegidos por csrfProcedure quando
 * o cookie ainda não foi setado (ex.: fluxo de login por passkey).
 */
export async function ensureCsrfToken(options?: { force?: boolean }): Promise<string | null> {
  if (!options?.force) {
    const existing = getCsrfToken();
    if (existing) return existing;
  }

  try {
    const res = await fetch('/api/v1/auth/csrf', {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return getCsrfToken();
  } catch {
    return getCsrfToken();
  }

  return getCsrfToken();
}

/**
 * Igual a getCsrfHeaders(), mas primeiro garante que o cookie CSRF
 * esteja setado. Use antes de mutations protegidas por csrfProcedure.
 */
export async function ensureCsrfHeaders(): Promise<Record<string, string>> {
  const token = await ensureCsrfToken();
  if (!token) return {};
  return { [CSRF_HEADER_NAME]: token };
}
