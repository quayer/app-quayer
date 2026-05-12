/**
 * Providers controller — BYOK (Bring Your Own Key).
 *
 * Mounts all CRUD routes under /providers.
 * Registered in igniter.router.ts as key "providers".
 */

import { igniter } from '@/igniter'
import { providersCrudRoutes } from './routes/crud.routes'

export const providersController = igniter.controller({
  name: 'providers',
  path: '/providers',
  description: 'BYOK — org-level AI provider key management',
  actions: {
    ...providersCrudRoutes,
  },
})
