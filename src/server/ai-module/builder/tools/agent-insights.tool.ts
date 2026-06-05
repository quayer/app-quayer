/**
 * Builder Tool — agent_insights (QH-07c)
 *
 * Complementa getMetrics (agregados do AIAgentConfig) com análise por turno:
 * % fallback, latência média, custo/conversa, top tools, modelos usados,
 * % erro + ChatSession: leads qualificados e distribuição de jornada.
 * Scoped por organizationId via BuilderProject → aiAgentId.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { database } from '@/server/services/database'
import { buildBuilderTool } from './build-tool'
import type { BuilderToolExecutionContext } from './create-agent.tool'

// -- Types (exported for unit tests) ----------------------------------------

export interface RawDecision {
  fallbackTriggered: boolean
  latencyMs: number
  totalCost: number
  toolsCalled: string[]
  status: string
  modelUsed: string
}

export interface RawSession {
  leadScore: number | null
  customerJourney: string | null
  totalAiCost: number
}

export interface AgentInsightsSummary {
  janela: string
  turnos: number
  percentualFallback: number
  latenciaMediaMs: number
  custoTotal: number
  custoPorConversa: number
  percentualErro: number
  topTools: Array<{ tool: string; chamadas: number }>
  modelosUsados: Array<{ modelo: string; turnos: number }>
  conversas: number
  leadsQualificados: number
  distribuicaoJornada: Record<string, number>
}

/** Lógica pura de agregação — sem I/O. Exportada para testes. */
export function computeInsights(
  decisions: RawDecision[],
  sessions: RawSession[],
  windowHours: number,
): AgentInsightsSummary {
  const total = decisions.length
  const fallbacks = decisions.filter((d) => d.fallbackTriggered).length
  const errors = decisions.filter((d) => d.status === 'error').length
  const latenciaTotal = decisions.reduce((acc, d) => acc + d.latencyMs, 0)
  const custoTotal = decisions.reduce((acc, d) => acc + d.totalCost, 0)

  const toolFreq: Record<string, number> = {}
  for (const d of decisions) {
    for (const t of d.toolsCalled) toolFreq[t] = (toolFreq[t] ?? 0) + 1
  }
  const topTools = Object.entries(toolFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t, chamadas]) => ({ tool: t, chamadas }))

  const modelFreq: Record<string, number> = {}
  for (const d of decisions) {
    modelFreq[d.modelUsed] = (modelFreq[d.modelUsed] ?? 0) + 1
  }
  const modelosUsados = Object.entries(modelFreq)
    .sort((a, b) => b[1] - a[1])
    .map(([modelo, turnos]) => ({ modelo, turnos }))

  const conversas = sessions.length
  const leadsQualificados = sessions.filter(
    (s) => s.leadScore !== null && s.leadScore >= 60,
  ).length
  const distribuicaoJornada: Record<string, number> = {}
  for (const s of sessions) {
    const stage = s.customerJourney ?? 'desconhecido'
    distribuicaoJornada[stage] = (distribuicaoJornada[stage] ?? 0) + 1
  }
  const custoPorConversa = conversas > 0 ? custoTotal / conversas : 0

  return {
    janela: `últimas ${windowHours}h`,
    turnos: total,
    percentualFallback: total > 0 ? Math.round((fallbacks / total) * 100) : 0,
    latenciaMediaMs: total > 0 ? Math.round(latenciaTotal / total) : 0,
    custoTotal: Math.round(custoTotal * 1e6) / 1e6,
    custoPorConversa: Math.round(custoPorConversa * 1e6) / 1e6,
    percentualErro: total > 0 ? Math.round((errors / total) * 100) : 0,
    topTools,
    modelosUsados,
    conversas,
    leadsQualificados,
    distribuicaoJornada,
  }
}

// -- Input schema ------------------------------------------------------------

const agentInsightsInputSchema = z.object({
  projectId: z.string().uuid().describe('BuilderProject.id a analisar'),
  windowHours: z
    .number()
    .int()
    .min(1)
    .max(720)
    .default(24)
    .describe('Janela de análise em horas (padrão 24, máximo 720)'),
})

// -- Factory -----------------------------------------------------------------

export function agentInsightsTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'agent_insights',
    metadata: { isReadOnly: true, isConcurrencySafe: true },
    tool: tool({
      description:
        'Analisa o desempenho do agente publicado vinculado ao projeto na janela indicada. Retorna: nº de turnos, % fallback, latência média, custo total e custo/conversa, top 5 tools, modelos usados, % erros, leads qualificados e distribuição de jornada. Use quando o usuário perguntar sobre performance, custos ou comportamento do agente em produção.',
      inputSchema: agentInsightsInputSchema,
      execute: async (input) => {
        try {
          const project = await database.builderProject.findFirst({
            where: { id: input.projectId, organizationId: ctx.organizationId },
            select: { aiAgentId: true, name: true },
          })
          if (!project) {
            return { success: false as const, message: 'Projeto não encontrado nesta organização.' }
          }
          if (!project.aiAgentId) {
            return {
              success: false as const,
              message: 'Projeto sem agente publicado. Publique o agente antes de consultar insights.',
            }
          }

          const since = new Date(Date.now() - input.windowHours * 60 * 60 * 1000)

          const [rawDecisions, rawSessions] = await Promise.all([
            database.agentRuntimeDecision.findMany({
              where: {
                agentConfigId: project.aiAgentId,
                organizationId: ctx.organizationId,
                createdAt: { gte: since },
              },
              select: {
                fallbackTriggered: true,
                latencyMs: true,
                totalCost: true,
                toolsCalled: true,
                status: true,
                modelUsed: true,
              },
            }),
            database.chatSession.findMany({
              where: {
                aiAgentConfigId: project.aiAgentId,
                organizationId: ctx.organizationId,
                createdAt: { gte: since },
              },
              select: {
                leadScore: true,
                customerJourney: true,
                totalAiCost: true,
              },
            }),
          ])

          return {
            success: true as const,
            projeto: project.name,
            ...computeInsights(rawDecisions, rawSessions, input.windowHours),
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Erro ao buscar insights do agente'
          return { success: false as const, message }
        }
      },
    }),
  })
}
