/**
 * Bot Echo Detection Service (Redis-based)
 *
 * Replaces the fragile zero-width Unicode char approach (BOT_SIGNATURE)
 * with a Redis SET + TTL pattern.
 *
 * When the bot sends a message, the returned WhatsApp message ID is stored
 * in Redis for BOT_ECHO_TTL seconds. When a webhook arrives, the incoming
 * message ID is checked against Redis — if present, it is a bot echo and
 * should be discarded.
 */

import { getRedis } from '@/server/services/redis'

const BOT_ECHO_TTL = 120 // seconds
const BOT_ECHO_PREFIX = 'bot_msg:'

/**
 * Mark a message ID as sent by the bot so future webhooks can detect the echo.
 */
export async function markBotEcho(messageId: string): Promise<void> {
  const redis = getRedis()
  await redis.set(`${BOT_ECHO_PREFIX}${messageId}`, '1', 'EX', BOT_ECHO_TTL)
}

/**
 * Check whether a message ID belongs to a bot-sent message (echo).
 */
export async function isBotEcho(messageId: string): Promise<boolean> {
  const redis = getRedis()
  const result = await redis.get(`${BOT_ECHO_PREFIX}${messageId}`)
  return result !== null
}

/**
 * Mark multiple message IDs as bot echoes in a single Redis pipeline.
 * Useful for Chatwoot where both the internal and external IDs may be present.
 */
export async function markBotEchoMulti(messageIds: string[]): Promise<void> {
  const redis = getRedis()
  const pipeline = redis.pipeline()
  for (const id of messageIds) {
    pipeline.set(`${BOT_ECHO_PREFIX}${id}`, '1', 'EX', BOT_ECHO_TTL)
  }
  await pipeline.exec()
}
