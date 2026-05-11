/**
 * Auth Magic Link — Controller (composer)
 *
 * Thin composition of 2 route modules:
 *  - verify.routes:  verifyMagicLink (signup + login paths)
 *  - status.routes:  checkMagicLinkStatus (cross-tab polling)
 *
 * Regra: este arquivo só COMPÕE rotas — qualquer lógica vive nos handlers.
 * Contexto completo em ./magic-link.skill.md
 */

import { igniter } from '@/igniter';
import { verifyRoutes } from './verify.routes';
import { statusRoutes } from './status.routes';

export const magicLinkController = igniter.controller({
  name: 'auth-magic-link',
  path: '/auth',
  description: 'Auth magic link flows',
  actions: {
    ...verifyRoutes,
    ...statusRoutes,
  },
});
