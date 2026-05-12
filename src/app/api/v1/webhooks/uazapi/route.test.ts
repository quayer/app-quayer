/**
 * UAZapi inbound webhook — unit tests (TDD red phase).
 *
 * Cobre o handler POST que recebe mensagens inbound do WhatsApp via uazapi e
 * dispara o runtime de IA do Quayer. O handler ainda não foi implementado —
 * estes testes vão FALHAR com "module not found" enquanto o arquivo
 * `route.ts` não existir. Isso é esperado no ciclo TDD (red → green → refactor).
 *
 * Fluxo coberto (analogia simplificada ao process-message do granvinhas):
 *  1. Valida secret header `X-Webhook-Secret`.
 *  2. Resolve `Connection` por `uazapiInstanceId` ou `uazapiToken`.
 *  3. Bot-echo guard para mensagens OUT.
 *  4. Upsert de `ChatSession` por (contactPhone, connectionId, organizationId).
 *  5. Cria `Message` INBOUND.
 *  6. Dispara `processAgentMessage` quando aplicável.
 *  7. Falhas do agente NÃO derrubam o webhook — apenas logam.
 *
 * Não testa o outbound de resposta (deferido para sprint 2).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/server/services/database', () => ({
  database: {
    connection: { findFirst: vi.fn() },
    chatSession: { findFirst: vi.fn(), create: vi.fn() },
    message: { create: vi.fn() },
  },
}))

vi.mock('@/server/communication/services/bot-echo-guard.service', () => ({
  isBotEcho: vi.fn(),
  markBotMessage: vi.fn(),
}))

vi.mock('@/server/ai-module/ai-agents/agent-runtime.service', () => ({
  processAgentMessage: vi.fn(),
}))

vi.mock('@/server/communication/services/inbound-pipeline.service', () => ({
  processInboundMessage: vi.fn(),
}))

vi.mock('@/server/communication/services/outbound.service', () => ({
  sendAgentResponse: vi.fn(),
}))

vi.mock('@/server/communication/services/typing-indicator.service', () => ({
  sendTypingIndicator: vi.fn(),
}))

vi.mock('@/server/communication/services/uazapi-sender.service', () => ({
  sendText: vi.fn(),
  sendImage: vi.fn(),
  sendAudio: vi.fn(),
  sendTyping: vi.fn(),
  normalizePhone: vi.fn((p: string) => p),
}))

vi.mock('@/server/services/redis', () => ({
  getRedis: vi.fn(() => ({})),
  redis: {},
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const WEBHOOK_URL = 'https://homol.quayer.com/api/v1/webhooks/uazapi'

interface MakeRequestOpts {
  body?: unknown
  secret?: string | null
  bodyRaw?: string
}

function makeRequest(opts: MakeRequestOpts = {}): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (opts.secret !== null && opts.secret !== undefined) {
    headers['x-webhook-secret'] = opts.secret
  }
  const body =
    opts.bodyRaw !== undefined ? opts.bodyRaw : JSON.stringify(opts.body ?? {})
  return new NextRequest(WEBHOOK_URL, {
    method: 'POST',
    headers,
    body,
  })
}

/**
 * Payload UAZ inbound canônico (cliente -> bot). `direction` é inferido pelo
 * `fromMe` no payload real — usamos a forma normalizada que o handler espera.
 */
function inboundPayload(overrides: Record<string, unknown> = {}) {
  return {
    event: 'messages',
    instance: 'uaz-instance-abc',
    token: 'uaz-token-xyz',
    data: {
      id: 'wamid.MSG-123',
      from: '5511999998888',
      fromMe: false,
      direction: 'IN',
      type: 'text',
      body: 'Olá, gostaria de saber sobre o serviço',
      timestamp: 1715472000,
      ...overrides,
    },
  }
}

function outboundPayload(overrides: Record<string, unknown> = {}) {
  return inboundPayload({
    fromMe: true,
    direction: 'OUT',
    id: 'wamid.MSG-OUT-1',
    ...overrides,
  })
}

const FAKE_CONNECTION = {
  id: 'conn-1',
  organizationId: 'org-1',
  uazapiInstanceId: 'uaz-instance-abc',
  uazapiToken: 'uaz-token-xyz',
  aiAgentId: 'agent-config-1',
}

