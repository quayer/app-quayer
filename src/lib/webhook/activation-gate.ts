/**
 * Activation gate (Orayon).
 *
 * Decides whether an INBOUND message should dispatch the AI runtime, based on
 * the owning agent's `activationMode`. This runs AFTER the legacy
 * `aiEnabled`/`aiBlockedUntil` gate and AFTER the Message is persisted — so a
 * blocked message is still stored, only the AI dispatch is skipped.
 *
 * Modes (mirror `AIAgentConfig.activationMode`):
 *   - 'all'                  → always dispatch (legacy/default behavior).
 *   - 'all_except_blacklist' → dispatch unless the session is tagged 'blacklist'.
 *   - 'keyword_trigger'      → dispatch only if the text contains one of the
 *                              `activationKeywords` (case-insensitive substring).
 *   - 'whitelist_only'       → dispatch only if the session is tagged 'whitelist'.
 *
 * Pure & dependency-free so it stays unit-testable and cheap to call per message.
 */

export type ActivationMode =
  | 'all'
  | 'all_except_blacklist'
  | 'keyword_trigger'
  | 'whitelist_only'

/** Tag conventions for blacklist/whitelist on ChatSession.tags. */
export const BLACKLIST_TAG = 'blacklist'
export const WHITELIST_TAG = 'whitelist'

export interface ActivationAgentConfig {
  /** Defaults to 'all' when null/undefined/unknown (backward-compat). */
  activationMode?: string | null
  /** Keywords for 'keyword_trigger'. Empty = never triggers in that mode. */
  activationKeywords?: string[] | null
}

export interface ActivationSession {
  /** ChatSession.tags — blacklist/whitelist live here. */
  tags?: string[] | null
}

export interface ActivationDecision {
  /** Whether the AI runtime should be dispatched for this message. */
  allowed: boolean
  /** Normalized mode actually applied (after defaulting). */
  mode: ActivationMode
  /** Machine-readable reason, present when blocked. */
  reason?:
    | 'BLACKLISTED'
    | 'NO_KEYWORD_MATCH'
    | 'NOT_WHITELISTED'
    | 'NO_KEYWORDS_CONFIGURED'
}

const KNOWN_MODES: ReadonlySet<string> = new Set<ActivationMode>([
  'all',
  'all_except_blacklist',
  'keyword_trigger',
  'whitelist_only',
])

/** Normalize an arbitrary stored value to a known ActivationMode. */
export function normalizeActivationMode(raw: string | null | undefined): ActivationMode {
  const v = (raw ?? '').trim().toLowerCase()
  return (KNOWN_MODES.has(v) ? v : 'all') as ActivationMode
}

function hasTag(tags: string[] | null | undefined, tag: string): boolean {
  if (!Array.isArray(tags)) return false
  const target = tag.toLowerCase()
  return tags.some((t) => typeof t === 'string' && t.trim().toLowerCase() === target)
}

function matchesAnyKeyword(text: string, keywords: string[] | null | undefined): boolean {
  if (!Array.isArray(keywords) || keywords.length === 0) return false
  const haystack = text.toLowerCase()
  return keywords.some((kw) => {
    if (typeof kw !== 'string') return false
    const needle = kw.trim().toLowerCase()
    return needle.length > 0 && haystack.includes(needle)
  })
}

/**
 * Evaluate whether the AI should run for an inbound message.
 *
 * @param agent   Activation config of the resolved agent (mode + keywords).
 * @param session Session whose `tags` carry blacklist/whitelist membership.
 * @param text    The enriched message content (post-pipeline).
 */
export function evaluateActivationGate(
  agent: ActivationAgentConfig | null | undefined,
  session: ActivationSession | null | undefined,
  text: string,
): ActivationDecision {
  const mode = normalizeActivationMode(agent?.activationMode)
  const tags = session?.tags ?? []
  const content = typeof text === 'string' ? text : ''

  switch (mode) {
    case 'all_except_blacklist':
      if (hasTag(tags, BLACKLIST_TAG)) {
        return { allowed: false, mode, reason: 'BLACKLISTED' }
      }
      return { allowed: true, mode }

    case 'keyword_trigger': {
      const keywords = agent?.activationKeywords ?? []
      if (!Array.isArray(keywords) || keywords.length === 0) {
        return { allowed: false, mode, reason: 'NO_KEYWORDS_CONFIGURED' }
      }
      if (matchesAnyKeyword(content, keywords)) {
        return { allowed: true, mode }
      }
      return { allowed: false, mode, reason: 'NO_KEYWORD_MATCH' }
    }

    case 'whitelist_only':
      if (hasTag(tags, WHITELIST_TAG)) {
        return { allowed: true, mode }
      }
      return { allowed: false, mode, reason: 'NOT_WHITELISTED' }

    case 'all':
    default:
      return { allowed: true, mode }
  }
}
