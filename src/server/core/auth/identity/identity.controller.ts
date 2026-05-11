/**
 * Identity — Controller (composer)
 *
 * Compõe os route files do subdomínio identity.
 * Toda a lógica vive nos route files.
 *
 * Route files:
 *   profile.routes.ts          → GET/PATCH /me, POST /me/avatar
 *   otp-preferences.routes.ts  → GET/PATCH /me/otp-preferences
 *   linked-accounts.routes.ts  → GET /me/linked-accounts, DELETE /me/linked-accounts/:provider
 *   admin.routes.ts            → GET /users
 */

import { igniter } from '@/igniter';
import { profileRoutes } from './profile.routes';
import { otpPreferencesRoutes } from './otp-preferences.routes';
import { linkedAccountsRoutes } from './linked-accounts.routes';
import { adminRoutes } from './admin.routes';

export const identityController = igniter.controller({
  name: 'auth-identity',
  path: '/auth',
  description: 'Auth current user identity',
  actions: {
    ...profileRoutes,
    ...otpPreferencesRoutes,
    ...linkedAccountsRoutes,
    ...adminRoutes,
  },
});
