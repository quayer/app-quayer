/**
 * Builder Controller
 *
 * Thin composition of 3 resource route modules:
 *  - projects.routes: CRUD de BuilderProject
 *  - chat.routes:     chat conversacional com o meta-agente
 *  - deploy.routes:   saga de publicação cross-module
 *
 * Regra: este arquivo só COMPÕE rotas — qualquer lógica vive nos handlers.
 * Contexto completo em ./builder.skill.md
 */

import { igniter } from '@/igniter'
import { projectsRoutes } from './projects/projects.routes'
import { chatRoutes }     from './chat/chat.routes'
import { deployRoutes }   from './deploy/deploy.routes'

export const builderController = igniter.controller({
  name: 'builder',
  path: '/builder',
  description: 'Builder IA — design-time para criação de agentes WhatsApp (não confundir com runtime em ai-agents)',
  actions: {
    ...projectsRoutes,
    ...chatRoutes,
    ...deployRoutes,
  },
})
