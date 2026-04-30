/**
 * Auth module barrel.
 * Re-exports all subdomain controllers so the router can wire them.
 */

export { sessionController } from "./session/session.controller";
export { identityController } from "./identity/identity.controller";
export { emailOtpController } from "./email-otp/email-otp.controller";
export { magicLinkController } from "./magic-link/magic-link.controller";
export { oauthGoogleController } from "./oauth-google/oauth-google.controller";
export { passkeyController } from "./passkey/passkey.controller";
export { phoneOtpController } from "./phone-otp/phone-otp.controller";
export { totpController } from "./totp/totp.controller";
