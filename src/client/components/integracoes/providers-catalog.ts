/**
 * Catálogo fixo dos provedores de IA suportados via BYOK.
 * A ordem aqui define a ordem visual na página.
 */
export type ProviderKey = 'openai' | 'anthropic' | 'google'

export interface ProviderMeta {
  key: ProviderKey
  name: string
  description: string
  /** Inicial usada como ícone monograma. */
  letter: string
  /** Placeholder do campo de chave, com pista do formato. */
  keyPlaceholder: string
}

export const PROVIDERS: readonly ProviderMeta[] = [
  {
    key: 'openai',
    name: 'OpenAI',
    description: 'GPT-4, GPT-4o, Whisper',
    letter: 'O',
    keyPlaceholder: 'sk-...',
  },
  {
    key: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 3.5 Sonnet, Opus',
    letter: 'A',
    keyPlaceholder: 'sk-ant-...',
  },
  {
    key: 'google',
    name: 'Google (Gemini)',
    description: 'Gemini 1.5, 2.0',
    letter: 'G',
    keyPlaceholder: 'AIza...',
  },
] as const

export interface ProviderRecord {
  provider: ProviderKey
  isConfigured: boolean
  lastFour: string | null
  updatedAt: string | null
}

export function emptyRecords(): ProviderRecord[] {
  return PROVIDERS.map((p) => ({
    provider: p.key,
    isConfigured: false,
    lastFour: null,
    updatedAt: null,
  }))
}
