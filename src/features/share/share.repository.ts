/**
 * Share Repository
 * Database operations for share tokens
 */

import { database } from '@/services/database'
import type { ShareToken } from './share.interfaces'

export const shareRepository = {
  /**
   * Create a new share token
   */
  async createShareToken(
    instanceId: string,
    expiresAt: Date,
    createdBy?: string
  ): Promise<ShareToken> {
    const token = await database.shareToken.create({
      data: {
        instanceId,
        expiresAt,
        createdBy,
      },
    })

    return token
  },

  /**
   * Find share token by token string
   */
  async findByToken(token: string): Promise<ShareToken | null> {
    const shareToken = await database.shareToken.findUnique({
      where: { token },
    })

    return shareToken
  },

  /**
   * Find share token with instance data
   */
  async findByTokenWithInstance(token: string) {
    const shareToken = await database.shareToken.findUnique({
      where: { token },
      include: {
        instance: true,
      },
    })

    return shareToken
  },

  /**
   * Mark token as used
   */
  async markAsUsed(token: string): Promise<void> {
    await database.shareToken.update({
      where: { token },
      data: {
        usedAt: new Date(),
      },
    })
  },

  /**
   * Delete expired tokens (cleanup job)
   */
  async deleteExpiredTokens(): Promise<number> {
    const result = await database.shareToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    })

    return result.count
  },

  /**
   * Get all tokens for an instance
   */
  async getTokensForInstance(instanceId: string): Promise<ShareToken[]> {
    const tokens = await database.shareToken.findMany({
      where: { instanceId },
      orderBy: { createdAt: 'desc' },
    })

    return tokens
  },
}