/**
 * Auth — agregador do namespace (facade), espelho do auth.controller.ts.
 *
 * Mantém o contrato do client (api.auth.*) unificando os lotes migrados dos
 * subdomínios. Cresce lote a lote:
 *   session    ✅ csrf, refresh, logout, switchOrganization
 *   email-otp  — próximo (login/signup/verify + 2FA gate)
 *   magic-link — pendente
 *   oauth-google, passkey, phone-otp, totp, identity — pendentes
 */
import { sessionActions } from './session/session.orpc'

export const auth = {
  ...sessionActions,
}
