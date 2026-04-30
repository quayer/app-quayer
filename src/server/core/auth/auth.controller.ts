/**
 * Auth controller aggregate (facade).
 * Mantem o contrato do cliente (api.auth.*) unificando todas as acoes dos 8 subdominios.
 * Os handlers vivem nos respectivos subdominios; aqui apenas referenciamos.
 */

import { igniter } from "@/igniter";
import { sessionController } from "./session/session.controller";
import { identityController } from "./identity/identity.controller";
import { emailOtpController } from "./email-otp/email-otp.controller";
import { magicLinkController } from "./magic-link/magic-link.controller";
import { oauthGoogleController } from "./oauth-google/oauth-google.controller";
import { passkeyController } from "./passkey/passkey.controller";
import { phoneOtpController } from "./phone-otp/phone-otp.controller";
import { totpController } from "./totp/totp.controller";

export const authController = igniter.controller({
  name: "auth",
  path: "/auth",
  description: "Authentication and authorization (aggregated from 9 subdomain controllers)",
  actions: {
    ...sessionController.actions,
    ...identityController.actions,
    ...emailOtpController.actions,
    ...magicLinkController.actions,
    ...oauthGoogleController.actions,
    ...passkeyController.actions,
    ...phoneOtpController.actions,
    ...totpController.actions,
  },
});
