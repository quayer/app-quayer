/**
 * API Keys Repository
 *
 * Manages API key storage and retrieval with secure hashing
 */

import { database } from '@/services/database'
import crypto from 'crypto'

// Generate a secure random API key
export function generateApiKey(): { fullKey: string; prefix: string; hash: string } {
  // Generate 32 bytes of random data
  const randomBytes = crypto.randomBytes(32)

  // Format: qk_live_ + base64url encoded (44 chars)
  const base64Key = randomBytes.toString('base64url')
  const fullKey = `qk_live_${base64Key}`

  // Prefix for display (first 12 chars including qk_live_)
  const prefix = fullKey.substring(0, 12)

  // Hash the full key for storage
  const hash = crypto.createHash('sha256').update(fullKey).digest('hex')

  return { fullKey, prefix, hash }
}

// Hash an API key for lookup
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

export const apiKeysRepository = {
  // Create a new API key
  async create(data: {
    name: string
    organizationId: string
    userId: string
    scopes?: string[]
    expiresAt?: Date | null
  }) {
    const { fullKey, prefix, hash } = generateApiKey()

    const apiKey = await database.apiKey.create({
      data: {
        name: data.name,
        keyHash: hash,
        prefix,
        organizationId: data.organizationId,
        userId: data.userId,
        scopes: data.scopes || ['read', 'write'],
        expiresAt: data.expiresAt,
        isActive: true,
      },
    })

    // Return the full key only once (at creation time)
    return {
      ...apiKey,
      key: fullKey, // This is the only time the full key is available
    }
  },

  // List all API keys for an organization
  async listByOrganization(organizationId: string) {
    return database.apiKey.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        expiresAt: true,
        lastUsedAt: true,
        lastUsedIp: true,
        usageCount: true,
        isActive: true,
        createdAt: true,
        userId: true,
      },
    })
  },

  // List all API keys (admin only)
  async listAll() {
    return database.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        organizationId: true,
        userId: true,
        scopes: true,
        expiresAt: true,
        lastUsedAt: true,
        lastUsedIp: true,
        usageCount: true,
        isActive: true,
        createdAt: true,
      },
    })
  },

  // Get API key by hash (for authentication)
  async getByHash(keyHash: string) {
    return database.apiKey.findUnique({
      where: { keyHash },
      select: {
        id: true,
        name: true,
        organizationId: true,
        userId: true,
        scopes: true,
        expiresAt: true,
        isActive: true,
        revokedAt: true,
      },
    })
  },

  // Validate and get API key (for authentication middleware)
  async validateKey(fullKey: string) {
    const keyHash = hashApiKey(fullKey)
    const apiKey = await this.getByHash(keyHash)

    if (!apiKey) {
      return { valid: false, reason: 'Key not found' }
    }

    if (!apiKey.isActive) {
      return { valid: false, reason: 'Key is inactive' }
    }

    if (apiKey.revokedAt) {
      return { valid: false, reason: 'Key has been revoked' }
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return { valid: false, reason: 'Key has expired' }
    }

    return { valid: true, apiKey }
  },

  // Update last used timestamp
  async updateLastUsed(id: string, ip?: string) {
    return database.apiKey.update({
      where: { id },
      data: {
        lastUsedAt: new Date(),
        lastUsedIp: ip,
        usageCount: { increment: 1 },
      },
    })
  },

  // Revoke an API key
  async revoke(id: string, revokedBy: string) {
    return database.apiKey.update({
      where: { id },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokedBy,
      },
    })
  },

  // Delete an API key permanently
  async delete(id: string) {
    return database.apiKey.delete({
      where: { id },
    })
  },

  // Update API key name or scopes
  async update(id: string, data: { name?: string; scopes?: string[] }) {
    return database.apiKey.update({
      where: { id },
      data,
    })
  },

  // Check if user owns the key or is admin
  async canManageKey(keyId: string, userId: string, userRole: string, userOrgId?: string) {
    if (userRole === 'admin') return true

    const apiKey = await database.apiKey.findUnique({
      where: { id: keyId },
      select: { userId: true, organizationId: true },
    })

    if (!apiKey) return false

    // User can manage their own keys
    if (apiKey.userId === userId) return true

    // Organization masters can manage org keys
    if (userOrgId && apiKey.organizationId === userOrgId) {
      const orgUser = await database.userOrganization.findUnique({
        where: { userId_organizationId: { userId, organizationId: userOrgId } },
        select: { role: true },
      })
      return orgUser?.role === 'master'
    }

    return false
  },
}
