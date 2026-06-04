/**
 * Credential Resolver — BYOK lookup with in-memory cache.
 *
 * Resolution order:
 *   1. OrganizationProvider row (DB) — decrypted on hit
 *   2. Environment variable fallback
 *   3. null (caller must handle missing credentials)
 *
 * Caches per-(organizationId, provider) for 60 seconds to avoid
 * a DB round-trip on every agent invocation.
 */

import { providersRepository } from '@/server/core/providers/providers.repository'

export interface ResolvedCredentials {
  provider: string
  credentials: {
    apiKey?: string
    model?: string
  }
}

interface ResolveContext {
  organizationId: string
  projectId?: string
}

// ── In-memory cache ───────────────────────────────────────────────────────────

interface CacheEntry {
  value: string | null
  expiresAt: number
}

const CACHE_TTL_MS = 60_000 // 60 seconds

const cache = new Map<string, CacheEntry>()

function cacheKey(organizationId: string, provider: string): string {
  return `${organizationId}:${provider}`
}

function getCached(organizationId: string, provider: string): string | null | undefined {
  const entry = cache.get(cacheKey(organizationId, provider))
  if (!entry) return undefined // miss
  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey(organizationId, provider))
    return undefined // expired
  }
  return entry.value // hit (may be null = "no key in DB")
}

function setCached(organizationId: string, provider: string, value: string | null): void {
  cache.set(cacheKey(organizationId, provider), {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
}

// ── Env fallback map ──────────────────────────────────────────────────────────

const ENV_KEYS: Record<string, string | undefined> = {
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GOOGLE_API_KEY,
  elevenlabs: process.env.ELEVENLABS_API_KEY,
  // Aligned with provider-factory.getModel() supported providers so BYOK
  // doesn't silently fall through for groq/openrouter agents.
  groq: process.env.GROQ_API_KEY,
  openrouter: process.env.OPENROUTER_API_KEY,
}

// ── Resolver ──────────────────────────────────────────────────────────────────

export const credentialResolver = {
  /**
   * Resolve credentials for a given provider, scoped to an org.
   *
   * @param type     - Credential type hint (e.g. "apiKey"). Currently unused
   *                   but preserved for future multi-credential providers.
   * @param provider - Provider slug: "openai" | "anthropic" | "google"
   * @param context  - { organizationId, projectId? }
   */
  async resolve(
    type: string,
    provider: string,
    context: ResolveContext,
  ): Promise<ResolvedCredentials | null> {
    const { organizationId } = context

    // 1. Check in-memory cache
    const cached = getCached(organizationId, provider)
    if (cached !== undefined) {
      // Cached value may be null (no DB row, no env) or a string (resolved key)
      if (cached === null) {
        // Previously resolved as "no key anywhere"
        const envKey = ENV_KEYS[provider]
        if (envKey) return { provider, credentials: { apiKey: envKey } }
        return null
      }
      return { provider, credentials: { apiKey: cached } }
    }

    // 2. DB lookup
    const dbKey = await providersRepository.getDecryptedKey(organizationId, provider)
    if (dbKey) {
      setCached(organizationId, provider, dbKey)
      return { provider, credentials: { apiKey: dbKey } }
    }

    // 3. Env fallback
    const envKey = ENV_KEYS[provider]
    // Cache a sentinel null to avoid future DB hits for this (org, provider)
    setCached(organizationId, provider, null)
    if (envKey) return { provider, credentials: { apiKey: envKey } }

    return null
  },

  /**
   * Invalidate the cache entry for a specific (org, provider) pair.
   * Call this after an upsert or delete so the next resolve reads fresh data.
   */
  invalidate(organizationId: string, provider: string): void {
    cache.delete(cacheKey(organizationId, provider))
  },
}
