/**
 * Agent Runtime Service
 *
 * Core service that executes AI agent responses using Vercel AI SDK.
 * Handles: context building, LLM calling, tool execution loop, cost tracking.
 *
 * Dependencies (to be installed):
 *   npm install ai @ai-sdk/openai @ai-sdk/anthropic
 */

import {
  generateText,
  streamText,
  stepCountIs,
  type ToolSet,
  type StopCondition,
} from 'ai'
import { database } from '@/server/services/database'
import { getModel } from './services/provider-factory'
import { retrieveRelevantChunks, buildContextBlock } from './knowledge/knowledge-retrieval.service'
import {
  recordRuntimeDecision,
  claimRuntimeTurn,
  computeDecisionIdempotencyKey,
  EMPTY_DECISION_META,
  type RuntimeDecisionMeta,
} from './services/runtime-decision.service'
import { credentialResolver } from '@/lib/providers/credential-resolver.service'
import { getRedis } from '@/server/services/redis'
import { getEnabledBuiltinTools, type ToolExecutionContext } from './tools/builtin-tools'
import { getCustomTools } from './tools/custom-tools'
import { BUILDER_RESERVED_NAME } from '@/server/ai-module/builder/builder.constants'
import { buildBuilderToolset } from '@/server/ai-module/builder/tools'
import { normalizeForAI } from '@/server/communication/services/message-normalizer.service'
// ── Sprint 2 services (TDD-backed, 103 tests) ────────────────────────────────
// Active integrations (this file):
//   - timeBasedMicrocompact: shrinks idle-session histories before LLM call
//   - persistTurn: writes user+assistant turn to Redis short-memory (US-029)
//
// Building blocks ready for future integration (not wired yet):
//   - loadMemoryForAgent (memory-integration): Redis-first context load
//   - buildLayeredSystemPrompt + buildAnthropicCacheOptions (prompt-builder):
//       enables prompt caching (70-90% input cost reduction)
//   - truncateToolResult (tool-registry): cap noisy tool outputs
//   - retryWithFallback (retry-with-fallback): replaces inline retry loop
//   - createBudgetTracker + checkTokenBudget (token-budget): diminishing returns
//   - activateSkills + renderActiveSkills (skill-activator): conditional skills
//   - cachedMicrocompact (microcompact): cache_edits-based history pruning
import path from 'node:path'
import { persistTurn } from './services/memory-integration.service'
import { timeBasedMicrocompact } from './services/microcompact.service'
import { truncateToolResult } from './services/tool-registry.service'
import { retryWithFallback } from './services/retry-with-fallback.service'
import {
  createBudgetTracker,
  checkTokenBudget,
} from './services/token-budget.service'
import {
  summarizeSession,
  persistSessionSummary,
  loadPreviousSessionSummary,
  type PrismaLike as SessionSummaryPrismaLike,
} from './services/session-summary.service'
import { loadContactMemory } from '@/server/communication/services/contact-memory.service'
import { loadRollingSummary } from './services/rolling-summary.service'
import {
  loadSkillsFromDirectory,
} from './services/skill-registry.service'
import {
  activateSkills,
  renderActiveSkills,
  type SkillManifest,
} from './services/skill-activator.service'
import { renderWhatsAppMediaGuide } from './services/whatsapp-media-guide'
import {
  computeDynamicWindow,
  applyWindow,
  estimateTokens as estimateMessageTokens,
} from './services/memory-window.service'
import {
  checkSessionCostCap,
  incrementSessionCost,
} from './infra/hard-caps.service'
// ── QH-04: Contact lock ───────────────────────────────────────────────────────
import {
  acquireContactLock,
  releaseContactLock,
} from './infra/contact-lock.service'
// ── QH-05: Model router ───────────────────────────────────────────────────────
import {
  modelForTurn,
  parseMiniModelEnv,
} from './services/model-router.service'
// ── QH-11: Config hash ────────────────────────────────────────────────────────
import { computeConfigHash } from './services/config-hash.service'

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentRuntimeResponse {
  text: string
  toolCalls: Array<{
    toolName: string
    args: Record<string, unknown>
    result: unknown
  }>
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  cost: {
    inputCost: number
    outputCost: number
    totalCost: number
  }
  latencyMs: number
  model: string
  provider: string
  promptVersionId?: string
}

export interface ProcessAgentMessageParams {
  agentConfigId: string
  sessionId: string
  contactId: string
  connectionId: string
  organizationId: string
  messageContent: string
  /** Bring-your-own-key: override the default provider API key */
  apiKey?: string
  /** QH-13: traceId propagado do webhook para correlação de logs cross-worker. */
  traceId?: string
  /**
   * Id da mensagem inbound do provider (waMessageId). Quando presente, ativa a
   * idempotência durável de turno — um 2º dispatch do mesmo turno é
   * short-circuitado. Ausente em playground/builder (sem retry de webhook).
   */
  inboundMessageId?: string
}

// ── Tool Result Truncation Wrapper ──────────────────────────────────────────
// Cap noisy tool outputs (search_contacts with 200 results, get_session_history,
// big MCP payloads, etc.) before they enter the LLM context. Each tool's
// `execute` is wrapped so that the serialized result is truncated to
// `maxResultSizeChars`. Tools without an `execute` function pass through.

 
function wrapToolWithTruncation(tool: any, maxResultSizeChars = 5000): any {
  if (!tool || typeof tool.execute !== 'function') return tool
  const originalExecute = tool.execute.bind(tool)
  return {
    ...tool,
     
    execute: async (...args: any[]) => {
      const result = await originalExecute(...args)
      const { content, truncated } = truncateToolResult(result, maxResultSizeChars)
      if (truncated) {
        console.warn('[AgentRuntime] tool result truncated:', {
          tool: tool?.name,
        })
        return content
      }
      return result
    },
  }
}

// ── Skill Registry (cached) ─────────────────────────────────────────────────
// Carrega `.claude/skills/agent/*.md` uma única vez por processo. Falhas
// (diretório ausente, parse error) viram array vazio para não derrubar o
// agente; o try/catch no call-site complementa.

let cachedSkills: SkillManifest[] | null = null

async function getRegistrySkills(): Promise<SkillManifest[]> {
  if (cachedSkills) return cachedSkills
  try {
    const skillsDir = path.resolve(process.cwd(), '.claude', 'skills', 'agent')
    cachedSkills = await loadSkillsFromDirectory(skillsDir)
  } catch {
    cachedSkills = []
  }
  return cachedSkills
}

// ── Cost Table ───────────────────────────────────────────────────────────────
// Approximate cost per 1M tokens (March 2026 pricing)

const COST_TABLE: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-haiku-3-5-20241022': { input: 0.8, output: 4.0 },
  'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },
}

const FALLBACK_RATES = { input: 5.0, output: 15.0 }

// ── US-036: Context Budget Error ────────────────────────────────────────────

export class ContextBudgetExhaustedError extends Error {
  constructor(totalTokens: number, maxTokens: number) {
    super(
      `Context budget exhausted: estimated ${totalTokens} tokens exceeds max ${maxTokens}`
    )
    this.name = 'ContextBudgetExhaustedError'
  }
}

// ── RT-04: Graceful fallback for ContextBudgetExhaustedError ────────────────
//
// Texto neutro entregue ao cliente quando o contexto não cabe no budget. Garante
// que o lead receba ALGUMA resposta (em vez de um 500 silencioso no webhook) e
// sinaliza, de forma natural, que um humano pode assumir.

const CONTEXT_BUDGET_FALLBACK_TEXT =
  'Desculpe, nossa conversa ficou um pouco longa e preciso de um instante para me reorganizar. Pode reenviar sua última mensagem de forma resumida? Se preferir, um atendente pode te ajudar.'

function buildContextBudgetFallbackResponse(): AgentRuntimeResponse {
  return {
    text: CONTEXT_BUDGET_FALLBACK_TEXT,
    toolCalls: [],
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    cost: { inputCost: 0, outputCost: 0, totalCost: 0 },
    latencyMs: 0,
    model: '',
    provider: '',
  }
}

