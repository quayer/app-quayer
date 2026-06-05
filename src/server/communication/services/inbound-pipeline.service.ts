/**
 * inbound-pipeline.service — orquestra a pipeline completa de uma mensagem
 * WhatsApp inbound. Recebe payload bruto (ou normalizado), atravessa os
 * services especializados (webhook-extractor → text-normalizer → whisper →
 * vision → buffer) e devolve um resultado pronto para `processAgentMessage`.
 *
 * Cada falha de etapa de enriquecimento (Whisper/Vision) é fail-safe: o
 * pipeline continua com o conteúdo anterior em vez de bloquear a mensagem.
 * Apenas direção OUT ou webhook inválido encerram a pipeline cedo, e o
 * buffer pode pausar a entrega quando ainda há fragmentos chegando.
 */

import type { Redis } from 'ioredis'
import {
  extractFromWebhook,
  type NormalizedWebhook,
} from './webhook-extractor.service'
import { cleanMessage, isBinaryGarbage } from './text-normalizer.service'
import { transcribeMedia } from './transcription.service'
import { processImage } from './vision.service'
import { processBuffer } from './buffer-concat.service'
import { credentialResolver } from '@/lib/providers/credential-resolver.service'

export interface InboundPipelineInput {
  payload: unknown
  redis: Redis | null
  openaiApiKey?: string
  /**
   * Org dona da conexão. Quando presente, a deepgramKey é resolvida por org
   * (BYOK) e usada como STT principal — Whisper (openaiApiKey) vira fallback.
   */
  organizationId?: string
  bufferTimeoutSeconds?: number
  whisperEnabled?: boolean
  visionEnabled?: boolean
  imageVisionEnabled?: boolean
  documentVisionEnabled?: boolean
  videoUnderstandingEnabled?: boolean
  bufferEnabled?: boolean
}

export interface InboundPipelineResult {
  shouldDispatchAi: boolean
  normalized: NormalizedWebhook | null
  enrichedContent: string
  detectedLanguage?: string
  mediaProcessed: boolean
  bufferConcatenated: boolean
  reason?: string
  processingSteps: string[]
}

const BINARY_GARBAGE_SENTINEL = '[mensagem ilegivel]'

/** Sessão usada pelo buffer — chave única por instância+contato. */
function buildSessionId(normalized: NormalizedWebhook): string {
  const inst = normalized.instanceId ?? 'unknown'
  return `${inst}:${normalized.contactPhone}`
}

