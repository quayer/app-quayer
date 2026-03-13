/**
 * SCIM Token Validation
 *
 * Validates a bearer token against stored SCIM tokens.
 * Used by SCIM API endpoints for authentication.
 */

import { verifyPassword } from '@/lib/auth/bcrypt'

/**
 * Validates a SCIM bearer token and returns the associated organizationId.
 *
 * - Iterates all non-revoked, non-expired tokens for hash comparison (bcrypt timing-safe)
 * - Updates lastUsedAt on successful validation
 * - Returns null if no match, token expired, or token revoked
 *
 * @param bearerToken - The raw bearer token string (128 hex chars)
 * @returns The organizationId if valid, null otherwise
 */
export async function validateScimToken(
  bearerToken: string
): Promise<{ organizationId: string; tokenId: string } | null> {
  if (!bearerToken || bearerToken.length === 0) {
    return null
  }

  const { database } = await import('@/server/services/database')

  // Fetch all active (non-revoked) tokens
  const tokens = await database.scimToken.findMany({
    where: {
      revokedAt: null,
    },
    select: {
      id: true,
      organizationId: true,
      tokenHash: true,
      expiresAt: true,
    },
  })

  const now = new Date()

  for (const token of tokens) {
    // Skip expired tokens
    if (token.expiresAt && token.expiresAt < now) {
      continue
    }

    // Timing-safe comparison via bcrypt
    const isMatch = await verifyPassword(bearerToken, token.tokenHash)

    if (isMatch) {
      // Update lastUsedAt (fire and forget — don't block the request)
      database.scimToken
        .update({
          where: { id: token.id },
          data: { lastUsedAt: now },
        })
        .catch((err: unknown) => {
          console.error('[SCIM] Failed to update lastUsedAt:', err)
        })

      return {
        organizationId: token.organizationId,
        tokenId: token.id,
      }
    }
  }

  return null
}
