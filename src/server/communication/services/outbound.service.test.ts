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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Redis mock — outbound.service agora chama o rate-limiter (INCR/EXPIRE) e a
// dead-letter (LPUSH/LTRIM). Mockamos getRedis para um stub em memória, assim
// os testes ficam determinísticos e sem rede. Cada teste pode sobrescrever o
// comportamento via os spies expostos.
//
// vi.hoisted: o factory de vi.mock é içado ao topo do arquivo, então as
// referências precisam ser criadas via vi.hoisted (também içado) para estarem
// inicializadas quando o factory roda.
// ---------------------------------------------------------------------------

// QH-09: a wrapper TTS (synthesizeTtsToMediaUrl) é mockada para controlar o
// resultado da síntese por teste (URL de áudio, null ou throw) sem tocar em
// storage/credential-resolver/provider. vi.hoisted garante que o spy exista
// quando o factory de vi.mock (içado ao topo) roda.
const { ttsSynthesizeMock } = vi.hoisted(() => ({
  ttsSynthesizeMock: vi.fn<(input: unknown) => Promise<string | null>>(),
}))

vi.mock('./tts.service', () => ({
  synthesizeTtsToMediaUrl: ttsSynthesizeMock,
}))

const { redisStore, deadLetterPushes, redisMock } = vi.hoisted(() => {
  const redisStore = new Map<string, number>()
  const deadLetterPushes: string[] = []

  const redisMock = {
    incr: vi.fn(async (key: string) => {
      const next = (redisStore.get(key) ?? 0) + 1
      redisStore.set(key, next)
      return next
    }),
    expire: vi.fn(async () => 1),
    lpush: vi.fn(async (_key: string, value: string) => {
      deadLetterPushes.unshift(value)
      return deadLetterPushes.length
    }),
    ltrim: vi.fn(async () => 'OK'),
    // Instance rate-limit (QH-02) usa EVAL (token bucket Lua). Default sem
    // implementação → retorna undefined → checkRateLimit faz fail-open
    // (allowed=true), preservando o comportamento dos testes existentes. Os
    // testes de retry sobrescrevem com mockResolvedValueOnce([0, retryAfterMs]).
    eval: vi.fn(),
  }

  return { redisStore, deadLetterPushes, redisMock }
})

vi.mock('@/server/services/redis', () => ({
  getRedis: () => redisMock,
  redis: redisMock,
}))

import {
  sendAgentResponse,
  type OutboundDeps,
  type OutboundRequest,
} from './outbound.service'
import { deriveDispatchKey } from './outbound-dispatch.pure'

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
  _sendImageMock: ReturnType<typeof vi.fn>
  _sendAudioMock: ReturnType<typeof vi.fn>
  _sendDocumentMock: ReturnType<typeof vi.fn>
  _sendVideoMock: ReturnType<typeof vi.fn>
  _sendLocationMock: ReturnType<typeof vi.fn>
  _sendButtonsMock: ReturnType<typeof vi.fn>
  _sendListMock: ReturnType<typeof vi.fn>
  _sendCarouselMock: ReturnType<typeof vi.fn>
  _markBotMessageMock: ReturnType<typeof vi.fn>
  _messageCreateMock: ReturnType<typeof vi.fn>
} {
  const sendTextResults =
    overrides.sendTextResults ?? [{ success: true, messageId: 'wa-1' }]

  // Resultado é mapeado por BLOCO (não por call), keyed pelo conteúdo enviado.
  // Assim, retries do mesmo bloco (resiliência: backoff) retornam o mesmo
  // resultado determinístico — o N-ésimo bloco distinto recebe o N-ésimo
  // resultado da fila (repete o último quando a fila acaba).
  const blockResultByContent = new Map<string, { success: boolean; messageId?: string; error?: string }>()
  let distinctBlockIdx = 0
  const sendTextMock = vi.fn(async (...args: unknown[]) => {
    const content = args[3] as string
    const existing = blockResultByContent.get(content)
    if (existing) return existing
    const r = sendTextResults[Math.min(distinctBlockIdx, sendTextResults.length - 1)]
    distinctBlockIdx += 1
    blockResultByContent.set(content, r)
    return r
  })

  const markBotMessageMock = vi.fn(async () => true)
  const messageCreateMock = vi.fn(async (args: { data: unknown }) => args.data)
  const sendImageMock = vi.fn(async () => ({ success: true, messageId: 'img-1' }))
  const sendAudioMock = vi.fn(async () => ({ success: true, messageId: 'aud-1' }))
  const sendDocumentMock = vi.fn(async () => ({ success: true, messageId: 'doc-1' }))
  const sendVideoMock = vi.fn(async () => ({ success: true, messageId: 'vid-1' }))
  const sendLocationMock = vi.fn(async () => ({ success: true, messageId: 'loc-1' }))
  const sendButtonsMock = vi.fn(async () => ({ success: true, messageId: 'btn-1' }))
  const sendListMock = vi.fn(async () => ({ success: true, messageId: 'list-1' }))
  const sendCarouselMock = vi.fn(async () => ({ success: true, messageId: 'car-1' }))

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
      sendImage: sendImageMock,
      sendAudio: sendAudioMock,
      sendDocument: sendDocumentMock,
      sendVideo: sendVideoMock,
      sendLocation: sendLocationMock,
      sendButtons: sendButtonsMock,
      sendList: sendListMock,
      sendCarousel: sendCarouselMock,
    } as unknown as OutboundDeps['sender'],
    markBotMessage: markBotMessageMock as unknown as OutboundDeps['markBotMessage'],
    _sendTextMock: sendTextMock,
    _sendImageMock: sendImageMock,
    _sendAudioMock: sendAudioMock,
    _sendDocumentMock: sendDocumentMock,
    _sendVideoMock: sendVideoMock,
    _sendLocationMock: sendLocationMock,
    _sendButtonsMock: sendButtonsMock,
    _sendListMock: sendListMock,
    _sendCarouselMock: sendCarouselMock,
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
  redisStore.clear()
  deadLetterPushes.length = 0
  // QH-09: default neutro — síntese retorna null (fallback p/ texto). Testes do
  // caminho TTS sobrescrevem com mockResolvedValueOnce/mockRejectedValueOnce.
  ttsSynthesizeMock.mockResolvedValue(null)
})

