/**
 * Signup gate — single source of truth for "is new-user creation allowed?".
 * Controlled by env var SIGNUP_ENABLED (default: enabled).
 * Affects all paths that create a user: email-otp, magic-link, oauth-google, phone-otp.
 * Invitations are NOT gated — users accepting an invite can always be created.
 */

export const SIGNUP_DISABLED_MESSAGE =
  'Cadastro temporariamente indisponível. Entre em contato se precisa de acesso.'

export function isSignupEnabled(): boolean {
  return process.env.SIGNUP_ENABLED !== 'false'
}
