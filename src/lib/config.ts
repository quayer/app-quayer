/**
 * Client-safe runtime config flags.
 * Only NEXT_PUBLIC_* envs are exposed to the browser.
 */

export const SIGNUP_ENABLED =
  process.env.NEXT_PUBLIC_SIGNUP_ENABLED !== 'false'

export const SIGNUP_DISABLED_MESSAGE =
  'Cadastro temporariamente indisponível. Entre em contato se precisa de acesso.'
