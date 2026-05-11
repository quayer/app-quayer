/**
 * Auth Device Sessions — Controller (composer)
 *
 * Thin composition das routes deste subdominio.
 * Toda a logica vive nos route files.
 *
 * Route files:
 *   list.routes.ts    → GET  /
 *   revoke.routes.ts  → POST /revoke, POST /revoke-all
 *
 * Tabela Prisma: DeviceSession (gravada no login via _shared/helpers.ts::registerDeviceSession)
 */

import { igniter } from '@/igniter';
import { listRoutes } from './list.routes';
import { revokeRoutes } from './revoke.routes';

export const deviceSessionsController = igniter.controller({
  name: 'deviceSessions',
  path: '/device-sessions',
  description: 'Device session listing and revocation',
  actions: {
    ...listRoutes,
    ...revokeRoutes,
  },
});
