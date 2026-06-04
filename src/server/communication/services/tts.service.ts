import { createHash } from 'node:crypto'
import { BUCKETS, storage } from '@/server/services/storage'
import { credentialResolver } from '@/lib/providers/credential-resolver.service'
import {
  DEFAULT_ELEVENLABS_MODEL,
  DEFAULT_ELEVENLABS_VOICE_ID,
  type AgentRuntimeSettings,
} from '@/lib/agent-runtime-settings'

export interface TtsToMediaUrlInput {
  organizationId: string
  text: string
  settings: AgentRuntimeSettings['tts']
}

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1'

function buildAudioPath(organizationId: string, text: string): string {
  const hash = createHash('sha256')
    .update(`${organizationId}:${text}:${Date.now()}`)
    .digest('hex')
    .slice(0, 18)
  return `tts/${organizationId}/${hash}.mp3`
}

async function synthesizeElevenLabsAudio(input: {
  apiKey: string
  text: string
  voiceId?: string
  model?: string
}): Promise<Buffer> {
  const voiceId = input.voiceId || DEFAULT_ELEVENLABS_VOICE_ID
  const modelId = input.model || DEFAULT_ELEVENLABS_MODEL
  const response = await fetch(
    `${ELEVENLABS_BASE_URL}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        Accept: 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': input.apiKey,
      },
      body: JSON.stringify({
        text: input.text,
        model_id: modelId,
      }),
    },
  )

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`ElevenLabs TTS failed: HTTP ${response.status}${body ? ` - ${body}` : ''}`)
  }

  return Buffer.from(await response.arrayBuffer())
}

export async function synthesizeTtsToMediaUrl(
  input: TtsToMediaUrlInput,
): Promise<string | null> {
  if (!input.settings.enabled || !input.text.trim()) {
    return null
  }

  if (input.settings.provider !== 'elevenlabs') {
    return null
  }

  if (!storage.isAvailable()) {
    console.warn('[tts] Supabase storage unavailable; falling back to text')
    return null
  }

  const credentials = await credentialResolver.resolve('apiKey', 'elevenlabs', {
    organizationId: input.organizationId,
  })
  const apiKey = credentials?.credentials.apiKey ?? process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    console.warn('[tts] ElevenLabs key unavailable; falling back to text')
    return null
  }

  const audio = await synthesizeElevenLabsAudio({
    apiKey,
    text: input.text,
    voiceId: input.settings.voiceId,
    model: input.settings.model,
  })

  const path = buildAudioPath(input.organizationId, input.text)
  await storage.upload(BUCKETS.MEDIA, path, audio, {
    contentType: 'audio/mpeg',
    upsert: true,
  })

  return storage.getSignedUrl(BUCKETS.MEDIA, path)
}
