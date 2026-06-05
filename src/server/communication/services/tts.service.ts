/**
 * QH-09: synthesizeTtsToMediaUrl delegates audio synthesis to the low-level
 * `synthesizeSpeech` primitive (ai-agents/outbound/tts.service.ts), which
 * supports both ElevenLabs and Deepgram. The storage upload + signed-URL step
 * lives here so outbound.service.ts only ever receives a URL (not raw bytes).
 */
import { createHash } from 'node:crypto'
import { BUCKETS, storage } from '@/server/services/storage'
import { credentialResolver } from '@/lib/providers/credential-resolver.service'
import { type AgentRuntimeSettings } from '@/lib/agent-runtime-settings'
import {
  synthesizeSpeech,
} from '@/server/ai-module/ai-agents/outbound/tts.service'

export interface TtsToMediaUrlInput {
  organizationId: string
  text: string
  settings: AgentRuntimeSettings['tts']
}

function buildAudioPath(organizationId: string, text: string): string {
  const hash = createHash('sha256')
    .update(`${organizationId}:${text}:${Date.now()}`)
    .digest('hex')
    .slice(0, 18)
  return `tts/${organizationId}/${hash}.mp3`
}

export async function synthesizeTtsToMediaUrl(
  input: TtsToMediaUrlInput,
): Promise<string | null> {
  if (!input.settings.enabled || !input.text.trim()) {
    return null
  }

  const provider = input.settings.provider
  if (provider !== 'elevenlabs' && provider !== 'deepgram') {
    return null
  }

  if (!storage.isAvailable()) {
    console.warn('[tts] Supabase storage unavailable; falling back to text')
    return null
  }

  // BYOK: resolve via credentialResolver (same pattern as STT inbound)
  const credentials = await credentialResolver.resolve('apiKey', provider, {
    organizationId: input.organizationId,
  })
  const apiKey = credentials?.credentials.apiKey
  if (!apiKey) {
    console.warn(`[tts] ${provider} key unavailable; falling back to text`)
    return null
  }

  const result = await synthesizeSpeech({
    text: input.text,
    provider,
    apiKey,
    voiceId: input.settings.voiceId,
    model: input.settings.model,
  })

  if ('skipped' in result) {
    console.warn(`[tts] synthesis skipped (${result.reason}); falling back to text`)
    return null
  }

  const path = buildAudioPath(input.organizationId, input.text)
  await storage.upload(BUCKETS.MEDIA, path, result.audio, {
    contentType: result.mimeType,
    upsert: true,
  })

  return storage.getSignedUrl(BUCKETS.MEDIA, path)
}
