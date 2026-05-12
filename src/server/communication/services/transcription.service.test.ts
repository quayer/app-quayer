/**
 * Transcription Service — Whisper audio transcription (TDD)
 *
 * Cobre:
 *  - Validacao de inputs (URL/key/mimetype)
 *  - Fluxo feliz com idioma detectado
 *  - Falha no download e na chamada da API
 *  - Mapeamento de preferredLanguage -> codigo Whisper
 *  - Deteccao de extensao por mimetype
 *
 * Rodar:
 *   npx vitest run src/server/communication/services/transcription.service.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  transcribeAudio,
  WHISPER_LANGUAGE_MAP,
} from './transcription.service'

// Helpers --------------------------------------------------------------------

function makeAudioResponse(body: Blob = new Blob(['fake-audio'], { type: 'audio/ogg' })) {
  return {
    ok: true,
    status: 200,
    blob: async () => body,
    text: async () => '',
  } as unknown as Response
}

function makeWhisperResponse(
  json: { text?: string; language?: string },
  ok = true,
  status = 200
) {
  return {
    ok,
    status,
    json: async () => json,
    text: async () => JSON.stringify(json),
  } as unknown as Response
}

describe('transcribeAudio', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retorna null se mediaUrl vazio', async () => {
    const result = await transcribeAudio('', 'audio/ogg', 'sk-test')
    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retorna null se openaiApiKey vazio', async () => {
    const result = await transcribeAudio('https://x/audio.ogg', 'audio/ogg', '')
    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retorna null se mimetype nao for audio/*', async () => {
    const result = await transcribeAudio('https://x/file.txt', 'text/plain', 'sk-test')
    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retorna TranscriptionResult com detectedLanguage uppercase em sucesso', async () => {
    fetchMock
      .mockResolvedValueOnce(makeAudioResponse())
      .mockResolvedValueOnce(makeWhisperResponse({ text: 'ola mundo', language: 'pt' }))

    const result = await transcribeAudio(
      'https://x/audio.ogg',
      'audio/ogg',
      'sk-test'
    )

    expect(result).toEqual({ text: 'ola mundo', detectedLanguage: 'PT' })
  })

  it('retorna null se download de audio falhar (status nao ok)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      blob: async () => new Blob(),
      text: async () => 'not found',
    } as unknown as Response)

    const result = await transcribeAudio(
      'https://x/missing.ogg',
      'audio/ogg',
      'sk-test'
    )

    expect(result).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retorna null se Whisper API responder 500', async () => {
    fetchMock
      .mockResolvedValueOnce(makeAudioResponse())
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => 'internal error',
      } as unknown as Response)

    const result = await transcribeAudio(
      'https://x/audio.ogg',
      'audio/ogg',
      'sk-test'
    )

    expect(result).toBeNull()
  })

  it('inclui language=pt no FormData quando preferredLanguage = "PT"', async () => {
    fetchMock
      .mockResolvedValueOnce(makeAudioResponse())
      .mockResolvedValueOnce(makeWhisperResponse({ text: 'ola', language: 'pt' }))

    await transcribeAudio('https://x/audio.ogg', 'audio/ogg', 'sk-test', 'PT')

    const whisperCall = fetchMock.mock.calls[1]
    expect(whisperCall[0]).toBe('https://api.openai.com/v1/audio/transcriptions')
    const init = whisperCall[1] as RequestInit
    const fd = init.body as FormData
    expect(fd.get('language')).toBe('pt')
    expect(fd.get('model')).toBe('whisper-1')
    expect(fd.get('response_format')).toBe('verbose_json')
  })

  it('quando preferredLanguage nao mapeado, NAO envia campo language (deteccao auto)', async () => {
    fetchMock
      .mockResolvedValueOnce(makeAudioResponse())
      .mockResolvedValueOnce(makeWhisperResponse({ text: 'hi', language: 'en' }))

    await transcribeAudio('https://x/audio.ogg', 'audio/ogg', 'sk-test', 'ZZ')

    const init = fetchMock.mock.calls[1][1] as RequestInit
    const fd = init.body as FormData
    expect(fd.get('language')).toBeNull()
  })

  it('detecta extensao mp3 a partir de mimetype audio/mpeg', async () => {
    fetchMock
      .mockResolvedValueOnce(makeAudioResponse(new Blob(['mp3'], { type: 'audio/mpeg' })))
      .mockResolvedValueOnce(makeWhisperResponse({ text: 't', language: 'pt' }))

    await transcribeAudio('https://x/audio.mp3', 'audio/mpeg', 'sk-test')

    const init = fetchMock.mock.calls[1][1] as RequestInit
    const fd = init.body as FormData
    const file = fd.get('file') as File | null
    expect(file).not.toBeNull()
    expect(file?.name).toBe('audio.mp3')
  })

  it('detecta extensao ogg a partir de mimetype audio/ogg', async () => {
    fetchMock
      .mockResolvedValueOnce(makeAudioResponse(new Blob(['ogg'], { type: 'audio/ogg' })))
      .mockResolvedValueOnce(makeWhisperResponse({ text: 't', language: 'pt' }))

    await transcribeAudio('https://x/audio.ogg', 'audio/ogg', 'sk-test')

    const init = fetchMock.mock.calls[1][1] as RequestInit
    const fd = init.body as FormData
    const file = fd.get('file') as File | null
    expect(file?.name).toBe('audio.ogg')
  })

  it('envia Authorization Bearer com a key', async () => {
    fetchMock
      .mockResolvedValueOnce(makeAudioResponse())
      .mockResolvedValueOnce(makeWhisperResponse({ text: 't', language: 'pt' }))

    await transcribeAudio('https://x/audio.ogg', 'audio/ogg', 'sk-MYKEY')

    const init = fetchMock.mock.calls[1][1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk-MYKEY')
  })

  it('retorna null sem detectedLanguage quando Whisper omite language', async () => {
    fetchMock
      .mockResolvedValueOnce(makeAudioResponse())
      .mockResolvedValueOnce(makeWhisperResponse({ text: 'sem idioma' }))

    const result = await transcribeAudio('https://x/audio.ogg', 'audio/ogg', 'sk-test')
    expect(result).toEqual({ text: 'sem idioma', detectedLanguage: undefined })
  })
})

describe('WHISPER_LANGUAGE_MAP', () => {
  it('mapeia idiomas suportados para codigos ISO Whisper', () => {
    expect(WHISPER_LANGUAGE_MAP.PT).toBe('pt')
    expect(WHISPER_LANGUAGE_MAP.EN).toBe('en')
    expect(WHISPER_LANGUAGE_MAP.ES).toBe('es')
    expect(WHISPER_LANGUAGE_MAP.FR).toBe('fr')
    expect(WHISPER_LANGUAGE_MAP.DE).toBe('de')
    expect(WHISPER_LANGUAGE_MAP.IT).toBe('it')
    expect(WHISPER_LANGUAGE_MAP.JA).toBe('ja')
    expect(WHISPER_LANGUAGE_MAP.ZH).toBe('zh')
    expect(WHISPER_LANGUAGE_MAP.RU).toBe('ru')
    expect(WHISPER_LANGUAGE_MAP.AR).toBe('ar')
  })
})
