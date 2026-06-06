/**
 * Calendar Events Preview Route — prova social da agenda (Onda C, G10).
 *
 * Expõe 1 action read-only sob `/builder/calendar` (composta no builder
 * controller pelo orquestrador — este arquivo NÃO toca builder.controller):
 *   GET /builder/calendar/events-preview/:projectId — conta compromissos das
 *       próximas ~3 semanas (intervalos OCUPADOS via freeBusy) para a "prova
 *       social" do card calendar_connect.
 *
 * Construída sobre a infra de calendário JÁ existente — NÃO é uma integração
 * Google nova/frágil:
 *   - resolveCalendarAccess(orgId, projectId)  (calendar-credential-resolver.ts)
 *   - queryFreeBusy(accessToken, calendarId, …) (google-calendar-client.ts)
 *
 * Degradação graciosa (espelha check-availability.ts e calendar.routes.ts): se
 * não houver credencial (resolveCalendarAccess → null) OU o freeBusy lançar,
 * retornamos `{ available:false, busyCount:0 }` em vez de 500. O card NUNCA volta
 * o status para erro por causa de uma leitura de prova social — pareamento é o
 * que importa, a contagem é só um bônus de confiança.
 *
 * Honestidade do dado: freeBusy devolve INTERVALOS ocupados (sem títulos), então
 * `busyCount = intervals.length` e a copy do card fala "compromissos" (contagem),
 * jamais nomes de evento inventados.
 *
 * Sem novo modelo Prisma, sem migration.
 *
 * Contrato: docs/AUTH_MAP.md (rota anotada). Registro no controller é do Integrate.
 */

import { z } from 'zod'
import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { database } from '@/server/services/database'
import { resolveCalendarAccess } from '@/lib/calendar/calendar-credential-resolver'
import { queryFreeBusy } from '@/server/ai-module/ai-agents/tools/calendar/google-calendar-client'

type AuthedUser = { id: string; currentOrgId?: string | null }

/** Janela da prova social: próximos 21 dias (~3 semanas). */
const PREVIEW_WINDOW_MS = 21 * 24 * 60 * 60 * 1000

/** Param schema: projectId é um UUID de BuilderProject. */
const eventsPreviewParamsSchema = z.object({
  projectId: z.string().uuid('projectId inválido'),
})

// ---------------------------------------------------------------------------
// GET /builder/calendar/events-preview/:projectId
// ---------------------------------------------------------------------------

const eventsPreview = igniter.query({
  name: 'Get Calendar Events Preview',
  description:
    'Conta os compromissos (intervalos ocupados via freeBusy) das próximas ~3 semanas da agenda conectada ao projeto, para a prova social do card calendar_connect. Org-scoped. Degrada para available:false sem nunca dar 500.',
  // Relativo ao prefixo do builderController ('/builder') — o Igniter concatena
  // controller.path + action.path, então NÃO repetir '/builder' aqui (senão vira
  // /builder/builder/...). Espelha calendar.routes.ts ('/calendar/status/:id').
  path: '/calendar/events-preview/:projectId' as const,
  method: 'GET',
  use: [authOrApiKeyProcedure({ required: true })],
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

    // Valida + extrai o param. `request.params` não é tipado pelo Igniter, então
    // passamos pelo zod schema explicitamente (mesmo padrão dos demais reads).
    const parsed = eventsPreviewParamsSchema.safeParse(request.params)
    if (!parsed.success) return response.badRequest('projectId inválido')
    const { projectId } = parsed.data

    // Ownership: o projeto precisa pertencer à org ativa.
    const project = await database.builderProject.findFirst({
      where: { id: projectId, organizationId: user.currentOrgId },
      select: { id: true },
    })
    if (!project) return response.notFound('Projeto não encontrado')

    // Tudo daqui pra frente é best-effort: qualquer falha vira available:false,
    // NUNCA um 500 — a prova social é opcional e não pode travar a jornada.
    try {
      const access = await resolveCalendarAccess(user.currentOrgId, projectId)
      if (!access) {
        return response.success({ available: false, busyCount: 0 })
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

      return response.success({ available: true, busyCount: intervals.length })
    } catch (err) {
      // Token race, 5xx transitório, rate-limit do Google… leitura suave: o card
      // mostra um hint gentil e mantém o status conectado.
      console.warn('[calendar/events-preview] Leitura falhou (soft):', err)
      return response.success({ available: false, busyCount: 0 })
    }
  },
})

export const calendarEventsPreviewRoutes = { eventsPreview }
