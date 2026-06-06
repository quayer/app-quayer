/**
 * Transcription Service — STT de áudio/vídeo com provider abstrato.
 *
 * Recebe um audio OU vídeo (mediaUrl + mimetype) vindo do WhatsApp, baixa, envia
 * para o STT e retorna o texto transcrito + idioma detectado. Para vídeo, o STT
 * transcreve a faixa de áudio (padrão Orayon — sem ffmpeg/frames).
 *
 * Estratégia (BYOK, fail-safe):
 *   1. Deepgram (principal) — se `deepgramKey` presente.
 *   2. Whisper OpenAI (fallback) — se Deepgram falhar OU sem `deepgramKey`.
 *   3. Ambos falham / sem chaves → `null` (caller decide o fallback).
 *
 * `transcribeAudio` (Whisper) é mantida para compat com chamadores existentes.
 */

import { computeSttCostUsd } from '@/server/ai-module/ai-agents/services/ext-service-cost.service'

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions'
const DEEPGRAM_API_URL =
  'https://api.deepgram.com/v1/listen?model=nova-3&detect_language=true&smart_format=true'

/** ISO-639-1 (upper) do produto → código aceito pelo Whisper (lower). Fora do mapa = auto-detect. */
export const WHISPER_LANGUAGE_MAP: Record<string, string> = {
  PT: 'pt',
  EN: 'en',
  ES: 'es',
  FR: 'fr',
  DE: 'de',
  IT: 'it',
  JA: 'ja',
  ZH: 'zh',
  RU: 'ru',
  AR: 'ar',
}

export type TranscriptionProvider = 'deepgram' | 'whisper'

export interface TranscriptionResult {
  text: string
  detectedLanguage?: string
  /** Provider que efetivamente produziu o texto. Ausente em chamadas legadas. */
  provider?: TranscriptionProvider
  /** Duração do áudio em segundos (sinal de uso p/ custo). Ausente se o provider não reportar. */
  durationSeconds?: number
  /** Custo estimado do STT em USD (computado de durationSeconds × tarifa do provider). */
  costUsd?: number
}

export interface TranscribeMediaInput {
  mediaUrl: string
  mimetype: string
  /** Chave Deepgram (principal). Quando ausente, vai direto pro Whisper. */
  deepgramKey?: string
  /** Chave OpenAI (fallback Whisper). */
  openaiKey?: string
  preferredLanguage?: string
}

/** Extensão a partir do mimetype (Whisper precisa de filename). Default: ogg (áudio WhatsApp). */
function pickExtension(mimetype: string): string {
  // Vídeo primeiro (video/mpeg não deve virar 'mp3').
  if (mimetype.startsWith('video/')) {
    return mimetype.includes('webm') ? 'webm' : 'mp4'
  }
  if (mimetype.includes('mp3') || mimetype.includes('mpeg')) return 'mp3'
  if (mimetype.includes('wav')) return 'wav'
  if (mimetype.includes('m4a')) return 'm4a'
  if (mimetype.includes('webm')) return 'webm'
  return 'ogg'
}

/** Aceita áudio E vídeo (STT extrai a faixa de áudio do vídeo). */
function isTranscribableMime(mimetype: string): boolean {
  return Boolean(
    mimetype &&
      (mimetype.startsWith('audio/') || mimetype.startsWith('video/')),
  )
}

/**
 * Transcreve via Deepgram (nova-3, detect_language, smart_format). O corpo da
 * requisição são os bytes brutos do áudio com o Content-Type do mimetype.
 * Retorna `null` em qualquer falha (caller faz fallback p/ Whisper).
 */
