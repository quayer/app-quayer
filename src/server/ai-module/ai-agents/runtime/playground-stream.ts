/**
 * Agent Runtime — playground runtime (stateless, no persistence)
 *
 * Variante streaming stateless usada pela aba Playground (e pelo faithful
 * preview QH-08): histórico em memória, sem side-effects de persistência.
 * Extraído de `agent-runtime.service.ts` no split estrutural — comportamento
 * idêntico.
 */

import {
  streamText,
  stepCountIs,
} from 'ai'
import { database } from '@/server/services/database'
import { getModel } from '../services/provider-factory'
import { credentialResolver } from '@/lib/providers/credential-resolver.service'
import { getEnabledBuiltinTools } from '../tools/builtin-tools'
import { getCustomTools } from '../tools/custom-tools'
import { renderWhatsAppMediaGuide } from '../services/whatsapp-media-guide'
import {
  retrieveRelevantChunks,
  buildContextBlock,
} from '../knowledge/knowledge-retrieval.service'
import { type AgentStreamEvent } from './runtime.types'
import { getActivePrompt } from './context-builders'
import { estimateTokens, calculateCost } from './cost'
import {
  wrapToolWithTruncation,
  budgetTokensFor,
  createBudgetStopCondition,
} from './tool-loop'
import {
  isProviderInCooldown,
  setProviderCooldown,
  isRetriableError,
} from './provider-failover'
import { autoFlipTestDrive } from '@/server/ai-module/builder/state/auto-flip-test-drive'

// ── Playground Runtime (stateless, no persistence) ──────────────────────────

export interface ProcessPlaygroundStreamParams {
  agentConfigId: string
  organizationId: string
  message: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  /**
   * Fallback design-time: id da KnowledgeCollection do PROJETO (`kb:<projectId>`),
   * resolvido pelo caller (a rota do playground conhece o projeto). Usado quando
   * o agente ainda NÃO foi deployado — `useRAG`/`ragCollectionId` só são ligados
   * na saga de deploy, e sem isto o playground alucina sobre conteúdo que o
   * usuário acabou de ingerir nos cards. Opcional: callers existentes (faithful
   * preview) seguem inalterados.
   */
  knowledgeCollectionId?: string | null
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
  // o preview tem que refletir o mesmo system prompt, incluindo o guia de mídia
  // (instrução de buscar_media só quando a tool está habilitada).
  const previewHasMediaTool = (agentConfig.enabledTools ?? []).includes(
    'buscar_media',
  )
  systemPrompt = `${systemPrompt}\n\n${renderWhatsAppMediaGuide(previewHasMediaTool)}`

