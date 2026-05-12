/**
 * Providers — Prisma repository for OrganizationProvider (BYOK).
 *
 * All queries are scoped to organizationId to prevent cross-org data leaks.
 */

import { database as db } from '@/server/services/database'
import { encrypt, decrypt } from '@/lib/crypto'
import { Prisma, ProviderCategory } from '@prisma/client'
import type { SupportedProvider, ProviderListItem } from './providers.schemas'

/** Maps supported providers to their ProviderCategory enum value. */
const PROVIDER_CATEGORY: Record<SupportedProvider, ProviderCategory> = {
  openai: ProviderCategory.AI,
  anthropic: ProviderCategory.AI,
  google: ProviderCategory.AI,
}

/**
 * Extract the last-four characters from an encrypted apiKey blob.
 * We decrypt only to derive the hint; the plaintext is never persisted.
 */
function lastFourFromEncrypted(encrypted: string): string | null {
  try {
    const plain = decrypt(encrypted)
    return plain.length >= 4 ? plain.slice(-4) : null
  } catch {
    return null
  }
}

/**
 * Parse `credentials` Json field safely.
 * The DB stores `{ apiKey: string, ...rest }` where apiKey is AES-encrypted.
 */
function parseCredentials(raw: unknown): { apiKey?: string } {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as { apiKey?: string }
  }
  return {}
}

export const providersRepository = {
  /**
   * Return the list shape for all three supported AI providers.
   * Rows that have no DB record are returned with isConfigured=false.
   */
  async list(organizationId: string): Promise<ProviderListItem[]> {
    const rows = await db.organizationProvider.findMany({
      where: {
        organizationId,
        category: ProviderCategory.AI,
        provider: { in: ['openai', 'anthropic', 'google'] },
        isActive: true,
      },
      select: {
        provider: true,
        credentials: true,
        updatedAt: true,
      },
    })

    const rowMap = new Map(rows.map((r) => [r.provider, r]))

    return (['openai', 'anthropic', 'google'] as SupportedProvider[]).map(
      (p) => {
        const row = rowMap.get(p)
        if (!row) {
          return { provider: p, isConfigured: false, lastFour: null, updatedAt: null }
        }
        const creds = parseCredentials(row.credentials)
        return {
          provider: p,
          isConfigured: Boolean(creds.apiKey),
          lastFour: creds.apiKey ? lastFourFromEncrypted(creds.apiKey) : null,
          updatedAt: row.updatedAt.toISOString(),
        }
      },
    )
  },

  /**
   * Create or update the provider record for the org.
   * `apiKey` is AES-encrypted before storing. Extra `config` keys go into `settings`.
   */
  async upsert(
    organizationId: string,
    provider: SupportedProvider,
    apiKey: string,
    config?: Record<string, unknown>,
  ): Promise<ProviderListItem> {
    const encryptedKey = encrypt(apiKey)
    const category = PROVIDER_CATEGORY[provider]

    const row = await db.organizationProvider.upsert({
      where: {
        organizationId_category_provider_builderProjectId_priority: {
          organizationId,
          category,
          provider,
          builderProjectId: '',
          priority: 0,
        },
      },
      create: {
        organizationId,
        category,
        provider,
        name: provider,
        isActive: true,
        isPrimary: true,
        priority: 0,
        builderProjectId: null,
        credentials: { apiKey: encryptedKey } as Prisma.InputJsonValue,
        settings: config ? (config as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
      update: {
        credentials: { apiKey: encryptedKey } as Prisma.InputJsonValue,
        settings: config ? (config as Prisma.InputJsonValue) : undefined,
        isActive: true,
        updatedAt: new Date(),
      },
      select: {
        provider: true,
        credentials: true,
        updatedAt: true,
      },
    })

    const creds = parseCredentials(row.credentials)
    return {
      provider: row.provider as SupportedProvider,
      isConfigured: Boolean(creds.apiKey),
      lastFour: creds.apiKey ? lastFourFromEncrypted(creds.apiKey) : null,
      updatedAt: row.updatedAt.toISOString(),
    }
  },

  /**
   * Hard-delete the provider row so the org falls back to the env-level key.
   * Returns false if no row existed (so controller can return 404).
   */
  async remove(organizationId: string, provider: SupportedProvider): Promise<boolean> {
    const existing = await db.organizationProvider.findFirst({
      where: { organizationId, provider, isActive: true },
      select: { id: true },
    })
    if (!existing) return false

    await db.organizationProvider.delete({ where: { id: existing.id } })
    return true
  },

  /**
   * Fetch the decrypted apiKey for a specific provider, or null if not found.
   * Used exclusively by credential-resolver (not exposed to HTTP layer).
   */
  async getDecryptedKey(
    organizationId: string,
    provider: string,
  ): Promise<string | null> {
    const row = await db.organizationProvider.findFirst({
      where: { organizationId, provider, isActive: true },
      select: { credentials: true },
    })
    if (!row) return null
    const creds = parseCredentials(row.credentials)
    if (!creds.apiKey) return null
    try {
      return decrypt(creds.apiKey)
    } catch {
      return null
    }
  },
}
