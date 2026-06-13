/**
 * outbound.types — tipos públicos compartilhados pela camada de envio outbound.
 *
 * Extraído de outbound.service.ts para respeitar FILE_SIZE_GUIDELINES e quebrar
 * a dependência circular service↔blocks (outbound-blocks.service importa
 * `OutboundSender`). Sem lógica — apenas contratos.
 */

import type { MessageBlock } from './message-splitter.service'
import type {
  SendResult,
  SendOptions,
  SendButtonsPayload,
  SendCarouselPayload,
  SendListPayload,
} from './uazapi-sender.service'
import type { AgentRuntimeSettings } from '@/lib/agent-runtime-settings'

export interface OutboundRequest {
  connectionId: string
  sessionId: string
  organizationId: string
  contactPhone: string
  agentText: string
  tts?: AgentRuntimeSettings['tts']
  /**
   * QH-02: nº da tentativa de retry deste envio. 0/ausente = envio original.
   * Incrementado a cada reenfileiramento pelo worker de retry; ao atingir
   * MAX_RETRY_ATTEMPTS, o turno barrado por rate-limit de instância vai para a
   * dead-letter em vez de reenfileirar de novo.
   */
  attempt?: number
  /**
   * FSM outbound durável: chave de idempotência sha256(sessionId:inboundMessageId)
   * que ancora o checkpoint POR BLOCO. AUSENTE → envio SEM checkpoint
   * (comportamento legado de HOJE: reenvia todos os blocos no retry). PRESENTE
   * (+ dep `outboundDispatch` injetada) → claim por dispatchKey: 'sent' = skip
   * idempotente; 'sending'/'partial' (crash) = retoma pulando blocos já enviados.
   * FAIL-OPEN: qualquer falha de dispatch cai para o caminho legado, NUNCA
   * bloqueia a mensagem.
   */
  dispatchKey?: string
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
  /**
   * QH-02: `true` quando o turno foi barrado pelo limite de INSTÂNCIA e um retry
   * com delay foi agendado (a resposta NÃO foi perdida — será reenviada). Quando
   * `false` com `rateLimited:true`, o retry esgotou e foi para a dead-letter.
   */
  retryScheduled?: boolean
  /** QH-02: delay (ms) com que o retry foi agendado, para observabilidade. */
  retryAfterMs?: number
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
  /**
   * FSM outbound durável (OPCIONAL — loose-typed igual ao resto do subset).
   * Ausente → fail-open: o service cai para o envio SEM checkpoint (legado).
   * Presente + `req.dispatchKey` → claim/checkpoint por bloco do providerMessageId.
   */
  outboundDispatch?: {
    findUnique: (args: {
      where: { dispatchKey: string }
    }) => Promise<{ status: string; blocks: unknown; sentBlocks: number; attempt: number } | null>
    upsert: (args: {
      where: { dispatchKey: string }
      create: Record<string, unknown>
      update: Record<string, unknown>
    }) => Promise<{ status: string; blocks: unknown; attempt: number } | null>
    update: (args: {
      where: { dispatchKey: string }
      data: Record<string, unknown>
    }) => Promise<unknown>
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
  /**
   * QH-02: agenda um retry deste envio com `delayMs` (injetado para não acoplar
   * o service à fila BullMQ — testes injetam um spy). Quando ausente, um turno
   * barrado pelo limite de instância vai direto para a dead-letter.
   */
  scheduleRetry?: (
    payload: OutboundRequest & { attempt: number },
    delayMs: number,
  ) => Promise<void>
}
