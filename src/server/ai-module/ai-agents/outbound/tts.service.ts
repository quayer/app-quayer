/**
 * TTS Service — baixo nível, fail-soft, BYOK.
 *
 * Responsabilidade única: dada uma chave de API já resolvida pelo caller,
 * chamar o provider TTS e retornar os bytes de áudio.
 *
 * Padrão BYOK: idêntico ao STT inbound (transcription.service.ts) — o caller
 * resolve a chave via credentialResolver ANTES de chamar esta função e a passa
 * explicitamente. Nenhuma leitura de process.env aqui.
 *
 * Fail-soft: qualquer falha (HTTP, rede, credencial ausente) retorna
 * `{ skipped: true, reason }`. Nunca lança. O caller mantém texto como fallback.
 *
 * Providers suportados:
 *   - elevenlabs  → POST /text-to-speech/:voiceId   (mp3_44100_128)
 *   - deepgram    → POST /v1/speak?model=aura-2      (mp3)
 */

import type { AgentTtsFields } from '@/lib/agent-runtime-settings'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type TtsProvider = 'elevenlabs' | 'deepgram'

export interface SynthesizeSpeechInput {
  text: string
  provider?: TtsProvider
  apiKey: string
  voiceId?: string
  /** Model ID. ElevenLabs: e.g. "eleven_flash_v2_5". Deepgram: ignored (aura-2). */
  model?: string
}

export type SynthesizeSpeechResult =
  | { audio: Buffer; mimeType: string }
  | { skipped: true; reason: string }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1'
const DEFAULT_ELEVENLABS_VOICE = 'JBFqnCBsd6RMkjVDRZzb'
const DEFAULT_ELEVENLABS_MODEL = 'eleven_flash_v2_5'

const DEEPGRAM_TTS_BASE = 'https://api.deepgram.com/v1'
const DEFAULT_DEEPGRAM_VOICE = 'aura-2-theia-en'

const TIMEOUT_MS = 10_000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function skipped(reason: string): { skipped: true; reason: string } {
  return { skipped: true, reason }
}

function withTimeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms)
}

// ---------------------------------------------------------------------------
// ElevenLabs
// ---------------------------------------------------------------------------

async function synthesizeElevenLabs(input: {
  apiKey: string
  text: string
  voiceId?: string
  model?: string
}): Promise<SynthesizeSpeechResult> {
  const voiceId = input.voiceId ?? DEFAULT_ELEVENLABS_VOICE
  const modelId = input.model ?? DEFAULT_ELEVENLABS_MODEL
  const url = `${ELEVENLABS_BASE}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': input.apiKey,
    },
    body: JSON.stringify({ text: input.text, model_id: modelId }),
    signal: withTimeout(TIMEOUT_MS),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return skipped(`ElevenLabs HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ''}`)
  }

  const audio = Buffer.from(await res.arrayBuffer())
  return { audio, mimeType: 'audio/mpeg' }
}

// ---------------------------------------------------------------------------
// Deepgram TTS
// ---------------------------------------------------------------------------

async function synthesizeDeepgram(input: {
  apiKey: string
  text: string
  voiceId?: string
}): Promise<SynthesizeSpeechResult> {
  const model = input.voiceId ?? DEFAULT_DEEPGRAM_VOICE
  const url = `${DEEPGRAM_TTS_BASE}/speak?model=${encodeURIComponent(model)}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${input.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({ text: input.text }),
    signal: withTimeout(TIMEOUT_MS),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return skipped(`Deepgram TTS HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ''}`)
  }

  const audio = Buffer.from(await res.arrayBuffer())
  return { audio, mimeType: 'audio/mpeg' }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sintetiza fala a partir de texto usando o provider especificado.
 *
 * BYOK: a apiKey deve ser resolvida pelo caller via credentialResolver antes
 * de chamar esta função — igual ao padrão STT (transcription.service.ts).
 *
 * Fail-soft: retorna `{ skipped: true, reason }` em qualquer falha.
 * O caller deve enviar o texto como fallback quando `skipped` for true.
 */
export async function synthesizeSpeech(
  input: SynthesizeSpeechInput,
): Promise<SynthesizeSpeechResult> {
  const { text, provider = 'elevenlabs', apiKey, voiceId, model } = input

  if (!apiKey) {
    return skipped('apiKey ausente — configure a chave do provider TTS na organização')
  }

  if (!text.trim()) {
    return skipped('texto vazio')
  }

  try {
    if (provider === 'deepgram') {
      return await synthesizeDeepgram({ apiKey, text, voiceId })
    }
    // Default: elevenlabs
    return await synthesizeElevenLabs({ apiKey, text, voiceId, model })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return skipped(`TTS ${provider} erro inesperado: ${msg}`)
  }
}

/**
 * Verifica se TTS está habilitado para o agente, a partir dos campos do
 * AIAgentConfig (AgentTtsFields). Retorna false quando enableTTS for falsy
 * ou provider não for reconhecido.
 *
 * AgentTtsFields já é o shape que o Prisma expõe (enableTTS, ttsProvider, …).
 */
export function isTtsEnabled(agentConfig: AgentTtsFields | null | undefined): boolean {
  if (!agentConfig) return false
  if (!agentConfig.enableTTS) return false
  const provider = agentConfig.ttsProvider
  return provider === 'elevenlabs' || provider === 'deepgram'
}
