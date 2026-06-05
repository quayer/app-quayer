/**
 * outbound.service — orquestra o envio da resposta do agente IA de volta
 * para o WhatsApp do cliente.
 *
 * Fluxo:
 *   1. Busca Connection (token + baseUrl)
 *   2. Rate-limit (token bucket por contato + por org) — barra o turno se estourar
 *   3. Quebra agentText em blocos respeitando parágrafos (`\n\n`), até 800 chars
 *   4. Para cada bloco: envia via sender (UAZapi) com retry+backoff exponencial;
 *      ao esgotar tentativas, manda o payload para a dead-letter list. Marca
 *      bot-echo no Redis nos envios bem-sucedidos.
 *   5. Persiste 1 Message OUTBOUND no Postgres com waMessageId do primeiro
 *      envio bem-sucedido
 *
 * Dependências injetadas (deps pattern) para facilitar testes — sem vi.mock global.
 *
 * Resiliência (padrões Orayon — ver outbound-rate-limit.ts / outbound-deadletter.ts):
 *   - Rate-limit por contato + por org via Redis (INCR + EXPIRE, fail-open).
 *   - Retry com backoff exponencial (2^n*500ms, cap 30s, máx 3) por bloco.
 *   - Dead-letter (Redis list `outbound:deadletter`) ao esgotar retries.
 *
 * Importante:
 *   - Erros em blocos individuais não abortam os próximos (resiliência).
 *   - markBotMessage só é chamado em envios bem-sucedidos (evita echo zumbi).
 *   - Se 0 blocos forem enviados, NADA é persistido (não polui o histórico).
 *   - Rate-limit estourado → `rateLimited: true` e NADA é enviado.
 */

import { parseTags, type ParsedTag } from './tag-parser.service'
import { splitMessage, type MessageBlock } from './message-splitter.service'
import type {
  SendResult,
  SendOptions,
  SendButtonsPayload,
  SendCarouselPayload,
  SendListPayload,
} from './uazapi-sender.service'
import { synthesizeTtsToMediaUrl } from './tts.service'
import { checkOutboundRateLimit } from './outbound-rate-limit'
import { sendWithRetry } from './outbound-deadletter'
import type { AgentRuntimeSettings } from '@/lib/agent-runtime-settings'
import { checkRateLimit } from '@/server/ai-module/ai-agents/infra/rate-limit.service'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OutboundRequest {
  connectionId: string
  sessionId: string
  organizationId: string
  contactPhone: string
  agentText: string
  tts?: AgentRuntimeSettings['tts']
  /**
   * Per-turn AI attribution (cost/tokens/model). Persisted on the OUTBOUND
   * Message so spend and latency are queryable per reply. Optional — operator
   * (human) messages won't carry it.
   */
  aiMeta?: {
    model?: string
    provider?: string
    agentId?: string | null
    inputTokens?: number
    outputTokens?: number
    inputCost?: number
    outputCost?: number
    totalCost?: number
    latencyMs?: number
  }
}

export interface OutboundResult {
  blocksSent: number
  persisted: boolean
  errors: string[]
  /**
   * `true` quando o turno foi barrado por rate-limit (contato ou org) e NADA
   * foi enviado. O caller isola isso como uma não-falha de infra.
   */
  rateLimited?: boolean
}

/**
 * Subset estrutural do PrismaClient que o orchestrator usa.
 * Mantido frouxo para evitar acoplamento com a versão exata do Prisma client.
 */
export interface OutboundDatabase {
  connection: {
    findFirst: (args: {
      where: Record<string, unknown>
      select?: Record<string, boolean>
    }) => Promise<{
      id: string
      uazapiToken?: string | null
      uazapiBaseUrl?: string | null
    } | null>
  }
  message: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>
  }
  chatSession?: {
    update?: (args: unknown) => Promise<unknown>
    findFirst?: (args: unknown) => Promise<unknown>
  }
}