// ── US-036: Token Estimation ────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// ── US-043 / RT-05: Provider Cooldown (Redis, distribuído) ──────────────────
//
// O estado de cooldown vive no Redis (não mais num Map em memória): assim ele
// sobrevive a restarts e é compartilhado entre réplicas do worker. A chave
// tem TTL = janela de cooldown, então o "destravamento" é automático (não
// precisamos guardar/comparar timestamps).
//
// FAIL-OPEN: se o Redis cair, comportamo-nos como SEM cooldown — `isProvider
// InCooldown` retorna false e `setProviderCooldown` vira no-op. Nunca lança;
// um turno jamais é bloqueado por indisponibilidade do Redis.

const COOLDOWN_DURATION_MS = 5 * 60 * 1000 // 5 minutes
const COOLDOWN_TTL_SECONDS = Math.ceil(COOLDOWN_DURATION_MS / 1000)

/** Chave Redis do cooldown de um provider/modelo (providerKey = `${provider}:${model}`). */
function cooldownKey(providerKey: string): string {
  return `runtime:breaker:cooldown:${providerKey}`
}

/**
 * true se o provider/modelo está em cooldown (chave presente no Redis).
 * Fail-open: qualquer erro de Redis → false (sem cooldown).
 */
async function isProviderInCooldown(providerKey: string): Promise<boolean> {
  try {
    const redis = getRedis()
    const exists = await redis.exists(cooldownKey(providerKey))
    return exists === 1
  } catch (err) {
    console.warn('[AgentRuntime] cooldown check failed (fail-open):', err)
    return false
  }
}

/**
 * Marca o provider/modelo em cooldown por COOLDOWN_TTL_SECONDS.
 * Fire-and-forget / fail-open: erro de Redis é só logado, nunca propagado.
 */
async function setProviderCooldown(providerKey: string): Promise<void> {
  try {
    const redis = getRedis()
    await redis.set(cooldownKey(providerKey), '1', 'EX', COOLDOWN_TTL_SECONDS)
  } catch (err) {
    console.warn('[AgentRuntime] cooldown set failed (ignored):', err)
  }
}

// ── RT-10: Token budget as a StopCondition ──────────────────────────────────
//
// `token-budget.service` decide continue|stop a partir do total de tokens
// consumidos no turno (com detecção de diminishing returns). Aqui ele vira uma
// `StopCondition` do AI SDK: a cada step, somamos `usage.totalTokens` de todos
// os steps e perguntamos ao tracker se vale a pena continuar o loop de tools.
//
// Aplicamos um PISO ao budget: Math.max(maxTokens * 4, 8000). `maxTokens` é o
// teto de OUTPUT por chamada — multiplicar por 4 (e nunca abaixo de 8k) dá
// folga para input + várias rodadas de tools, evitando cortar o loop cedo
// demais. Mantido SEMPRE junto do `stepCountIs` existente (nunca o substitui).

const BUDGET_TOKEN_FLOOR = 8000

function budgetTokensFor(maxTokens: number | null | undefined): number {
  return Math.max((maxTokens ?? 0) * 4, BUDGET_TOKEN_FLOOR)
}

/**
 * Cria uma StopCondition baseada no token-budget. Fecha sobre um tracker por
 * chamada — cada turno (generateText/streamText) recebe a sua própria via
 * `createBudgetStopCondition(...)`, então o estado não vaza entre turnos.
 */
function createBudgetStopCondition(budgetTokens: number): StopCondition<ToolSet> {
  const tracker = createBudgetTracker()
  return ({ steps }) => {
    const turnTokens = steps.reduce(
      (sum, step) => sum + (step.usage?.totalTokens ?? 0),
      0,
    )
    return checkTokenBudget(tracker, turnTokens, budgetTokens).action === 'stop'
  }
}

function calculateCost(model: string, inputTokens: number, outputTokens: number) {
  const rates = COST_TABLE[model] || FALLBACK_RATES
  const inputCost = (inputTokens / 1_000_000) * rates.input
  const outputCost = (outputTokens / 1_000_000) * rates.output
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  }
}

// ── Provider Factory ─────────────────────────────────────────────────────────
// Imported from ./services/provider-factory.ts (shared with Builder tools)

// ── Context Builders ─────────────────────────────────────────────────────────

/**
 * Fetch the most recent messages from the session to build conversation history.
 * Maps message direction to the appropriate AI SDK role.
 */
async function buildConversationContext(sessionId: string, memoryWindow: number) {
  const messages = await database.message.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    take: memoryWindow,
    select: {
      content: true,
      direction: true,
      author: true,
      type: true,
      createdAt: true,
      transcription: true,
      locationName: true,
      latitude: true,
      longitude: true,
      geoAddress: true,
      geoNeighborhood: true,
      geoCity: true,
      geoState: true,
      geoPostalCode: true,
      fileName: true,
      mediaType: true,
    },
  })

  return messages.map((msg) => ({
    role: (msg.direction === 'INBOUND' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: normalizeForAI(msg),
  }))
}

/**
 * Resolve which prompt version to use for the agent.
 *
 * Priority:
 *   1. A/B test — when two or more prompt versions have status TESTING,
 *      the session ID hash deterministically picks a variant.
 *   2. ACTIVE version — the latest active prompt version.
 *   3. Fallback — returns null so the caller uses the agent's own systemPrompt.
 */
async function getActivePrompt(agentConfigId: string, sessionId?: string) {
  // Check for A/B test (TESTING versions)
  const testingVersions = await database.agentPromptVersion.findMany({
    where: {
      agentConfigId,
      status: 'TESTING',
    },
    orderBy: { version: 'asc' },
  })

  if (testingVersions.length >= 2 && sessionId) {
    // Deterministic variant assignment based on session ID character code sum
    const hash = sessionId
      .split('')
      .reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const variant = hash % testingVersions.length
    return testingVersions[variant]
  }

  // Default: get the latest ACTIVE version
  const activeVersion = await database.agentPromptVersion.findFirst({
    where: {
      agentConfigId,
      status: 'ACTIVE',
    },
    orderBy: { version: 'desc' },
  })

  return activeVersion ?? null
}

// ── Shared Setup ─────────────────────────────────────────────────────────────

type PreparedAgentCall = {
  agentConfig: Awaited<ReturnType<typeof database.aIAgentConfig.findUnique>>
  promptVersion: Awaited<ReturnType<typeof getActivePrompt>>
  conversationHistory: Awaited<ReturnType<typeof buildConversationContext>>
  tools: ToolSet
  model: ReturnType<typeof getModel>
  systemPrompt: string
  startTime: number
  /** Resolved BYOK key (or undefined → provider env fallback). */
  apiKey?: string
  /** Decisões coletadas no setup (RAG/skills/memória) p/ observabilidade. */
  decisionMeta: RuntimeDecisionMeta
  /** QH-05: provider resolvido pelo model router (pode ser mini). */
  routedProvider: string
  /** QH-05: modelo resolvido pelo model router (pode ser mini). */
  routedModel: string
}

/**
 * Shared setup for both `processAgentMessage` and `processAgentMessageStream`.
 * Loads agent config, resolves active prompt, builds conversation history,
 * wires built-in tools, and instantiates the Vercel AI SDK model.
 */
