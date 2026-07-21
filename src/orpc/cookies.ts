/**
 * oRPC — escrita de cookies de resposta (equivalente ao response.setCookie
 * do Igniter).
 *
 * Mecânica: o ResponseHeadersPlugin (registrado no catch-all) injeta
 * `resHeaders: Headers` no contexto e faz merge no response final —
 * múltiplos Set-Cookie são preservados (Headers itera set-cookie sem
 * combinar, por spec do Fetch).
 *
 * O `cookieWriter(resHeaders)` expõe a MESMA interface `.setCookie(name,
 * value, opts)` que os helpers do app esperam (`setAuthCookies`,
 * `clearAuthCookies` de _shared/helpers e `setCsrfCookie` de lib/auth/csrf
 * recebem `response: any`) — os helpers são REUSADOS verbatim, e os
 * atributos dos cookies continuam definidos num único lugar.
 */

export type CookieOptions = {
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'lax' | 'strict' | 'none'
  path?: string
  /** Segundos. 0 = expira imediatamente (clear). */
  maxAge?: number
  expires?: Date
  domain?: string
}

const SAME_SITE_LABEL = { lax: 'Lax', strict: 'Strict', none: 'None' } as const

/** Serializa um Set-Cookie com os mesmos atributos que o Igniter emite. */
export function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`)
  if (opts.expires) parts.push(`Expires=${opts.expires.toUTCString()}`)
  if (opts.domain) parts.push(`Domain=${opts.domain}`)
  if (opts.path) parts.push(`Path=${opts.path}`)
  if (opts.httpOnly) parts.push('HttpOnly')
  if (opts.secure) parts.push('Secure')
  if (opts.sameSite) parts.push(`SameSite=${SAME_SITE_LABEL[opts.sameSite]}`)
  return parts.join('; ')
}

/**
 * Adapter com a interface do response Igniter — para reusar os helpers de
 * cookie do app sem duplicar nenhum atributo:
 *
 *   setAuthCookies(cookieWriter(context.resHeaders), accessToken, refresh)
 */
export function cookieWriter(resHeaders: Headers) {
  return {
    setCookie(name: string, value: string, opts?: CookieOptions) {
      resHeaders.append('set-cookie', serializeCookie(name, value, opts))
    },
  }
}
