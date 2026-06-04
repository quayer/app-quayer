/**
 * Agent Identity Card — objetivo, persona, tom e DISCLOSURE (como o agente se
 * apresenta: assume ser IA, se passa por humano, ou texto personalizado).
 *
 * Guardado em BuilderProject.metadata sob a chave 'identityCard' (sem migration),
 * espelhando o padrão de agent-runtime-settings.ts. Os 4 campos estruturados do
 * AIAgentConfig (personality/agentTarget/agentBehavior/agentAvatar) são
 * derivados via toAgentConfigIdentityFields para tracking/analytics.
 *
 * `compileDisclosureBlock` é PURO e determinístico — o texto de identidade NÃO
 * passa pelo LLM (injetado no system prompt igual ao FORMAT_TAGS).
 */

export type DisclosureMode = 'ai_explicit' | 'human_passthrough' | 'custom'
export type IdentityTone = 'formal' | 'amigavel' | 'direto'

export interface AgentIdentityCard {
  /** Objetivo principal (ex: 'agendamento', 'vendas', 'suporte'). */
  objetivo: string
  /** Nome que o agente usa ao se apresentar (ex: 'Marina'). */
  displayName: string
  /** Persona curta (ex: 'secretária da clínica, acolhedora e objetiva'). */
  persona: string
  tom: IdentityTone
  usaEmojis: boolean
  disclosureMode: DisclosureMode
  /** Texto livre quando disclosureMode === 'custom'. */
  disclosureCustomText?: string
  /** URL de avatar opcional. */
  avatarUrl?: string
}

export const DEFAULT_AGENT_IDENTITY_CARD: AgentIdentityCard = {
  objetivo: '',
  displayName: '',
  persona: '',
  tom: 'amigavel',
  usaEmojis: true,
  // Default seguro: assume ser IA (menor risco LGPD/CDC/WhatsApp ToS).
  disclosureMode: 'ai_explicit',
  disclosureCustomText: '',
  avatarUrl: '',
}

export const IDENTITY_CARD_METADATA_KEY = 'identityCard'

type RecordLike = Record<string, unknown>

function isRecord(value: unknown): value is RecordLike {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asTone(value: unknown): IdentityTone {
  return value === 'formal' || value === 'amigavel' || value === 'direto'
    ? value
    : DEFAULT_AGENT_IDENTITY_CARD.tom
}

function asDisclosure(value: unknown): DisclosureMode {
  return value === 'ai_explicit' ||
    value === 'human_passthrough' ||
    value === 'custom'
    ? value
    : DEFAULT_AGENT_IDENTITY_CARD.disclosureMode
}

export function normalizeIdentityCard(raw: unknown): AgentIdentityCard {
  const s = isRecord(raw) ? raw : {}
  const d = DEFAULT_AGENT_IDENTITY_CARD
  return {
    objetivo: asString(s.objetivo, d.objetivo).slice(0, 200),
    displayName: asString(s.displayName, d.displayName).slice(0, 80),
    persona: asString(s.persona, d.persona).slice(0, 400),
    tom: asTone(s.tom),
    usaEmojis: asBoolean(s.usaEmojis, d.usaEmojis),
    disclosureMode: asDisclosure(s.disclosureMode),
    disclosureCustomText: asString(s.disclosureCustomText, d.disclosureCustomText ?? '').slice(0, 600),
    avatarUrl: asString(s.avatarUrl, d.avatarUrl ?? '').slice(0, 500),
  }
}

export function getIdentityCardFromMetadata(metadata: unknown): AgentIdentityCard {
  if (!isRecord(metadata)) return { ...DEFAULT_AGENT_IDENTITY_CARD }
  return normalizeIdentityCard(metadata[IDENTITY_CARD_METADATA_KEY])
}

export function mergeIdentityCardIntoMetadata(
  metadata: unknown,
  card: AgentIdentityCard,
): RecordLike {
  const base = isRecord(metadata) ? { ...metadata } : {}
  base[IDENTITY_CARD_METADATA_KEY] = card
  return base
}

/**
 * Bloco de identidade/disclosure injetado no system prompt — PURO e fixo por
 * modo (não passa pelo LLM). É o que garante o comportamento de apresentação.
 */
export function compileDisclosureBlock(
  mode: DisclosureMode,
  customText: string | undefined,
  agentName: string,
): string {
  const name = agentName.trim() || 'o assistente'
  switch (mode) {
    case 'human_passthrough':
      return [
        '# Identidade',
        `Apresente-se naturalmente como ${name}. Use linguagem humana e próxima.`,
        'NUNCA minta negando ativamente ser uma IA se o cliente perguntar diretamente — nesse caso, acione transfer_to_human em vez de afirmar que é humano.',
      ].join('\n')
    case 'custom':
      return ['# Identidade', (customText ?? '').trim() || `Você é ${name}.'`].join('\n')
    case 'ai_explicit':
    default:
      return [
        '# Identidade',
        `Você é ${name}, um assistente virtual. Se perguntarem, assuma com naturalidade que é uma IA a serviço do negócio.`,
      ].join('\n')
  }
}

/**
 * Injeta (de forma idempotente) o bloco '# Identidade' no system prompt do
 * agente: remove qualquer bloco anterior e anexa o compilado do card. Assim o
 * disclosure escolhido no card REALMENTE altera o comportamento do agente.
 */
export function injectDisclosureIntoPrompt(
  systemPrompt: string,
  card: AgentIdentityCard,
): string {
  const block = compileDisclosureBlock(
    card.disclosureMode,
    card.disclosureCustomText,
    card.displayName,
  )
  // Remove um bloco '# Identidade' existente (até o próximo heading '#' ou fim).
  const stripped = (systemPrompt || '')
    .replace(/\n*#\s*Identidade[\s\S]*?(?=\n#\s|\s*$)/i, '')
    .trimEnd()
  return stripped ? `${stripped}\n\n${block}` : block
}

/** Resumo curto de personalidade (persona + tom) para a coluna AIAgentConfig.personality. */
function personalitySummary(card: AgentIdentityCard): string {
  const tomLabel =
    card.tom === 'formal' ? 'formal' : card.tom === 'direto' ? 'direto e objetivo' : 'amigável'
  const base = card.persona.trim() || card.displayName.trim() || 'Assistente'
  return `${base} — tom ${tomLabel}${card.usaEmojis ? ', usa emojis com moderação' : ', sem emojis'}`.slice(0, 280)
}

export interface AgentConfigIdentityFields {
  personality: string
  agentTarget: string
  agentBehavior: string
  agentAvatar: string | null
}

/** Mapeia o card para os 4 campos estruturados (antes mortos) do AIAgentConfig. */
export function toAgentConfigIdentityFields(card: AgentIdentityCard): AgentConfigIdentityFields {
  return {
    personality: personalitySummary(card),
    agentTarget: card.objetivo.trim(),
    agentBehavior: card.disclosureMode,
    agentAvatar: card.avatarUrl?.trim() ? card.avatarUrl.trim() : null,
  }
}