async function prepareAgentCall(
  params: ProcessAgentMessageParams
): Promise<PreparedAgentCall> {
  const startTime = Date.now()

  // 1. Load agent config
  const agentConfig = await database.aIAgentConfig.findUnique({
    where: { id: params.agentConfigId },
  })

  if (!agentConfig || !agentConfig.isActive) {
    throw new Error(
      `Agent config ${params.agentConfigId} not found or inactive`
    )
  }

  // Defesa multi-tenant: o agente DEVE pertencer à org do chamador. Sem isto, um
  // webhook com (connection da org A + agentConfigId da org B) leria prompt/RAG/
  // settings da org B. Mesma mensagem de erro (não revela existência cross-org).
  if (agentConfig.organizationId !== params.organizationId) {
    throw new Error(
      `Agent config ${params.agentConfigId} not found or inactive`
    )
  }

  // 2. Get active prompt (supports A/B testing)
  const promptVersion = await getActivePrompt(agentConfig.id, params.sessionId)
  let systemPrompt =
    promptVersion?.systemPrompt || agentConfig.systemPrompt || ''

  // 2·media: ativa o envio de mídia (foto/vídeo/áudio/doc) ensinando as tags que o
  // pipeline outbound já converte. Conteúdo estático → fica cedo no prompt p/ ser
  // prefixo estável do prompt cache. Sem tool nova, sem bypassar a resiliência.
  systemPrompt = `${systemPrompt}\n\n${renderWhatsAppMediaGuide()}`

  // Observabilidade: coleta as decisões de setup conforme cada bloco roda.
  const decisionMeta: RuntimeDecisionMeta = {
    ...EMPTY_DECISION_META,
    promptVersionId: promptVersion?.id ?? null,
    memoryWindowSize: agentConfig.memoryWindow,
    enabledTools: agentConfig.enabledTools ?? [],
  }

  // 2a. Long-term memory: carrega o resumo da sessão anterior CLOSED do mesmo
  // contato (se houver) e injeta no system prompt. Wrap em try/catch — falha
  // de memória nunca deve derrubar o agente.
  try {
    const previousSummary = await loadPreviousSessionSummary(
      database as unknown as SessionSummaryPrismaLike,
      params.contactId,
      params.organizationId,
      { excludeSessionId: params.sessionId },
    )
    if (previousSummary?.summary) {
      systemPrompt = `${systemPrompt}\n\n## Contexto de conversa anterior\n\n${previousSummary.summary}`
      decisionMeta.previousSessionSummaryUsed = true
    }
  } catch (err) {
    console.warn(
      '[AgentRuntime] loadPreviousSessionSummary failed (ignored):',
      err,
    )
  }

  // 2a-bis. Lifelong contact memory: perfil cumulativo do contato (todas as
  // sessões fechadas, não só a última). Injetado após o resumo da sessão
  // anterior. Wrap em try/catch — falha de memória nunca derruba o agente.
  // Nota: params.contactId carrega o telefone do contato (mesma chave usada em
  // loadPreviousSessionSummary acima).
  try {
    const contactMemory = await loadContactMemory(
      params.organizationId,
      params.contactId,
    )
    if (contactMemory?.aggregatedProfile) {
      systemPrompt = `${systemPrompt}\n\n## Perfil do cliente\n\n${contactMemory.aggregatedProfile}`
    }
  } catch (err) {
    console.warn('[AgentRuntime] loadContactMemory failed (ignored):', err)
  }

  // 2a-ter. Rolling summary (Orayon): resumo incremental da sessão ATUAL,
  // atualizado a cada N turnos e mantido no Redis. Sobrevive à poda da janela
  // dinâmica/microcompact, mantendo o fio da conversa em diálogos longos.
  // Injetado após o perfil do cliente. Wrap em try/catch — sem rolling, segue.
  try {
    const redis = getRedis()
    const rollingSummary = await loadRollingSummary(redis, params.sessionId)
    if (rollingSummary) {
      systemPrompt = `${systemPrompt}\n\n## Resumo recente da conversa\n\n${rollingSummary}`
    }
  } catch (err) {
    console.warn('[AgentRuntime] loadRollingSummary failed (ignored):', err)
  }

  // 2b. Conditional skills: carrega skills do registry (.claude/skills/agent)
  // e ativa apenas as que batem com keywords/journey/customerJourney do turno
  // atual. Append no system prompt. Falha → segue sem skills.
  try {
    const skills = await getRegistrySkills()
    if (skills.length > 0) {
      const active = activateSkills(skills, {
        messageContent: params.messageContent,
        session: undefined, // session enriquecida será adicionada futuramente
      })
      if (active.length > 0) {
        systemPrompt = `${systemPrompt}\n\n${renderActiveSkills(active)}`
        decisionMeta.skillsActivated = active.map((s) => s.name)
      }
    }
  } catch (err) {
    console.warn('[AgentRuntime] skills activation failed (ignored):', err)
  }

  // 2c. RAG: se o agente tem base de conhecimento ativa, recupera os chunks mais
  // relevantes para a mensagem atual e injeta no system prompt (NÃO como tool —
  // decisão de design: economiza um passo do tool-loop e garante disponibilidade).
  // Falha (coleção vazia, extensão ausente, embedding indisponível) → segue sem RAG.
  if (agentConfig.useRAG && agentConfig.ragCollectionId) {
    decisionMeta.ragEnabled = true
    decisionMeta.ragCollectionId = agentConfig.ragCollectionId
    try {
      const chunks = await retrieveRelevantChunks({
        collectionId: agentConfig.ragCollectionId,
        query: params.messageContent,
        organizationId: params.organizationId,
      })
      decisionMeta.ragQueried = true
      decisionMeta.ragChunksRetrieved = chunks.length
      const ragBlock = buildContextBlock(chunks)
      if (ragBlock) {
        systemPrompt = `${systemPrompt}\n\n${ragBlock}`
      }
    } catch (err) {
      console.warn('[AgentRuntime] RAG retrieval failed (ignored):', err)
    }
  }

  // 3. Build conversation context from recent session messages.
  // Pegamos 2x a janela configurada para ter margem antes da window dinâmica.
  const rawHistory = await buildConversationContext(
    params.sessionId,
    agentConfig.memoryWindow * 2
  )

  // 3a. Dynamic memory window: calcula quantas mensagens cabem no budget
  // (system prompt + tools + output reservado + buffer) ANTES de chamar o
  // LLM. Substitui o `memoryWindow` fixo. Wrap em try/catch defensivo —
  // qualquer erro cai para o histórico bruto (já limitado por take=window*2).
  let conversationHistory = rawHistory
  try {
    const dynamicDecision = computeDynamicWindow(rawHistory, {
      maxTokens: agentConfig.maxTokens || 4096,
      systemPromptTokens: estimateMessageTokens(
        promptVersion?.systemPrompt || agentConfig.systemPrompt || ''
      ),
      toolsEstimateTokens: 300,
    })
    conversationHistory = applyWindow(rawHistory, dynamicDecision.window)
    decisionMeta.dynamicWindowSize = dynamicDecision.window
    decisionMeta.messagesDropped = dynamicDecision.droppedCount
    if (dynamicDecision.droppedCount > 0) {
      console.log(
        `[AgentRuntime] dynamic window: ${dynamicDecision.window}/${rawHistory.length} msgs (reason: ${dynamicDecision.reason})`
      )
    }
  } catch (err) {
    console.warn('[AgentRuntime] dynamic window failed (using raw history):', err)
  }

  // 3b. Time-based microcompact: se a última msg foi há > 30min, o prompt cache
  // da Anthropic já expirou (TTL 5min/1h). Substituir content de tool_results
  // antigos por placeholder reduz tokens sem perder estrutura conversacional.
  // Returns null quando não há cleanup a fazer (mantém histórico original).
  const compacted = timeBasedMicrocompact(
    conversationHistory.map((msg, i) => ({
      role: msg.role,
      content: msg.content,
      // Não temos timestamps por message aqui; usar índice como proxy
      // (microcompact identifica "antigas" por posição quando timestamp ausente).
      timestamp: new Date(Date.now() - (conversationHistory.length - i) * 60_000).toISOString(),
    })),
    { gapThresholdMinutes: 30, keepLast: 5 },
  )
  if (compacted) {
    conversationHistory = compacted.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    }))
  }

  // 4. Get enabled tools with execution context
  const toolContext: ToolExecutionContext = {
    sessionId: params.sessionId,
    contactId: params.contactId,
    connectionId: params.connectionId,
    organizationId: params.organizationId,
    agentConfigId: agentConfig.id,
    ragCollectionId: agentConfig.useRAG ? agentConfig.ragCollectionId : null,
  }
  const tools: ToolSet = {
    ...Object.fromEntries(
      Object.entries(getEnabledBuiltinTools(agentConfig.enabledTools, toolContext)).map(
        ([name, tool]) => [name, wrapToolWithTruncation(tool, 5000)],
      ),
    ),
    ...Object.fromEntries(
      Object.entries(await getCustomTools(agentConfig.enabledTools, toolContext)).map(
        ([name, tool]) => [name, wrapToolWithTruncation(tool, 5000)],
      ),
    ),
  }

  // 4b. Builder meta-agent hook: when the active agent is the reserved Builder,
  // merge in the 7 Builder tool factories so the meta-agent can actually act
  // on the platform (create agents, attach tools, launch instances, etc.).
  if (agentConfig.name === BUILDER_RESERVED_NAME) {
    const conv = await database.builderProjectConversation.findUnique({
      where: { id: params.sessionId },
      select: { projectId: true },
    })
    if (!conv) {
      throw new Error(
        `Builder conversation ${params.sessionId} not found — cannot resolve projectId for Builder toolset`
      )
    }
    Object.assign(
      tools,
      buildBuilderToolset({
        projectId: conv.projectId,
        organizationId: params.organizationId,
        userId: params.contactId,
      })
    )
  }

  // 5. Get LLM model instance — BYOK: when the caller didn't pass an explicit
  // key (e.g. the WhatsApp webhook), resolve the org-scoped key from
  // OrganizationProvider (falls back to env inside the resolver). This is what
  // makes the PUBLISHED agent honour the customer's own key, not the platform's.
  let resolvedApiKey = params.apiKey
  if (!resolvedApiKey) {
    try {
      const cred = await credentialResolver.resolve('AI', agentConfig.provider, {
        organizationId: params.organizationId,
        // BYOK por agente: usa a chave escolhida (se houver); senão fallback.
        organizationProviderId:
          (agentConfig as { organizationProviderId?: string | null }).organizationProviderId ??
          undefined,
      })
      resolvedApiKey = cred?.credentials?.apiKey
    } catch (err) {
      console.warn('[AgentRuntime] BYOK resolve failed, falling back to env:', err)
    }
  }
  // ── QH-05: Model router — decide full vs mini antes de instanciar o modelo ──
  // Busca o último AgentRuntimeDecision da sessão p/ obter previousTools.
  // Query barata (idx sessionId+createdAt). Fail-safe: qualquer erro → full model.
  let routedProvider = agentConfig.provider
  let routedModel = agentConfig.model
  try {
    const lastDecision = await database.agentRuntimeDecision.findFirst({
      where: { sessionId: params.sessionId },
      orderBy: { createdAt: 'desc' },
      select: { toolsCalled: true },
    })
    const routerResult = modelForTurn({
      previousTools: lastDecision?.toolsCalled as string[] | undefined,
      fullModel: { provider: agentConfig.provider, model: agentConfig.model },
      miniModel: parseMiniModelEnv(process.env.AGENT_MINI_MODEL),
    })
    routedProvider = routerResult.provider
    routedModel = routerResult.model
    decisionMeta.modelTier = routerResult.tier
    decisionMeta.modelRouterReason = routerResult.reason
  } catch (err) {
    console.warn('[AgentRuntime] modelForTurn failed (using full model):', err)
  }

  const model = getModel(routedProvider, routedModel, resolvedApiKey)

  // ── US-036: Token budget tracker ──────────────────────────────────────
  const systemTokens = estimateTokens(systemPrompt)
  const messagesTokens = conversationHistory.reduce(
    (sum, msg) => sum + estimateTokens(msg.content),
    0
  )
  const toolDefinitionsEstimate = 300
  const totalEstimatedTokens = systemTokens + messagesTokens + toolDefinitionsEstimate
  const maxTokens = agentConfig.maxTokens || 4096

  if (totalEstimatedTokens > maxTokens) {
    throw new ContextBudgetExhaustedError(totalEstimatedTokens, maxTokens)
  }

  if (totalEstimatedTokens > maxTokens * 0.80) {
    systemPrompt += '\n\n[SISTEMA: Contexto próximo do limite. Seja conciso nas próximas respostas.]'
  }

  // ── US-036: Context window guard ──────────────────────────────────────
  if (estimateTokens(systemPrompt) < 500) {
    console.warn(
      '[AgentRuntime] System prompt suspiciously short (<500 estimated tokens). Using fallback.'
    )
    systemPrompt =
      'Desculpe, estou com dificuldades no momento. Um atendente vai te ajudar em breve.'
  }

  // ── QH-03: Hard cap de custo por sessão — gate antes da chamada LLM ───
  // Lê totalAiCost da sessão como fallback; Redis é o fast-path O(1).
  // Fail-open: se checkSessionCostCap falhar, o agente continua normalmente.
  try {
    const session = await database.chatSession.findUnique({
      where: { id: params.sessionId },
      select: { totalAiCost: true },
    })
    const capCheck = await checkSessionCostCap({
      sessionId: params.sessionId,
      organizationId: params.organizationId,
      currentCostUsd: session?.totalAiCost ?? 0,
    })
    if (capCheck.exceeded) {
      // Bloqueia sessão de forma durável (fire-and-forget) e lança p/ o caller.
      void database.chatSession.update({
        where: { id: params.sessionId },
        data: {
          aiBlockedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
          aiBlockReason: capCheck.reason,
          aiEnabled: false,
        },
      }).catch((err: unknown) =>
        console.warn('[AgentRuntime] capBlock update failed:', err),
      )
      throw new Error(capCheck.reason ?? 'Session cost cap exceeded')
    }
  } catch (err) {
    // Re-lança erros de cap excedido; engole falhas inesperadas (fail-open).
    if (err instanceof Error && err.message.includes('cost cap')) throw err
    console.warn('[AgentRuntime] checkSessionCostCap failed (fail-open):', err)
  }

  // ── QH-11: Compute config hash (fire-and-forget — erro nunca derruba o agente) ─
  try {
    decisionMeta.configHash = computeConfigHash({
      systemPrompt,
      tools: decisionMeta.enabledTools,
      provider: routedProvider,
      model: routedModel,
      temperature: agentConfig.temperature ?? undefined,
      maxTokens: agentConfig.maxTokens ?? undefined,
    })
  } catch (err) {
    console.warn('[AgentRuntime] computeConfigHash failed (ignored):', err)
  }

  return {
    agentConfig,
    promptVersion,
    conversationHistory,
    tools,
    model,
    systemPrompt,
    startTime,
    // Resolved BYOK key (or undefined) so fallback model swaps reuse it.
    apiKey: resolvedApiKey,
    decisionMeta,
    routedProvider,
    routedModel,
  }
}

