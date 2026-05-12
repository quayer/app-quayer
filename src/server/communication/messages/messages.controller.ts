/**
 * Messages — Controller (composer)
 *
 * Compõe os route files do módulo messages.
 *
 * Route files:
 *   list.routes.ts → GET / (list), GET /:id (getById), GET /sessions (listSessions)
 */

import { igniter } from '@/igniter'
import { listRoutes } from './list.routes'

export const messagesController = igniter.controller({
  name: 'messages',
  path: '/messages',
  description: 'Chat messages and sessions (multi-tenant, org-isolated)',
  actions: {
    ...listRoutes,
  },
})
