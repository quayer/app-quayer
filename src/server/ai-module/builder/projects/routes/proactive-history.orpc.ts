/**
 * Builder Projects/Proactive History — porta mecânica para oRPC (lote B1).
 *
 * Origem: ./proactive-history.routes.ts (1 action, F1.5).
 * URL: GET /builder/projects/:id/proactive/history
 * Fidelidade: degradação fail-open completa — sem agente publicado, sem
 * sessões ou delegate scheduledMessage ausente (migration não landada) →
 * lista vazia, nunca lança.
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { getDatabase } from '@/server/services/database'
import {
  toProactiveHistoryItem,
  type ProactiveHistoryItem,
  type ProactiveMessageRow,
} from '@/server/ai-module/ai-agents/proactive/proactive-history.pure'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from './crud.orpc'

const SESSION_SCAN_CAP = 1000
const HISTORY_LIMIT = 50

interface ScheduledMessageReadDelegate {
  findMany: (args: {
    where: Record<string, unknown>
    orderBy?: Record<string, unknown>
    take?: number
    select?: Record<string, unknown>
  }) => Promise<ProactiveMessageRow[]>
}

const authed = base.use(authOrApiKey)

export const getProactiveHistory = authed
  .route({
    method: 'GET',
    path: '/builder/projects/{id}/proactive/history',
    summary: 'Get Builder Project Proactive History',
  })
  .input(z.object({ id: z.string().uuid('ID de projeto inválido') }))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const database = getDatabase()

    const project = await database.builderProject.findFirst({
      where: { id: input.id, organizationId: orgId },
      select: { id: true, aiAgentId: true },
    })
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    // Agente ainda não publicado → não há envios proativos.
    if (!project.aiAgentId) {
      return ok<{ items: ProactiveHistoryItem[] }>({ items: [] })
    }

    const sessions = await database.chatSession.findMany({
      where: { organizationId: orgId, aiAgentConfigId: project.aiAgentId },
      select: { id: true },
      orderBy: { lastMessageAt: 'desc' },
      take: SESSION_SCAN_CAP,
    })
    const sessionIds = sessions.map((s) => s.id)
    if (sessionIds.length === 0) {
      return ok<{ items: ProactiveHistoryItem[] }>({ items: [] })
    }

    // Guard defensivo: migration proactive_scheduling pode não ter landado.
    const delegate = (
      database as unknown as { scheduledMessage?: ScheduledMessageReadDelegate }
    ).scheduledMessage
    if (!delegate) {
      return ok<{ items: ProactiveHistoryItem[] }>({ items: [] })
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

    return ok<{ items: ProactiveHistoryItem[] }>({
      items: rows.map(toProactiveHistoryItem),
    })
  })

export const proactiveHistoryActions = {
  getProactiveHistory,
}