/**
 * Fire-and-forget metrics update shared by both sync and streaming runtimes.
 * Logs errors but never throws — metrics updates are non-critical.
 */
function updateRuntimeMetrics(
  agentConfig: NonNullable<PreparedAgentCall['agentConfig']>,
  promptVersion: PreparedAgentCall['promptVersion'],
  inputTokens: number,
  outputTokens: number,
  cost: { totalCost: number },
  latencyMs: number,
  toolCalls: Array<{ toolName: string }>
) {
  const updateAgentMetrics = database.aIAgentConfig.update({
    where: { id: agentConfig.id },
    data: {
      totalInputTokens: { increment: inputTokens },
      totalOutputTokens: { increment: outputTokens },
      totalCost: { increment: cost.totalCost },
      totalCalls: { increment: 1 },
    },
  })

  const updatePromptMetrics = promptVersion
    ? database.agentPromptVersion.update({
        where: { id: promptVersion.id },
        data: {
          totalMessages: { increment: 1 },
          totalCost: { increment: cost.totalCost },
          avgResponseTime: {
            set:
              promptVersion.totalMessages > 0
                ? (promptVersion.avgResponseTime *
                    promptVersion.totalMessages +
                    latencyMs) /
                  (promptVersion.totalMessages + 1)
                : latencyMs,
          },
          totalTransfers: {
            increment: toolCalls.some(
              (tc) => tc.toolName === 'transfer_to_human'
            )
              ? 1
              : 0,
          },
        },
      })
    : Promise.resolve()

  Promise.all([updateAgentMetrics, updatePromptMetrics]).catch((err) => {
    console.error('[AgentRuntime] Failed to update metrics:', err.message)
  })
}

// ── Main Runtime ─────────────────────────────────────────────────────────────