async function transcribeWithDeepgram(
  mediaUrl: string,
  mimetype: string,
  deepgramKey: string,
): Promise<TranscriptionResult | null> {
  try {
    const mediaResponse = await fetch(mediaUrl)
    if (!mediaResponse.ok) {
      console.warn(`[transcription] deepgram download falhou: ${mediaResponse.status}`)
      return null
    }
    const audioBytes = await mediaResponse.arrayBuffer()

    const dgResponse = await fetch(DEEPGRAM_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Token ${deepgramKey}`,
        'Content-Type': mimetype,
      },
      body: audioBytes,
    })

    if (!dgResponse.ok) {
      console.warn(`[transcription] deepgram API falhou: ${dgResponse.status}`)
      return null
    }

    const result = (await dgResponse.json()) as {
      metadata?: { duration?: number }
      results?: {
        channels?: Array<{
          detected_language?: string
          alternatives?: Array<{ transcript?: string }>
        }>
      }
    }

    const channel = result.results?.channels?.[0]
    const text = (channel?.alternatives?.[0]?.transcript ?? '').trim()
    if (!text) return null

    const detectedLanguage = channel?.detected_language
      ? channel.detected_language.toUpperCase()
      : undefined

    return {
      text,
      detectedLanguage,
      provider: 'deepgram',
      durationSeconds: result.metadata?.duration,
    }
  } catch (error) {
    console.warn('[transcription] deepgram erro inesperado:', error)
    return null
  }
}

/**
 * Transcreve via Whisper. `null` em qualquer falha. detectedLanguage em uppercase.
 */
export async function transcribeAudio(
  mediaUrl: string,
  mimetype: string,
  openaiApiKey: string,
  preferredLanguage?: string,
): Promise<TranscriptionResult | null> {
  if (!mediaUrl || !openaiApiKey) {
    return null
  }

  if (!isTranscribableMime(mimetype)) {
    return null
  }

  try {
    // 1. Baixar audio da URL fornecida (CDN do WhatsApp tipicamente).
    const audioResponse = await fetch(mediaUrl)
    if (!audioResponse.ok) {
      console.warn(`[transcription] download falhou: ${audioResponse.status}`)
      return null
    }

    const audioBlob = await audioResponse.blob()
    const extension = pickExtension(mimetype)

    // 2. Montar payload multipart para Whisper.
    const formData = new FormData()
    formData.append('file', audioBlob, `audio.${extension}`)
    formData.append('model', 'whisper-1')
    formData.append('response_format', 'verbose_json')

    if (preferredLanguage && WHISPER_LANGUAGE_MAP[preferredLanguage]) {
      formData.append('language', WHISPER_LANGUAGE_MAP[preferredLanguage])
    }

    // 3. Chamar Whisper.
    const whisperResponse = await fetch(WHISPER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: formData,
    })

    if (!whisperResponse.ok) {
      console.warn(`[transcription] Whisper API falhou: ${whisperResponse.status}`)
      return null
    }

    const result = (await whisperResponse.json()) as {
      text?: string
      language?: string
      duration?: number
    }

    const text = (result.text ?? '').trim()
    const detectedLanguage = result.language
      ? result.language.toUpperCase()
      : undefined

    // Shape preservada p/ compat (sem `provider`); transcribeMedia carimba o provider.
    return { text, detectedLanguage, durationSeconds: result.duration }
  } catch (error) {
    console.warn('[transcription] erro inesperado:', error)
    return null
  }
}

/**
 * STT com Deepgram (principal) → fallback Whisper. `null` se ambos falharem / sem chaves.
 */
export async function transcribeMedia(
  input: TranscribeMediaInput,
): Promise<TranscriptionResult | null> {
  const { mediaUrl, mimetype, deepgramKey, openaiKey, preferredLanguage } = input

  if (!mediaUrl || !isTranscribableMime(mimetype)) {
    return null
  }

  // 1. Deepgram (principal).
  if (deepgramKey) {
    const dg = await transcribeWithDeepgram(mediaUrl, mimetype, deepgramKey)
    if (dg && dg.text) return withSttCost(dg, 'deepgram')
  }

  // 2. Whisper (fallback). Carimba o provider na saída (transcribeAudio omite p/ compat).
  if (openaiKey) {
    const whisper = await transcribeAudio(
      mediaUrl,
      mimetype,
      openaiKey,
      preferredLanguage,
    )
    if (whisper && whisper.text) return withSttCost({ ...whisper, provider: 'whisper' }, 'whisper')
  }

  // 3. Ambos falharam / sem chaves.
  return null
}

/**
 * Computa o custo do STT (custo de serviço externo por turno) a partir da duração
 * + provider, loga para observabilidade e anexa `costUsd` ao resultado. Fail-safe:
 * nunca lança — custo é best-effort. A persistência (extServiceCosts) é fase 2.
 */
function withSttCost(
  result: TranscriptionResult,
  provider: TranscriptionProvider,
): TranscriptionResult {
  const costUsd = computeSttCostUsd(provider, result.durationSeconds)
  if (costUsd > 0) {
    console.info(
      `[ext-cost] stt provider=${provider} duration=${result.durationSeconds}s cost=$${costUsd.toFixed(6)}`,
    )
  }
  return { ...result, costUsd }
}
