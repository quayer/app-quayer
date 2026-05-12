/**
 * outbound.service — orquestra o envio da resposta do agente IA de volta
 * para o WhatsApp do cliente.
 *
 * Fluxo:
 *   1. Busca Connection (token + baseUrl)
 *   2. Quebra agentText em blocos respeitando parágrafos (`\n\n`), até 800 chars
 *   3. Para cada bloco: envia via sender (UAZapi), marca bot-echo no Redis
 *   4. Persiste 1 Message OUTBOUND no Postgres com waMessageId do primeiro
 *      envio bem-sucedido
 *
 * Dependências injetadas (deps pattern) para facilitar testes — sem vi.mock global.
 *
 * Importante:
 *   - Erros em blocos individuais não abortam os próximos (resiliência).
 *   - markBotMessage só é chamado em envios bem-sucedidos (evita echo zumbi).
 *   - Se 0 blocos forem enviados, NADA é persistido (não polui o histórico).
 */

import type { SendResult, SendOptions } from './uazapi-sender.service'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OutboundRequest {
  connectionId: string
  sessionId: string
  organizationId: string
  contactPhone: string
  agentText: string
}

export interface OutboundResult {
  blocksSent: number
  persisted: boolean
  errors: string[]
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

/** Interface mínima do sender — só sendText hoje, expansível para image/audio. */
export interface OutboundSender {
  sendText: (
    token: string,
    baseUrl: string,
    recipient: string,
    content: string,
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

  // 2. Split em blocos
  const blocks = splitIntoBlocks(req.agentText, MAX_BLOCK_CHARS)

  // 3. Envio sequencial + bot-echo tracking
  let blocksSent = 0
  let firstSuccessMessageId: string | undefined

  for (const block of blocks) {
    const result = await deps.sender.sendText(
      connection.uazapiToken,
      baseUrl,
      req.contactPhone,
      block,
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

  // 4. Persistência (só se enviou algo)
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
  if (!text) return []
  if (text.length <= maxChars) return [text]

  const paragraphs = text.split(/\n\n+/)
  const blocks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    if (para.length > maxChars) {
      // parágrafo grande: empurra o `current` antes e quebra por palavras
      if (current) {
        blocks.push(current)
        current = ''
      }
      for (const sub of splitByWords(para, maxChars)) {
        blocks.push(sub)
      }
      continue
    }

    const candidate = current ? `${current}\n\n${para}` : para
    if (candidate.length <= maxChars) {
      current = candidate
    } else {
      if (current) blocks.push(current)
      current = para
    }
  }

  if (current) blocks.push(current)
  return blocks
}

function splitByWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/)
  const out: string[] = []
  let cur = ''
  for (const w of words) {
    if (!w) continue
    const candidate = cur ? `${cur} ${w}` : w
    if (candidate.length <= maxChars) {
      cur = candidate
    } else {
      if (cur) out.push(cur)
      cur = w
    }
  }
  if (cur) out.push(cur)
  return out
}
