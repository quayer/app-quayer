/**
 * Webhook Extractor Service — TDD
 *
 * Aceita webhook UAZ em formato RAW (cru, body.event === "messages" e
 * body.data presente) OU NORMALIZED (objeto que ja foi pre-processado por
 * outro middleware com messageId/contactPhone). Detecta e converte para
 * NormalizedWebhook unificado.
 *
 * Rodar:
 *   npx vitest run src/server/communication/services/webhook-extractor.service.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  isRawWebhook,
  extractFromWebhook,
  type NormalizedWebhook,
} from './webhook-extractor.service'

// Helpers --------------------------------------------------------------------

function rawIncomingText() {
  return {
    event: 'messages',
    data: {
      id: 'wamid.ABC',
      from: '5511999999999',
      fromMe: false,
      type: 'text',
      text: { body: 'oi tudo bem' },
    },
  }
}

function rawOutgoing() {
  return {
    event: 'messages',
    data: {
      id: 'wamid.OUT',
      from: '5511888888888',
      fromMe: true,
      type: 'text',
      text: { body: 'resposta do bot' },
    },
  }
}

describe('isRawWebhook', () => {
  it('retorna true quando body.event === "messages" e body.data e objeto', () => {
    expect(isRawWebhook(rawIncomingText())).toBe(true)
  })

  it('retorna false quando body nao tem event', () => {
    expect(isRawWebhook({ messageId: 'x', contactPhone: 'y' })).toBe(false)
  })

  it('retorna false quando body e null/undefined/primitivo', () => {
    expect(isRawWebhook(null)).toBe(false)
    expect(isRawWebhook(undefined)).toBe(false)
    expect(isRawWebhook('string')).toBe(false)
    expect(isRawWebhook(123)).toBe(false)
  })

  it('retorna false quando event !== "messages"', () => {
    expect(isRawWebhook({ event: 'connection', data: {} })).toBe(false)
  })
})

describe('extractFromWebhook', () => {
  it('mapeia raw payload UAZ texto entrante para NormalizedWebhook completo', () => {
    const out = extractFromWebhook(rawIncomingText())
    expect(out).not.toBeNull()
    const n = out as NormalizedWebhook
    expect(n.messageId).toBe('wamid.ABC')
    expect(n.contactPhone).toBe('5511999999999')
    expect(n.type).toBe('text')
    expect(n.content).toBe('oi tudo bem')
    expect(n.direction).toBe('IN')
  })

  it('direction = "IN" quando data.from existe e fromMe falsy', () => {
    const out = extractFromWebhook(rawIncomingText())
    expect(out?.direction).toBe('IN')
  })

  it('direction = "OUT" quando data.fromMe === true', () => {
    const out = extractFromWebhook(rawOutgoing())
    expect(out?.direction).toBe('OUT')
  })

  it('mapeia type=audio e extrai mediaUrl + mediaMimetype', () => {
    const out = extractFromWebhook({
      event: 'messages',
      data: {
        id: 'wamid.AUDIO',
        from: '5511999999999',
        fromMe: false,
        type: 'audio',
        audio: {
          url: 'https://cdn.uaz/audio.ogg',
          mimetype: 'audio/ogg',
        },
      },
    })
    expect(out?.type).toBe('audio')
    expect(out?.mediaUrl).toBe('https://cdn.uaz/audio.ogg')
    expect(out?.mediaMimetype).toBe('audio/ogg')
  })

  it('mapeia type=image e extrai media', () => {
    const out = extractFromWebhook({
      event: 'messages',
      data: {
        id: 'wamid.IMG',
        from: '5511999999999',
        fromMe: false,
        type: 'image',
        image: {
          url: 'https://cdn.uaz/photo.jpg',
          mimetype: 'image/jpeg',
        },
      },
    })
    expect(out?.type).toBe('image')
    expect(out?.mediaUrl).toBe('https://cdn.uaz/photo.jpg')
    expect(out?.mediaMimetype).toBe('image/jpeg')
  })

  it('mapeia type=video, document, location', () => {
    const v = extractFromWebhook({
      event: 'messages',
      data: { id: 'v', from: '1', fromMe: false, type: 'video', video: { url: 'u', mimetype: 'video/mp4' } },
    })
    expect(v?.type).toBe('video')

    const d = extractFromWebhook({
      event: 'messages',
      data: { id: 'd', from: '1', fromMe: false, type: 'document', document: { url: 'u', mimetype: 'application/pdf' } },
    })
    expect(d?.type).toBe('document')

    const l = extractFromWebhook({
      event: 'messages',
      data: { id: 'l', from: '1', fromMe: false, type: 'location', location: { latitude: -23.5, longitude: -46.6 } },
    })
    expect(l?.type).toBe('location')
  })

  it('aceita payload normalized (passthrough) quando ja tem messageId e contactPhone', () => {
    const normalized: NormalizedWebhook = {
      direction: 'IN',
      messageId: 'pre-normalized-1',
      contactPhone: '5511777777777',
      type: 'text',
      content: 'ja normalizado',
      raw: { foo: 'bar' },
    }
    const out = extractFromWebhook(normalized as unknown)
    expect(out).not.toBeNull()
    expect(out?.messageId).toBe('pre-normalized-1')
    expect(out?.contactPhone).toBe('5511777777777')
    expect(out?.type).toBe('text')
    expect(out?.content).toBe('ja normalizado')
  })

  it('retorna null para input invalido (null, primitivo, ou objeto sem campos)', () => {
    expect(extractFromWebhook(null)).toBeNull()
    expect(extractFromWebhook(undefined)).toBeNull()
    expect(extractFromWebhook('string')).toBeNull()
    expect(extractFromWebhook(42)).toBeNull()
    expect(extractFromWebhook({})).toBeNull()
    expect(extractFromWebhook({ random: 'noise' })).toBeNull()
  })

  it('preserva o body original em .raw', () => {
    const raw = rawIncomingText()
    const out = extractFromWebhook(raw)
    expect(out?.raw).toBe(raw)
  })
})
