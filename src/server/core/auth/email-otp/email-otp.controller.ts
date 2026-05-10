/**
 * Auth Email OTP — Controller (composer)
 *
 * Thin composition of the three Email OTP route modules.
 * All logic lives in the individual route files; this file only wires them together.
 *
 * Route files:
 *   verify-email.routes.ts  → POST /verify-email
 *   signup.routes.ts        → POST /signup-otp, POST /verify-signup-otp
 *   login.routes.ts         → POST /login-otp,  POST /verify-login-otp
 *
 * Shared helpers consumed:
 *   _shared/issue-session.ts       — issueSession()
 *   _shared/two-factor-gate.ts     — check2faAndIssueChallenge()
 *   _shared/finalize-login.ts      — finalizeLogin()
 *   _shared/helpers.ts             — getClientIdentifier, createAuditLog, autoJoinByVerifiedDomain, …
 */

import { igniter } from '@/igniter';
import { verifyEmailRoutes } from './verify-email.routes';
import { signupRoutes } from './signup.routes';
import { loginRoutes } from './login.routes';

export const emailOtpController = igniter.controller({
  name: 'auth-email-otp',
  path: '/auth',
  description: 'Auth email OTP flows',
  actions: {
    ...verifyEmailRoutes,
    ...signupRoutes,
    ...loginRoutes,
  },
});