/**
 * Process an incoming message through the AI agent and return the response.
 *
 * Flow:
 *   1. Load agent config from DB
 *   2. Resolve active prompt version (supports A/B testing)
 *   3. Build conversation history from session messages
 *   4. Resolve enabled built-in tools
 *   5. Call LLM via Vercel AI SDK (with tool loop, maxSteps=5)
 *   6. Track cost and update agent + prompt version metrics
 *   7. Return structured response
 */
export async function processAgentMessage(
  params: ProcessAgentMessageParams
): Promise<AgentRuntimeResponse> {
  // ── QH-04: Contact lock — serializa turnos do mesmo contato ──────────────
  // Adquire antes de prepareAgentCall para cobrir todo o turno (incluindo I/O).
  // fail-open: se Redis indisponível, acquired=true e segue sem serialização.
  const lockResult = await acquireContactLock({
    organizationId: params.organizationId,
    contactPhone: params.contactId, // contactId IS the phone (see callers)
    ttlMs: 90_000,
  })
  if (!lockResult.acquired) {
    console.log(
      `[AgentRuntime] QH-04: lock não adquirido para contactId=${params.contactId} — descartando turno`,
    )
    // Return an empty response — caller (webhook) treats this as a no-op.
    return {
      text: '',
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      cost: { inputCost: 0, outputCost: 0, totalCost: 0 },
      latencyMs: 0,
      model: '',
      provider: '',
    }
  }

  try {
  // QH-13: log traceId no início do turno para correlação cross-worker.
  if (params.traceId) {
    console.info('[AgentRuntime] turno iniciado', {
      traceId: params.traceId,
      sessionId: params.sessionId,
      organizationId: params.organizationId,
    })
  }

  // RT-04: prepareAgentCall pode lançar ContextBudgetExhaustedError quando o
  // contexto estimado não cabe no budget. Sem captura, isso vira 500 no webhook
  // (cliente sem resposta, sem telemetria). Capturamos AQUI — antes de entrar no
  // bloco de execução do LLM — para devolver um fallback gracioso e registrar a
  // decisão exatamente uma vez. (Outros erros de setup continuam propagando.)
  let prepared: PreparedAgentCall
  try {
    prepared = await prepareAgentCall(params)
  } catch (error: unknown) {
    if (error instanceof ContextBudgetExhaustedError) {
      console.warn(
        `[AgentRuntime] RT-04: context budget exhausted (sync) — fallback gracioso:`,
        error.message,
      )
      void recordRuntimeDecision({
        ...EMPTY_DECISION_META,
        organizationId: params.organizationId,
        sessionId: params.sessionId,
        agentConfigId: params.agentConfigId,
        executionMode: 'sync',
        modelPrimary: '',
        providerPrimary: '',
        modelUsed: '',
        providerUsed: '',
        status: 'fallback',
        errorMessage: error.message,
      })
      return buildContextBudgetFallbackResponse()
    }
    throw error
  }

  const {
    agentConfig,
    promptVersion,
    conversationHistory,
    tools,
    model,
    systemPrompt,
    startTime,
    apiKey: resolvedApiKey,
    decisionMeta,
    routedModel,
    routedProvider,
  } = prepared

  // agentConfig is guaranteed non-null here (prepareAgentCall throws otherwise)
  if (!agentConfig) {
    throw new Error('Agent config missing after prepareAgentCall')
  }

  // ── Idempotência durável de turno ────────────────────────────────────────
  // Reivindica ANTES do LLM. Se o MESMO turno (sessão + msg inbound + config) já
  // foi concluído por uma entrega anterior, short-circuita SEM reenviar — backstop
  // durável (DB) para quando o dedup Redis do inbound falha-open (Redis down).
  // Só ativa no caminho de webhook (inboundMessageId presente). Fail-open dentro
  // de claimRuntimeTurn: erro de DB → processa.
  const decisionKey = computeDecisionIdempotencyKey(
    params.sessionId,
    params.inboundMessageId,
    decisionMeta.configHash,
  )
  if (decisionKey) {
    const claimed = await claimRuntimeTurn({
      decisionIdempotencyKey: decisionKey,
      organizationId: params.organizationId,
      sessionId: params.sessionId,
      agentConfigId: agentConfig.id,
      executionMode: 'sync',
      modelPrimary: agentConfig.model,
      providerPrimary: agentConfig.provider,
    })
    if (!claimed) {
      // Turno duplicado já concluído — no-op (o caller-webhook trata text vazio
      // como skip, exatamente como no lock-não-adquirido acima).
      return {
        text: '',
        toolCalls: [],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        cost: { inputCost: 0, outputCost: 0, totalCost: 0 },
        latencyMs: 0,
        model: '',
        provider: '',
      }
    }
  }

  // US-043 / RT-05: Check if primary provider is in cooldown (Redis-backed).
  const fallbackModel = (agentConfig as Record<string, unknown>).fallbackModel as string | undefined
  const providerKey = `${agentConfig.provider}:${agentConfig.model}`
  const isInCooldown = await isProviderInCooldown(providerKey)

  // Choose which model to use (skip primary if in cooldown and fallback exists).
  // QH-05: start from the router-resolved model (may be mini), not agentConfig.model.
  let activeModel = model
  let activeModelName = routedModel
  let activeProvider = routedProvider
  let usedFallback = false

  if (isInCooldown && fallbackModel) {
    console.log(`[AgentRuntime] Primary model ${agentConfig.model} in cooldown, using fallback ${fallbackModel}`)
    activeModel = getModel(agentConfig.provider, fallbackModel, resolvedApiKey ?? params.apiKey)
    activeModelName = fallbackModel
    activeProvider = agentConfig.provider
    usedFallback = true
  }

  // 6. Call LLM with automatic tool-calling loop + US-043 fallback
  // RT-10: token-budget StopCondition junto do stepCountIs (piso aplicado).
  const callGenerateText = async (llmModel: ReturnType<typeof getModel>) => {
    return generateText({
      model: llmModel,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: 'user', content: params.messageContent },
      ],
      tools,
      stopWhen: [
        stepCountIs(5),
        createBudgetStopCondition(budgetTokensFor(agentConfig.maxTokens)),
      ],
      temperature: agentConfig.temperature,
      maxOutputTokens: agentConfig.maxTokens,
      // Anthropic prompt caching: marks the system prompt as cacheable
      // (ephemeral TTL ~5min). Cuts input cost by 70-90% on long conversations
      // when the same system prompt is reused within the TTL window.
      ...(agentConfig.provider === 'anthropic'
        ? {
            providerOptions: {
              anthropic: {
                cacheControl: { type: 'ephemeral' as const },
              },
            },
          }
        : {}),
    })
  }

  try {
    // US-043 (refactored): retryWithFallback wraps the primary generateText
    // call with exponential backoff and an automatic fallback model after half
    // the attempts. Uses the legacy `isRetriableError` classifier (HTTP 429,
    // 5xx, timeout/aborted) to preserve existing behavior visible from tests.
    const retryResult = await retryWithFallback(
      () => callGenerateText(activeModel),
      !usedFallback && fallbackModel
        ? () => {
            const fb = getModel(agentConfig.provider, fallbackModel, resolvedApiKey ?? params.apiKey)
            activeModel = fb
            activeModelName = fallbackModel
            usedFallback = true
            return callGenerateText(fb)
          }
        : null,
      {
        maxAttempts: 3,
        baseDelayMs: 500,
        maxDelayMs: 5000,
        isRetriable: isRetriableError,
        // QH-06: circuit breaker por provider/modelo.
        circuitBreaker: {
          primaryProvider: routedProvider,
          primaryModel: routedModel,
          fallbackProvider: agentConfig.provider,
          fallbackModel: fallbackModel,
        },
      },
    )

    if (retryResult.error) {
      throw retryResult.error
    }

    if (retryResult.usedFallback) {
      // Trip the cooldown so subsequent calls skip the primary for 5min.
      // Fire-and-forget (fail-open): nunca bloqueia o turno por erro de Redis.
      void setProviderCooldown(providerKey)
      console.log(
        `[AgentRuntime] Used fallback model ${fallbackModel} (attempts=${retryResult.attemptsUsed})`,
      )
    }

    const result = retryResult.data!

    const latencyMs = Date.now() - startTime
    const inputTokens = result.usage?.inputTokens ?? 0
    const outputTokens = result.usage?.outputTokens ?? 0
    const cost = calculateCost(activeModelName, inputTokens, outputTokens)

    // 7. Extract tool calls from multi-step execution
    const toolCalls =
      result.steps
        ?.filter((step) => step.toolCalls && step.toolCalls.length > 0)
        .flatMap((step) =>
          step.toolCalls.map((tc) => ({
            toolName: tc.toolName,
            args: tc.input as Record<string, unknown>,
            result: step.toolResults?.find(
              (tr) => tr.toolCallId === tc.toolCallId
            )?.output,
          }))
        ) ?? []

    // 8. Update metrics (fire-and-forget, non-blocking)
    updateRuntimeMetrics(
      agentConfig,
      promptVersion,
      inputTokens,
      outputTokens,
      cost,
      latencyMs,
      toolCalls
    )

    // 8b. Persist turn na short-memory Redis (US-029 wire-up).
    // Fire-and-forget — erros são logados pelo próprio service.
    try {
      const redis = getRedis()
      void persistTurn(
        redis,
        params.sessionId,
        params.messageContent,
        result.text || '',
        params.organizationId,
      )
    } catch (err) {
      console.warn('[AgentRuntime] persistTurn skipped:', err)
    }

    // QH-03: Acumula custo no Redis após turno bem-sucedido (fire-and-forget).
    void incrementSessionCost(params.sessionId, cost.totalCost)

    // 8c. Observabilidade por turno (fire-and-forget — nunca derruba o agente).
    void recordRuntimeDecision({
      ...decisionMeta,
      organizationId: params.organizationId,
      sessionId: params.sessionId,
      agentConfigId: agentConfig.id,
      executionMode: 'sync',
      modelPrimary: agentConfig.model,
      providerPrimary: agentConfig.provider,
      modelUsed: activeModelName,
      providerUsed: activeProvider,
      fallbackTriggered: usedFallback,
      fallbackReason: usedFallback ? 'cooldown_or_retry' : null,
      toolsCalled: toolCalls.map((t) => t.toolName),
      toolIterations: result.steps?.length ?? 0,
      inputTokens,
      outputTokens,
      cachedTokens:
        (result.usage as { cachedInputTokens?: number } | undefined)
          ?.cachedInputTokens ?? 0,
      totalTokens: inputTokens + outputTokens,
      totalCost: cost.totalCost,
      latencyMs,
      status: 'success',
      decisionIdempotencyKey: decisionKey,
    })

    return {
      text: result.text || '',
      toolCalls,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      cost,
      latencyMs,
      model: activeModelName,
      provider: activeProvider,
      promptVersionId: promptVersion?.id,
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown LLM error'
    console.error(
      `[AgentRuntime] LLM call failed for agent "${agentConfig.name}":`,
      message
    )
    void recordRuntimeDecision({
      ...decisionMeta,
      organizationId: params.organizationId,
      sessionId: params.sessionId,
      agentConfigId: agentConfig.id,
      executionMode: 'sync',
      modelPrimary: agentConfig.model,
      providerPrimary: agentConfig.provider,
      modelUsed: activeModelName,
      providerUsed: activeProvider,
      fallbackTriggered: usedFallback,
      latencyMs: Date.now() - startTime,
      status: 'error',
      errorMessage: message,
      decisionIdempotencyKey: decisionKey,
    })
    throw error
  }
  } finally {
    // QH-04: sempre libera o lock — even on error/cap-exceeded.
    await releaseContactLock({
      organizationId: params.organizationId,
      contactPhone: params.contactId,
      token: lockResult.token ?? '',
    })
  }
}