const FAKE_SESSION_OPEN = {
  id: 'session-1',
  contactPhone: '5511999998888',
  connectionId: 'conn-1',
  organizationId: 'org-1',
  status: 'OPEN',
  aiEnabled: true,
  aiBlockedUntil: null,
}

// ── Setup ─────────────────────────────────────────────────────────────────────

const ORIGINAL_ENV = { ...process.env }

beforeEach(async () => {
  vi.clearAllMocks()
  vi.resetModules()
  process.env = { ...ORIGINAL_ENV }
  process.env.UAZAPI_WEBHOOK_SECRET = 'super-secret-token'

  const { database } = await import('@/server/services/database')
  const { isBotEcho } = await import(
    '@/server/communication/services/bot-echo-guard.service'
  )
  const { processAgentMessage } = await import(
    '@/server/ai-module/ai-agents/agent-runtime.service'
  )
  const { processInboundMessage } = await import(
    '@/server/communication/services/inbound-pipeline.service'
  )
  const { sendAgentResponse } = await import(
    '@/server/communication/services/outbound.service'
  )
  const { sendTypingIndicator } = await import(
    '@/server/communication/services/typing-indicator.service'
  )

  // Default happy-path responses — testes individuais sobrescrevem.
  ;(database.connection.findFirst as any).mockResolvedValue(FAKE_CONNECTION)
  ;(database.chatSession.findFirst as any).mockResolvedValue(FAKE_SESSION_OPEN)
  ;(database.chatSession.create as any).mockImplementation(
    async ({ data }: any) => ({
      id: 'session-new',
      status: 'OPEN',
      aiEnabled: true,
      aiBlockedUntil: null,
      ...data,
    }),
  )
  ;(database.message.create as any).mockImplementation(
    async ({ data }: any) => ({
      id: 'msg-new-1',
      ...data,
    }),
  )
  ;(isBotEcho as any).mockResolvedValue(false)
  ;(processAgentMessage as any).mockResolvedValue({
    text: 'Olá! Como posso ajudar?',
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    cost: { inputCost: 0, outputCost: 0, totalCost: 0 },
    latencyMs: 100,
    model: 'gpt-4o-mini',
    provider: 'openai',
  })

  // Pipeline default: dispatch=true, enrichedContent = data.body do payload.
  ;(processInboundMessage as any).mockImplementation(async (input: any) => {
    const body = input?.payload?.data?.body ?? ''
    return {
      shouldDispatchAi: true,
      normalized: null,
      enrichedContent: body,
      mediaProcessed: false,
      bufferConcatenated: false,
      processingSteps: ['normalize'],
    }
  })
  ;(sendAgentResponse as any).mockResolvedValue({
    blocksSent: 1,
    errors: [],
    persisted: true,
  })
  ;(sendTypingIndicator as any).mockResolvedValue(undefined)
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UAZapi webhook — secret validation', () => {
  it('retorna 401 quando X-Webhook-Secret está ausente', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeRequest({ body: inboundPayload(), secret: null }))

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('retorna 401 quando X-Webhook-Secret está errado', async () => {
    const { POST } = await import('./route')
    const res = await POST(
      makeRequest({ body: inboundPayload(), secret: 'wrong-secret' }),
    )

    expect(res.status).toBe(401)
  })

  it('retorna 503 quando UAZAPI_WEBHOOK_SECRET não está configurado (refuse to operate)', async () => {
    delete process.env.UAZAPI_WEBHOOK_SECRET

    const { POST } = await import('./route')
    const res = await POST(
      makeRequest({ body: inboundPayload(), secret: 'super-secret-token' }),
    )

    expect(res.status).toBe(503)
  })
})

describe('UAZapi webhook — connection resolution', () => {
  it('retorna 404 quando nenhuma Connection bate com instance ou token do payload', async () => {
    const { database } = await import('@/server/services/database')
    ;(database.connection.findFirst as any).mockResolvedValueOnce(null)

    const { POST } = await import('./route')
    const res = await POST(
      makeRequest({
        body: inboundPayload(),
        secret: 'super-secret-token',
      }),
    )

    expect(res.status).toBe(404)
  })

  it('procura Connection por uazapiInstanceId OU uazapiToken', async () => {
    const { database } = await import('@/server/services/database')

    const { POST } = await import('./route')
    await POST(
      makeRequest({ body: inboundPayload(), secret: 'super-secret-token' }),
    )

    expect(database.connection.findFirst).toHaveBeenCalledTimes(1)
    const callArg = (database.connection.findFirst as any).mock.calls[0][0]
    // Espera-se uma busca por instance OU token — qualquer forma OR é aceita.
    const stringified = JSON.stringify(callArg)
    expect(stringified).toContain('uaz-instance-abc')
  })
})

