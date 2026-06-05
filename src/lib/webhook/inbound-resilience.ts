/**
 * Inbound webhook resilience patterns (Orayon playbook).
 *
 * Two defensive helpers consumed by the UAZapi inbound webhook:
 *
 *  1. Idempotent dedup — `isDuplicateInbound`
 *     UAZapi (and the brokers in front of it) retry-storm webhooks. Without a
 *     dedup gate the same physical message gets processed twice → duplicate AI
 *     reply + double LLM/STT cost. We fingerprint the message as
 *     `sha256('uazapi:'+instanceId+':'+messageId)` and claim it in Redis with a
 *     `SET key 1 EX 86400 NX`. First writer wins (NX); any later retry sees the
 *     key already exists → flagged as duplicate. 24h window covers broker retry
 *     budgets comfortably.
 *
 *  2. Operator takeover — `pauseAiForOperatorTakeover`
 *     When a human operator replies straight from the WhatsApp app, the message
 *     comes back as an OUT/fromMe webhook that is NOT a bot echo. That signals a
 *     human took over the conversation, so we pause the AI *until the session
 *     closes* by setting `ChatSession.aiEnabled = false` — the same field
 *     `canDispatchAi` already honours. When the session is later closed (manual
 *     or inactivity) the contact's next message opens a NEW session with
 *     aiEnabled=true → the AI resumes automatically. This keeps the human in
 *     control for the whole conversation instead of an arbitrary timer.
 *
 * Fail-open by design: Redis/DB hiccups must never drop a real customer message.
 * Every helper swallows its own errors and degrades to "process normally"
 * (dedup) or "best effort, don't block" (takeover).
 */

import { createHash } from 'crypto'
import type Redis from 'ioredis'

/** Dedup key TTL — 24h covers broker retry budgets (Orayon default). */
const DEDUP_TTL_SECONDS = 24 * 60 * 60

/**
 * Deterministic fingerprint of an inbound message: sha256 over the tenant-ish
 * `instance` plus the provider message id. Same message → same hash → same
 * Redis key, regardless of which server instance handles the retry.
 */
export function computeInboundDedupHash(instanceId: string, messageId: string): string {
  return createHash('sha256')
    .update(`uazapi:${instanceId}:${messageId}`)
    .digest('hex')
}

/** Redis key for the dedup claim. */
function dedupKey(hash: string): string {
  return `dedup:wa:${hash}`
}

/**
 * Claims the inbound message in Redis (SET NX EX). Returns `true` when the
 * message is a DUPLICATE (key already existed → another delivery already claimed
 * it), `false` when this is the first delivery (claim succeeded).
 *
 * Fail-open: if `redis` is missing or the call throws (Redis down), returns
 * `false` so the message is processed normally — never block real traffic on an
 * infra blip. Double-processing is the lesser evil vs. dropping a customer msg.
 */
export async function isDuplicateInbound(
  redis: Pick<Redis, 'set'> | null | undefined,
  instanceId: string,
  messageId: string,
): Promise<boolean> {
  if (!redis || !instanceId || !messageId) {
    return false
  }

  try {
    const hash = computeInboundDedupHash(instanceId, messageId)
    // ioredis: SET key value EX <seconds> NX → returns 'OK' on write, null if
    // the key already existed (NX failed). null ⇒ duplicate.
    const result = await redis.set(dedupKey(hash), '1', 'EX', DEDUP_TTL_SECONDS, 'NX')
    return result === null
  } catch (err) {
    console.warn(
      '[uazapi-webhook] dedup check failed, processing anyway:',
      err instanceof Error ? err.message : String(err),
    )
    return false
  }
}

/**
 * Minimal DB surface needed to stamp the AI pause — keeps this helper decoupled
 * from the concrete Prisma client (and trivially mockable).
 */
interface SessionPauser {
  chatSession: {
    update: (args: {
      where: { id: string }
      data: { aiEnabled?: boolean; aiBlockedUntil?: Date | null; aiBlockReason?: string }
    }) => Promise<unknown>
  }
}

/**
 * Pauses the AI on a session because a human operator replied from WhatsApp.
 * Sets `aiEnabled = false` (pause until the session closes), which `canDispatchAi`
 * already checks before dispatching the runtime. Also clears any stale
 * time-based `aiBlockedUntil` left by older logic.
 *
 * The AI resumes on its own when the session closes (manual or inactivity) and
 * the contact's next message opens a fresh session (aiEnabled defaults to true).
 * An operator can also hand back early via the "return to AI" action.
 *
 * Best-effort + defensive: errors are swallowed (logged) so an outbound operator
 * message never fails the webhook. Returns `true` on success, `false` if it
 * skipped/failed.
 */
export async function pauseAiForOperatorTakeover(
  db: SessionPauser,
  sessionId: string,
): Promise<boolean> {
  if (!sessionId) {
    return false
  }

  try {
    await db.chatSession.update({
      where: { id: sessionId },
      data: {
        aiEnabled: false,
        aiBlockReason: 'operator_takeover',
        aiBlockedUntil: null,
      },
    })
    return true
  } catch (err) {
    console.warn(
      '[uazapi-webhook] operator-takeover pause failed (non-fatal):',
      err instanceof Error ? err.message : String(err),
    )
    return false
  }
}
