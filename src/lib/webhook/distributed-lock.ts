/**
 * Distributed Lock Service using Redlock
 *
 * Provides distributed locking to prevent race conditions when
 * processing webhooks across multiple server instances.
 */

// @ts-expect-error - redlock types issue with package.json exports
import Redlock, { Lock, ResourceLockedError } from 'redlock';
import { getRedis } from '@/services/redis';
import { logger } from '@/lib/logging/logger';

// Check if we're in a build environment
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';

let _redlock: Redlock | null = null;

/**
 * Get the Redlock instance (lazy initialization)
 */
function getRedlock(): Redlock {
  if (isBuildTime) {
    throw new Error('Redlock is not available during build time');
  }

  if (!_redlock) {
    const redis = getRedis();
    _redlock = new Redlock([redis], {
      // Retry count: 0 means don't retry (fail fast if lock can't be acquired)
      retryCount: 0,
      // Time in ms between retries (not used when retryCount is 0)
      retryDelay: 200,
      // Randomization factor for retry delay jitter
      retryJitter: 200,
      // Proportion of the TTL that should have elapsed before a lock is considered in need of extension
      automaticExtensionThreshold: 500,
    });

    _redlock.on('error', (error: Error) => {
      // Ignore ResourceLockedError - this is expected when another instance holds the lock
      if (error instanceof ResourceLockedError) {
        return;
      }
      logger.error('Redlock error', { error: error.message });
    });
  }

  return _redlock;
}

/**
 * Result type for lock operations
 */
export type LockResult<T> =
  | { acquired: true; result: T }
  | { acquired: false; reason: 'already_locked' | 'error'; error?: Error };

/**
 * Execute a function with a distributed lock
 *
 * @param key - Unique key for the lock (e.g., `msg:${messageId}`)
 * @param ttl - Lock time-to-live in milliseconds (default: 5000ms)
 * @param fn - Function to execute while holding the lock
 * @returns LockResult with the function result or lock failure reason
 */
export async function withLock<T>(
  key: string,
  ttl: number,
  fn: () => Promise<T>
): Promise<LockResult<T>> {
  if (isBuildTime) {
    // During build, skip locking
    return { acquired: true, result: await fn() };
  }

  const lockKey = `lock:${key}`;
  let lock: Lock | null = null;

  // Step 1: Acquire the lock
  try {
    const redlock = getRedlock();
    lock = await redlock.acquire([lockKey], ttl);
  } catch (error) {
    if (error instanceof ResourceLockedError) {
      // Another instance is processing this message
      logger.debug('Lock not acquired - resource already locked', { key: lockKey });
      return { acquired: false, reason: 'already_locked' };
    }

    // Lock acquisition error (Redis down, etc.)
    logger.error('Lock acquisition error', {
      key: lockKey,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return {
      acquired: false,
      reason: 'error',
      error: error instanceof Error ? error : new Error('Unknown error'),
    };
  }

  // Step 2: Execute the function with the lock held
  // IMPORTANT: Errors from fn() should propagate, not be swallowed!
  try {
    const result = await fn();
    return { acquired: true, result };
  } finally {
    // Always release the lock after execution (success or error)
    if (lock) {
      try {
        await lock.release();
      } catch (releaseError) {
        // Ignore release errors (lock may have expired)
        logger.debug('Lock release warning', {
          key: lockKey,
          error: releaseError instanceof Error ? releaseError.message : 'Unknown',
        });
      }
    }
  }
}

/**
 * Execute webhook processing with idempotency lock
 *
 * @param messageId - WhatsApp message ID for deduplication
 * @param fn - Function to execute (should return true if message was processed)
 * @returns true if processed, false if skipped (already processed or locked)
 */
export async function withMessageLock<T>(
  messageId: string,
  fn: () => Promise<T>
): Promise<{ processed: boolean; result?: T; reason?: string }> {
  if (!messageId) {
    // No message ID, can't deduplicate
    const result = await fn();
    return { processed: true, result };
  }

  const lockResult = await withLock(`msg:${messageId}`, 5000, fn);

  if (lockResult.acquired) {
    return { processed: true, result: lockResult.result };
  }

  return {
    processed: false,
    reason: lockResult.reason === 'already_locked'
      ? 'Message is being processed by another instance'
      : `Lock error: ${lockResult.error?.message}`,
  };
}

export { ResourceLockedError };
