/**
 * Runtime Decision recording — observabilidade por turno do agente.
 *
 * Grava UM registro por turno em agent_runtime_decisions: que decisões o runtime
 * tomou (modelo/fallback, RAG hit/miss, skills, tools, memória dinâmica) +
 * tokens/custo/latência/status. Complementa as métricas AGREGADAS do AIAgentConfig
 * com granularidade por-turno (root-cause de comportamento do agente).
 *
 * Fire-and-forget: a gravação NUNCA pode derrubar o agente. Callers usam
 * `void recordRuntimeDecision(...)`. Todo erro é capturado e só logado.
 *
 * Decisão de design (Quayer faz ops via SQL/MCP): o valor primário é a tabela
 * consultável; dashboard UI é fase 2 (consultar por SQL/Supabase MCP já serve).
 */

import { database } from '@/server/services/database'

/**
 * Campos de decisão coletados no `prepareAgentCall` (setup, antes do LLM).
 * Anexado ao PreparedAgentCall e mesclado com os resultados de execução no fim.
 */
export interface RuntimeDecisionMeta {
  promptVersionId: string | null
  memoryWindowSize: number
  dynamicWindowSize: number | null
  messagesDropped: number
  previousSessionSummaryUsed: boolean
  ragEnabled: boolean
  ragQueried: boolean
  ragCollectionId: string | null
  ragChunksRetrieved: number
  skillsActivated: string[]
  enabledTools: string[]
  /** QH-05: tier escolhido pelo model router ('mini' | 'full' | null). */
  modelTier?: 'mini' | 'full' | null
  /** QH-05: razão human-readable do model router. */
  modelRouterReason?: string | null
}

/** Meta default (usado em caminhos que falham antes de popular o meta). */
export const EMPTY_DECISION_META: RuntimeDecisionMeta = {
  promptVersionId: null,
  memoryWindowSize: 0,
  dynamicWindowSize: null,
  messagesDropped: 0,
  previousSessionSummaryUsed: false,
  ragEnabled: false,
  ragQueried: false,
  ragCollectionId: null,
  ragChunksRetrieved: 0,
  skillsActivated: [],
  enabledTools: [],
}

/** Entrada completa: identidade + meta de setup + resultados de execução. */
export interface RuntimeDecisionInput extends Partial<RuntimeDecisionMeta> {
  organizationId: string
  sessionId: string
  agentConfigId: string
  executionMode: 'sync' | 'stream' | 'playground'

  modelPrimary: string
  providerPrimary: string
  modelUsed: string
  providerUsed: string
  fallbackTriggered?: boolean
  fallbackReason?: string | null

  toolsCalled?: string[]
  toolIterations?: number

  inputTokens?: number
  outputTokens?: number
  cachedTokens?: number
  totalTokens?: number
  totalCost?: number

  latencyMs?: number
  status?: 'success' | 'error'
  errorMessage?: string | null
}

/**
 * Persiste a decisão do turno. Fire-and-forget: captura qualquer erro (incl.
 * tabela ausente antes da migration) e só loga — nunca propaga.
 */
export async function recordRuntimeDecision(
  input: RuntimeDecisionInput,
): Promise<void> {
  try {
    await database.agentRuntimeDecision.create({
      data: {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        agentConfigId: input.agentConfigId,
        promptVersionId: input.promptVersionId ?? null,
        executionMode: input.executionMode,

        modelPrimary: input.modelPrimary,
        providerPrimary: input.providerPrimary,
        modelUsed: input.modelUsed,
        providerUsed: input.providerUsed,
        fallbackTriggered: input.fallbackTriggered ?? false,
        fallbackReason: input.fallbackReason ?? null,

        memoryWindowSize: input.memoryWindowSize ?? null,
        dynamicWindowSize: input.dynamicWindowSize ?? null,
        messagesDropped: input.messagesDropped ?? 0,
        previousSessionSummaryUsed: input.previousSessionSummaryUsed ?? false,

        ragEnabled: input.ragEnabled ?? false,
        ragQueried: input.ragQueried ?? false,
        ragCollectionId: input.ragCollectionId ?? null,
        ragChunksRetrieved: input.ragChunksRetrieved ?? 0,

        skillsActivated: input.skillsActivated ?? [],
        enabledTools: input.enabledTools ?? [],
        toolsCalled: input.toolsCalled ?? [],
        toolIterations: input.toolIterations ?? 0,

        inputTokens: input.inputTokens ?? 0,
        outputTokens: input.outputTokens ?? 0,
        cachedTokens: input.cachedTokens ?? 0,
        totalTokens: input.totalTokens ?? 0,
        totalCost: input.totalCost ?? 0,

        latencyMs: input.latencyMs ?? 0,
        status: input.status ?? 'success',
        errorMessage: input.errorMessage ?? null,
      },
    })
  } catch (err) {
    console.warn(
      '[RuntimeDecision] gravação falhou (ignorada):',
      err instanceof Error ? err.message : String(err),
    )
  }
}
