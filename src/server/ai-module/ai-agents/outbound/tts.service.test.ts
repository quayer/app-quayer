/**
 * tts.service — unit tests (Vitest, fetch mockado).
 *
 * Cobre:
 *   - Sucesso ElevenLabs → retorna { audio: Buffer, mimeType }
 *   - Sucesso Deepgram   → retorna { audio: Buffer, mimeType }
 *   - apiKey ausente     → { skipped: true, reason }
 *   - texto vazio        → { skipped: true, reason }
 *   - HTTP 401 provider  → { skipped: true, reason } (sem throw)
 *   - fetch lança        → { skipped: true, reason } (sem throw)
 *   - isTtsEnabled       → true/false conforme enableTTS + provider
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { synthesizeSpeech, isTtsEnabled } from './tts.service'

// ---------------------------------------------------------------------------
// fetch mock global
// ---------------------------------------------------------------------------

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeResponse(ok: boolean, status: number, body: ArrayBuffer | string): Response {
  const arrayBuf = typeof body === 'string' ? new TextEncoder().encode(body).buffer : body
  return {
    ok,
    status,
    arrayBuffer: async () => arrayBuf,
    text: async () => (typeof body === 'string' ? body : ''),
  } as unknown as Response
}

const SAMPLE_AUDIO = new Uint8Array([0xff, 0xfb, 0x90, 0x00]).buffer

beforeEach(() => {
  mockFetch.mockReset()
})

// ---------------------------------------------------------------------------
// synthesizeSpeech — ElevenLabs
// ---------------------------------------------------------------------------

describe('synthesizeSpeech — elevenlabs', () => {
  it('retorna audio Buffer quando HTTP 200', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(true, 200, SAMPLE_AUDIO))

    const result = await synthesizeSpeech({
      text: 'Olá mundo',
      provider: 'elevenlabs',
      apiKey: 'el-test-key',
    })

    expect('skipped' in result).toBe(false)
    if (!('skipped' in result)) {
      expect(result.audio).toBeInstanceOf(Buffer)
      expect(result.audio.length).toBeGreaterThan(0)
      expect(result.mimeType).toBe('audio/mpeg')
    }

    // Garante que a key NÃO aparece nos logs (fetch headers não são logados
    // — verificamos apenas que o call aconteceu uma vez)
    expect(mockFetch).toHaveBeenCalledOnce()
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('elevenlabs.io')
  })

  it('retorna skipped quando HTTP 401', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(false, 401, 'invalid api key'))

    const result = await synthesizeSpeech({
      text: 'Teste',
      provider: 'elevenlabs',
      apiKey: 'bad-key',
    })

    expect(result).toMatchObject({ skipped: true })
    if ('skipped' in result) {
      expect(result.reason).toContain('401')
    }
  })

  it('usa voiceId e model customizados na URL', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(true, 200, SAMPLE_AUDIO))

    await synthesizeSpeech({
      text: 'Hi',
      provider: 'elevenlabs',
      apiKey: 'el-key',
      voiceId: 'custom-voice-abc',
      model: 'eleven_turbo_v2',
    })

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('custom-voice-abc')
  })
})

// ---------------------------------------------------------------------------
// synthesizeSpeech — Deepgram
// ---------------------------------------------------------------------------

describe('synthesizeSpeech — deepgram', () => {
  it('retorna audio Buffer quando HTTP 200', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(true, 200, SAMPLE_AUDIO))

    const result = await synthesizeSpeech({
      text: 'Hello',
      provider: 'deepgram',
      apiKey: 'dg-test-key',
    })

    expect('skipped' in result).toBe(false)
    if (!('skipped' in result)) {
      expect(result.audio).toBeInstanceOf(Buffer)
      expect(result.mimeType).toBe('audio/mpeg')
    }

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('deepgram.com')
  })

  it('retorna skipped quando HTTP 500', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(false, 500, 'internal error'))

    const result = await synthesizeSpeech({
      text: 'Hi',
      provider: 'deepgram',
      apiKey: 'dg-key',
    })

    expect(result).toMatchObject({ skipped: true })
    if ('skipped' in result) {
      expect(result.reason).toContain('500')
    }
  })

  it('usa voiceId como parâmetro model na URL', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(true, 200, SAMPLE_AUDIO))

    await synthesizeSpeech({
      text: 'Oi',
      provider: 'deepgram',
      apiKey: 'dg-key',
      voiceId: 'aura-2-luna-en',
    })

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('aura-2-luna-en')
  })
})

// ---------------------------------------------------------------------------
// synthesizeSpeech — fail-soft sem apiKey / texto vazio
// ---------------------------------------------------------------------------

describe('synthesizeSpeech — fail-soft', () => {
  it('retorna skipped quando apiKey ausente (string vazia)', async () => {
    const result = await synthesizeSpeech({
      text: 'Olá',
      provider: 'elevenlabs',
      apiKey: '',
    })

    expect(result).toMatchObject({ skipped: true })
    if ('skipped' in result) {
      expect(result.reason).toContain('apiKey ausente')
    }
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('retorna skipped quando texto vazio', async () => {
    const result = await synthesizeSpeech({
      text: '   ',
      provider: 'elevenlabs',
      apiKey: 'some-key',
    })

    expect(result).toMatchObject({ skipped: true })
    if ('skipped' in result) {
      expect(result.reason).toContain('texto vazio')
    }
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('retorna skipped quando fetch lança (rede)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network timeout'))

    const result = await synthesizeSpeech({
      text: 'Olá',
      provider: 'elevenlabs',
      apiKey: 'el-key',
    })

    expect(result).toMatchObject({ skipped: true })
    if ('skipped' in result) {
      expect(result.reason).toContain('network timeout')
    }
  })

  it('usa elevenlabs como provider default quando omitido', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(true, 200, SAMPLE_AUDIO))

    const result = await synthesizeSpeech({ text: 'Oi', apiKey: 'k' })

    expect('skipped' in result).toBe(false)
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('elevenlabs.io')
  })
})

// ---------------------------------------------------------------------------
// isTtsEnabled
// ---------------------------------------------------------------------------

describe('isTtsEnabled', () => {
  it('retorna false para null', () => {
    expect(isTtsEnabled(null)).toBe(false)
  })

  it('retorna false para undefined', () => {
    expect(isTtsEnabled(undefined)).toBe(false)
  })

  it('retorna false quando enableTTS=false', () => {
    expect(isTtsEnabled({ enableTTS: false, ttsProvider: 'elevenlabs' })).toBe(false)
  })

  it('retorna false quando enableTTS=true mas provider desconhecido', () => {
    expect(isTtsEnabled({ enableTTS: true, ttsProvider: 'openai' })).toBe(false)
  })

  it('retorna false quando enableTTS=true mas provider null', () => {
    expect(isTtsEnabled({ enableTTS: true, ttsProvider: null })).toBe(false)
  })

  it('retorna true para enableTTS=true + provider elevenlabs', () => {
    expect(isTtsEnabled({ enableTTS: true, ttsProvider: 'elevenlabs' })).toBe(true)
  })

  it('retorna true para enableTTS=true + provider deepgram', () => {
    expect(isTtsEnabled({ enableTTS: true, ttsProvider: 'deepgram' })).toBe(true)
  })

  it('retorna false quando enableTTS=null', () => {
    expect(isTtsEnabled({ enableTTS: null, ttsProvider: 'elevenlabs' })).toBe(false)
  })
})
