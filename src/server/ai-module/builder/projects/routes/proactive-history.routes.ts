/**
 * Builder Projects — Proactive history route (F1.5)
 *
 * Expõe 1 action read-only sob `/builder`:
 *   GET /builder/projects/:id/proactive/history — histórico LEGÍVEL dos envios
 *       proativos (follow-ups) do agente do projeto: status + por que foi enviado,
 *       agendado, cancelado ou falhou (mapa de `ScheduledMessage` → rótulos PT).
 *
 * Acceptance (plano-tarefas-faltantes F1.5): "Usuário consegue ver por que uma
 * mensagem proativa foi enviada ou bloqueada."
 *
 * Escopo: org (sempre) + projeto. `ScheduledMessage` NÃO tem `projectId` (org-scoped,
 * liga ao projeto via `sessionId`). Resolvemos as sessões do agente do projeto
 * (mesmo padrão de `metrics.routes.ts`: `session.aiAgentConfigId = project.aiAgentId`)
 * e filtramos os envios por `sessionId IN (...)`. Read-only, sem migration.
 *
 * Degradação fail-open (NUNCA derruba a UI):
 *   - sem org → badRequest; projeto inexistente → notFound;
 *   - agente não publicado (sem aiAgentId) → lista vazia;
 *   - sem sessões → lista vazia;
 *   - delegate `scheduledMessage` ausente (migration proactive_scheduling não landou)
 *     → lista vazia (não lança).
 */

import { z } from 'zod'
import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { getDatabase } from '@/server/services/database'
import {
  toProactiveHistoryItem,
  type ProactiveHistoryItem,
  type ProactiveMessageRow,
} from '@/server/ai-module/ai-agents/proactive/proactive-history.pure'

export const getProactiveHistoryParamsSchema = z.object({
  id: z.string().uuid('ID de projeto inválido'),
})

type AuthedUser = { id: string; currentOrgId?: string | null }

/** Máximo de sessões do agente consideradas (cap defensivo — histórico recente). */
const SESSION_SCAN_CAP = 1000
/** Máximo de envios proativos retornados (histórico minimal). */
const HISTORY_LIMIT = 50

/**
 * Subset estrutural do delegate `scheduledMessage` (findMany) — guard defensivo
 * igual aos handlers de deploy: se a migration não landou, o delegate é ausente e
 * a rota degrada para lista vazia em vez de lançar.
 */
interface ScheduledMessageReadDelegate {
  findMany: (args: {
    where: Record<string, unknown>
    orderBy?: Record<string, unknown>
    take?: number
    select?: Record<string, unknown>
  }) => Promise<ProactiveMessageRow[]>
}

export const proactiveHistoryRoutes = {
  getProactiveHistory: igniter.query({
    name: 'Get Builder Project Proactive History',
    description:
      'Histórico legível dos envios proativos (follow-ups) do agente do projeto: status + motivo por que foi enviado, agendado, cancelado ou falhou. Org/project-scoped, read-only.',
    path: '/projects/:id/proactive/history',
    method: 'GET',
    use: [authOrApiKeyProcedure({ required: true })],
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) return response.unauthorized('Não autenticado')
      if (!user.currentOrgId) {
        return response.badRequest('Organização não selecionada')
      }
      const orgId = user.currentOrgId

      const parsed = getProactiveHistoryParamsSchema.safeParse(request.params)
      if (!parsed.success) return response.badRequest('ID de projeto inválido')
      const { id } = parsed.data

      const database = getDatabase()

      const project = await database.builderProject.findFirst({
        where: { id, organizationId: orgId },
        select: { id: true, aiAgentId: true },
      })
      if (!project) return response.notFound('Projeto não encontrado')

      // Agente ainda não publicado → não há envios proativos.
      if (!project.aiAgentId) {
        return response.success<{ items: ProactiveHistoryItem[] }>({ items: [] })
      }

      // Sessões do agente (escopo project via aiAgentConfigId, igual metrics.routes).
      const sessions = await database.chatSession.findMany({
        where: { organizationId: orgId, aiAgentConfigId: project.aiAgentId },
        select: { id: true },
        orderBy: { lastMessageAt: 'desc' },
        take: SESSION_SCAN_CAP,
      })
      const sessionIds = sessions.map((s) => s.id)
      if (sessionIds.length === 0) {
        return response.success<{ items: ProactiveHistoryItem[] }>({ items: [] })
      }

      // Guard defensivo do delegate (migration proactive_scheduling pode não ter landado).
      const delegate = (database as unknown as {
        scheduledMessage?: ScheduledMessageReadDelegate
      }).scheduledMessage
      if (!delegate) {
        return response.success<{ items: ProactiveHistoryItem[] }>({ items: [] })
      }

      const rows = await delegate.findMany({
        where: { organizationId: orgId, sessionId: { in: sessionIds } },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_LIMIT,
        select: {
          id: true,
          status: true,
          reason: true,
          messageGoal: true,
          scheduledAt: true,
          sentAt: true,
          cancelledReason: true,
          contactPhone: true,
          createdAt: true,
        },
      })

      return response.success<{ items: ProactiveHistoryItem[] }>({
        items: rows.map(toProactiveHistoryItem),
      })
    },
  }),
}
