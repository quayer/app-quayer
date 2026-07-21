/**
 * Auth — agregador do namespace (facade), espelho do auth.controller.ts.
 *
 * Mantém o contrato do client (api.auth.*) unificando os lotes migrados dos
 * subdomínios. Cresce lote a lote:
 *   session      ✅ csrf, refresh, logout, switchOrganization
 *   email-otp    ✅ loginOTP, verifyLoginOTP, signupOTP, verifySignupOTP, verifyEmail
 *   magic-link   ✅ checkMagicLinkStatus, verifyMagicLink
 *   oauth-google ✅ googleAuth, googleCallback
 *   passkey, phone-otp, totp, identity — pendentes
 */
import { sessionActions } from './session/session.orpc'
import { emailOtpActions } from './email-otp/email-otp.orpc'
import { magicLinkActions } from './magic-link/magic-link.orpc'
import { oauthGoogleActions } from './oauth-google/oauth-google.orpc'

export const auth = {
  ...sessionActions,
  ...emailOtpActions,
  ...magicLinkActions,
  ...oauthGoogleActions,
}
