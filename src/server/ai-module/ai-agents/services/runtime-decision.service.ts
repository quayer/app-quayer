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

import { createHash } from 'node:crypto'
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
  /** QH-11: SHA-256 da configuração efetiva do turno (systemPrompt + tools + provider + model). */
  configHash?: string | null
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
  /**
   * Status do turno:
   *   - 'success'  → resposta gerada normalmente
   *   - 'error'    → falha não recuperada (turno sem resposta)
   *   - 'fallback' → resposta de fallback gracioso devolvida ao cliente
   *                  (ex.: ContextBudgetExhaustedError — RT-04)
   */
  status?: 'success' | 'error' | 'fallback'
  errorMessage?: string | null
  /**
   * Chave de idempotência durável do turno. Quando presente, a gravação vira
   * upsert por esta chave (atualiza a linha 'pending' reivindicada por
   * `claimRuntimeTurn`); ausente → create (comportamento legado).
   */
  decisionIdempotencyKey?: string | null
  /**
   * Custo de serviços EXTERNOS do turno (STT/TTS/embedding) em USD, ex.:
   * `{ stt: 0.0086 }`. Separado do `totalCost` (LLM). Persistido como JSONB.
   */
  extServiceCosts?: Record<string, number> | null
}

/**
 * Idempotência durável de turno: `sha256(sessionId:inboundMessageId:configHash)`.
 *
 * Retorna `null` (idempotência DESATIVADA p/ este turno) quando falta o id da
 * mensagem inbound (caminhos playground/builder, que não sofrem retry de webhook)
 * ou o configHash (falha rara no setup). Incluir o configHash garante que editar
 * o agente (prompt/tools/modelo) gere uma chave nova → re-dispatch permitido.
 */
export function computeDecisionIdempotencyKey(
  sessionId: string,
  inboundMessageId: string | null | undefined,
  configHash: string | null | undefined,
): string | null {
  if (!inboundMessageId || !configHash) return null
  return createHash('sha256')
    .update(`${sessionId}:${inboundMessageId}:${configHash}`, 'utf8')
    .digest('hex')
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  )
}

export interface ClaimRuntimeTurnInput {
  decisionIdempotencyKey: string
  organizationId: string
  sessionId: string
  agentConfigId: string
  executionMode: 'sync' | 'stream' | 'playground'
  modelPrimary: string
  providerPrimary: string
}

/**
 * Reivindica o turno de forma idempotente e DURÁVEL **antes** do LLM, criando a
 * linha 'pending' com a chave única.
 *
 * Retorna:
 *   - `true`  → siga (primeiro a reivindicar, OU a tentativa anterior travou em
 *               'pending' e pode ser retomada — a serialização de concorrência
 *               real fica a cargo do contact-lock QH-04, 90s).
 *   - `false` → turno JÁ CONCLUÍDO (status terminal) por uma entrega anterior →
 *               o caller deve abortar SEM reenviar (evita resposta duplicada).
 *
 * Fail-open: qualquer erro inesperado (DB down, coluna ausente pré-migration)
 * retorna `true` — a idempotência nunca pode bloquear uma resposta legítima.
 */
export async function claimRuntimeTurn(
  input: ClaimRuntimeTurnInput,
): Promise<boolean> {
  try {
    await database.agentRuntimeDecision.create({
      data: {
        decisionIdempotencyKey: input.decisionIdempotencyKey,
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        agentConfigId: input.agentConfigId,
        executionMode: input.executionMode,
        modelPrimary: input.modelPrimary,
        providerPrimary: input.providerPrimary,
        // Placeholders até recordRuntimeDecision sobrescrever com o real.
        modelUsed: input.modelPrimary,
        providerUsed: input.providerPrimary,
        status: 'pending',
      },
    })
    return true
  } catch (err) {
    if (!isUniqueViolation(err)) {
      console.warn(
        '[RuntimeDecision] claim falhou (fail-open, processando):',
        err instanceof Error ? err.message : String(err),
      )
      return true
    }
    // Chave já existe. Bloqueia SÓ se o turno anterior concluiu (status terminal);
    // 'pending' = tentativa travada/crashada → permite reprocessar (não bloqueia
    // o cliente para sempre por causa de um crash).
    try {
      const existing = await database.agentRuntimeDecision.findUnique({
        where: { decisionIdempotencyKey: input.decisionIdempotencyKey },
        select: { status: true },
      })
      const completed = !!existing && existing.status !== 'pending'
      if (completed) {
        console.info(
          '[RuntimeDecision] turno duplicado já concluído — short-circuit (idempotência)',
        )
        return false
      }
      return true
    } catch {
      return true
    }
  }
}

/**
 * Persiste a decisão do turno. Fire-and-forget: captura qualquer erro (incl.
 * tabela ausente antes da migration) e só loga — nunca propaga.
 */
export async function recordRuntimeDecision(
  input: RuntimeDecisionInput,
): Promise<void> {
  try {
    const data = {
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
      configHash: input.configHash ?? null,
      // Json? — só inclui quando há custo externo; ausente fica NULL.
      ...(input.extServiceCosts
        ? { extServiceCosts: input.extServiceCosts }
        : {}),
    }

    const key = input.decisionIdempotencyKey ?? null
    if (key) {
      // Atualiza a linha 'pending' reivindicada por claimRuntimeTurn (ou cria,
      // se o claim falhou-open sem persistir). Upsert é idempotente por design.
      await database.agentRuntimeDecision.upsert({
        where: { decisionIdempotencyKey: key },
        create: { ...data, decisionIdempotencyKey: key },
        update: data,
      })
    } else {
      await database.agentRuntimeDecision.create({ data })
    }
  } catch (err) {
    console.warn(
      '[RuntimeDecision] gravação falhou (ignorada):',
      err instanceof Error ? err.message : String(err),
    )
  }
}
