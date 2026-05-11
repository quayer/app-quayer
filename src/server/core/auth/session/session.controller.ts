/**
 * Session — Controller (composer)
 *
 * Compoe os route files do subdominio session (lifecycle, csrf, org switching).
 * Toda a logica vive nos route files.
 *
 * Route files:
 *   lifecycle.routes.ts     → POST /refresh, POST /logout
 *   csrf.routes.ts          → GET  /csrf
 *   organization.routes.ts  → POST /switch-organization
 */

import { igniter } from '@/igniter';
import { lifecycleRoutes } from './lifecycle.routes';
import { csrfRoutes } from './csrf.routes';
import { organizationRoutes } from './organization.routes';

export const sessionController = igniter.controller({
  name: 'auth-session',
  path: '/auth',
  description: 'Auth session lifecycle',
  actions: {
    ...lifecycleRoutes,
    ...csrfRoutes,
    ...organizationRoutes,
  },
});