describe('UAZapi webhook — bot-echo guard (outbound)', () => {
  it('quando direction=OUT e isBotEcho=true → 200 com skip:bot_echo e NÃO cria Message', async () => {
    const { isBotEcho } = await import(
      '@/server/communication/services/bot-echo-guard.service'
    )
    const { database } = await import('@/server/services/database')
    ;(isBotEcho as any).mockResolvedValueOnce(true)

    const { POST } = await import('./route')
    const res = await POST(
      makeRequest({
        body: outboundPayload(),
        secret: 'super-secret-token',
      }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skip).toBe('bot_echo')
    expect(database.message.create).not.toHaveBeenCalled()
  })

  it('chama isBotEcho com (organizationId, externalMessageId) corretos', async () => {
    const { isBotEcho } = await import(
      '@/server/communication/services/bot-echo-guard.service'
    )
    ;(isBotEcho as any).mockResolvedValueOnce(true)

    const { POST } = await import('./route')
    await POST(
      makeRequest({
        body: outboundPayload({ id: 'wamid.OUT-XYZ' }),
        secret: 'super-secret-token',
      }),
    )

    expect(isBotEcho).toHaveBeenCalledWith('org-1', 'wamid.OUT-XYZ')
  })

  it('quando direction=OUT e isBotEcho=false → cria Message com author=HUMAN (operador no painel)', async () => {
    const { isBotEcho } = await import(
      '@/server/communication/services/bot-echo-guard.service'
    )
    const { database } = await import('@/server/services/database')
    ;(isBotEcho as any).mockResolvedValueOnce(false)

    const { POST } = await import('./route')
    const res = await POST(
      makeRequest({
        body: outboundPayload(),
        secret: 'super-secret-token',
      }),
    )

    expect(res.status).toBe(200)
    expect(database.message.create).toHaveBeenCalledTimes(1)
    const createArg = (database.message.create as any).mock.calls[0][0]
    // author deve ser AGENT (operador humano) — não CUSTOMER e não AI.
    expect(['AGENT', 'HUMAN', 'BUSINESS']).toContain(createArg.data.author)
    expect(createArg.data.author).not.toBe('CUSTOMER')
    expect(createArg.data.author).not.toBe('AI')
  })
})

describe('UAZapi webhook — ChatSession upsert', () => {
  it('cria ChatSession nova quando não há sessão OPEN para o contato', async () => {
    const { database } = await import('@/server/services/database')
    ;(database.chatSession.findFirst as any).mockResolvedValueOnce(null)

    const { POST } = await import('./route')
    const res = await POST(
      makeRequest({ body: inboundPayload(), secret: 'super-secret-token' }),
    )

    expect(res.status).toBe(200)
    expect(database.chatSession.create).toHaveBeenCalledTimes(1)
    const createArg = (database.chatSession.create as any).mock.calls[0][0]
    expect(createArg.data.contactPhone).toBe('5511999998888')
    expect(createArg.data.connectionId).toBe('conn-1')
    expect(createArg.data.organizationId).toBe('org-1')
    expect(createArg.data.status).toBe('OPEN')
  })

  it('reutiliza ChatSession existente OPEN — não cria nova', async () => {
    const { database } = await import('@/server/services/database')
    // FAKE_SESSION_OPEN já está em default — apenas valida que não cria.

    const { POST } = await import('./route')
    const res = await POST(
      makeRequest({ body: inboundPayload(), secret: 'super-secret-token' }),
    )

    expect(res.status).toBe(200)
    expect(database.chatSession.create).not.toHaveBeenCalled()
    // O sessionId retornado deve ser o existente.
    const body = await res.json()
    expect(body.sessionId).toBe('session-1')
  })

  it('cria nova ChatSession se a anterior está CLOSED', async () => {
    const { database } = await import('@/server/services/database')
    ;(database.chatSession.findFirst as any).mockResolvedValueOnce({
      ...FAKE_SESSION_OPEN,
      status: 'CLOSED',
    })
    // Segunda chamada (após decidir criar) — handler pode ou não fazer mais
    // um findFirst, então permitimos null fallback.

    const { POST } = await import('./route')
    const res = await POST(
      makeRequest({ body: inboundPayload(), secret: 'super-secret-token' }),
    )

    expect(res.status).toBe(200)
    expect(database.chatSession.create).toHaveBeenCalledTimes(1)
  })
})

describe('UAZapi webhook — Message creation', () => {
  it('cria Message INBOUND com content correto', async () => {
    const { database } = await import('@/server/services/database')

    const { POST } = await import('./route')
    const res = await POST(
      makeRequest({
        body: inboundPayload({ body: 'Quero saber preços' }),
        secret: 'super-secret-token',
      }),
    )

    expect(res.status).toBe(200)
    expect(database.message.create).toHaveBeenCalledTimes(1)
    const createArg = (database.message.create as any).mock.calls[0][0]
    expect(createArg.data.direction).toBe('INBOUND')
    expect(createArg.data.content).toBe('Quero saber preços')
    expect(createArg.data.contactPhone).toBe('5511999998888')
    expect(createArg.data.connectionId).toBe('conn-1')
  })

  it('cria Message com type apropriado (text → text)', async () => {
    const { database } = await import('@/server/services/database')

    const { POST } = await import('./route')
    await POST(
      makeRequest({
        body: inboundPayload({ type: 'text' }),
        secret: 'super-secret-token',
      }),
    )

    const createArg = (database.message.create as any).mock.calls[0][0]
    // Aceita formas comuns: 'text', 'TEXT'.
    expect(['text', 'TEXT']).toContain(createArg.data.type)
  })
})

describe('UAZapi webhook — AI runtime dispatch', () => {
  it('quando direction=IN, agentConfigId existe e session.aiEnabled=true → chama processAgentMessage com params corretos', async () => {
    const { processAgentMessage } = await import(
      '@/server/ai-module/ai-agents/agent-runtime.service'
    )

    const { POST } = await import('./route')
    const res = await POST(
      makeRequest({ body: inboundPayload(), secret: 'super-secret-token' }),
    )

    expect(res.status).toBe(200)
    expect(processAgentMessage).toHaveBeenCalledTimes(1)
    const callArg = (processAgentMessage as any).mock.calls[0][0]
    expect(callArg).toMatchObject({
      agentConfigId: 'agent-config-1',
      sessionId: 'session-1',
      connectionId: 'conn-1',
      organizationId: 'org-1',
      messageContent: 'Olá, gostaria de saber sobre o serviço',
    })
  })

  it('quando session.aiEnabled=false → NÃO chama processAgentMessage', async () => {
    const { database } = await import('@/server/services/database')
    const { processAgentMessage } = await import(
      '@/server/ai-module/ai-agents/agent-runtime.service'
    )
    ;(database.chatSession.findFirst as any).mockResolvedValueOnce({
      ...FAKE_SESSION_OPEN,
      aiEnabled: false,
    })

    const { POST } = await import('./route')
    const res = await POST(
      makeRequest({ body: inboundPayload(), secret: 'super-secret-token' }),
    )

    expect(res.status).toBe(200)
    expect(processAgentMessage).not.toHaveBeenCalled()
  })

  it('quando session.aiBlockedUntil é futuro → NÃO chama processAgentMessage', async () => {
    const { database } = await import('@/server/services/database')
    const { processAgentMessage } = await import(
      '@/server/ai-module/ai-agents/agent-runtime.service'
    )
    const futureTime = new Date(Date.now() + 60 * 60 * 1000) // +1h
    ;(database.chatSession.findFirst as any).mockResolvedValueOnce({
      ...FAKE_SESSION_OPEN,
      aiBlockedUntil: futureTime,
    })

    const { POST } = await import('./route')
    const res = await POST(
      makeRequest({ body: inboundPayload(), secret: 'super-secret-token' }),
    )

    expect(res.status).toBe(200)
    expect(processAgentMessage).not.toHaveBeenCalled()
  })

  it('quando connection.aiAgentId é null → NÃO chama processAgentMessage', async () => {
    const { database } = await import('@/server/services/database')
    const { processAgentMessage } = await import(
      '@/server/ai-module/ai-agents/agent-runtime.service'
    )
    ;(database.connection.findFirst as any).mockResolvedValueOnce({
      ...FAKE_CONNECTION,
      aiAgentId: null,
    })

    const { POST } = await import('./route')
    const res = await POST(
      makeRequest({ body: inboundPayload(), secret: 'super-secret-token' }),
    )

    expect(res.status).toBe(200)
    expect(processAgentMessage).not.toHaveBeenCalled()
  })

  it('falha do processAgentMessage NÃO derruba o handler — retorna 200 com ai_error', async () => {
    const { processAgentMessage } = await import(
      '@/server/ai-module/ai-agents/agent-runtime.service'
    )
    ;(processAgentMessage as any).mockRejectedValueOnce(
      new Error('OpenAI rate limit'),
    )

    const { POST } = await import('./route')
    const res = await POST(
      makeRequest({ body: inboundPayload(), secret: 'super-secret-token' }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.ai_error).toBeDefined()
    expect(typeof body.ai_error).toBe('string')
  })
})

describe('UAZapi webhook — payload validation', () => {
  it('retorna 400 quando o body não é JSON válido', async () => {
    const { POST } = await import('./route')
    const res = await POST(
      makeRequest({ bodyRaw: '{not valid json', secret: 'super-secret-token' }),
    )

    expect(res.status).toBe(400)
  })

  it('retorna 400 quando payload está faltando campos essenciais (sem data.from)', async () => {
    const { POST } = await import('./route')
    const res = await POST(
      makeRequest({
        body: {
          event: 'messages',
          instance: 'uaz-instance-abc',
          data: { id: 'x', body: 'oi', type: 'text' },
        },
        secret: 'super-secret-token',
      }),
    )

    expect(res.status).toBe(400)
  })
})

describe('UAZapi webhook — successful response shape', () => {
  it('retorna { ok: true, sessionId, messageId } em sucesso completo', async () => {
    const { POST } = await import('./route')
    const res = await POST(
      makeRequest({ body: inboundPayload(), secret: 'super-secret-token' }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.sessionId).toBeDefined()
    expect(body.messageId).toBeDefined()
  })
})

// ── New integration tests (pipeline + outbound + typing) ────────────────────

describe('UAZapi webhook — inbound pipeline (Whisper/Vision/Buffer)', () => {
  it('22. audio: processInboundMessage é chamado e enrichedContent vira o content da Message (transcrição)', async () => {
    const { processInboundMessage } = await import(
      '@/server/communication/services/inbound-pipeline.service'
    )
    const { processAgentMessage } = await import(
      '@/server/ai-module/ai-agents/agent-runtime.service'
    )
    const { database } = await import('@/server/services/database')

    ;(processInboundMessage as any).mockResolvedValueOnce({
      shouldDispatchAi: true,
      normalized: null,
      enrichedContent: 'transcrição via Whisper',
      mediaProcessed: true,
      bufferConcatenated: false,
      processingSteps: ['normalize', 'whisper'],
    })

    const { POST } = await import('./route')
    const res = await POST(
      makeRequest({
        body: inboundPayload({
          type: 'audio',
          body: '',
          media_url: 'https://example.com/audio.ogg',
          media_mimetype: 'audio/ogg',
        }),
        secret: 'super-secret-token',
      }),
    )

    expect(res.status).toBe(200)
    expect(processInboundMessage).toHaveBeenCalledTimes(1)
    // Message foi criada com o conteúdo transcrito
    const createMessageArg = (database.message.create as any).mock.calls[0][0]
    expect(createMessageArg.data.content).toBe('transcrição via Whisper')
    // processAgentMessage recebe o conteúdo enriquecido
    expect(processAgentMessage).toHaveBeenCalledTimes(1)
    expect((processAgentMessage as any).mock.calls[0][0].messageContent).toBe(
      'transcrição via Whisper',
    )
  })

  it('23. buffer waiting: quando shouldDispatchAi=false → 200 com waiting/reason e NÃO chama processAgentMessage', async () => {
    const { processInboundMessage } = await import(
      '@/server/communication/services/inbound-pipeline.service'
    )
    const { processAgentMessage } = await import(
      '@/server/ai-module/ai-agents/agent-runtime.service'
    )
    const { database } = await import('@/server/services/database')

    ;(processInboundMessage as any).mockResolvedValueOnce({
      shouldDispatchAi: false,
      normalized: null,
      enrichedContent: 'parcial',
      mediaProcessed: false,
      bufferConcatenated: false,
      reason: 'WAITING_FOR_MORE_MESSAGES',
      processingSteps: ['normalize', 'buffer'],
    })

    const { POST } = await import('./route')
    const res = await POST(
      makeRequest({ body: inboundPayload(), secret: 'super-secret-token' }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.waiting).toBe(true)
    expect(body.reason).toBe('WAITING_FOR_MORE_MESSAGES')
    expect(processAgentMessage).not.toHaveBeenCalled()
    // Também não criamos Message ainda — esperamos os próximos fragmentos.
    expect(database.message.create).not.toHaveBeenCalled()
  })
})

describe('UAZapi webhook — outbound dispatch', () => {
  it('24. outbound sucesso: sendAgentResponse é chamado após AI e response inclui outbound', async () => {
    const { sendAgentResponse } = await import(
      '@/server/communication/services/outbound.service'
    )

    ;(sendAgentResponse as any).mockResolvedValueOnce({
      blocksSent: 2,
      errors: [],
      persisted: true,
    })

    const { POST } = await import('./route')
    const res = await POST(
      makeRequest({ body: inboundPayload(), secret: 'super-secret-token' }),
    )

    expect(res.status).toBe(200)
    expect(sendAgentResponse).toHaveBeenCalledTimes(1)

    const callArg = (sendAgentResponse as any).mock.calls[0][0]
    expect(callArg).toMatchObject({
      connectionId: 'conn-1',
      sessionId: 'session-1',
      organizationId: 'org-1',
      contactPhone: '5511999998888',
      agentText: 'Olá! Como posso ajudar?',
    })

    const body = await res.json()
    expect(body.ai_response).toBe('Olá! Como posso ajudar?')
    expect(body.outbound).toBeDefined()
    expect(body.outbound.blocksSent).toBe(2)
    expect(body.outbound.errors).toEqual([])
  })

  it('25. outbound falha NÃO derruba o webhook: retorna 200 com ai_response e outbound.errors preenchido', async () => {
    const { sendAgentResponse } = await import(
      '@/server/communication/services/outbound.service'
    )

    ;(sendAgentResponse as any).mockRejectedValueOnce(new Error('UAZ 500'))

    const { POST } = await import('./route')
    const res = await POST(
      makeRequest({ body: inboundPayload(), secret: 'super-secret-token' }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.ai_response).toBe('Olá! Como posso ajudar?')
    expect(body.outbound).toBeDefined()
    expect(body.outbound.errors.length).toBeGreaterThan(0)
    expect(body.outbound.errors[0]).toContain('UAZ 500')
  })
})

describe('UAZapi webhook — typing indicator', () => {
  it('26. sendTypingIndicator é chamado antes de processAgentMessage (ordem de invocação)', async () => {
    const { sendTypingIndicator } = await import(
      '@/server/communication/services/typing-indicator.service'
    )
    const { processAgentMessage } = await import(
      '@/server/ai-module/ai-agents/agent-runtime.service'
    )

    const { POST } = await import('./route')
    const res = await POST(
      makeRequest({ body: inboundPayload(), secret: 'super-secret-token' }),
    )

    expect(res.status).toBe(200)
    expect(sendTypingIndicator).toHaveBeenCalledTimes(1)
    expect(processAgentMessage).toHaveBeenCalledTimes(1)

    const typingOrder = (sendTypingIndicator as any).mock.invocationCallOrder[0]
    const aiOrder = (processAgentMessage as any).mock.invocationCallOrder[0]
    expect(typingOrder).toBeLessThan(aiOrder)

    // Sanity: typing recebe (token, baseUrl, contactPhone)
    const typingArgs = (sendTypingIndicator as any).mock.calls[0]
    expect(typingArgs[0]).toBe('uaz-token-xyz')
    expect(typeof typingArgs[1]).toBe('string') // baseUrl
    expect(typingArgs[2]).toBe('5511999998888')
  })
})
