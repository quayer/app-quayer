/**
 * notify-member-whatsapp — Vitest unit (M1, envio 6A da roleta).
 *
 * Pina o contrato fail-safe do helper de envio WhatsApp da roleta:
 *   - no_whatsapp   — membro sem WhatsApp → não envia (fallback in-app cobre)
 *   - no_instance   — Connection sem token/inexistente → não envia
 *   - rate_limited  — rate-limit estourou → não envia
 *   - send_failed   — sendText retornou !success → não envia
 *   - sent          — sucesso
 *   - FAIL-SAFE     — NUNCA lança (engole throws inesperados)
 *
 * `database`, `sendText` e `RateLimiter` são mockados (boundaries do helper).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockConnectionFindFirst = vi.hoisted(() => vi.fn())
const databaseMock = vi.hoisted(() => ({
  connection: { findFirst: mockConnectionFindFirst },
}))
vi.mock('@/server/services/database', () => ({
  database: databaseMock,
  getDatabase: () => databaseMock,
}))

const mockSendText = vi.hoisted(() => vi.fn())
vi.mock('@/server/communication/services/uazapi-sender.service', () => ({
  sendText: mockSendText,
  // normalizePhone real-ish (só dígitos) — o helper usa para a chave do limiter.
  normalizePhone: (phone: string) =>
    (phone ?? '').replace('@s.whatsapp.net', '').replace(/\D/g, ''),
}))

// RateLimiter mockado: a instância criada no módulo usa este `.check()`.
const mockRateCheck = vi.hoisted(() => vi.fn())
vi.mock('@/lib/rate-limit/rate-limiter', () => ({
  RateLimiter: class {
    check = mockRateCheck
    reset = vi.fn()
  },
}))

// ---------------------------------------------------------------------------
// SUT — após os vi.mock
// ---------------------------------------------------------------------------

import {
  trySendRouletteWhatsApp,
  buildRouletteNotifyText,
  type TrySendRouletteWhatsAppArgs,
} from './notify-member-whatsapp'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ID = 'org-1'
const CONNECTION_ID = 'conn-1'

function args(
  overrides: Partial<TrySendRouletteWhatsAppArgs> = {},
): TrySendRouletteWhatsAppArgs {
  return {
    organizationId: ORG_ID,
    connectionId: CONNECTION_ID,
    member: { whatsapp: '+5511988887777', displayName: 'Ana' },
    contactPhone: '5511999990000',
    reason: 'cliente quer falar de contrato',
    summary: 'lead quente',
    urgency: 'high',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockConnectionFindFirst.mockResolvedValue({
    uazapiToken: 'tok-123',
    uazapiBaseUrl: 'https://api.uazapi.com',
  })
  mockRateCheck.mockResolvedValue({ success: true, remaining: 9 })
  mockSendText.mockResolvedValue({ success: true, messageId: 'msg-1' })
})

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('trySendRouletteWhatsApp — envio 6A (fail-safe)', () => {
  it('no_whatsapp: membro sem WhatsApp NÃO envia', async () => {
    const res = await trySendRouletteWhatsApp(
      args({ member: { whatsapp: null, displayName: 'Sem Zap' } }),
    )
    expect(res).toEqual({ sent: false, skippedReason: 'no_whatsapp' })
    expect(mockConnectionFindFirst).not.toHaveBeenCalled()
    expect(mockSendText).not.toHaveBeenCalled()
  })

  it('no_instance: Connection sem token NÃO envia', async () => {
    mockConnectionFindFirst.mockResolvedValue({ uazapiToken: null })
    const res = await trySendRouletteWhatsApp(args())
    expect(res).toEqual({ sent: false, skippedReason: 'no_instance' })
    expect(mockSendText).not.toHaveBeenCalled()
  })

  it('no_instance: Connection inexistente NÃO envia', async () => {
    mockConnectionFindFirst.mockResolvedValue(null)
    const res = await trySendRouletteWhatsApp(args())
    expect(res.skippedReason).toBe('no_instance')
  })

  it('a Connection é resolvida org-scoped (id + organizationId no where)', async () => {
    await trySendRouletteWhatsApp(args())
    const arg = mockConnectionFindFirst.mock.calls[0]?.[0] as {
      where: { id: string; organizationId: string }
    }
    expect(arg.where.id).toBe(CONNECTION_ID)
    expect(arg.where.organizationId).toBe(ORG_ID)
  })

  it('rate_limited: limiter estourado NÃO envia', async () => {
    mockRateCheck.mockResolvedValue({ success: false, remaining: 0 })
    const res = await trySendRouletteWhatsApp(args())
    expect(res).toEqual({ sent: false, skippedReason: 'rate_limited' })
    expect(mockSendText).not.toHaveBeenCalled()
  })

  it('rate-limit é por (org + atendente normalizado) — não floodar a mesma pessoa', async () => {
    await trySendRouletteWhatsApp(args())
    const key = mockRateCheck.mock.calls[0]?.[0] as string
    expect(key).toBe(`${ORG_ID}:5511988887777`)
  })

  it('send_failed: sendText !success NÃO marca enviado', async () => {
    mockSendText.mockResolvedValue({ success: false, error: 'HTTP 500' })
    const res = await trySendRouletteWhatsApp(args())
    expect(res).toEqual({ sent: false, skippedReason: 'send_failed' })
  })

  it('sent: caminho feliz retorna { sent: true } e chama sendText', async () => {
    const res = await trySendRouletteWhatsApp(args())
    expect(res).toEqual({ sent: true })
    expect(mockSendText).toHaveBeenCalledTimes(1)
    const [token, baseUrl, recipient] = mockSendText.mock.calls[0] as [
      string,
      string,
      string,
    ]
    expect(token).toBe('tok-123')
    expect(baseUrl).toBe('https://api.uazapi.com')
    expect(recipient).toBe('+5511988887777')
  })

  it('FAIL-SAFE: um throw inesperado (DB) NÃO propaga — devolve send_failed', async () => {
    mockConnectionFindFirst.mockRejectedValue(new Error('db down'))
    const res = await trySendRouletteWhatsApp(args())
    expect(res).toEqual({ sent: false, skippedReason: 'send_failed' })
  })
})

describe('buildRouletteNotifyText', () => {
  it('inclui nome, contato, urgência, motivo e resumo quando presente', () => {
    const text = buildRouletteNotifyText({
      displayName: 'Ana',
      contactPhone: '5511999990000',
      reason: 'contrato de locação',
      summary: 'cliente decidido',
      urgency: 'high',
    })
    expect(text).toContain('Ana')
    expect(text).toContain('5511999990000')
    expect(text).toContain('ALTA')
    expect(text).toContain('contrato de locação')
    expect(text).toContain('cliente decidido')
  })

  it('omite a linha de resumo quando summary é null/vazio', () => {
    const text = buildRouletteNotifyText({
      displayName: 'Ana',
      contactPhone: '5511999990000',
      reason: 'x',
      summary: null,
      urgency: 'low',
    })
    expect(text).not.toContain('Resumo:')
  })
})
