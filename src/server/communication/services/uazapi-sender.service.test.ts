/**
 * uazapi-sender.service — TDD unit tests.
 *
 * Cobre o serviço low-level de envio outbound via UAZapi:
 *   - sendText, sendImage, sendAudio, sendTyping
 *   - normalizePhone (helper interno, testado via comportamento exposto)
 *   - delay opcional + replyToMessageId
 *
 * Estratégia:
 *   - fetch é mockado via vi.stubGlobal para inspecionar URL/headers/body.
 *   - Não há mock de Redis ou DB — este serviço é puro HTTP.
 *
 * Rodar:
 *   npx vitest run src/server/communication/services/uazapi-sender.service.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  sendText,
  sendImage,
  sendAudio,
  sendTyping,
  normalizePhone,
} from './uazapi-sender.service'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FetchMock = ReturnType<typeof vi.fn>

function getFetchMock(): FetchMock {
  return globalThis.fetch as unknown as FetchMock
}

function jsonResponse(body: unknown, init: { status?: number; ok?: boolean } = {}) {
  const status = init.status ?? 200
  const ok = init.ok ?? (status >= 200 && status < 300)
  return {
    ok,
    status,
    json: async () => body,
  } as Response
}

const TOKEN = 'tok-abc'
const BASE_URL = 'https://api.uazapi.example.com'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// normalizePhone
// ---------------------------------------------------------------------------

describe('normalizePhone', () => {
  it('remove caracteres não numéricos de um telefone formatado', () => {
    expect(normalizePhone('+55 (11) 99999-9999')).toBe('5511999999999')
  })

  it('remove sufixo @s.whatsapp.net', () => {
    expect(normalizePhone('5511999999999@s.whatsapp.net')).toBe('5511999999999')
  })

  it('mantém um telefone já normalizado', () => {
    expect(normalizePhone('5511999999999')).toBe('5511999999999')
  })

  it('lida com string vazia', () => {
    expect(normalizePhone('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// sendText
// ---------------------------------------------------------------------------

describe('sendText', () => {
  it('retorna success=true com messageId quando UAZapi responde 200', async () => {
    getFetchMock().mockResolvedValue(
      jsonResponse({ key: { id: 'wa-msg-id-1' } }, { status: 200 }),
    )

    const res = await sendText(TOKEN, BASE_URL, '5511999999999', 'oi')

    expect(res.success).toBe(true)
    expect(res.messageId).toBe('wa-msg-id-1')
    expect(res.error).toBeUndefined()
  })

  it('extrai messageId do campo messageId quando key.id ausente', async () => {
    getFetchMock().mockResolvedValue(
      jsonResponse({ messageId: 'fallback-id' }, { status: 200 }),
    )

    const res = await sendText(TOKEN, BASE_URL, '5511999999999', 'oi')

    expect(res.success).toBe(true)
    expect(res.messageId).toBe('fallback-id')
  })

  it('retorna success=false com erro quando UAZapi responde 500', async () => {
    getFetchMock().mockResolvedValue(
      jsonResponse({ message: 'internal' }, { status: 500 }),
    )

    const res = await sendText(TOKEN, BASE_URL, '5511999999999', 'oi')

    expect(res.success).toBe(false)
    expect(res.messageId).toBeUndefined()
    expect(res.error).toBeDefined()
    expect(String(res.error)).toMatch(/500|internal/i)
  })

  it('retorna success=false quando fetch lança (network error)', async () => {
    getFetchMock().mockRejectedValue(new Error('ECONNREFUSED'))

    const res = await sendText(TOKEN, BASE_URL, '5511999999999', 'oi')

    expect(res.success).toBe(false)
    expect(res.error).toBeDefined()
    expect(String(res.error)).toMatch(/ECONNREFUSED/)
  })

  it('envia POST para baseUrl + /send/text com header token e body correto', async () => {
    getFetchMock().mockResolvedValue(jsonResponse({ messageId: 'x' }, { status: 200 }))

    await sendText(TOKEN, BASE_URL, '+55 11 99999-9999', 'olá')

    const fetchMock = getFetchMock()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]

    expect(url).toBe(`${BASE_URL}/send/text`)
    expect(init.method).toBe('POST')

    const headers = init.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers.token).toBe(TOKEN)

    const body = JSON.parse(init.body as string)
    expect(body.number).toBe('5511999999999') // normalizado
    expect(body.text).toBe('olá')
  })

  it('inclui replyid no body quando replyToMessageId é passado', async () => {
    getFetchMock().mockResolvedValue(jsonResponse({ messageId: 'x' }, { status: 200 }))

    await sendText(TOKEN, BASE_URL, '5511999999999', 'oi', {
      replyToMessageId: 'reply-target',
    })

    const fetchMock = getFetchMock()
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>

    // Aceita tanto replyid (padrão UAZapi) quanto reply_to/quoted_message_id.
    const replyValue = body.replyid ?? body.reply_to ?? body.quoted_message_id
    expect(replyValue).toBe('reply-target')
  })

  it('respeita delayMs antes de enviar', async () => {
    vi.useFakeTimers()
    getFetchMock().mockResolvedValue(jsonResponse({ messageId: 'x' }, { status: 200 }))

    const promise = sendText(TOKEN, BASE_URL, '5511999999999', 'oi', { delayMs: 2000 })

    // antes de avançar o tempo, fetch ainda não foi chamado
    expect(getFetchMock()).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2000)
    const res = await promise

    expect(res.success).toBe(true)
    expect(getFetchMock()).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// sendImage
// ---------------------------------------------------------------------------

describe('sendImage', () => {
  it('envia campo image (url) e caption no body', async () => {
    getFetchMock().mockResolvedValue(jsonResponse({ messageId: 'img-1' }, { status: 200 }))

    const res = await sendImage(
      TOKEN,
      BASE_URL,
      '5511999999999',
      'https://cdn/foto.jpg',
      'legenda',
    )

    expect(res.success).toBe(true)
    expect(res.messageId).toBe('img-1')

    const [url, init] = getFetchMock().mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE_URL}/send/image`)

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.number).toBe('5511999999999')
    // Aceita tanto "image" quanto "imageUrl" como nome do campo.
    expect(body.image ?? body.imageUrl).toBe('https://cdn/foto.jpg')
    expect(body.caption).toBe('legenda')
  })

  it('caption opcional → envia string vazia ou ausente', async () => {
    getFetchMock().mockResolvedValue(jsonResponse({ messageId: 'img-2' }, { status: 200 }))

    await sendImage(TOKEN, BASE_URL, '5511999999999', 'https://cdn/x.jpg')

    const [, init] = getFetchMock().mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.caption === '' || body.caption === undefined).toBe(true)
  })

  it('retorna error quando UAZapi responde 4xx', async () => {
    getFetchMock().mockResolvedValue(jsonResponse({ message: 'invalid url' }, { status: 400 }))

    const res = await sendImage(TOKEN, BASE_URL, '5511999999999', 'bad')

    expect(res.success).toBe(false)
    expect(res.error).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// sendAudio
// ---------------------------------------------------------------------------

describe('sendAudio', () => {
  it('envia campo audio (url) e mimetype audio/ogg', async () => {
    getFetchMock().mockResolvedValue(jsonResponse({ messageId: 'aud-1' }, { status: 200 }))

    const res = await sendAudio(TOKEN, BASE_URL, '5511999999999', 'https://cdn/audio.ogg')

    expect(res.success).toBe(true)
    expect(res.messageId).toBe('aud-1')

    const [url, init] = getFetchMock().mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE_URL}/send/audio`)

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.number).toBe('5511999999999')
    expect(body.audio ?? body.audioUrl).toBe('https://cdn/audio.ogg')
    // Deve sinalizar mimetype para áudio (voice note / ptt).
    const mime = (body.mimetype ?? body.mimeType ?? body.type) as string | undefined
    expect(mime).toBeDefined()
    expect(String(mime)).toMatch(/audio\/ogg/i)
  })

  it('retorna error em falha de rede', async () => {
    getFetchMock().mockRejectedValue(new Error('socket hang up'))

    const res = await sendAudio(TOKEN, BASE_URL, '5511999999999', 'https://cdn/x.ogg')

    expect(res.success).toBe(false)
    expect(String(res.error)).toMatch(/socket hang up/)
  })
})

// ---------------------------------------------------------------------------
// sendTyping
// ---------------------------------------------------------------------------

describe('sendTyping', () => {
  it('envia presence=composing quando isTyping=true', async () => {
    getFetchMock().mockResolvedValue(jsonResponse({}, { status: 200 }))

    const ok = await sendTyping(TOKEN, BASE_URL, '5511999999999', true)

    expect(ok).toBe(true)
    const [, init] = getFetchMock().mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.presence).toBe('composing')
  })

  it('envia presence=paused quando isTyping=false', async () => {
    getFetchMock().mockResolvedValue(jsonResponse({}, { status: 200 }))

    const ok = await sendTyping(TOKEN, BASE_URL, '5511999999999', false)

    expect(ok).toBe(true)
    const [, init] = getFetchMock().mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.presence).toBe('paused')
  })

  it('retorna false em erro de rede (não propaga)', async () => {
    getFetchMock().mockRejectedValue(new Error('boom'))

    const ok = await sendTyping(TOKEN, BASE_URL, '5511999999999', true)

    expect(ok).toBe(false)
  })
})
