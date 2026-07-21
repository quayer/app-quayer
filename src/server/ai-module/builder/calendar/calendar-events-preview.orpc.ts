/**
 * Builder Calendar events-preview — porta mecânica para oRPC (lote B5).
 *
 * Origem: ./calendar-events-preview.routes.ts (1 action).
 *   eventsPreview GET /builder/calendar/events-preview/:projectId
 *
 * Degradação graciosa preservada: sem credencial ou freeBusy falhando ⇒
 * { available:false, busyCount:0 } — NUNCA 500.
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { database } from '@/server/services/database'
import { resolveCalendarAccess } from '@/lib/calendar/calendar-credential-resolver'
import { queryFreeBusy } from '@/server/ai-module/ai-agents/tools/calendar/google-calendar-client'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from '../projects/routes/crud.orpc'

const authed = base.use(authOrApiKey)

/** Janela da prova social: próximos 21 dias (~3 semanas). */
const PREVIEW_WINDOW_MS = 21 * 24 * 60 * 60 * 1000

// ==========================================
// EVENTS PREVIEW — GET /builder/calendar/events-preview/{projectId}
// ==========================================
export const eventsPreview = authed
  .route({
    method: 'GET',
    path: '/builder/calendar/events-preview/{projectId}',
    summary: 'Get Calendar Events Preview',
  })
  .input(z.object({ projectId: z.string().uuid('projectId inválido') }))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const { projectId } = input

    // Ownership: o projeto precisa pertencer à org ativa.
    const project = await database.builderProject.findFirst({
      where: { id: projectId, organizationId: orgId },
      select: { id: true },
    })
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    // Tudo daqui pra frente é best-effort: qualquer falha vira available:false.
    try {
      const access = await resolveCalendarAccess(orgId, projectId)
      if (!access) {
        return ok({ available: false, busyCount: 0 })
      }

      const now = new Date()
      const timeMin = now.toISOString()
      const timeMax = new Date(now.getTime() + PREVIEW_WINDOW_MS).toISOString()

      const intervals = await queryFreeBusy(
        access.accessToken,
        access.calendarId,
        timeMin,
        timeMax,
      )

      return ok({ available: true, busyCount: intervals.length })
    } catch (err) {
      console.warn('[calendar/events-preview] Leitura falhou (soft):', err)
      return ok({ available: false, busyCount: 0 })
    }
  })

export const calendarEventsPreviewActions = { eventsPreview }