export async function processInboundMessage(
  input: InboundPipelineInput,
): Promise<InboundPipelineResult> {
  const {
    payload,
    redis,
    openaiApiKey,
    organizationId,
    bufferTimeoutSeconds,
    whisperEnabled = true,
    visionEnabled = true,
    imageVisionEnabled = visionEnabled,
    documentVisionEnabled = visionEnabled,
    videoUnderstandingEnabled = true,
    bufferEnabled = true,
  } = input

  const processingSteps: string[] = []

  // 1. Extrair webhook.
  const normalized = extractFromWebhook(payload)
  if (!normalized) {
    return {
      shouldDispatchAi: false,
      normalized: null,
      enrichedContent: '',
      mediaProcessed: false,
      bufferConcatenated: false,
      reason: 'INVALID_WEBHOOK',
      processingSteps,
    }
  }

  // 2. OUT → não processar.
  if (normalized.direction === 'OUT') {
    return {
      shouldDispatchAi: false,
      normalized,
      enrichedContent: '',
      mediaProcessed: false,
      bufferConcatenated: false,
      reason: 'OUTBOUND_MESSAGE',
      processingSteps,
    }
  }

  // 3. Normalização de texto.
  let enrichedContent = normalized.content ?? ''
  processingSteps.push('normalize')

  if (enrichedContent && isBinaryGarbage(enrichedContent)) {
    enrichedContent = BINARY_GARBAGE_SENTINEL
  } else if (enrichedContent) {
    enrichedContent = cleanMessage(enrichedContent)
  }

  let detectedLanguage: string | undefined
  let mediaProcessed = false

  // 4. STT para áudio E vídeo. Deepgram (BYOK por org) é o STT principal; Whisper
  // (openaiApiKey) é o fallback. Para vídeo, o STT transcreve a faixa de áudio
  // (padrão Orayon — sem ffmpeg/frames; análise visual de frame fica p/ fase 2).
  // Áudio é gated por whisperEnabled; vídeo por videoUnderstandingEnabled.
  const wantsAudioTranscription = normalized.type === 'audio' && whisperEnabled
  const wantsVideoTranscription =
    normalized.type === 'video' && videoUnderstandingEnabled
  if (
    (wantsAudioTranscription || wantsVideoTranscription) &&
    normalized.mediaUrl &&
    normalized.mediaMimetype
  ) {
    // Resolve a chave Deepgram por org (BYOK). Fail-safe: qualquer erro vira
    // undefined e a transcrição segue só com Whisper.
    let deepgramKey: string | undefined
    if (organizationId) {
      try {
        const resolved = await credentialResolver.resolve('AI', 'deepgram', {
          organizationId,
        })
        deepgramKey = resolved?.credentials.apiKey
      } catch (err) {
        console.warn(
          '[inbound-pipeline] resolve deepgram falhou:',
          (err as Error).message,
        )
      }
    }

    // Só transcreve se houver ao menos uma chave (Deepgram OU Whisper).
    if (deepgramKey || openaiApiKey) {
      const sttStep = deepgramKey ? 'deepgram' : 'whisper'
      processingSteps.push(
        wantsVideoTranscription ? `${sttStep}_video` : sttStep,
      )
      try {
        const transcription = await transcribeMedia({
          mediaUrl: normalized.mediaUrl,
          mimetype: normalized.mediaMimetype,
          deepgramKey,
          openaiKey: openaiApiKey,
        })
        if (transcription && transcription.text) {
          enrichedContent = transcription.text
          detectedLanguage = transcription.detectedLanguage
          mediaProcessed = true
        }
      } catch (err) {
        // Fail-safe: mantém enrichedContent anterior.
        console.warn(
          '[inbound-pipeline] transcrição falhou:',
          (err as Error).message,
        )
      }
    }
  }

  // 5. Vision para imagem ou documento.
  if (
    (
      (normalized.type === 'image' && imageVisionEnabled) ||
      (normalized.type === 'document' && documentVisionEnabled)
    ) &&
    openaiApiKey &&
    normalized.mediaUrl &&
    normalized.mediaMimetype
  ) {
    processingSteps.push('vision')
    try {
      const vision = await processImage(
        normalized.mediaUrl,
        normalized.mediaMimetype,
        openaiApiKey,
      )
      if (vision && vision.success && vision.text) {
        enrichedContent = vision.text
        mediaProcessed = true
      }
    } catch (err) {
      console.warn(
        '[inbound-pipeline] vision falhou:',
        (err as Error).message,
      )
    }
  }

  if (normalized.type === 'video' && !videoUnderstandingEnabled) {
    // Vídeo recebido mas transcrição desabilitada na conexão.
    processingSteps.push('video_skipped')
  }

  // 6. Buffer de concatenação.
  let bufferConcatenated = false
  if (bufferEnabled && redis) {
    processingSteps.push('buffer')
    const bufferResult = await processBuffer(
      redis,
      buildSessionId(normalized),
      enrichedContent,
      normalized.messageId,
      bufferTimeoutSeconds,
    )

    if (!bufferResult.shouldProcess) {
      return {
        shouldDispatchAi: false,
        normalized,
        enrichedContent,
        detectedLanguage,
        mediaProcessed,
        bufferConcatenated: false,
        reason: bufferResult.reason ?? 'WAITING',
        processingSteps,
      }
    }

    if (bufferResult.totalMensagens > 1) {
      enrichedContent = bufferResult.mensagemFinal
      bufferConcatenated = true
    } else if (bufferResult.mensagemFinal) {
      enrichedContent = bufferResult.mensagemFinal
    }
  }

  return {
    shouldDispatchAi: true,
    normalized,
    enrichedContent,
    detectedLanguage,
    mediaProcessed,
    bufferConcatenated,
    processingSteps,
  }
}
