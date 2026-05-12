/**
 * outbound.service — TDD unit tests.
 *
 * Orquestra o envio de respostas do agente IA de volta ao WhatsApp:
 *   1. Carrega Connection (token + baseUrl)
 *   2. Quebra agentText em blocos respeitando parágrafos (até 800 chars)
 *   3. Envia cada bloco via UAZapi sender (injetado)
 *   4. Marca cada messageId enviado no bot-echo-guard (injetado)
 *   5. Persiste 1 Message OUTBOUND no Postgres
 *
 * Estratégia de mock:
 *   - `deps injection` (não vi.mock) porque o orchestrator declara explicitamente
 *     suas dependências (database, sender, markBotMessage). Mais fácil de testar
 *     e nada de magic global state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  sendAgentResponse,
  type OutboundDeps,
  type OutboundRequest,
} from './outbound.service'

// ---------------------------------------------------------------------------
// Test fixtures + factory helpers
// ---------------------------------------------------------------------------

const CONNECTION_ID = 'conn-1'
const SESSION_ID = 'sess-1'
const ORG_ID = 'org-1'
const CONTACT_PHONE = '5511999999999'

function buildDeps(overrides: {
  connection?: unknown
  sendTextResults?: Array<{ success: boolean; messageId?: string; error?: string }>
} = {}): OutboundDeps & {
  _sendTextMock: ReturnType<typeof vi.fn>
  _markBotMessageMock: ReturnType<typeof vi.fn>
  _messageCreateMock: ReturnType<typeof vi.fn>
} {
  const sendTextResults =
    overrides.sendTextResults ?? [{ success: true, messageId: 'wa-1' }]

  // Cada call consome um resultado da fila; se acabar, repete o último.
  let callIdx = 0
  const sendTextMock = vi.fn(async () => {
    const r = sendTextResults[Math.min(callIdx, sendTextResults.length - 1)]
    callIdx += 1
    return r
  })

  const markBotMessageMock = vi.fn(async () => true)
  const messageCreateMock = vi.fn(async (args: { data: unknown }) => args.data)

  const connectionFindFirstMock = vi.fn(async () => {
    if ('connection' in overrides) return overrides.connection
    return {
      id: CONNECTION_ID,
      uazapiToken: 'tok-abc',
      // Em alguns deploys o baseUrl vem do connection diretamente.
      uazapiBaseUrl: 'https://uaz.example.com',
    }
  })

  return {
    database: {
      connection: { findFirst: connectionFindFirstMock },
      message: { create: messageCreateMock },
      // chatSession reservado se algum teste futuro precisar inspecionar
      chatSession: { update: vi.fn(), findFirst: vi.fn() },
    } as unknown as OutboundDeps['database'],
    sender: {
      sendText: sendTextMock,
    } as unknown as OutboundDeps['sender'],
    markBotMessage: markBotMessageMock as unknown as OutboundDeps['markBotMessage'],
    _sendTextMock: sendTextMock,
    _markBotMessageMock: markBotMessageMock,
    _messageCreateMock: messageCreateMock,
  }
}

function buildRequest(overrides: Partial<OutboundRequest> = {}): OutboundRequest {
  return {
    connectionId: CONNECTION_ID,
    sessionId: SESSION_ID,
    organizationId: ORG_ID,
    contactPhone: CONTACT_PHONE,
    agentText: 'oi tudo bem?',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sendAgentResponse — connection lookup', () => {
  it('retorna erro quando Connection não encontrada', async () => {
    const deps = buildDeps({ connection: null })

    const res = await sendAgentResponse(buildRequest(), deps)

    expect(res.blocksSent).toBe(0)
    expect(res.persisted).toBe(false)
    expect(res.errors.length).toBeGreaterThan(0)
    expect(deps._sendTextMock).not.toHaveBeenCalled()
    expect(deps._messageCreateMock).not.toHaveBeenCalled()
  })
})

describe('sendAgentResponse — message splitting', () => {
  it('agentText curto (1 bloco) → 1 sendText, 1 markBotMessage', async () => {
    const deps = buildDeps()

    const res = await sendAgentResponse(buildRequest({ agentText: 'oi' }), deps)

    expect(res.blocksSent).toBe(1)
    expect(deps._sendTextMock).toHaveBeenCalledTimes(1)
    expect(deps._markBotMessageMock).toHaveBeenCalledTimes(1)
    expect(deps._markBotMessageMock).toHaveBeenCalledWith(ORG_ID, 'wa-1')
  })

  it('agentText longo (>800 chars com \\n\\n) → múltiplos blocos', async () => {
    const para1 = 'a'.repeat(500)
    const para2 = 'b'.repeat(500)
    const para3 = 'c'.repeat(500)
    const text = `${para1}\n\n${para2}\n\n${para3}`

    const deps = buildDeps({
      sendTextResults: [
        { success: true, messageId: 'wa-1' },
        { success: true, messageId: 'wa-2' },
        { success: true, messageId: 'wa-3' },
      ],
    })

    const res = await sendAgentResponse(buildRequest({ agentText: text }), deps)

    expect(res.blocksSent).toBeGreaterThanOrEqual(2)
    expect(deps._sendTextMock).toHaveBeenCalledTimes(res.blocksSent)
  })

  it('quebra preserva parágrafos (não corta no meio de palavra)', async () => {
    const para1 = 'palavra '.repeat(80).trim() // ~640 chars
    const para2 = 'segundo '.repeat(80).trim()
    const text = `${para1}\n\n${para2}`

    const deps = buildDeps({
      sendTextResults: [
        { success: true, messageId: 'wa-1' },
        { success: true, messageId: 'wa-2' },
      ],
    })

    const res = await sendAgentResponse(buildRequest({ agentText: text }), deps)

    expect(res.blocksSent).toBe(2)
    const sentTexts = deps._sendTextMock.mock.calls.map((c) => c[3] as string)
    // Cada bloco deve terminar numa fronteira de palavra (não cortou no meio).
    for (const sent of sentTexts) {
      expect(sent.length).toBeLessThanOrEqual(800)
      // Não há sufixo cortado (último char é fim de palavra ou espaço/quebra).
      expect(sent).not.toMatch(/[a-z]palavr$/i)
    }
    // Concatenando de volta cobre o texto original (com possível trim de espaços).
    const joined = sentTexts.join(' ').replace(/\s+/g, ' ').trim()
    const expected = text.replace(/\s+/g, ' ').trim()
    expect(joined).toBe(expected)
  })
})

describe('sendAgentResponse — bot-echo tracking', () => {
  it('cada envio successful chama markBotMessage com messageId retornado', async () => {
    const deps = buildDeps({
      sendTextResults: [
        { success: true, messageId: 'wa-1' },
        { success: true, messageId: 'wa-2' },
      ],
    })
    const text = `${'a'.repeat(500)}\n\n${'b'.repeat(500)}`

    await sendAgentResponse(buildRequest({ agentText: text }), deps)

    const calls = deps._markBotMessageMock.mock.calls
    expect(calls.length).toBe(2)
    expect(calls[0][1]).toBe('wa-1')
    expect(calls[1][1]).toBe('wa-2')
    // org sempre no primeiro arg
    expect(calls[0][0]).toBe(ORG_ID)
  })

  it('não marca bot-echo quando envio falha', async () => {
    const deps = buildDeps({
      sendTextResults: [{ success: false, error: 'timeout' }],
    })

    await sendAgentResponse(buildRequest({ agentText: 'oi' }), deps)

    expect(deps._markBotMessageMock).not.toHaveBeenCalled()
  })
})

describe('sendAgentResponse — error resilience', () => {
  it('erro em 1 bloco não impede próximos blocos', async () => {
    const deps = buildDeps({
      sendTextResults: [
        { success: true, messageId: 'wa-1' },
        { success: false, error: 'rate limited' },
        { success: true, messageId: 'wa-3' },
      ],
    })
    const text = `${'a'.repeat(500)}\n\n${'b'.repeat(500)}\n\n${'c'.repeat(500)}`

    const res = await sendAgentResponse(buildRequest({ agentText: text }), deps)

    expect(deps._sendTextMock).toHaveBeenCalledTimes(3)
    expect(res.blocksSent).toBe(2) // 2 success, 1 fail
    expect(res.errors.length).toBe(1)
    expect(res.errors[0]).toMatch(/rate limited/)
  })

  it('errors array contém mensagens de todos os blocos que falharam', async () => {
    const deps = buildDeps({
      sendTextResults: [
        { success: false, error: 'err-A' },
        { success: false, error: 'err-B' },
      ],
    })
    const text = `${'a'.repeat(500)}\n\n${'b'.repeat(500)}`

    const res = await sendAgentResponse(buildRequest({ agentText: text }), deps)

    expect(res.errors.length).toBe(2)
    expect(res.errors.join('|')).toMatch(/err-A/)
    expect(res.errors.join('|')).toMatch(/err-B/)
  })
})

describe('sendAgentResponse — persistence', () => {
  it('persiste 1 Message OUTBOUND com content = agentText completo', async () => {
    const deps = buildDeps()
    const fullText = 'mensagem agregada completa'

    await sendAgentResponse(buildRequest({ agentText: fullText }), deps)

    expect(deps._messageCreateMock).toHaveBeenCalledTimes(1)
    const arg = deps._messageCreateMock.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(arg.data.content).toBe(fullText)
    expect(arg.data.direction).toBe('OUTBOUND')
    expect(arg.data.author).toBe('AI')
    expect(arg.data.sessionId).toBe(SESSION_ID)
    expect(arg.data.connectionId).toBe(CONNECTION_ID)
    expect(arg.data.contactPhone).toBe(CONTACT_PHONE)
  })

  it('persiste com waMessageId do primeiro envio bem-sucedido', async () => {
    const deps = buildDeps({
      sendTextResults: [
        { success: false, error: 'first failed' },
        { success: true, messageId: 'wa-second' },
      ],
    })
    const text = `${'a'.repeat(500)}\n\n${'b'.repeat(500)}`

    const res = await sendAgentResponse(buildRequest({ agentText: text }), deps)

    expect(res.persisted).toBe(true)
    const arg = deps._messageCreateMock.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(arg.data.waMessageId).toBe('wa-second')
  })

  it('NÃO persiste Message quando nenhum bloco foi enviado', async () => {
    const deps = buildDeps({
      sendTextResults: [{ success: false, error: 'no go' }],
    })

    const res = await sendAgentResponse(buildRequest({ agentText: 'oi' }), deps)

    expect(res.blocksSent).toBe(0)
    expect(res.persisted).toBe(false)
    expect(deps._messageCreateMock).not.toHaveBeenCalled()
  })
})
