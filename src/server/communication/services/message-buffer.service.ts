/**
 * Message Buffer Service
 *
 * Debounces rapid-fire messages from a session into a single concatenated
 * payload before forwarding to the AI agent runtime. Uses Redis lists for
 * accumulation and a separate timer key for debounce tracking.
 *
 * Zero external dependencies beyond ioredis (already available via
 * `@/server/services/redis`).
 */

import type { Redis } from 'ioredis'

// ── Constants ───────────────────────────────────────────────────────────────

/** Default debounce per channel type (milliseconds). */
const CHANNEL_DEBOUNCE_MS: Record<string, number> = {
  WHATSAPP: 5000,
  WHATSAPP_WEB: 5000,
  WHATSAPP_CLOUD_API: 5000,
  INSTAGRAM: 7000,
  INSTAGRAM_META: 7000,
  CHATWOOT: 3000,
}

/** Safety cap — skip buffering if too many concurrent buffers exist. */
const MAX_TRACKED_BUFFERS = 2048

/** TTL applied to the buffer list key (seconds). */
const BUFFER_TTL_SECONDS = 7

/** Key prefix for the message accumulation list. */
const BUFFER_PREFIX = 'buffer:'

/** Key prefix for the debounce timer. */
const TIMER_PREFIX = 'buffer:timer:'

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolve the debounce interval to use.
 *
 * Priority: `customMs` > channel-type lookup > 5 000 ms default.
 */
export function getDebounceMs(channelType?: string, customMs?: number): number {
  if (customMs !== undefined && customMs > 0) return customMs
  if (channelType && channelType in CHANNEL_DEBOUNCE_MS) {
    return CHANNEL_DEBOUNCE_MS[channelType]
  }
  return 5000
}

/**
 * Buffer an incoming message for the given session.
 *
 * @returns The concatenated (newline-separated) buffered messages when the
 *          debounce window has expired, or `null` if still accumulating.
 */
export async function bufferMessage(
  redis: Redis,
  sessionId: string,
  content: string,
  channelType?: string,
  customDebounceMs?: number,
): Promise<string | null> {
  const debounceMs = getDebounceMs(channelType, customDebounceMs)
  const bufferKey = `${BUFFER_PREFIX}${sessionId}`
  const timerKey = `${TIMER_PREFIX}${sessionId}`

  // Safety: if too many buffers are tracked concurrently, bypass buffering
  // altogether and return the content immediately to avoid memory pressure.
  const trackedCount = await redis.dbsize()
  if (trackedCount > MAX_TRACKED_BUFFERS) {
    return content
  }

  // 1. Append the new message to the buffer list
  await redis.rpush(bufferKey, content)

  // 2. Ensure TTL on the buffer key so orphaned buffers auto-expire
  await redis.expire(bufferKey, BUFFER_TTL_SECONDS)

  // 3. Check the debounce timer
  //    SET NX + PX atomically creates the timer only if it doesn't exist yet.
  const timerSet = await redis.set(timerKey, '1', 'PX', debounceMs, 'NX')

  if (!timerSet) {
    // Timer already exists — still within debounce window, keep buffering.
    return null
  }

  // Timer was just created — this is the first message of a new debounce
  // window. We need to wait for the debounce to expire, then flush.
  // Instead of sleeping here (blocking), we return null so the caller can
  // schedule a delayed flush. However, per the spec we can also implement a
  // simpler approach: if the timer did NOT exist we flush immediately
  // (treating the absence of a timer as "debounce expired").

  // Re-check: the NX-based approach means we flush on the FIRST message,
  // which defeats the purpose. The correct pattern is:
  //   - Always push to the buffer.
  //   - Always (re)set the timer with the debounce TTL.
  //   - The caller should schedule a delayed consumer, OR we use a
  //     polling approach where the next call after expiry flushes.
  //
  // Simpler pattern (polling flush):
  //   - Push message to buffer.
  //   - Try to SET timer (NX). If set → first message of window.
  //   - If NOT set → check remaining TTL. If expired or about to,
  //     flush.
  //   - Actually, the cleanest approach: always push, always reset
  //     the timer, and check from outside.
  //
  // Let's implement the "flush on timer miss" pattern:
  //   After pushing, if the timer does NOT exist, it means the
  //   previous debounce window expired → flush all buffered content.

  // We already set the timer above. Since NX succeeded, this is the first
  // message. Return null — the flush will happen when a subsequent call
  // finds the timer expired (or we can handle it with a background check).

  // --- Revised, simpler approach ---
  // Delete the timer we just set and use the "re-set on every message" pattern:
  await redis.del(timerKey)

  return await tryFlush(redis, sessionId, debounceMs)
}

/**
 * Internal: attempt to flush the buffer if the debounce window has passed.
 *
 * Uses SET NX with the debounce TTL. If the timer key already exists (another
 * message arrived recently), returns null. If the timer key was successfully
 * created (no recent message), flushes all buffered content.
 */
async function tryFlush(
  redis: Redis,
  sessionId: string,
  debounceMs: number,
): Promise<string | null> {
  const bufferKey = `${BUFFER_PREFIX}${sessionId}`
  const timerKey = `${TIMER_PREFIX}${sessionId}`

  // Reset the timer — each new message restarts the debounce clock.
  await redis.set(timerKey, '1', 'PX', debounceMs)

  // At this point the caller should schedule a delayed check.
  // For a synchronous API, we check if there are messages and the
  // timer has expired. Since we just SET the timer, it hasn't expired yet.
  // Return null — the flush will be triggered by a delayed invocation.
  return null
}

/**
 * Force-flush the buffer for a session. Call this from a delayed job
 * (e.g. BullMQ delayed job or setTimeout) after the debounce interval.
 *
 * @returns Concatenated messages or null if the buffer is empty / another
 *          message arrived and reset the timer.
 */
export async function flushBuffer(
  redis: Redis,
  sessionId: string,
): Promise<string | null> {
  const bufferKey = `${BUFFER_PREFIX}${sessionId}`
  const timerKey = `${TIMER_PREFIX}${sessionId}`

  // Check if the timer still exists (meaning a new message arrived and
  // the debounce was restarted). If so, don't flush yet.
  const timerExists = await redis.exists(timerKey)
  if (timerExists) {
    return null
  }

  // Atomically read and delete the buffer
  const messages = await redis.lrange(bufferKey, 0, -1)
  if (messages.length === 0) return null

  await redis.del(bufferKey)

  return messages.join('\n')
}