// ── Streaming Runtime ────────────────────────────────────────────────────────

/**
 * Event yielded by `processAgentMessageStream` — a trimmed, stable shape
 * derived from `TextStreamPart` in the Vercel AI SDK. Only the subset
 * relevant to the Quayer Builder chat is exposed.
 */
export type AgentStreamEvent =
  | { type: 'text-delta'; text: string }
  | {
      type: 'tool-call'
      toolName: string
      args: Record<string, unknown>
    }
  | {
      type: 'tool-result'
      toolName: string
      result: unknown
    }
  | {
      type: 'finish'
      usage: {
        inputTokens: number
        outputTokens: number
        totalTokens: number
      }
      cost: {
        inputCost: number
        outputCost: number
        totalCost: number
      }
      latencyMs: number
      model: string
      provider: string
      toolCalls: Array<{
        toolName: string
        args: Record<string, unknown>
        result: unknown
      }>
    }
  | { type: 'error'; message: string }

/**
 * Streaming variant of `processAgentMessage` used by the Quayer Builder chat.
 *
 * Yields text deltas, tool calls, tool results, a final `finish` event with
 * aggregated usage/cost/toolCalls, and any `error` that surfaces from the
 * underlying `streamText()` call.
 *
 * Shares setup (agent config load, prompt resolution, history build, tool
 * wiring, model instantiation) with `processAgentMessage` via
 * `prepareAgentCall`. Metrics are updated fire-and-forget right before the
 * `finish` event is yielded, matching the non-streaming path.
 */
