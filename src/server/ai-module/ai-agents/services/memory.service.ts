/**
 * Short Memory Service (US-029)
 *
 * Redis-backed short-term conversation memory for AI agent sessions.
 * Stores the last N messages per session with 24h TTL.
 * Falls back to Postgres (Message table) when Redis is empty.
 */

import type { Redis } from 'ioredis'
import type { PrismaClient } from '@prisma/client'

// ── Constants ───────────────────────────────────────────────────────────────

const SHORT_MEMORY_PREFIX = 'agent:memory:short:'
const SHORT_MEMORY_TTL = 86400 // 24h

// ── Types ───────────────────────────────────────────────────────────────────

export interface ShortMemoryMessage {
  role: string
  content: string
  createdAt?: string
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Push a message to the short-term memory list for the given session.
 * Each entry is stored as a JSON string in a Redis list.
 * The key expires after 24 hours of inactivity.
 */
export async function pushToShortMemory(
  redis: Redis,
  sessionId: string,
  message: ShortMemoryMessage
): Promise<void> {
  const key = `${SHORT_MEMORY_PREFIX}${sessionId}`

  const entry = JSON.stringify({
    role: message.role,
    content: message.content,
    createdAt: message.createdAt ?? new Date().toISOString(),
  })

  await redis.rpush(key, entry)
  await redis.expire(key, SHORT_MEMORY_TTL)
}

/**
 * Load the most recent messages from short-term memory.
 *
 * 1. Attempts to read from Redis (fast path).
 * 2. If Redis returns empty, falls back to Postgres Message table.
 *
 * @param limit - Maximum number of messages to return (default: 50)
 */
export async function loadShortMemory(
  redis: Redis,
  sessionId: string,
  limit?: number,
  database?: PrismaClient
): Promise<Array<{ role: string; content: string }>> {
  const key = `${SHORT_MEMORY_PREFIX}${sessionId}`
  const count = limit ?? 50

  // Fast path: read from Redis
  const raw = await redis.lrange(key, -count, -1)

  if (raw.length > 0) {
    return raw.map((entry) => {
      const parsed = JSON.parse(entry) as ShortMemoryMessage
      return { role: parsed.role, content: parsed.content }
    })
  }

  // Fallback: read from Postgres if database client is provided
  if (database) {
    try {
      const messages = await database.message.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
        take: count,
        select: {
          content: true,
          direction: true,
        },
      })

      return messages.map((msg) => ({
        role: msg.direction === 'INBOUND' ? 'user' : 'assistant',
        content: msg.content || '',
      }))
    } catch (err) {
      console.warn(
        '[ShortMemory] Postgres fallback failed:',
        err instanceof Error ? err.message : err
      )
    }
  }

  return []
}

/**
 * Clear all short-term memory entries for the given session.
 */
export async function clearShortMemory(
  redis: Redis,
  sessionId: string
): Promise<void> {
  const key = `${SHORT_MEMORY_PREFIX}${sessionId}`
  await redis.del(key)
}
