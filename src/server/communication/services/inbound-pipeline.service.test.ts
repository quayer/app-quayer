/**
 * inbound-pipeline.service — TDD
 *
 * Rodar:
 *   npx vitest run src/server/communication/services/inbound-pipeline.service.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Redis } from 'ioredis'

import { processInboundMessage } from './inbound-pipeline.service'
import { extractFromWebhook } from './webhook-extractor.service'
import { cleanMessage, isBinaryGarbage } from './text-normalizer.service'
import { transcribeMedia } from './transcription.service'
import { processImage } from './vision.service'
import { processBuffer } from './buffer-concat.service'

vi.mock('./webhook-extractor.service')
vi.mock('./text-normalizer.service')
vi.mock('./transcription.service')
vi.mock('./vision.service')
vi.mock('./buffer-concat.service')

const mockExtract = vi.mocked(extractFromWebhook)
const mockCleanMessage = vi.mocked(cleanMessage)
const mockIsBinaryGarbage = vi.mocked(isBinaryGarbage)
const mockTranscribeMedia = vi.mocked(transcribeMedia)
const mockProcessImage = vi.mocked(processImage)
const mockProcessBuffer = vi.mocked(processBuffer)

const fakeRedis = {} as unknown as Redis

const baseNormalized = {
  instanceId: 'inst-1',
  token: 'tok-1',
  direction: 'IN' as const,
  messageId: 'msg-1',
  contactPhone: '5511999990000',
  type: 'text' as const,
  content: 'oi tudo bem',
  raw: { event: 'messages' },
}

function bufferPass(text: string, total = 1) {
  return {
    shouldProcess: true,
    mensagemFinal: text,
    mensagemOriginal: text,
    totalMensagens: total,
  }
}

describe('processInboundMessage', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    // Defaults benignos — testes que precisam sobrescrevem.
    mockExtract.mockReturnValue({ ...baseNormalized })
    mockCleanMessage.mockImplementation((t: string) => (t ?? '').trim())
    mockIsBinaryGarbage.mockReturnValue(false)
    mockTranscribeMedia.mockResolvedValue(null)
    mockProcessImage.mockResolvedValue({ success: false, error: 'noop' })
    mockProcessBuffer.mockResolvedValue(bufferPass('oi tudo bem'))
  })

  afterEach(() => warnSpy?.mockRestore())

  // 1. Payload inválido
  it('retorna shouldDispatchAi=false com reason INVALID_WEBHOOK quando extractFromWebhook devolve null', async () => {
    mockExtract.mockReturnValue(null)

    const result = await processInboundMessage({ payload: {}, redis: null })

    expect(result.shouldDispatchAi).toBe(false)
    expect(result.reason).toBe('INVALID_WEBHOOK')
    expect(result.normalized).toBeNull()
    expect(mockProcessBuffer).not.toHaveBeenCalled()
    expect(mockTranscribeMedia).not.toHaveBeenCalled()
  })

  // 2. Direção OUT
  it('para imediatamente com reason OUTBOUND_MESSAGE quando direction=OUT', async () => {
    mockExtract.mockReturnValue({ ...baseNormalized, direction: 'OUT' })

    const result = await processInboundMessage({
      payload: { event: 'messages' },
      redis: fakeRedis,
      openaiApiKey: 'sk-1',
    })

    expect(result.shouldDispatchAi).toBe(false)
    expect(result.reason).toBe('OUTBOUND_MESSAGE')
    expect(mockTranscribeMedia).not.toHaveBeenCalled()
    expect(mockProcessImage).not.toHaveBeenCalled()
    expect(mockProcessBuffer).not.toHaveBeenCalled()
  })

  // 3. Texto simples
  it('texto simples passa por cleanMessage e processBuffer e dispatch=true', async () => {
    mockCleanMessage.mockReturnValue('oi tudo bem')
    mockProcessBuffer.mockResolvedValue(bufferPass('oi tudo bem'))

    const result = await processInboundMessage({
      payload: { event: 'messages' },
      redis: fakeRedis,
    })

    expect(mockCleanMessage).toHaveBeenCalledWith('oi tudo bem')
    expect(mockProcessBuffer).toHaveBeenCalled()
    expect(result.shouldDispatchAi).toBe(true)
    expect(result.enrichedContent).toBe('oi tudo bem')
  })

  // 4. Áudio + whisperEnabled + openaiApiKey
  it('audio com whisperEnabled e openaiApiKey usa transcrição como enrichedContent', async () => {
    mockExtract.mockReturnValue({
      ...baseNormalized,
      type: 'audio',
      content: '',
      mediaUrl: 'https://cdn/audio.ogg',
      mediaMimetype: 'audio/ogg',
    })
    mockTranscribeMedia.mockResolvedValue({
      text: 'olá quero saber o preço',
      detectedLanguage: 'PT',
      provider: 'whisper',
    })
    mockProcessBuffer.mockResolvedValue(bufferPass('olá quero saber o preço'))
    mockCleanMessage.mockImplementation((t: string) => t)

    const result = await processInboundMessage({
      payload: { event: 'messages' },
      redis: fakeRedis,
      openaiApiKey: 'sk-test',
    })

    expect(mockTranscribeMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaUrl: 'https://cdn/audio.ogg',
        mimetype: 'audio/ogg',
        openaiKey: 'sk-test',
      }),
    )
    expect(result.enrichedContent).toBe('olá quero saber o preço')
    expect(result.detectedLanguage).toBe('PT')
    expect(result.mediaProcessed).toBe(true)
    expect(result.processingSteps).toContain('whisper')
  })

  // 5. Áudio com whisperEnabled=false
  it('audio com whisperEnabled=false NÃO chama transcribeMedia', async () => {
    mockExtract.mockReturnValue({
      ...baseNormalized,
      type: 'audio',
      content: '',
      mediaUrl: 'https://cdn/audio.ogg',
      mediaMimetype: 'audio/ogg',
    })
    mockProcessBuffer.mockResolvedValue(bufferPass(''))

    const result = await processInboundMessage({
      payload: { event: 'messages' },
      redis: fakeRedis,
      openaiApiKey: 'sk-test',
      whisperEnabled: false,
    })

    expect(mockTranscribeMedia).not.toHaveBeenCalled()
    expect(result.mediaProcessed).toBe(false)
    expect(result.processingSteps).not.toContain('whisper')
  })

  // 6. Áudio sem chaves (sem openaiApiKey e sem org → sem Deepgram)
  it('audio sem nenhuma chave NÃO chama transcribeMedia', async () => {
    mockExtract.mockReturnValue({
      ...baseNormalized,
      type: 'audio',
      content: '',
      mediaUrl: 'https://cdn/audio.ogg',
      mediaMimetype: 'audio/ogg',
    })
    mockProcessBuffer.mockResolvedValue(bufferPass(''))

    const result = await processInboundMessage({
      payload: { event: 'messages' },
      redis: fakeRedis,
    })

    expect(mockTranscribeMedia).not.toHaveBeenCalled()
    expect(result.mediaProcessed).toBe(false)
  })

  // 7. Imagem com visionEnabled=true
  it('imagem com visionEnabled=true chama processImage e usa vision.text', async () => {
    mockExtract.mockReturnValue({
      ...baseNormalized,
      type: 'image',
      content: '',
      mediaUrl: 'https://cdn/img.jpg',
      mediaMimetype: 'image/jpeg',
    })
    mockProcessImage.mockResolvedValue({
      success: true,
      text: 'foto de uma camisa azul',
      method: 'vision',
      type: 'image',
    })
    mockProcessBuffer.mockResolvedValue(bufferPass('foto de uma camisa azul'))
    mockCleanMessage.mockImplementation((t: string) => t)

    const result = await processInboundMessage({
      payload: { event: 'messages' },
      redis: fakeRedis,
      openaiApiKey: 'sk-1',
    })

    expect(mockProcessImage).toHaveBeenCalledWith(
      'https://cdn/img.jpg',
      'image/jpeg',
      'sk-1',
    )
    expect(result.enrichedContent).toBe('foto de uma camisa azul')
    expect(result.mediaProcessed).toBe(true)
    expect(result.processingSteps).toContain('vision')
  })

  // 8. Imagem com visionEnabled=false
  it('imagem com visionEnabled=false NÃO chama processImage', async () => {
    mockExtract.mockReturnValue({
      ...baseNormalized,
      type: 'image',
      content: '',
      mediaUrl: 'https://cdn/img.jpg',
      mediaMimetype: 'image/jpeg',
    })
    mockProcessBuffer.mockResolvedValue(bufferPass(''))

    const result = await processInboundMessage({
      payload: { event: 'messages' },
      redis: fakeRedis,
      openaiApiKey: 'sk-1',
      visionEnabled: false,
    })

    expect(mockProcessImage).not.toHaveBeenCalled()
    expect(result.processingSteps).not.toContain('vision')
  })

  // 9. Buffer waiting (shouldProcess=false)
  it('buffer shouldProcess=false propaga reason e dispatch=false', async () => {
    mockProcessBuffer.mockResolvedValue({
      shouldProcess: false,
      mensagemFinal: '',
      mensagemOriginal: 'oi',
      totalMensagens: 2,
      reason: 'NOT_FIRST_MESSAGE',
    })

    const result = await processInboundMessage({
      payload: { event: 'messages' },
      redis: fakeRedis,
    })

    expect(result.shouldDispatchAi).toBe(false)
    expect(result.reason).toBe('NOT_FIRST_MESSAGE')
    expect(result.bufferConcatenated).toBe(false)
  })

  // 10. Buffer concatena
  it('buffer com totalMensagens>1 atualiza enrichedContent e marca bufferConcatenated=true', async () => {
    mockCleanMessage.mockImplementation((t: string) => t)
    mockProcessBuffer.mockResolvedValue({
      shouldProcess: true,
      mensagemFinal: 'oi\nquero saber\no preço',
      mensagemOriginal: 'oi\nquero saber\no preço',
      totalMensagens: 3,
    })

    const result = await processInboundMessage({
      payload: { event: 'messages' },
      redis: fakeRedis,
    })

    expect(result.shouldDispatchAi).toBe(true)
    expect(result.enrichedContent).toBe('oi\nquero saber\no preço')
    expect(result.bufferConcatenated).toBe(true)
    expect(result.processingSteps).toContain('buffer')
  })

  // 11. Buffer disabled
  it('bufferEnabled=false NÃO chama processBuffer', async () => {
    mockCleanMessage.mockReturnValue('oi tudo bem')

    const result = await processInboundMessage({
      payload: { event: 'messages' },
      redis: fakeRedis,
      bufferEnabled: false,
    })

    expect(mockProcessBuffer).not.toHaveBeenCalled()
    expect(result.shouldDispatchAi).toBe(true)
    expect(result.enrichedContent).toBe('oi tudo bem')
    expect(result.processingSteps).not.toContain('buffer')
  })

  // 12. Redis null
  it('redis=null NÃO chama processBuffer (passthrough)', async () => {
    mockCleanMessage.mockReturnValue('oi')

    const result = await processInboundMessage({
      payload: { event: 'messages' },
      redis: null,
    })

    expect(mockProcessBuffer).not.toHaveBeenCalled()
    expect(result.shouldDispatchAi).toBe(true)
    expect(result.enrichedContent).toBe('oi')
  })

  // 13. processingSteps tem os steps executados
  it('processingSteps inclui normalize, whisper, vision quando aplicável e buffer', async () => {
    mockExtract.mockReturnValue({
      ...baseNormalized,
      type: 'audio',
      content: '',
      mediaUrl: 'https://cdn/a.ogg',
      mediaMimetype: 'audio/ogg',
    })
    mockTranscribeMedia.mockResolvedValue({ text: 'hello', detectedLanguage: 'EN', provider: 'whisper' })
    mockProcessBuffer.mockResolvedValue(bufferPass('hello'))
    mockCleanMessage.mockImplementation((t: string) => t)

    const result = await processInboundMessage({
      payload: { event: 'messages' },
      redis: fakeRedis,
      openaiApiKey: 'sk-1',
    })

    expect(result.processingSteps).toEqual(
      expect.arrayContaining(['normalize', 'whisper', 'buffer']),
    )
    expect(result.processingSteps).not.toContain('vision')
  })

  // 14. Whisper joga erro
  it('erro do Whisper preserva enrichedContent original (fail-safe) e continua pipeline', async () => {
    mockExtract.mockReturnValue({
      ...baseNormalized,
      type: 'audio',
      content: 'caption-fallback',
      mediaUrl: 'https://cdn/a.ogg',
      mediaMimetype: 'audio/ogg',
    })
    mockCleanMessage.mockImplementation((t: string) => t)
    mockTranscribeMedia.mockRejectedValue(new Error('boom'))
    mockProcessBuffer.mockResolvedValue(bufferPass('caption-fallback'))

    const result = await processInboundMessage({
      payload: { event: 'messages' },
      redis: fakeRedis,
      openaiApiKey: 'sk-1',
    })

    expect(result.shouldDispatchAi).toBe(true)
    expect(result.enrichedContent).toBe('caption-fallback')
    expect(result.mediaProcessed).toBe(false)
    expect(mockProcessBuffer).toHaveBeenCalled()
  })

  // 15. Vision joga erro
  it('erro do Vision preserva enrichedContent original (fail-safe)', async () => {
    mockExtract.mockReturnValue({
      ...baseNormalized,
      type: 'image',
      content: 'caption',
      mediaUrl: 'https://cdn/i.jpg',
      mediaMimetype: 'image/jpeg',
    })
    mockCleanMessage.mockImplementation((t: string) => t)
    mockProcessImage.mockRejectedValue(new Error('vision crash'))
    mockProcessBuffer.mockResolvedValue(bufferPass('caption'))

    const result = await processInboundMessage({
      payload: { event: 'messages' },
      redis: fakeRedis,
      openaiApiKey: 'sk-1',
    })

    expect(result.shouldDispatchAi).toBe(true)
    expect(result.enrichedContent).toBe('caption')
    expect(result.mediaProcessed).toBe(false)
  })

  // 16. isBinaryGarbage
  it('isBinaryGarbage=true substitui enrichedContent por [mensagem ilegivel] mas continua pipeline', async () => {
    mockExtract.mockReturnValue({
      ...baseNormalized,
      content: 'binarystuff==',
    })
    mockIsBinaryGarbage.mockReturnValue(true)
    mockProcessBuffer.mockResolvedValue(bufferPass('[mensagem ilegivel]'))

    const result = await processInboundMessage({
      payload: { event: 'messages' },
      redis: fakeRedis,
    })

    expect(result.shouldDispatchAi).toBe(true)
    expect(mockCleanMessage).not.toHaveBeenCalled()
    expect(mockProcessBuffer).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      '[mensagem ilegivel]',
      expect.any(String),
      undefined,
    )
  })
})

