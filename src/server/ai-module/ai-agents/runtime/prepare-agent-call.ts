/**
 * Agent Runtime — shared setup (prepareAgentCall)
 *
 * Setup compartilhado entre `processAgentMessage` e `processAgentMessageStream`:
 * carga do agent config, prompt version, memórias (sessão anterior, contato,
 * rolling), skills condicionais, RAG, janela dinâmica, microcompact, toolset,
 * BYOK, model router (QH-05), gates (US-036 budget, QH-03 cost cap) e config
 * hash (QH-11). Extraído de `agent-runtime.service.ts` no split estrutural —
 * comportamento idêntico.
 */

import { type ToolSet } from 'ai'
import { database } from '@/server/services/database'
import { getModel } from '../services/provider-factory'
import { retrieveRelevantChunks, buildContextBlock } from '../knowledge/knowledge-retrieval.service'
import {
  EMPTY_DECISION_META,
  type RuntimeDecisionMeta,
} from '../services/runtime-decision.service'
import { credentialResolver } from '@/lib/providers/credential-resolver.service'
import { getRedis } from '@/server/services/redis'
import { getEnabledBuiltinTools, type ToolExecutionContext } from '../tools/builtin-tools'
import { getCustomTools } from '../tools/custom-tools'
import { BUILDER_RESERVED_NAME } from '@/server/ai-module/builder/builder.constants'
import { buildBuilderToolset } from '@/server/ai-module/builder/tools'
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
import { timeBasedMicrocompact } from '../services/microcompact.service'
import {
  loadPreviousSessionSummary,
  type PrismaLike as SessionSummaryPrismaLike,
} from '../services/session-summary.service'
import { loadContactMemory } from '@/server/communication/services/contact-memory.service'
import { loadRollingSummary } from '../services/rolling-summary.service'
import {
  activateSkills,
  renderActiveSkills,
} from '../services/skill-activator.service'
import { renderWhatsAppMediaGuide } from '../services/whatsapp-media-guide'
import {
  computeDynamicWindow,
  applyWindow,
  estimateTokens as estimateMessageTokens,
} from '../services/memory-window.service'
import {
  checkSessionCostCap,
} from '../infra/hard-caps.service'
// ── QH-05: Model router ───────────────────────────────────────────────────────
import {
  modelForTurn,
  parseMiniModelEnv,
} from '../services/model-router.service'
// ── QH-11: Config hash ────────────────────────────────────────────────────────
import { computeConfigHash } from '../services/config-hash.service'
import {
  ContextBudgetExhaustedError,
  type PreparedAgentCall,
  type ProcessAgentMessageParams,
} from './runtime.types'
import {
  buildConversationContext,
  getActivePrompt,
  getRegistrySkills,
} from './context-builders'
import { estimateTokens } from './cost'
import { wrapToolWithTruncation } from './tool-loop'

// ── Provider Factory ─────────────────────────────────────────────────────────
// Imported from ../services/provider-factory.ts (shared with Builder tools)

/**
 * Shared setup for both `processAgentMessage` and `processAgentMessageStream`.
 * Loads agent config, resolves active prompt, builds conversation history,
 * wires built-in tools, and instantiates the Vercel AI SDK model.
 */
export async function prepareAgentCall(
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
  // prefixo estável do prompt cache. A instrução de chamar `buscar_media` só entra
  // quando a tool ESTÁ habilitada (senão mandaria chamar tool inexistente).
  const hasMediaTool = (agentConfig.enabledTools ?? []).includes('buscar_media')
  systemPrompt = `${systemPrompt}\n\n${renderWhatsAppMediaGuide(hasMediaTool)}`

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
    agentDepartmentId: agentConfig.departmentId ?? null,
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
      // Bloqueia sessão de forma DURÁVEL antes de lançar — awaited de propósito:
      // o antigo fire-and-forget engolia falha do write e a sessão NÃO ficava
      // bloqueada (cap re-verificado a cada turno sem efeito durável). Caminho
      // raro (só quando o cap estourou), então o roundtrip extra é aceitável.
      try {
        await database.chatSession.update({
          where: { id: params.sessionId },
          data: {
            aiBlockedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
            aiBlockReason: capCheck.reason,
            aiEnabled: false,
          },
        })
      } catch (blockErr: unknown) {
        // Não-fatal: o throw abaixo já interrompe ESTE turno; o bloqueio durável
        // é re-tentado no próximo turno (o cap continua excedido).
        console.warn('[AgentRuntime] capBlock update failed:', blockErr)
      }
      // O prefixo 'cost cap' é OBRIGATÓRIO: o catch externo re-lança APENAS
      // mensagens contendo 'cost cap'. Antes, um `capCheck.reason` sem esse
      // texto (ex: em português) era ENGOLIDO pelo fail-open e o agente
      // continuava rodando com o cap estourado.
      throw new Error(
        `Session cost cap exceeded${capCheck.reason ? `: ${capCheck.reason}` : ''}`,
      )
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