  // 2·rag: paridade com o runtime real (prepare-agent-call.ts §2c) — retrieval
  // pgvector da mensagem do turno injetado no system prompt, MESMO formato
  // (buildContextBlock). Diferença deliberada do playground: o vínculo
  // useRAG/ragCollectionId é garantido em DOIS pontos (backfill no create_agent +
  // passo materialize_knowledge da saga de deploy), mas o playground pode rodar
  // ANTES de qualquer um deles ter ligado (ex.: agente recém-criado sem fonte no
  // momento da criação, fonte colada depois e ainda sem deploy) — então aceitamos o
  // collectionId do PROJETO resolvido pelo caller como fallback. Fail-open TOTAL:
  // qualquer falha (sem collection, sem embeddings, pgvector fora) → segue SEM RAG,
  // nunca quebra o stream.
  const pgRagCollectionId =
    (agentConfig.useRAG ? agentConfig.ragCollectionId : null) ??
    params.knowledgeCollectionId ??
    null
  if (pgRagCollectionId) {
    try {
      const chunks = await retrieveRelevantChunks({
        collectionId: pgRagCollectionId,
        query: params.message,
        organizationId: params.organizationId,
      })
      const ragBlock = buildContextBlock(chunks)
      if (ragBlock) {
        systemPrompt = `${systemPrompt}\n\n${ragBlock}`
      }
    } catch (err) {
      console.warn(
        '[AgentRuntime:playground] RAG retrieval failed (ignored):',
        err instanceof Error ? err.message : String(err),
      )
    }

    // 2·catálogo: linha informativa com o count de fotos do projeto — evita o
    // agente NEGAR que existem fotos (P0). Pré-deploy as fotos curadas vivem em
    // knowledge_images (MediaAsset só é materializado pela saga), por isso o
    // max() entre os dois (a materialização gallery→MediaAsset é 1:1, então o
    // max evita double-count). NÃO envia mídia — só informa a existência.
    // Fail-open: erro → segue sem a linha.
    try {
      const [confirmedAssets, galleryImages] = await Promise.all([
        database.mediaAsset.count({
          where: {
            collectionId: pgRagCollectionId,
            organizationId: params.organizationId,
            mediaType: 'image',
            confirmedAt: { not: null },
            deletedAt: null,
          },
        }),
        database.knowledgeImage.count({
          where: {
            collectionId: pgRagCollectionId,
            organizationId: params.organizationId,
            deletedAt: null,
          },
        }),
      ])
      const photoCount = Math.max(confirmedAssets, galleryImages)
      if (photoCount > 0) {
        // Sem instrução de "como enviar" o LLM INVENTA urls de imagem (observado
        // em teste E2E). No playground não há envio real de mídia.
        systemPrompt = `${systemPrompt}\n\nCatálogo: ${photoCount} fotos do negócio cadastradas. NUNCA diga que não existem fotos, e NUNCA invente links/URLs de imagem: se pedirem fotos, diga que elas serão enviadas pelo WhatsApp quando o agente estiver publicado (neste modo de teste o envio de mídia fica desativado).`
      }
    } catch (err) {
      console.warn(
        '[AgentRuntime:playground] media catalog count failed (ignored):',
        err instanceof Error ? err.message : String(err),
      )
    }
  }

  // 3. Use caller-supplied history directly (no DB round-trip)
  const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> =
    params.history

  // 4. Wire built-in tools with a synthetic context
  const toolContext: import('../tools/builtin-tools').ToolExecutionContext = {
    sessionId: 'playground',
    contactId: 'playground',
    connectionId: 'playground',
    organizationId: params.organizationId,
    agentConfigId: agentConfig.id,
    // Mesmo fallback do bloco 2·rag: pré-deploy as tools (buscar_conhecimento /
    // buscar_media) enxergam a collection design-time do projeto. Para agentes
    // já deployados o valor é idêntico ao anterior (agentConfig.ragCollectionId).
    ragCollectionId: pgRagCollectionId,
    agentDepartmentId: agentConfig.departmentId ?? null,
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

  // BYOK — paridade com o runtime real (prepare-agent-call.ts §5): o playground
  // deve honrar a chave da org/agente, não a da plataforma. Fail-open: resolve
  // falhando → env key dentro do provider-factory.
  let pgApiKey: string | undefined
  try {
    const cred = await credentialResolver.resolve('AI', agentConfig.provider, {
      organizationId: params.organizationId,
      organizationProviderId:
        (agentConfig as { organizationProviderId?: string | null }).organizationProviderId ??
        undefined,
    })
    pgApiKey = cred?.credentials?.apiKey
  } catch (err) {
    console.warn('[AgentRuntime:playground] BYOK resolve failed, falling back to env:', err)
  }

  let pgActiveModel = getModel(agentConfig.provider, agentConfig.model, pgApiKey)
  let pgActiveModelName = agentConfig.model

  if (pgIsInCooldown && pgFallbackModel) {
    pgActiveModel = getModel(agentConfig.provider, pgFallbackModel, pgApiKey)
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
        pgActiveModel = getModel(agentConfig.provider, pgFallbackModel, pgApiKey)
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

    // Jornada v2 (T33): primeiro turno bem-sucedido do playground satisfaz o
    // passo Testar — flipa `confirmations.testDrive` (se ainda false) + emite
    // `test_done`. Resolve o projeto pelo agentConfigId. Fail-open TOTAL: o
    // helper nunca lança, então um erro de DB jamais quebra o stream; segundo
    // turno é no-op (sentinel já true).
    await autoFlipTestDrive({
      agentConfigId: agentConfig.id,
      organizationId: params.organizationId,
    })

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