export async function* processAgentMessageStream(
  params: ProcessAgentMessageParams
): AsyncGenerator<AgentStreamEvent, void, unknown> {
  // ── QH-04: Contact lock ───────────────────────────────────────────────────
  const streamLockResult = await acquireContactLock({
    organizationId: params.organizationId,
    contactPhone: params.contactId,
    ttlMs: 90_000,
  })
  if (!streamLockResult.acquired) {
    console.log(
      `[AgentRuntime] QH-04: lock não adquirido (stream) para contactId=${params.contactId} — descartando turno`,
    )
    return
  }

  try {
  let prepared: PreparedAgentCall
  try {
    prepared = await prepareAgentCall(params)
  } catch (error: unknown) {
    // RT-04: budget estourado no setup → fallback gracioso (texto neutro +
    // finish) em vez de só um 'error'. Garante que o cliente receba ALGUMA
    // resposta e registra a decisão de runtime exatamente uma vez.
    if (error instanceof ContextBudgetExhaustedError) {
      console.warn(
        `[AgentRuntime] RT-04: context budget exhausted (stream) — fallback gracioso:`,
        error.message,
      )
      void recordRuntimeDecision({
        ...EMPTY_DECISION_META,
        organizationId: params.organizationId,
        sessionId: params.sessionId,
        agentConfigId: params.agentConfigId,
        executionMode: 'stream',
        modelPrimary: '',
        providerPrimary: '',
        modelUsed: '',
        providerUsed: '',
        status: 'fallback',
        errorMessage: error.message,
      })
      yield { type: 'text-delta', text: CONTEXT_BUDGET_FALLBACK_TEXT }
      yield {
        type: 'finish',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        cost: { inputCost: 0, outputCost: 0, totalCost: 0 },
        latencyMs: 0,
        model: '',
        provider: '',
        toolCalls: [],
      }
      return
    }
    const message =
      error instanceof Error ? error.message : 'Unknown agent setup error'
    yield { type: 'error', message }
    return
  }

  const {
    agentConfig,
    promptVersion,
    conversationHistory,
    tools,
    model,
    systemPrompt,
    startTime,
    decisionMeta,
    routedModel: preparedRoutedModel,
    routedProvider: preparedRoutedProvider,
  } = prepared

  if (!agentConfig) {
    yield { type: 'error', message: 'Agent config missing after prepareAgentCall' }
    return
  }

  // US-043 / RT-05: Check cooldown for streaming path (Redis-backed).
  const streamFallbackModel = (agentConfig as Record<string, unknown>).fallbackModel as string | undefined
  const streamProviderKey = `${agentConfig.provider}:${agentConfig.model}`
  const streamIsInCooldown = await isProviderInCooldown(streamProviderKey)

  // QH-05: start from the router-resolved model (may be mini).
  let streamActiveModel = model
  let streamActiveModelName = preparedRoutedModel
  // QH-05: track the routed provider for providerUsed in recordRuntimeDecision.
  let streamActiveProvider = preparedRoutedProvider

  if (streamIsInCooldown && streamFallbackModel) {
    console.log(`[AgentRuntime] Primary model ${agentConfig.model} in cooldown (stream), using fallback ${streamFallbackModel}`)
    streamActiveModel = getModel(agentConfig.provider, streamFallbackModel, prepared.apiKey ?? params.apiKey)
    streamActiveModelName = streamFallbackModel
    streamActiveProvider = agentConfig.provider
  }

  // Aggregators collected from the stream to build the final `finish` event.
  const toolCallArgsById = new Map<string, Record<string, unknown>>()
  const toolCallNameById = new Map<string, string>()
  const aggregatedToolCalls: Array<{
    toolName: string
    args: Record<string, unknown>
    result: unknown
  }> = []
  let inputTokens = 0
  let outputTokens = 0

  try {
    let result: ReturnType<typeof streamText>

    // RT-10: token-budget StopCondition junto do stepCountIs (piso aplicado).
    const callStreamText = (llmModel: ReturnType<typeof getModel>) =>
      streamText({
        model: llmModel,
        system: systemPrompt,
        messages: [
          ...conversationHistory,
          { role: 'user', content: params.messageContent },
        ],
        tools,
        stopWhen: [
          stepCountIs(5),
          createBudgetStopCondition(budgetTokensFor(agentConfig.maxTokens)),
        ],
        temperature: agentConfig.temperature,
        maxOutputTokens: agentConfig.maxTokens,
        ...(agentConfig.provider === 'anthropic'
          ? {
              providerOptions: {
                anthropic: {
                  cacheControl: { type: 'ephemeral' as const },
                },
              },
            }
          : {}),
      })

    try {
      result = callStreamText(streamActiveModel)
      // Eagerly test the stream by awaiting a property — if the model is down,
      // this may throw before we iterate. We rely on the for-await below to
      // surface errors for models that fail mid-stream.
    } catch (primaryError: unknown) {
      if (!streamIsInCooldown && streamFallbackModel && isRetriableError(primaryError)) {
        console.log(
          `[AgentRuntime] Primary model failed (stream), falling back to ${streamFallbackModel}`
        )
        void setProviderCooldown(streamProviderKey)
        streamActiveModel = getModel(agentConfig.provider, streamFallbackModel, prepared.apiKey ?? params.apiKey)
        streamActiveModelName = streamFallbackModel
        streamActiveProvider = agentConfig.provider
        result = callStreamText(streamActiveModel)
      } else {
        throw primaryError
      }
    }

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta': {
          if (part.text) {
            yield { type: 'text-delta', text: part.text }
          }
          break
        }
        case 'tool-call': {
          const args = (part.input ?? {}) as Record<string, unknown>
          toolCallArgsById.set(part.toolCallId, args)
          toolCallNameById.set(part.toolCallId, part.toolName)
          yield { type: 'tool-call', toolName: part.toolName, args }
          break
        }
        case 'tool-result': {
          const args = toolCallArgsById.get(part.toolCallId) ?? {}
          const toolName =
            toolCallNameById.get(part.toolCallId) ?? part.toolName
          const output = (part as { output?: unknown }).output
          aggregatedToolCalls.push({ toolName, args, result: output })
          yield { type: 'tool-result', toolName, result: output }
          break
        }
        case 'finish': {
          inputTokens = part.totalUsage?.inputTokens ?? 0
          outputTokens = part.totalUsage?.outputTokens ?? 0
          break
        }
        case 'error': {
          const message =
            part.error instanceof Error
              ? part.error.message
              : typeof part.error === 'string'
                ? part.error
                : 'Unknown stream error'
          yield { type: 'error', message }
          return
        }
        default:
          // Ignore events not relevant to the Builder chat (text-start,
          // text-end, reasoning-*, tool-input-*, source, file, start,
          // start-step, finish-step, abort, raw, tool-error, ...).
          break
      }
    }

    const latencyMs = Date.now() - startTime
    const cost = calculateCost(streamActiveModelName, inputTokens, outputTokens)

    // QH-03: Acumula custo no Redis após turno bem-sucedido (fire-and-forget).
    void incrementSessionCost(params.sessionId, cost.totalCost)

    // Fire-and-forget metrics update (non-blocking), mirroring the sync path.
    updateRuntimeMetrics(
      agentConfig,
      promptVersion,
      inputTokens,
      outputTokens,
      cost,
      latencyMs,
      aggregatedToolCalls
    )

    void recordRuntimeDecision({
      ...decisionMeta,
      organizationId: params.organizationId,
      sessionId: params.sessionId,
      agentConfigId: agentConfig.id,
      executionMode: 'stream',
      modelPrimary: agentConfig.model,
      providerPrimary: agentConfig.provider,
      modelUsed: streamActiveModelName,
      providerUsed: streamActiveProvider,
      fallbackTriggered: streamActiveModelName !== agentConfig.model,
      toolsCalled: aggregatedToolCalls.map((t) => t.toolName),
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      totalCost: cost.totalCost,
      latencyMs,
      status: 'success',
    })

    yield {
      type: 'finish',
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      cost,
      latencyMs,
      model: streamActiveModelName,
      provider: streamActiveProvider,
      toolCalls: aggregatedToolCalls,
    }
  } catch (error: unknown) {
    // US-043: On retriable stream error, attempt fallback
    if (!streamIsInCooldown && streamFallbackModel && isRetriableError(error)) {
      console.log(
        `[AgentRuntime] Primary model failed mid-stream, falling back to ${streamFallbackModel}`
      )
      void setProviderCooldown(streamProviderKey)
      yield { type: 'error', message: `Primary model failed, retrying with fallback model ${streamFallbackModel}` }
    } else {
      const message =
        error instanceof Error ? error.message : 'Unknown LLM stream error'
      console.error(
        `[AgentRuntime] LLM stream failed for agent "${agentConfig.name}":`,
        message
      )
      void recordRuntimeDecision({
        ...decisionMeta,
        organizationId: params.organizationId,
        sessionId: params.sessionId,
        agentConfigId: agentConfig.id,
        executionMode: 'stream',
        modelPrimary: agentConfig.model,
        providerPrimary: agentConfig.provider,
        modelUsed: streamActiveModelName,
        providerUsed: streamActiveProvider,
        latencyMs: Date.now() - startTime,
        status: 'error',
        errorMessage: message,
      })
      yield { type: 'error', message }
    }
  }
  } finally {
    // QH-04: sempre libera o lock após o turno (mesmo em erro/return precoce).
    await releaseContactLock({
      organizationId: params.organizationId,
      contactPhone: params.contactId,
      token: streamLockResult.token ?? '',
    })
  }
}

// ── Playground Runtime (stateless, no persistence) ──────────────────────────

export interface ProcessPlaygroundStreamParams {
  agentConfigId: string
  organizationId: string
  message: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
}

/**
 * Stateless streaming variant for the Playground tab.
 *
 * Differs from `processAgentMessageStream` in two ways:
 *   1. History is passed in-memory — never read from DB.
 *   2. No persistence side effects (no Message, BuilderToolCall, metrics update).
 *
 * Everything else (model selection, system prompt, built-in tools, cooldown
 * fallback) is shared via internal helpers from this file.
 */