/** Fixture de settings TTS habilitado (shape de AgentRuntimeSettings['tts']). */
function buildTtsSettings(
  overrides: Partial<OutboundRequest['tts']> = {},
): OutboundRequest['tts'] {
  return {
    enabled: true,
    provider: 'elevenlabs',
    voiceId: 'voice-abc',
    model: 'eleven_turbo_v2',
    speechRate: 1,
    ...overrides,
  }
}

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

  it('não marca bot-echo quando envio falha (após esgotar retries)', async () => {
    vi.useFakeTimers()
    try {
      const deps = buildDeps({
        sendTextResults: [{ success: false, error: 'timeout' }],
      })

      const p = sendAgentResponse(buildRequest({ agentText: 'oi' }), deps)
      await vi.runAllTimersAsync()
      await p

      expect(deps._markBotMessageMock).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('sendAgentResponse — rich tags', () => {
  it('envia tag de buttons como bloco tipado e não como texto cru', async () => {
    const deps = buildDeps()
    const agentText = 'Escolha uma opção\n\n[buttons:"Como prefere seguir?" | Comprar | Falar com humano]'

    const res = await sendAgentResponse(buildRequest({ agentText }), deps)

    expect(res.blocksSent).toBe(2)
    expect(deps._sendTextMock).toHaveBeenCalledTimes(1)
    expect(deps._sendTextMock.mock.calls[0][3]).toBe('Escolha uma opção')
    expect(deps._sendButtonsMock).toHaveBeenCalledTimes(1)
    const payload = deps._sendButtonsMock.mock.calls[0][3] as {
      text: string
      buttons: Array<{ id: string; title: string }>
    }
    expect(payload.text).toBe('Como prefere seguir?')
    expect(payload.buttons.map((button) => button.title)).toEqual([
      'Comprar',
      'Falar com humano',
    ])
    expect(String(deps._sendTextMock.mock.calls[0][3])).not.toContain('[buttons:')
    expect(deps._markBotMessageMock).toHaveBeenCalledWith(ORG_ID, 'wa-1')
    expect(deps._markBotMessageMock).toHaveBeenCalledWith(ORG_ID, 'btn-1')
  })

  it('envia mídia, localização, lista e carrossel por funções específicas', async () => {
    const deps = buildDeps()
    const agentText = [
      '[document:https://cdn/doc.pdf|Contrato]',
      '[video:https://cdn/video.mp4|Demonstração]',
      '[location:-23.55,-46.63|Loja Centro|Rua A]',
      '[list:"Escolha" | Produtos > Plano A, Plano B]',
      '[carousel:"Veja" | A: https://cdn/a.jpg: Comprar | B: https://cdn/b.jpg: Saiba mais]',
    ].join('\n\n')

    const res = await sendAgentResponse(buildRequest({ agentText }), deps)

    expect(res.blocksSent).toBe(5)
    expect(deps._sendDocumentMock).toHaveBeenCalledTimes(1)
    expect(deps._sendVideoMock).toHaveBeenCalledTimes(1)
    expect(deps._sendLocationMock).toHaveBeenCalledTimes(1)
    expect(deps._sendListMock).toHaveBeenCalledTimes(1)
    expect(deps._sendCarouselMock).toHaveBeenCalledTimes(1)
    expect(deps._sendTextMock).not.toHaveBeenCalled()
    expect(deps._markBotMessageMock).toHaveBeenCalledTimes(5)
  })

  it('faz fallback de cta_url para texto com URL', async () => {
    const deps = buildDeps()

    const res = await sendAgentResponse(
      buildRequest({ agentText: '[cta:"Confira a proposta" | Abrir | https://example.com]' }),
      deps,
    )

    expect(res.blocksSent).toBe(1)
    expect(deps._sendTextMock).toHaveBeenCalledTimes(1)
    expect(deps._sendTextMock.mock.calls[0][3]).toBe(
      'Confira a proposta\nAbrir: https://example.com',
    )
  })

  it('faz fallback de flow para texto legível sem vazar tag crua', async () => {
    const deps = buildDeps()

    const res = await sendAgentResponse(
      buildRequest({ agentText: '[flow:cadastro_lead | Preencher cadastro]' }),
      deps,
    )

    expect(res.blocksSent).toBe(1)
    expect(deps._sendTextMock).toHaveBeenCalledTimes(1)
    expect(deps._sendTextMock.mock.calls[0][3]).toBe(
      'Preencher cadastro\nFormulario: cadastro_lead',
    )
    expect(String(deps._sendTextMock.mock.calls[0][3])).not.toContain('[flow:')
  })
})

describe('sendAgentResponse — error resilience', () => {
  // Backoff usa setTimeout; com timers reais os retries adicionam delay.
  // Fake timers + runAllTimersAsync mantém o suite rápido e determinístico.
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** Roda a promise concorrentemente, drenando os timers de backoff. */
  async function runWithTimers<T>(p: Promise<T>): Promise<T> {
    await vi.runAllTimersAsync()
    return p
  }

  it('erro em 1 bloco não impede próximos blocos', async () => {
    const deps = buildDeps({
      sendTextResults: [
        { success: true, messageId: 'wa-1' },
        { success: false, error: 'rate limited' },
        { success: true, messageId: 'wa-3' },
      ],
    })
    const text = `${'a'.repeat(500)}\n\n${'b'.repeat(500)}\n\n${'c'.repeat(500)}`

    const res = await runWithTimers(sendAgentResponse(buildRequest({ agentText: text }), deps))

    // 3 blocos distintos; o do meio falha e é retentado até MAX_ATTEMPTS (3).
    // 1 (bloco ok) + 3 (bloco falho com retries) + 1 (bloco ok) = 5 calls.
    expect(deps._sendTextMock).toHaveBeenCalledTimes(5)
    expect(res.blocksSent).toBe(2) // 2 success, 1 fail (após esgotar retries)
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

    const res = await runWithTimers(sendAgentResponse(buildRequest({ agentText: text }), deps))

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

  it('persiste com waMessageId do primeiro bloco bem-sucedido', async () => {
    vi.useFakeTimers()
    try {
      const deps = buildDeps({
        sendTextResults: [
          { success: false, error: 'first failed' },
          { success: true, messageId: 'wa-second' },
        ],
      })
      const text = `${'a'.repeat(500)}\n\n${'b'.repeat(500)}`

      const p = sendAgentResponse(buildRequest({ agentText: text }), deps)
      await vi.runAllTimersAsync()
      const res = await p

      expect(res.persisted).toBe(true)
      const arg = deps._messageCreateMock.mock.calls[0][0] as { data: Record<string, unknown> }
      // 1o bloco falha (esgota retries), 2o bloco sucede → waMessageId = wa-second.
      expect(arg.data.waMessageId).toBe('wa-second')
    } finally {
      vi.useRealTimers()
    }
  })

  it('NÃO persiste Message quando nenhum bloco foi enviado', async () => {
    vi.useFakeTimers()
    try {
      const deps = buildDeps({
        sendTextResults: [{ success: false, error: 'no go' }],
      })

      const p = sendAgentResponse(buildRequest({ agentText: 'oi' }), deps)
      await vi.runAllTimersAsync()
      const res = await p

      expect(res.blocksSent).toBe(0)
      expect(res.persisted).toBe(false)
      expect(deps._messageCreateMock).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('sendAgentResponse — rate limit (Orayon token bucket)', () => {
  it('barra o turno por LIMITE DE CONTATO e não envia nada', async () => {
    const deps = buildDeps()
    // Pré-popula a chave do contato no limite (10/min). O 11o INCR estoura.
    redisStore.set(`outbound:rl:contact:${ORG_ID}:${CONTACT_PHONE}`, 10)

    const res = await sendAgentResponse(buildRequest({ agentText: 'oi' }), deps)

    expect(res.rateLimited).toBe(true)
    expect(res.blocksSent).toBe(0)
    expect(res.persisted).toBe(false)
    expect(deps._sendTextMock).not.toHaveBeenCalled()
    expect(deps._messageCreateMock).not.toHaveBeenCalled()
    expect(res.errors[0]).toMatch(/rate_limited scope=contact/)
  })

  it('barra o turno por LIMITE DE ORG (contato ok, org estourada)', async () => {
    const deps = buildDeps()
    redisStore.set(`outbound:rl:org:${ORG_ID}`, 100) // org no limite (100/min)

    const res = await sendAgentResponse(buildRequest({ agentText: 'oi' }), deps)

    expect(res.rateLimited).toBe(true)
    expect(res.blocksSent).toBe(0)
    expect(deps._sendTextMock).not.toHaveBeenCalled()
    expect(res.errors[0]).toMatch(/rate_limited scope=org/)
  })

  it('consome cota UMA vez por turno (1 INCR de contato + 1 de org)', async () => {
    const deps = buildDeps()

    await sendAgentResponse(buildRequest({ agentText: 'oi' }), deps)

    // Mesmo com vários blocos seria 1 check; aqui 1 bloco → 2 INCR (contato+org).
    expect(redisMock.incr).toHaveBeenCalledTimes(2)
    expect(redisMock.incr).toHaveBeenCalledWith(
      `outbound:rl:contact:${ORG_ID}:${CONTACT_PHONE}`,
    )
    expect(redisMock.incr).toHaveBeenCalledWith(`outbound:rl:org:${ORG_ID}`)
  })

  it('fail-open: Redis com erro no INCR não barra o envio', async () => {
    const deps = buildDeps()
    redisMock.incr.mockRejectedValueOnce(new Error('redis down'))

    const res = await sendAgentResponse(buildRequest({ agentText: 'oi' }), deps)

    expect(res.rateLimited).toBeUndefined()
    expect(res.blocksSent).toBe(1)
    expect(deps._sendTextMock).toHaveBeenCalledTimes(1)
  })
})

describe('sendAgentResponse — dead-letter + backoff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('empurra payload na dead-letter ao esgotar retries', async () => {
    const deps = buildDeps({
      sendTextResults: [{ success: false, error: 'uaz 500' }],
    })

    const p = sendAgentResponse(buildRequest({ agentText: 'oi' }), deps)
    await vi.runAllTimersAsync()
    const res = await p

    expect(res.blocksSent).toBe(0)
    // 1 bloco falho retentado MAX_ATTEMPTS (3) vezes.
    expect(deps._sendTextMock).toHaveBeenCalledTimes(3)
    expect(redisMock.lpush).toHaveBeenCalledTimes(1)
    expect(redisMock.ltrim).toHaveBeenCalledTimes(1)

    const payload = JSON.parse(deadLetterPushes[0]) as Record<string, unknown>
    expect(payload.organizationId).toBe(ORG_ID)
    expect(payload.phone).toBe(CONTACT_PHONE)
    expect(payload.text).toBe('oi')
    expect(payload.error).toMatch(/uaz 500/)
    expect(typeof payload.timestamp).toBe('string')
  })

  it('retry bem-sucedido NÃO vai para dead-letter', async () => {
    // Mesmo bloco: 1a tentativa falha (exceção), 2a sucede.
    let calls = 0
    const deps = buildDeps()
    deps._sendTextMock.mockImplementation(async () => {
      calls += 1
      if (calls === 1) throw new Error('transient network blip')
      return { success: true, messageId: 'wa-ok' }
    })

    const p = sendAgentResponse(buildRequest({ agentText: 'oi' }), deps)
    await vi.runAllTimersAsync()
    const res = await p

    expect(res.blocksSent).toBe(1)
    expect(deps._sendTextMock).toHaveBeenCalledTimes(2)
    expect(redisMock.lpush).not.toHaveBeenCalled()
    expect(deps._markBotMessageMock).toHaveBeenCalledWith(ORG_ID, 'wa-ok')
  })
})

describe('sendAgentResponse — QH-02 retry no limite de INSTÂNCIA', () => {
  // O 1o gate (contato/org via INCR) passa com redisStore vazio; forçamos o gate
  // de INSTÂNCIA (EVAL) a barrar com [allowed=0, retryAfterMs].
  it('agenda retry (não descarta) quando o limite de instância estoura', async () => {
    const scheduleRetry = vi.fn(
      async (_payload: OutboundRequest & { attempt: number }, _delayMs: number) => undefined,
    )
    const deps = { ...buildDeps(), scheduleRetry }
    redisMock.eval.mockResolvedValueOnce([0, 1200])

    const res = await sendAgentResponse(buildRequest({ agentText: 'oi' }), deps)

    expect(res.rateLimited).toBe(true)
    expect(res.retryScheduled).toBe(true)
    expect(res.retryAfterMs).toBe(1200)
    expect(res.blocksSent).toBe(0)
    // Nada enviado, nada persistido, nada na dead-letter.
    expect(deps._sendTextMock).not.toHaveBeenCalled()
    expect(deps._messageCreateMock).not.toHaveBeenCalled()
    expect(redisMock.lpush).not.toHaveBeenCalled()
    // Agendou exatamente 1 retry, com attempt incrementado (0 → 1) e o delay.
    expect(scheduleRetry).toHaveBeenCalledOnce()
    const [payload, delayMs] = scheduleRetry.mock.calls[0]
    expect(payload.attempt).toBe(1)
    expect(payload.agentText).toBe('oi')
    expect(payload.connectionId).toBe(CONNECTION_ID)
    expect(delayMs).toBe(1200)
  })

  it('clampa retryAfterMs pequeno para o piso de 1000ms', async () => {
    const scheduleRetry = vi.fn(
      async (_payload: OutboundRequest & { attempt: number }, _delayMs: number) => undefined,
    )
    const deps = { ...buildDeps(), scheduleRetry }
    redisMock.eval.mockResolvedValueOnce([0, 50]) // < piso

    const res = await sendAgentResponse(buildRequest({ agentText: 'oi' }), deps)

    expect(res.retryAfterMs).toBe(1000)
    expect(scheduleRetry.mock.calls[0][1]).toBe(1000)
  })

  it('vai para dead-letter (não agenda) ao atingir o cap de tentativas', async () => {
    const scheduleRetry = vi.fn(
      async (_payload: OutboundRequest & { attempt: number }, _delayMs: number) => undefined,
    )
    const deps = { ...buildDeps(), scheduleRetry }
    redisMock.eval.mockResolvedValueOnce([0, 1200])

    // attempt=5 === MAX_RETRY_ATTEMPTS → não reenfileira.
    const res = await sendAgentResponse(buildRequest({ agentText: 'oi', attempt: 5 }), deps)

    expect(res.rateLimited).toBe(true)
    expect(res.retryScheduled).toBe(false)
    expect(scheduleRetry).not.toHaveBeenCalled()
    expect(redisMock.lpush).toHaveBeenCalledOnce()
    const dl = JSON.parse(deadLetterPushes[0]) as Record<string, unknown>
    expect(dl.organizationId).toBe(ORG_ID)
    expect(dl.text).toBe('oi')
    expect(String(dl.error)).toMatch(/rate_limited_instance/)
  })

  it('sem scheduler injetado: vai direto para dead-letter (não perde silenciosamente)', async () => {
    const deps = buildDeps() // sem scheduleRetry
    redisMock.eval.mockResolvedValueOnce([0, 1200])

    const res = await sendAgentResponse(buildRequest({ agentText: 'oi' }), deps)

    expect(res.rateLimited).toBe(true)
    expect(res.retryScheduled).toBe(false)
    expect(redisMock.lpush).toHaveBeenCalledOnce()
  })

  it('falha ao agendar o retry → cai para dead-letter (fail-safe, não lança)', async () => {
    const scheduleRetry = vi.fn(async () => {
      throw new Error('bullmq indisponível')
    })
    const deps = { ...buildDeps(), scheduleRetry }
    redisMock.eval.mockResolvedValueOnce([0, 1200])

    const res = await sendAgentResponse(buildRequest({ agentText: 'oi' }), deps)

    expect(res.retryScheduled).toBe(false)
    expect(scheduleRetry).toHaveBeenCalledOnce()
    expect(redisMock.lpush).toHaveBeenCalledOnce()
    expect(res.errors.join('|')).toMatch(/schedule retry failed/)
  })

  it('retry (attempt>0) NÃO re-consome cota de contato/org — só revalida a instância', async () => {
    const deps = buildDeps() // sender retorna sucesso por default
    // Sem override de eval → o gate de INSTÂNCIA faz fail-open (allowed) e envia.
    const res = await sendAgentResponse(buildRequest({ agentText: 'oi', attempt: 1 }), deps)

    // Enviou normalmente (não barrado).
    expect(res.blocksSent).toBe(1)
    expect(res.rateLimited).toBeUndefined()
    expect(deps._sendTextMock).toHaveBeenCalledTimes(1)
    // O gate de contato/org (INCR) é PULADO no retry — só o envio original consome.
    expect(redisMock.incr).not.toHaveBeenCalled()
  })

  it('retry ainda barrado pela instância reenfileira (attempt 1→2) sem tocar cota de contato/org', async () => {
    const scheduleRetry = vi.fn(
      async (_payload: OutboundRequest & { attempt: number }, _delayMs: number) => undefined,
    )
    const deps = { ...buildDeps(), scheduleRetry }
    redisMock.eval.mockResolvedValueOnce([0, 1200])

    const res = await sendAgentResponse(buildRequest({ agentText: 'oi', attempt: 1 }), deps)

    expect(res.retryScheduled).toBe(true)
    expect(scheduleRetry.mock.calls[0][0].attempt).toBe(2)
    expect(redisMock.incr).not.toHaveBeenCalled()
  })
})

describe('sendAgentResponse — QH-09 TTS outbound (text → áudio)', () => {
  it('tts.enabled + síntese retorna URL → sendAudio (NÃO sendText) e marca bot-echo', async () => {
    const deps = buildDeps()
    deps._sendAudioMock.mockResolvedValueOnce({ success: true, messageId: 'wa-audio-1' })
    ttsSynthesizeMock.mockResolvedValueOnce('https://cdn.example.com/tts/abc.mp3')

    const res = await sendAgentResponse(
      buildRequest({ agentText: 'oi tudo bem?', tts: buildTtsSettings() }),
      deps,
    )

    // Enviou 1 bloco como ÁUDIO — texto não foi usado.
    expect(res.blocksSent).toBe(1)
    expect(deps._sendAudioMock).toHaveBeenCalledTimes(1)
    expect(deps._sendTextMock).not.toHaveBeenCalled()

    // A URL sintetizada foi repassada ao sender.sendAudio (4º arg = audioUrl).
    expect(deps._sendAudioMock.mock.calls[0][3]).toBe('https://cdn.example.com/tts/abc.mp3')

    // bot-echo marcado com o messageId do envio de áudio.
    expect(deps._markBotMessageMock).toHaveBeenCalledTimes(1)
    expect(deps._markBotMessageMock).toHaveBeenCalledWith(ORG_ID, 'wa-audio-1')
  })

  it('passa text/settings/org corretos para a síntese (BYOK por org)', async () => {
    const deps = buildDeps()
    deps._sendAudioMock.mockResolvedValueOnce({ success: true, messageId: 'wa-audio-2' })
    const tts = buildTtsSettings({ provider: 'deepgram', voiceId: 'aura-2-luna-en' })
    ttsSynthesizeMock.mockResolvedValueOnce('https://cdn.example.com/tts/dg.mp3')

    await sendAgentResponse(
      buildRequest({ agentText: 'mensagem para sintetizar', tts }),
      deps,
    )

    expect(ttsSynthesizeMock).toHaveBeenCalledTimes(1)
    const input = ttsSynthesizeMock.mock.calls[0][0] as {
      organizationId: string
      text: string
      settings: typeof tts
    }
    expect(input.organizationId).toBe(ORG_ID)
    expect(input.text).toBe('mensagem para sintetizar')
    expect(input.settings).toEqual(tts)
  })

  it('síntese retorna null → fallback gracioso para sendText (sem áudio)', async () => {
    const deps = buildDeps()
    ttsSynthesizeMock.mockResolvedValueOnce(null)

    const res = await sendAgentResponse(
      buildRequest({ agentText: 'oi tudo bem?', tts: buildTtsSettings() }),
      deps,
    )

    expect(res.blocksSent).toBe(1)
    expect(deps._sendTextMock).toHaveBeenCalledTimes(1)
    expect(deps._sendTextMock.mock.calls[0][3]).toBe('oi tudo bem?')
    expect(deps._sendAudioMock).not.toHaveBeenCalled()
    expect(deps._markBotMessageMock).toHaveBeenCalledWith(ORG_ID, 'wa-1')
  })

  it('síntese lança (rede/provider) → fallback gracioso para sendText (não derruba o turno)', async () => {
    const deps = buildDeps()
    ttsSynthesizeMock.mockRejectedValueOnce(new Error('provider 503'))

    const res = await sendAgentResponse(
      buildRequest({ agentText: 'oi tudo bem?', tts: buildTtsSettings() }),
      deps,
    )

    expect(res.blocksSent).toBe(1)
    expect(res.persisted).toBe(true)
    expect(deps._sendTextMock).toHaveBeenCalledTimes(1)
    expect(deps._sendAudioMock).not.toHaveBeenCalled()
  })

  it('tts.enabled=false → NÃO sintetiza, envia texto direto', async () => {
    const deps = buildDeps()

    const res = await sendAgentResponse(
      buildRequest({ agentText: 'oi', tts: buildTtsSettings({ enabled: false }) }),
      deps,
    )

    expect(res.blocksSent).toBe(1)
    expect(ttsSynthesizeMock).not.toHaveBeenCalled()
    expect(deps._sendTextMock).toHaveBeenCalledTimes(1)
    expect(deps._sendAudioMock).not.toHaveBeenCalled()
  })

  it('persiste 1 Message OUTBOUND mesmo quando o bloco saiu como áudio', async () => {
    const deps = buildDeps()
    deps._sendAudioMock.mockResolvedValueOnce({ success: true, messageId: 'wa-audio-3' })
    ttsSynthesizeMock.mockResolvedValueOnce('https://cdn.example.com/tts/xyz.mp3')

    const res = await sendAgentResponse(
      buildRequest({ agentText: 'texto que vira áudio', tts: buildTtsSettings() }),
      deps,
    )

    expect(res.persisted).toBe(true)
    expect(deps._messageCreateMock).toHaveBeenCalledTimes(1)
    const arg = deps._messageCreateMock.mock.calls[0][0] as { data: Record<string, unknown> }
    // content persiste o texto original (não a URL do áudio); waMessageId = áudio.
    expect(arg.data.content).toBe('texto que vira áudio')
    expect(arg.data.direction).toBe('OUTBOUND')
    expect(arg.data.waMessageId).toBe('wa-audio-3')
  })
})

// ---------------------------------------------------------------------------
// FSM outbound durável — checkpoint por bloco (idempotência de turno)
// ---------------------------------------------------------------------------

/**
 * Fake in-memory de `outboundDispatch` (Map por dispatchKey). Espelha o subset
 * usado pelo service (findUnique/upsert/update) e expõe os spies + o store para
 * asserções. Sem rede, sem Prisma — coerente com o deps-injection do arquivo.
 */
type DispatchRow = {
  dispatchKey: string
  status: string
  blocks: unknown
  sentBlocks: number
  attempt: number
  totalBlocks?: number
  lastError?: string
}

function buildDispatchFake(seed?: DispatchRow) {
  const store = new Map<string, DispatchRow>()
  if (seed) store.set(seed.dispatchKey, { ...seed })

  const findUnique = vi.fn(async (args: { where: { dispatchKey: string } }) => {
    const row = store.get(args.where.dispatchKey)
    if (!row) return null
    return {
      status: row.status,
      blocks: row.blocks,
      sentBlocks: row.sentBlocks,
      attempt: row.attempt,
    }
  })

  const upsert = vi.fn(
    async (args: {
      where: { dispatchKey: string }
      create: Record<string, unknown>
      update: Record<string, unknown>
    }) => {
      const existing = store.get(args.where.dispatchKey)
      if (existing) {
        Object.assign(existing, args.update)
        store.set(args.where.dispatchKey, existing)
        return { status: existing.status, blocks: existing.blocks, attempt: existing.attempt }
      }
      const created = args.create as unknown as DispatchRow
      store.set(args.where.dispatchKey, { ...created })
      return { status: created.status, blocks: created.blocks, attempt: created.attempt }
    },
  )

  const update = vi.fn(
    async (args: { where: { dispatchKey: string }; data: Record<string, unknown> }) => {
      const row = store.get(args.where.dispatchKey)
      if (row) {
        Object.assign(row, args.data)
        store.set(args.where.dispatchKey, row)
      }
      return row
    },
  )

  return { outboundDispatch: { findUnique, upsert, update }, store, findUnique, upsert, update }
}

/** Deps com a dep durável injetada. */
function buildDurableDeps(
  dispatchFake: ReturnType<typeof buildDispatchFake>,
  overrides: Parameters<typeof buildDeps>[0] = {},
): ReturnType<typeof buildDeps> {
  const deps = buildDeps(overrides)
  ;(deps.database as unknown as { outboundDispatch: unknown }).outboundDispatch =
    dispatchFake.outboundDispatch
  return deps
}

const DISPATCH_KEY = 'dk-test-1'

describe('sendAgentResponse — FSM outbound durável (checkpoint por bloco)', () => {
  it('CLAIM "sent" → skip idempotente: não chama sender nem persiste de novo', async () => {
    const dispatchFake = buildDispatchFake({
      dispatchKey: DISPATCH_KEY,
      status: 'sent',
      blocks: [{ idx: 0, providerMessageId: 'wa-prev', status: 'sent' }],
      sentBlocks: 1,
      attempt: 1,
    })
    const deps = buildDurableDeps(dispatchFake)

    const res = await sendAgentResponse(
      buildRequest({ agentText: 'oi', dispatchKey: DISPATCH_KEY }),
      deps,
    )

    // Idempotente: nada reenviado, nada re-persistido, persisted=true.
    expect(res.persisted).toBe(true)
    expect(res.blocksSent).toBe(1)
    expect(deps._sendTextMock).not.toHaveBeenCalled()
    expect(deps._messageCreateMock).not.toHaveBeenCalled()
    // upsert/update NÃO são chamados no skip (saímos antes).
    expect(dispatchFake.upsert).not.toHaveBeenCalled()
    expect(dispatchFake.update).not.toHaveBeenCalled()
  })

  it('RESUME "partial": bloco 0 já sent → só o bloco 1 é enviado; checkpoint final "sent"', async () => {
    // Texto de 2 blocos (\n\n). Bloco 0 já enviado (crash antes do bloco 1).
    const text = `${'a'.repeat(500)}\n\n${'b'.repeat(500)}`
    const dispatchFake = buildDispatchFake({
      dispatchKey: DISPATCH_KEY,
      status: 'partial',
      blocks: [
        { idx: 0, providerMessageId: 'wa-0', status: 'sent' },
        { idx: 1, status: 'pending' },
      ],
      sentBlocks: 1,
      attempt: 1,
    })
    const deps = buildDurableDeps(dispatchFake, {
      sendTextResults: [{ success: true, messageId: 'wa-1' }],
    })

    const res = await sendAgentResponse(
      buildRequest({ agentText: text, dispatchKey: DISPATCH_KEY }),
      deps,
    )

    // Só o bloco 1 foi (re)enviado — o bloco 0 foi pulado (anti-duplicação).
    expect(deps._sendTextMock).toHaveBeenCalledTimes(1)
    expect(res.blocksSent).toBe(2) // 1 pulado + 1 enviado
    // markBotMessage só no bloco efetivamente enviado.
    expect(deps._markBotMessageMock).toHaveBeenCalledTimes(1)
    // Persistência usa o waMessageId do bloco 0 (recuperado do checkpoint).
    const arg = deps._messageCreateMock.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(arg.data.waMessageId).toBe('wa-0')
    // Estado final: status 'sent', 2 blocos.
    const row = dispatchFake.store.get(DISPATCH_KEY)
    expect(row?.status).toBe('sent')
    expect(row?.sentBlocks).toBe(2)
  })

  it('FRESH: 2 blocos enviados, dispatch criado "sending" → "sent", checkpoint por bloco', async () => {
    const text = `${'a'.repeat(500)}\n\n${'b'.repeat(500)}`
    const dispatchFake = buildDispatchFake() // sem seed → findUnique=null → fresh
    const deps = buildDurableDeps(dispatchFake, {
      sendTextResults: [
        { success: true, messageId: 'wa-1' },
        { success: true, messageId: 'wa-2' },
      ],
    })

    const res = await sendAgentResponse(
      buildRequest({ agentText: text, dispatchKey: DISPATCH_KEY }),
      deps,
    )

    expect(res.blocksSent).toBe(2)
    expect(deps._sendTextMock).toHaveBeenCalledTimes(2)
    // upsert criou a linha; update foi chamado por bloco (2) + finalize (1) = 3.
    expect(dispatchFake.upsert).toHaveBeenCalledOnce()
    expect(dispatchFake.update).toHaveBeenCalledTimes(3)
    // Estado final e checkpoint com providerMessageId por bloco.
    const row = dispatchFake.store.get(DISPATCH_KEY)
    expect(row?.status).toBe('sent')
    expect(row?.sentBlocks).toBe(2)
    const blocks = row?.blocks as Array<{ idx: number; providerMessageId?: string; status: string }>
    expect(blocks.map((b) => b.providerMessageId)).toEqual(['wa-1', 'wa-2'])
    expect(blocks.every((b) => b.status === 'sent')).toBe(true)
    // Persistiu o Message com o waMessageId do 1o bloco.
    const arg = deps._messageCreateMock.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(arg.data.waMessageId).toBe('wa-1')
  })

  it('FAIL-OPEN: findUnique lança → cai pro legado (envia tudo, persiste), nunca lança', async () => {
    const dispatchFake = buildDispatchFake()
    dispatchFake.findUnique.mockRejectedValueOnce(new Error('db down'))
    const deps = buildDurableDeps(dispatchFake)

    const res = await sendAgentResponse(
      buildRequest({ agentText: 'oi', dispatchKey: DISPATCH_KEY }),
      deps,
    )

    // Caminho legado: enviou e persistiu normalmente, sem propagar o erro.
    expect(res.blocksSent).toBe(1)
    expect(res.persisted).toBe(true)
    expect(deps._sendTextMock).toHaveBeenCalledTimes(1)
    expect(deps._messageCreateMock).toHaveBeenCalledTimes(1)
    // Como o claim falhou, durable=false → upsert/update NÃO foram chamados.
    expect(dispatchFake.upsert).not.toHaveBeenCalled()
    expect(dispatchFake.update).not.toHaveBeenCalled()
  })

  it('SEM dispatchKey: comportamento idêntico ao legado (não toca outboundDispatch)', async () => {
    const dispatchFake = buildDispatchFake()
    const deps = buildDurableDeps(dispatchFake) // dep presente, mas req sem dispatchKey

    const res = await sendAgentResponse(buildRequest({ agentText: 'oi' }), deps)

    expect(res.blocksSent).toBe(1)
    expect(res.persisted).toBe(true)
    expect(deps._sendTextMock).toHaveBeenCalledTimes(1)
    // Sem dispatchKey → durável desligado → nada tocado.
    expect(dispatchFake.findUnique).not.toHaveBeenCalled()
    expect(dispatchFake.upsert).not.toHaveBeenCalled()
    expect(dispatchFake.update).not.toHaveBeenCalled()
  })

  it('checkpoint falha (update lança) → não derruba o turno: envia e persiste', async () => {
    const dispatchFake = buildDispatchFake()
    // upsert ok; mas o checkpoint por bloco (update) lança → fail-open.
    dispatchFake.update.mockRejectedValue(new Error('checkpoint write failed'))
    const deps = buildDurableDeps(dispatchFake)

    const res = await sendAgentResponse(
      buildRequest({ agentText: 'oi', dispatchKey: DISPATCH_KEY }),
      deps,
    )

    expect(res.blocksSent).toBe(1)
    expect(res.persisted).toBe(true)
    expect(deps._sendTextMock).toHaveBeenCalledTimes(1)
    expect(deps._messageCreateMock).toHaveBeenCalledTimes(1)
  })

  it('deriveDispatchKey é determinístico e estável (idempotência de turno)', async () => {
    const a = deriveDispatchKey('sess-x', 'wamid-y')
    const b = deriveDispatchKey('sess-x', 'wamid-y')
    const c = deriveDispatchKey('sess-x', 'wamid-z')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})
