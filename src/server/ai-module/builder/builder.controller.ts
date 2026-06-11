/**
 * Builder Controller
 *
 * Thin composition of resource route modules:
 *  - projects.routes:    CRUD de BuilderProject
 *  - chat.routes:        chat conversacional com o meta-agente (+ getReadiness, Orayon Uplift)
 *  - card-submit.routes: protocolo de card-action determinístico (Orayon Uplift W2)
 *  - sources.routes:     ingestão de fontes "cole seu site/IG" (Orayon Uplift W4)
 *  - media-curation.routes: list/patch do catálogo de mídia enviável (Fase E / E4)
 *  - deploy.routes:      saga de publicação cross-module
 *
 * Regra: este arquivo só COMPÕE rotas — qualquer lógica vive nos handlers.
 * Contexto completo em ./builder.skill.md
 */

import { igniter } from '@/igniter'
import { projectsRoutes } from './projects/projects.routes'
import { chatRoutes }     from './chat/chat.routes'
import { cardSubmitRoutes } from './cards/card-submit.routes'
import { sheetParseRoutes } from './cards/sheet-parse.routes'
import { sourcesRoutes }  from './sources/sources.routes'
import { sourceImagesRoutes } from './sources/source-images.routes'
import { mediaCurationRoutes } from './media/media-curation.routes'
import { deployRoutes }   from './deploy/deploy.routes'
import { channelCredentialsRoutes } from './channel/channel-credentials.routes'
import { provisionWhatsAppRoutes } from './channel/provision-whatsapp.routes'
import { identityRoutes } from './identity/identity.routes'
import { calendarRoutes } from './calendar/calendar.routes'
import { calendarEventsPreviewRoutes } from './calendar/calendar-events-preview.routes'
import { connectionsListRoutes } from './connections/connections-list.routes'
import { knowledgeRoutes } from './knowledge/knowledge.routes'
import { knowledgeSourceRoutes } from './knowledge/knowledge-source.routes'
import { pricingRoutes } from './pricing/pricing.routes'
import { credentialRoutes } from './credential/credential.routes'
import { capabilitiesRoutes } from './capabilities/capabilities.routes'

export const builderController = igniter.controller({
  name: 'builder',
  path: '/builder',
  description: 'Builder IA — design-time para criação de agentes WhatsApp (não confundir com runtime em ai-agents)',
  actions: {
    ...projectsRoutes,
    ...chatRoutes,
    ...cardSubmitRoutes,
    ...sheetParseRoutes,
    ...sourcesRoutes,
    ...sourceImagesRoutes,
    ...mediaCurationRoutes,
    ...deployRoutes,
    ...channelCredentialsRoutes,
    ...provisionWhatsAppRoutes,
    ...identityRoutes,
    ...calendarRoutes,
    ...calendarEventsPreviewRoutes,
    ...connectionsListRoutes,
    ...knowledgeRoutes,
    ...knowledgeSourceRoutes,
    ...pricingRoutes,
    ...credentialRoutes,
    ...capabilitiesRoutes,
  },
})