export async function* processPlaygroundStream(
  params: ProcessPlaygroundStreamParams
): AsyncGenerator<AgentStreamEvent, void, unknown> {
  const startTime = Date.now()

  // 1. Load agent config
  let agentConfig: Awaited<ReturnType<typeof database.aIAgentConfig.findUnique>>
  try {
    agentConfig = await database.aIAgentConfig.findUnique({
      where: { id: params.agentConfigId },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'DB error loading agent config'
    yield { type: 'error', message }
    return
  }

  if (!agentConfig || !agentConfig.isActive) {
    yield {
      type: 'error',
      message: `Agent config ${params.agentConfigId} not found or inactive`,
    }
    return
  }

  // 2. Resolve active prompt (no A/B — sessionId not available in playground)
  const promptVersion = await getActivePrompt(agentConfig.id)
  let systemPrompt = promptVersion?.systemPrompt || agentConfig.systemPrompt || ''

  // 2·media: paridade com o runtime real (ver função sendAgentResponse acima) —
  // o preview tem que refletir o mesmo system prompt, incluindo o guia de mídia.
  systemPrompt = `${systemPrompt}\n\n${renderWhatsAppMediaGuide()}`

  // 3. Use caller-supplied history directly (no DB round-trip)
  const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> =
    params.history

  // 4. Wire built-in tools with a synthetic context
  const toolContext: import('./tools/builtin-tools').ToolExecutionContext = {
    sessionId: 'playground',
    contactId: 'playground',
    connectionId: 'playground',
    organizationId: params.organizationId,
    agentConfigId: agentConfig.id,
    ragCollectionId: agentConfig.useRAG ? agentConfig.ragCollectionId : null,
  }
  const tools: import('ai').ToolSet = {
    ...Object.fromEntries(
      Object.entries(getEnabledBuiltinTools(agentConfig.enabledTools, toolContext)).map(
        ([name, tool]) => [name, wrapToolWithTruncation(tool, 5000)],
      ),
    ),
    ...Object.fromEntries(
      Object.entries(await getCustomTools(agentConfig.enabledTools, toolContext)).map(
        ([name, tool]) => [name, wrapToolWithTruncation(tool, 5000)],
      ),
    ),
  }

  // 5. Token budget check (reuse same logic, lenient in playground)
  const systemTokens = estimateTokens(systemPrompt)
  const historyTokens = conversationHistory.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0
  )
  const totalEstimatedTokens = systemTokens + historyTokens + 300
  const maxTokens = agentConfig.maxTokens || 4096

  if (totalEstimatedTokens > maxTokens) {
    yield {
      type: 'error',
      message: `Context budget exhausted: estimated ${totalEstimatedTokens} tokens exceeds max ${maxTokens}`,
    }
    return
  }

  if (totalEstimatedTokens > maxTokens * 0.8) {
    systemPrompt +=
      '\n\n[SISTEMA: Contexto próximo do limite. Seja conciso nas próximas respostas.]'
  }

  if (estimateTokens(systemPrompt) < 500) {
    systemPrompt =
      'Desculpe, estou com dificuldades no momento. Um atendente vai te ajudar em breve.'
  }

  // 6. Model selection (same cooldown logic, Redis-backed — RT-05)
  const pgFallbackModel = (agentConfig as Record<string, unknown>).fallbackModel as string | undefined
  const pgProviderKey = `${agentConfig.provider}:${agentConfig.model}`
  const pgIsInCooldown = await isProviderInCooldown(pgProviderKey)

  let pgActiveModel = getModel(agentConfig.provider, agentConfig.model)
  let pgActiveModelName = agentConfig.model

  if (pgIsInCooldown && pgFallbackModel) {
    pgActiveModel = getModel(agentConfig.provider, pgFallbackModel)
    pgActiveModelName = pgFallbackModel
  }

  // 7. Stream
  const toolCallArgsById = new Map<string, Record<string, unknown>>()
  const toolCallNameById = new Map<string, string>()
  const aggregatedToolCalls: Array<{
    toolName: string
    args: Record<string, unknown>
    result: unknown
  }> = []
  let inputTokens = 0
  let outputTokens = 0

  // RT-10: token-budget StopCondition junto do stepCountIs (piso aplicado).
  const callStream = (m: ReturnType<typeof getModel>) =>
    streamText({
      model: m,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: 'user', content: params.message },
      ],
      tools,
      stopWhen: [
        stepCountIs(5),
        createBudgetStopCondition(budgetTokensFor(agentConfig!.maxTokens)),
      ],
      temperature: agentConfig!.temperature,
      maxOutputTokens: agentConfig!.maxTokens,
      ...(agentConfig!.provider === 'anthropic'
        ? {
            providerOptions: {
              anthropic: {
                cacheControl: { type: 'ephemeral' as const },
              },
            },
          }
        : {}),
    })

  try {
    let result: ReturnType<typeof streamText>

    try {
      result = callStream(pgActiveModel)
    } catch (primaryErr: unknown) {
      if (!pgIsInCooldown && pgFallbackModel && isRetriableError(primaryErr)) {
        void setProviderCooldown(pgProviderKey)
        pgActiveModel = getModel(agentConfig.provider, pgFallbackModel)
        pgActiveModelName = pgFallbackModel
        result = callStream(pgActiveModel)
      } else {
        throw primaryErr
      }
    }

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta': {
          if (part.text) yield { type: 'text-delta', text: part.text }
          break
        }
        case 'tool-call': {
          const args = (part.input ?? {}) as Record<string, unknown>
          toolCallArgsById.set(part.toolCallId, args)
          toolCallNameById.set(part.toolCallId, part.toolName)
          yield { type: 'tool-call', toolName: part.toolName, args }
          break
        }
        case 'tool-result': {
          const args = toolCallArgsById.get(part.toolCallId) ?? {}
          const toolName = toolCallNameById.get(part.toolCallId) ?? part.toolName
          const output = (part as { output?: unknown }).output
          aggregatedToolCalls.push({ toolName, args, result: output })
          yield { type: 'tool-result', toolName, result: output }
          break
        }
        case 'finish': {
          inputTokens = part.totalUsage?.inputTokens ?? 0
          outputTokens = part.totalUsage?.outputTokens ?? 0
          break
        }
        case 'error': {
          const msg =
            part.error instanceof Error
              ? part.error.message
              : typeof part.error === 'string'
                ? part.error
                : 'Unknown stream error'
          yield { type: 'error', message: msg }
          return
        }
        default:
          break
      }
    }

    const latencyMs = Date.now() - startTime
    const cost = calculateCost(pgActiveModelName, inputTokens, outputTokens)

    yield {
      type: 'finish',
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      cost,
      latencyMs,
      model: pgActiveModelName,
      provider: agentConfig.provider,
      toolCalls: aggregatedToolCalls,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown playground stream error'
    console.error(`[AgentRuntime:playground] LLM stream failed for agent "${agentConfig.name}":`, message)
    yield { type: 'error', message }
  }
}

// ── US-043: Retriable Error Detection ───────────────────────────────────────

/**
 * Determines if an LLM error is retriable (429, 5xx, or timeout).
 */
function isRetriableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()

  // Check for timeout
  if (message.includes('timeout') || message.includes('timed out') || message.includes('aborted')) {
    return true
  }

  // Check for status code in error message or properties
  const statusMatch = message.match(/\b(429|5\d{2})\b/)
  if (statusMatch) return true

  // Check for common status property on error objects
  const statusCode = (error as unknown as Record<string, unknown>).status ??
    (error as unknown as Record<string, unknown>).statusCode
  if (typeof statusCode === 'number') {
    return statusCode === 429 || (statusCode >= 500 && statusCode < 600)
  }

  return false
}

// ── Summarize-on-close helper ──────────────────────────────────────────────
//
// Helper exportado para gerar e persistir o resumo de uma sessão recém-fechada.
// Pode ser chamado por:
//   - lifecycle hook quando ChatSession.status muda para CLOSED
//   - job em background (BullMQ)
//   - script administrativo via Claude Code
//
// Comportamento defensivo: sem OPENAI_API_KEY, retorna false e loga; falha de
// OpenAI/persist retorna false sem throw. Idempotente — re-rodar substitui o
// resumo anterior em aiAgentContext.

export async function summarizeSessionOnClose(
  sessionId: string,
  openaiApiKey?: string,
): Promise<boolean> {
  const apiKey = openaiApiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.warn('[AgentRuntime] summarizeSessionOnClose: missing OPENAI_API_KEY')
    return false
  }

  // Buscar todas as messages da sessão em ordem cronológica.
  const messages = await database.message.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    select: { content: true, direction: true },
  })

  const formatted = messages.map((m) => ({
    role: m.direction === 'INBOUND' ? 'user' : 'assistant',
    content: m.content || '',
  }))

  const summary = await summarizeSession(formatted, { openaiApiKey: apiKey })
  if (!summary) return false

  return persistSessionSummary(
    database as unknown as SessionSummaryPrismaLike,
    sessionId,
    summary,
  )
}
