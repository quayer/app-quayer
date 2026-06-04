export const DEFAULT_ELEVENLABS_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'
export const DEFAULT_ELEVENLABS_MODEL = 'eleven_flash_v2_5'

export interface AgentRuntimeSettings {
  typingIndicatorEnabled: boolean
  languageDetectionEnabled: boolean
  messageBuffer: {
    enabled: boolean
    timeoutMs: number
    maxMessages: number
  }
  media: {
    audioTranscriptionEnabled: boolean
    imageUnderstandingEnabled: boolean
    documentUnderstandingEnabled: boolean
    videoUnderstandingEnabled: boolean
  }
  tts: {
    enabled: boolean
    provider: 'elevenlabs'
    voiceId: string
    model: string
    speechRate: number
  }
}

export const DEFAULT_AGENT_RUNTIME_SETTINGS: AgentRuntimeSettings = {
  typingIndicatorEnabled: true,
  languageDetectionEnabled: false,
  messageBuffer: {
    enabled: true,
    timeoutMs: 8000,
    maxMessages: 10,
  },
  media: {
    audioTranscriptionEnabled: true,
    imageUnderstandingEnabled: true,
    documentUnderstandingEnabled: true,
    videoUnderstandingEnabled: true,
  },
  tts: {
    enabled: false,
    provider: 'elevenlabs',
    voiceId: DEFAULT_ELEVENLABS_VOICE_ID,
    model: DEFAULT_ELEVENLABS_MODEL,
    speechRate: 1,
  },
}

export const AGENT_RUNTIME_SETTINGS_METADATA_KEY = 'agentRuntimeSettings'

type RecordLike = Record<string, unknown>

export interface AgentTtsFields {
  enableTTS?: boolean | null
  ttsProvider?: string | null
  ttsVoiceId?: string | null
  ttsModel?: string | null
  ttsSpeechRate?: number | null
}

function isRecord(value: unknown): value is RecordLike {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

export function getAgentRuntimeSettingsFromMetadata(metadata: unknown): unknown {
  if (!isRecord(metadata)) return null
  return metadata[AGENT_RUNTIME_SETTINGS_METADATA_KEY] ?? null
}

export function normalizeAgentRuntimeSettings(
  raw: unknown,
  agentTts?: AgentTtsFields | null,
): AgentRuntimeSettings {
  const source = isRecord(raw) ? raw : {}
  const messageBuffer = isRecord(source.messageBuffer) ? source.messageBuffer : {}
  const media = isRecord(source.media) ? source.media : {}
  const tts = isRecord(source.tts) ? source.tts : {}
  const defaults = DEFAULT_AGENT_RUNTIME_SETTINGS

  const normalized: AgentRuntimeSettings = {
    typingIndicatorEnabled: asBoolean(
      source.typingIndicatorEnabled,
      defaults.typingIndicatorEnabled,
    ),
    languageDetectionEnabled: asBoolean(
      source.languageDetectionEnabled,
      defaults.languageDetectionEnabled,
    ),
    messageBuffer: {
      enabled: asBoolean(messageBuffer.enabled, defaults.messageBuffer.enabled),
      timeoutMs: asNumber(
        messageBuffer.timeoutMs,
        defaults.messageBuffer.timeoutMs,
        1000,
        30000,
      ),
      maxMessages: asNumber(
        messageBuffer.maxMessages,
        defaults.messageBuffer.maxMessages,
        2,
        20,
      ),
    },
    media: {
      audioTranscriptionEnabled: asBoolean(
        media.audioTranscriptionEnabled,
        defaults.media.audioTranscriptionEnabled,
      ),
      imageUnderstandingEnabled: asBoolean(
        media.imageUnderstandingEnabled,
        defaults.media.imageUnderstandingEnabled,
      ),
      documentUnderstandingEnabled: asBoolean(
        media.documentUnderstandingEnabled,
        defaults.media.documentUnderstandingEnabled,
      ),
      videoUnderstandingEnabled: asBoolean(
        media.videoUnderstandingEnabled,
        defaults.media.videoUnderstandingEnabled,
      ),
    },
    tts: {
      enabled: asBoolean(tts.enabled, defaults.tts.enabled),
      provider: 'elevenlabs',
      voiceId: asString(tts.voiceId, defaults.tts.voiceId),
      model: asString(tts.model, defaults.tts.model),
      speechRate: asNumber(tts.speechRate, defaults.tts.speechRate, 0.7, 1.3),
    },
  }

  if (agentTts) {
    normalized.tts.enabled =
      typeof agentTts.enableTTS === 'boolean'
        ? agentTts.enableTTS
        : normalized.tts.enabled
    normalized.tts.voiceId = asString(agentTts.ttsVoiceId, normalized.tts.voiceId)
    normalized.tts.model = asString(agentTts.ttsModel, normalized.tts.model)
    normalized.tts.speechRate = asNumber(
      agentTts.ttsSpeechRate,
      normalized.tts.speechRate,
      0.7,
      1.3,
    )
  }

  return normalized
}

export function mergeAgentRuntimeSettingsIntoMetadata(
  metadata: unknown,
  settings: AgentRuntimeSettings,
): RecordLike {
  const base = isRecord(metadata) ? { ...metadata } : {}
  base[AGENT_RUNTIME_SETTINGS_METADATA_KEY] = settings
  return base
}