export interface OutboundSender {
  sendText: (
    token: string,
    baseUrl: string,
    recipient: string,
    content: string,
    options?: SendOptions,
  ) => Promise<SendResult>
  sendImage?: (
    token: string,
    baseUrl: string,
    recipient: string,
    imageUrl: string,
    caption?: string,
    options?: SendOptions,
  ) => Promise<SendResult>
  sendAudio?: (
    token: string,
    baseUrl: string,
    recipient: string,
    audioUrl: string,
    options?: SendOptions,
  ) => Promise<SendResult>
  sendDocument?: (
    token: string,
    baseUrl: string,
    recipient: string,
    documentUrl: string,
    caption?: string,
    options?: SendOptions,
  ) => Promise<SendResult>
  sendVideo?: (
    token: string,
    baseUrl: string,
    recipient: string,
    videoUrl: string,
    caption?: string,
    options?: SendOptions,
  ) => Promise<SendResult>
  sendLocation?: (
    token: string,
    baseUrl: string,
    recipient: string,
    location: NonNullable<MessageBlock['location']>,
    options?: SendOptions,
  ) => Promise<SendResult>
  sendButtons?: (
    token: string,
    baseUrl: string,
    recipient: string,
    payload: SendButtonsPayload,
    options?: SendOptions,
  ) => Promise<SendResult>
  sendList?: (
    token: string,
    baseUrl: string,
    recipient: string,
    payload: SendListPayload,
    options?: SendOptions,
  ) => Promise<SendResult>
  sendCarousel?: (
    token: string,
    baseUrl: string,
    recipient: string,
    payload: SendCarouselPayload,
    options?: SendOptions,
  ) => Promise<SendResult>
}

