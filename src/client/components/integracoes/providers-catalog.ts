/**
 * Catálogo fixo dos provedores de IA suportados via BYOK (LiteLLM).
 *
 * O usuário escolhe um MODELO (ex.: GPT-4o, Claude 3.5 Sonnet, Gemini) e a
 * chave de API é por PROVIDER. Cada provider pode ter MÚLTIPLAS chaves rotuladas
 * (multi-key) — o agente seleciona qual chave usar.
 *
 * openai / anthropic / google → LLM (texto).  elevenlabs → voz (separado).
 * deepgram → STT (transcrição de áudio; Whisper/OpenAI é o fallback).
 * A ordem aqui define a ordem visual na página.
 */
export type ProviderKey = 'openai' | 'anthropic' | 'google' | 'elevenlabs' | 'deepgram'

/** Categoria do provider — usada para agrupar/rotular na UI. */
export type ProviderCategory = 'llm' | 'voice' | 'transcription'

export interface ProviderModel {
  /** ID LiteLLM do modelo (ex.: 'gpt-4o', 'claude-3-5-sonnet'). */
  id: string
  /** Rótulo amigável exibido na UI. */
  label: string
}

export interface ProviderMeta {
  key: ProviderKey
  name: string
  description: string
  category: ProviderCategory
  /** Inicial usada como ícone monograma. */
  letter: string
  /** Placeholder do campo de chave, com pista do formato. */
  keyPlaceholder: string
  /** Modelos disponíveis via LiteLLM (vazio para provedores de voz). */
  models: readonly ProviderModel[]
}

export const PROVIDERS: readonly ProviderMeta[] = [
  {
    key: 'openai',
    name: 'OpenAI',
    description: 'Modelos GPT via LiteLLM',
    category: 'llm',
    letter: 'O',
    keyPlaceholder: 'sk-...',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    ],
  },
  {
    key: 'anthropic',
    name: 'Anthropic',
    description: 'Modelos Claude via LiteLLM',
    category: 'llm',
    letter: 'A',
    keyPlaceholder: 'sk-ant-...',
    models: [
      { id: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku', label: 'Claude 3.5 Haiku' },
      { id: 'claude-3-opus', label: 'Claude 3 Opus' },
    ],
  },
  {
    key: 'google',
    name: 'Google (Gemini)',
    description: 'Modelos Gemini via LiteLLM',
    category: 'llm',
    letter: 'G',
    keyPlaceholder: 'AIza...',
    models: [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    ],
  },
  {
    key: 'elevenlabs',
    name: 'ElevenLabs',
    description: 'Voz do agente para respostas em áudio no callback',
    category: 'voice',
    letter: 'E',
    keyPlaceholder: 'xi-...',
    models: [],
  },
  {
    key: 'deepgram',
    name: 'Deepgram',
    description:
      'STT — transcrição de áudio recebido (principal). Whisper/OpenAI é o fallback.',
    category: 'transcription',
    letter: 'D',
    keyPlaceholder: 'Token ...',
    models: [],
  },
] as const

/**
 * Uma chave BYOK rotulada (multi-key). Espelha o shape retornado por
 * GET /api/v1/providers/:provider/keys.
 */
export interface ProviderKeyRecord {
  id: string
  name: string
  provider: ProviderKey
  lastFour: string | null
  isPrimary: boolean
  priority: number
  updatedAt: string | null
}

/** Agrupamento de chaves por provider para renderizar a UI. */
export interface ProviderGroup {
  provider: ProviderKey
  keys: ProviderKeyRecord[]
}

export function emptyGroups(): ProviderGroup[] {
  return PROVIDERS.map((p) => ({ provider: p.key, keys: [] }))
}

/**
 * @deprecated Surface single-key legada — mantida apenas p/ consumidores fora
 * da ownership desta refatoração (ex.: credentials-tab no preview). Derivada de
 * ProviderGroup. Remover quando o preview migrar para multi-key.
 */
export interface ProviderRecord {
  provider: ProviderKey
  isConfigured: boolean
  lastFour: string | null
  updatedAt: string | null
}

/** @deprecated ver ProviderRecord. */
export function emptyRecords(): ProviderRecord[] {
  return PROVIDERS.map((p) => ({
    provider: p.key,
    isConfigured: false,
    lastFour: null,
    updatedAt: null,
  }))
}

/** Achata um ProviderGroup na surface legada (chave primária como "a chave"). */
export function groupToRecord(group: ProviderGroup): ProviderRecord {
  const primary =
    group.keys.find((k) => k.isPrimary) ?? group.keys[0] ?? null
  return {
    provider: group.provider,
    isConfigured: group.keys.length > 0,
    lastFour: primary?.lastFour ?? null,
    updatedAt: primary?.updatedAt ?? null,
  }
}
