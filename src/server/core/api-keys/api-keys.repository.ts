import crypto from 'crypto'
import { database } from '@/server/services/database'

interface ApiKeyData {
  id: string
  organizationId: string
  userId: string
  scopes: string[]
  name: string
}

interface ApiKeyValidation {
  valid: boolean
  apiKey: ApiKeyData | null
}

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

export const apiKeysRepository = {
  async validateKey(key: string): Promise<ApiKeyValidation> {
    const keyHash = hashKey(key)
    const record = await database.apiKey.findFirst({
      where: { keyHash, isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { id: true, organizationId: true, userId: true, scopes: true, name: true },
    })
    return { valid: !!record, apiKey: record }
  },

  async updateLastUsed(id: string, ip: string | null): Promise<void> {
    await database.apiKey.update({ where: { id }, data: { lastUsedAt: new Date(), lastUsedIp: ip, usageCount: { increment: 1 } } })
  },
}