export interface OutboundDeps {
  database: OutboundDatabase
  sender: OutboundSender
  markBotMessage: (organizationId: string, externalMessageId: string) => Promise<boolean>
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const MAX_BLOCK_CHARS = 800
/** Fallback de baseUrl quando a Connection não traz um. */
const FALLBACK_BASE_URL = process.env.UAZAPI_BASE_URL ?? 'https://api.uazapi.com'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function sendAgentResponse(
  req: OutboundRequest,
  deps: OutboundDeps,
): Promise<OutboundResult> {
  const errors: string[] = []

  // 1. Connection lookup
  const connection = await deps.database.connection.findFirst({
    where: { id: req.connectionId, organizationId: req.organizationId },
  })
  if (!connection) {
    errors.push(`Connection ${req.connectionId} não encontrada para org ${req.organizationId}`)
    return { blocksSent: 0, persisted: false, errors }
  }
  if (!connection.uazapiToken) {
    errors.push(`Connection ${req.connectionId} sem uazapiToken configurado`)
    return { blocksSent: 0, persisted: false, errors }
  }

  const baseUrl = connection.uazapiBaseUrl ?? FALLBACK_BASE_URL

  // 2. Rate-limit (Orayon token bucket: por contato + por org). Consome cota
  //    UMA vez por turno — não dentro do loop de blocos. Fail-open por dentro.
  const rl = await checkOutboundRateLimit(req.organizationId, req.contactPhone)
  if (!rl.allowed) {
    const msg = `rate_limited scope=${rl.scope} current=${rl.current} limit=${rl.limit} org=${req.organizationId}`
    console.warn(`[outbound] ${msg}`)
    errors.push(msg)
    return { blocksSent: 0, persisted: false, errors, rateLimited: true }
  }

  // QH-02: Rate limit por instância (60 msgs/min por connectionId) — token bucket
  // Redis Lua. Fail-open: Redis down → allowed=true, retryAfterMs=0.
  // Quando excedido, o turno é barrado com rateLimited=true (mesma semântica do
  // checkOutboundRateLimit acima). O caller (webhook route) já trata rateLimited
  // como não-erro de infra — o lead é preservado no histórico via Message INBOUND
  // já persistida antes do envio.
  const instanceRl = await checkRateLimit({ scope: 'instance', key: req.connectionId })
  if (!instanceRl.allowed) {
    const msg = `rate_limited scope=instance key=${req.connectionId} retryAfterMs=${instanceRl.retryAfterMs}`
    console.warn(`[outbound] QH-02: ${msg}`)
    errors.push(msg)
    return { blocksSent: 0, persisted: false, errors, rateLimited: true }
  }

  // 3. Parse tags ricas + split de texto puro
  const blocks = buildOutboundBlocks(req.agentText, MAX_BLOCK_CHARS)

  // 4. Envio sequencial + bot-echo tracking. Cada bloco usa retry+backoff
  //    exponencial; ao esgotar, vai para a dead-letter (sem derrubar o turno).
  let blocksSent = 0
  let firstSuccessMessageId: string | undefined

  for (const block of blocks) {
    const result = await sendWithRetry(
      () =>
        sendBlock(
          deps.sender,
          connection.uazapiToken as string,
          baseUrl,
          req.contactPhone,
          block,
          req.organizationId,
          req.tts,
        ),
      {
        organizationId: req.organizationId,
        phone: req.contactPhone,
        text: block.content,
      },
    )

    if (result.success) {
      blocksSent += 1
      if (result.messageId) {
        if (!firstSuccessMessageId) firstSuccessMessageId = result.messageId
        // Marca echo para o webhook OUT do UAZapi não reprocessar.
        await deps.markBotMessage(req.organizationId, result.messageId)
      }
    } else {
      errors.push(result.error ?? 'erro desconhecido')
    }
  }

  // 5. Persistência (só se enviou algo)
  if (blocksSent === 0) {
    return { blocksSent: 0, persisted: false, errors }
  }

  try {
    await deps.database.message.create({
      data: {
        sessionId: req.sessionId,
        connectionId: req.connectionId,
        contactPhone: req.contactPhone,
        // waMessageId é unique no schema. Caímos no firstSuccessMessageId; se
        // o provider não retornou (raro), usamos um sentinel determinístico.
        waMessageId: firstSuccessMessageId ?? `outbound-${req.sessionId}-${Date.now()}`,
        direction: 'OUTBOUND',
        type: 'text',
        author: 'AI',
        content: req.agentText,
        status: 'sent',
        sentAt: new Date(),
        // Per-turn AI attribution (these columns existed but were always NULL).
        ...(req.aiMeta
          ? {
              aiModel: req.aiMeta.model,
              aiProvider: req.aiMeta.provider,
              aiAgentId: req.aiMeta.agentId ?? undefined,
              inputTokens: req.aiMeta.inputTokens,
              outputTokens: req.aiMeta.outputTokens,
              inputCost: req.aiMeta.inputCost,
              outputCost: req.aiMeta.outputCost,
              totalCost: req.aiMeta.totalCost,
              aiLatency: req.aiMeta.latencyMs,
            }
          : {}),
      },
    })
    return { blocksSent, persisted: true, errors }
  } catch (err) {
    errors.push(
      `persist Message failed: ${err instanceof Error ? err.message : String(err)}`,
    )
    return { blocksSent, persisted: false, errors }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Divide o texto em blocos de até `maxChars`, respeitando:
 *   1. Parágrafos (`\n\n`) — preferencial
 *   2. Palavras (espaço) — fallback quando um parágrafo é maior que maxChars
 *
 * Garantia: nenhum bloco corta no meio de uma palavra (ASCII/UTF-8 — split
 * por espaços, não por bytes).
 *
 * Exportado para testes; uso primário interno.
 */
export function splitIntoBlocks(text: string, maxChars: number): string[] {
  return splitMessage(text, { maxChars, useDelay: false }).map((block) => block.content)
}

function buildOutboundBlocks(text: string, maxChars: number): MessageBlock[] {
  const parsed = parseTags(text)
  if (parsed.tagsFound.length === 0) {
    return splitMessage(text, { maxChars })
  }

  const blocks: MessageBlock[] = []
  const parts = parsed.textWithPlaceholders.split(/(__TAG_\d+__)/g)

  for (const part of parts) {
    if (!part) continue

    const placeholder = /^__TAG_(\d+)__$/.exec(part)
    if (placeholder) {
      const tag = parsed.tagsFound[Number(placeholder[1])]
      if (tag) blocks.push(blockFromTag(tag, blocks.length))
      continue
    }

    blocks.push(
      ...splitMessage(part, { maxChars }).map((block) => ({
        ...block,
        index: blocks.length + block.index,
      })),
    )
  }

  return blocks.map((block, index) => ({
    ...block,
    index,
    delay_ms: index === 0 ? 0 : block.delay_ms,
  }))
}

function blockFromTag(tag: ParsedTag, index: number): MessageBlock {
  return {
    type: tag.type,
    content: tag.content ?? tag.caption ?? tag.raw,
    url: tag.url,
    caption: tag.caption,
    index,
    delay_ms: index === 0 ? 0 : undefined,
    buttons: tag.buttons,
    list: tag.list,
    location: tag.location,
    flow: tag.flow,
    carousel: tag.carousel,
    cta_url: tag.cta_url,
  }
}

async function sendBlock(
  sender: OutboundSender,
  token: string,
  baseUrl: string,
  recipient: string,
  block: MessageBlock,
  organizationId: string,
  tts?: AgentRuntimeSettings['tts'],
): Promise<SendResult> {
  const options = { delayMs: block.delay_ms }

  switch (block.type) {
    case 'text':
      if (tts?.enabled && sender.sendAudio) {
        try {
          const audioUrl = await synthesizeTtsToMediaUrl({
            organizationId,
            text: block.content,
            settings: tts,
          })
          if (audioUrl) {
            return sender.sendAudio(token, baseUrl, recipient, audioUrl, options)
          }
        } catch (err) {
          console.warn(
            '[outbound] TTS failed, falling back to text:',
            err instanceof Error ? err.message : String(err),
          )
        }
      }
      return sender.sendText(token, baseUrl, recipient, block.content, options)
    case 'image':
      if (sender.sendImage && block.url) {
        return sender.sendImage(token, baseUrl, recipient, block.url, block.caption, options)
      }
      return sendFallbackText(sender, token, baseUrl, recipient, block, options)
    case 'audio':
      if (sender.sendAudio && block.url) {
        return sender.sendAudio(token, baseUrl, recipient, block.url, options)
      }
      return sendFallbackText(sender, token, baseUrl, recipient, block, options)
    case 'document':
      if (sender.sendDocument && block.url) {
        return sender.sendDocument(token, baseUrl, recipient, block.url, block.caption, options)
      }
      return sendFallbackText(sender, token, baseUrl, recipient, block, options)
    case 'video':
      if (sender.sendVideo && block.url) {
        return sender.sendVideo(token, baseUrl, recipient, block.url, block.caption, options)
      }
      return sendFallbackText(sender, token, baseUrl, recipient, block, options)
    case 'location':
      if (sender.sendLocation && block.location) {
        return sender.sendLocation(token, baseUrl, recipient, block.location, options)
      }
      return sendFallbackText(sender, token, baseUrl, recipient, block, options)
    case 'buttons':
      if (sender.sendButtons && block.buttons?.length) {
        return sender.sendButtons(
          token,
          baseUrl,
          recipient,
          { text: block.content, buttons: block.buttons },
          options,
        )
      }
      return sendFallbackText(sender, token, baseUrl, recipient, block, options)
    case 'list':
      if (sender.sendList && block.list?.sections.length) {
        return sender.sendList(
          token,
          baseUrl,
          recipient,
          { text: block.content, button: block.list.button, sections: block.list.sections },
          options,
        )
      }
      return sendFallbackText(sender, token, baseUrl, recipient, block, options)
    case 'carousel':
      if (sender.sendCarousel && block.carousel?.cards.length) {
        return sender.sendCarousel(
          token,
          baseUrl,
          recipient,
          { text: block.content, cards: block.carousel.cards },
          options,
        )
      }
      return sendFallbackText(sender, token, baseUrl, recipient, block, options)
    case 'cta_url':
    case 'flow':
      return sendFallbackText(sender, token, baseUrl, recipient, block, options)
    default:
      return sendFallbackText(sender, token, baseUrl, recipient, block, options)
  }
}

function sendFallbackText(
  sender: OutboundSender,
  token: string,
  baseUrl: string,
  recipient: string,
  block: MessageBlock,
  options: SendOptions,
): Promise<SendResult> {
  return sender.sendText(token, baseUrl, recipient, fallbackTextForBlock(block), options)
}

function fallbackTextForBlock(block: MessageBlock): string {
  if (block.type === 'cta_url' && block.cta_url) {
    return [block.content, `${block.cta_url.display_text}: ${block.cta_url.url}`]
      .filter(Boolean)
      .join('\n')
  }
  if (block.type === 'flow' && block.flow) {
    const flowLabel = block.flow.flow_name ?? block.flow.flow_id
    return [block.flow.flow_cta, flowLabel ? `Formulario: ${flowLabel}` : 'Formulario']
      .filter(Boolean)
      .join('\n')
  }
  if (block.type === 'location' && block.location) {
    const { latitude, longitude, name, address } = block.location
    return [name, address, `https://maps.google.com/?q=${latitude},${longitude}`]
      .filter(Boolean)
      .join('\n')
  }
  if (block.url) {
    return [block.caption ?? block.content, block.url].filter(Boolean).join('\n')
  }
  if (block.buttons?.length) {
    return [block.content, ...block.buttons.map((button) => `- ${button.title}`)]
      .filter(Boolean)
      .join('\n')
  }
  if (block.list?.sections.length) {
    const rows = block.list.sections.flatMap((section) => [
      section.title,
      ...section.rows.map((row) => `- ${row.title}`),
    ])
    return [block.content, ...rows].filter(Boolean).join('\n')
  }
  if (block.carousel?.cards.length) {
    const cards = block.carousel.cards.map((card) =>
      [card.body, card.button_url ?? card.header_url].filter(Boolean).join(' - '),
    )
    return [block.content, ...cards].filter(Boolean).join('\n')
  }
  return block.content
}
