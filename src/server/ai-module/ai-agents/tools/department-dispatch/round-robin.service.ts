/**
 * Round-Robin Service — department member selection (roleta)
 *
 * Pure(ish) selection logic for picking the next human agent of a department
 * to receive a conversation, following a deterministic circular order.
 *
 * Data model (added in migration `add_department_round_robin`, gated by
 * approval — see prisma/schema.prisma DESIGN block):
 *
 *   - Department.lastAssignedUserId / lastAssignedAt
 *       Persisted CURSOR: the User.id of the LAST member the roleta picked.
 *       NULL = the roleta never ran (start from the first member).
 *
 *   - DepartmentMember (table `department_members`)
 *       Junction User<->Department. The pool of candidates.
 *       Order of the roleta = (position ASC, createdAt ASC).
 *       `isActive=false` removes a member from the roleta without deleting it
 *       (offline / vacation). `Department.isActive=false` disables the whole
 *       department.
 *
 * Why a persisted cursor and not an in-memory counter: the agent runtime runs
 * per webhook (stateless, possibly multi-instance). An in-memory pointer would
 * reset and break fair distribution. The Department row is the source of truth.
 *
 * Concurrency: `selectNextMember` advances the cursor inside an interactive
 * transaction with a row lock on the Department (SELECT ... FOR UPDATE via
 * `$queryRaw`) so two concurrent webhooks of the same org never land on the
 * same member under load. The selection + cursor advance is atomic.
 *
 * Resilience: the `DepartmentMember` model and the round-robin columns on
 * `Department` arrive via a migration under an approval gate. Until it lands,
 * `database.departmentMember` is `undefined` (delegate absent from the
 * generated client). We mirror the defensive pattern of
 * `src/server/communication/departments/departments.routes.ts`: the delegate
 * is accessed through `getDepartmentMemberDelegate()` and selection degrades to
 * `department_not_found` (so the caller falls back to transfer_to_human)
 * instead of throwing. This also avoids a hard compile-time dependency on not-
 * yet-generated Prisma types.
 *
 * This file does NOT touch ChatSession or Notification — it only resolves
 * "who is next" and moves the cursor. Session assignment / AI pause / handoff
 * notification live in `dispatch-to-agent.ts`.
 */

import type { Prisma, PrismaClient } from '@prisma/client'
import { database } from '@/server/services/database'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A department member eligible to receive a conversation.
 *
 * IDENTITY = `memberId` (DepartmentMember.id), ALWAYS present. Since M1 the
 * `userId` is NULLABLE (a member may be a plain "name + WhatsApp" contact, not a
 * platform user), so userId can no longer be the roleta key — multiple NULLs
 * would collide and the cursor couldn't distinguish them. The cursor, the
 * ordering and `pickNextInOrder` are all keyed by `memberId`.
 */
export interface RouletteCandidate {
  /** DepartmentMember.id — the stable identity / cursor key of the roleta. */
  memberId: string
  /** User.id of the human agent, or null for a "name + WhatsApp" member. */
  userId: string | null
  /** User.name (for return envelopes / notifications) — legacy alias. */
  userName: string
  /** Display name = user.name ?? member.name ?? 'Atendente' (for notifications). */
  displayName: string
  /** Member WhatsApp (E.164-BR), or null when absent — drives the 6A send. */
  whatsapp: string | null
  /** F0 — Connection.id da instância PRÓPRIA do membro (warm transfer), ou null. */
  connectionId: string | null
  /** Ordering key — DepartmentMember.position */
  position: number
}

/** Outcome of a round-robin selection attempt. */
export type SelectMemberResult =
  | {
      ok: true
      /** The chosen member (cursor has already been advanced to this user). */
      chosen: RouletteCandidate
      /** Total active members in the pool at selection time. */
      poolSize: number
    }
  | {
      ok: false
      /**
       * Why no member was selected:
       *  - 'department_not_found'   — id unknown / wrong org / inactive department
       *  - 'empty_pool'             — department exists but has 0 active members
       *  - 'feature_not_provisioned'— migration not landed yet (delegate absent)
       */
      reason: 'department_not_found' | 'empty_pool' | 'feature_not_provisioned'
    }

/** A Prisma client or transaction handle. */
type Db = PrismaClient | Prisma.TransactionClient

// ---------------------------------------------------------------------------
// Defensive delegate access (migration may not have landed)
// ---------------------------------------------------------------------------

/**
 * Minimal structural type for the DepartmentMember delegate, mirroring
 * departments.routes.ts. Kept structural so this file does NOT take a hard
 * compile-time dependency on the generated DepartmentMember model (which only
 * exists once the gated migration lands).
 */
interface DepartmentMemberRow {
  id: string
  /** Nullable since M1 — a member can be a plain "name + WhatsApp" contact. */
  userId: string | null
  /** M1 — display name for a non-user member. */
  name: string | null
  /** M1 — member WhatsApp (E.164-BR); drives the 6A notification. */
  whatsapp: string | null
  /** F0 — Connection.id da instância própria do membro (warm transfer). */
  connectionId: string | null
  position: number
  createdAt: Date
  user?: { name?: string | null } | null
}

interface DepartmentMemberDelegate {
  findMany: (args: {
    where: Record<string, unknown>
    orderBy?: Record<string, unknown> | Array<Record<string, unknown>>
    select?: Record<string, unknown>
  }) => Promise<DepartmentMemberRow[]>
}

/**
 * Returns the departmentMember delegate from a Prisma client/tx, or null when
 * the migration that creates the model hasn't landed yet.
 */
function getDepartmentMemberDelegate(db: Db): DepartmentMemberDelegate | null {
  const delegate = (db as unknown as {
    departmentMember?: DepartmentMemberDelegate
  }).departmentMember
  return delegate ?? null
}

// ---------------------------------------------------------------------------
// Pure ordering / cursor helpers (no I/O — unit-testable)
// ---------------------------------------------------------------------------

/**
 * Picks the next candidate after the cursor in circular order.
 *
 * Pure function: given a deterministically-ordered pool (already sorted by
 * position ASC, createdAt ASC) and the DepartmentMember.id of the last assigned
 * member, returns the first member strictly AFTER the cursor, wrapping around to
 * the start. If the cursor is null or no longer in the pool (member removed /
 * deactivated since last run), starts from the first member.
 *
 * Keyed by `memberId` (NOT userId): since M1 the userId is nullable, so several
 * members can share `userId = null` — only the always-present `memberId` can
 * distinguish them and serve as the persisted cursor.
 *
 * @param orderedPool   candidates sorted by (position, createdAt) ascending
 * @param lastMemberId  Department.lastAssignedUserId reinterpreted as the last
 *                      assigned DepartmentMember.id (cursor), or null
 * @returns the next candidate, or null if the pool is empty
 */
export function pickNextInOrder(
  orderedPool: RouletteCandidate[],
  lastMemberId: string | null,
): RouletteCandidate | null {
  if (orderedPool.length === 0) return null
  if (orderedPool.length === 1) return orderedPool[0]

  if (!lastMemberId) {
    // Roleta never ran (or reset) — start from the first member.
    return orderedPool[0]
  }

  const lastIdx = orderedPool.findIndex((c) => c.memberId === lastMemberId)
  if (lastIdx === -1) {
    // Previous member is gone from the pool — restart from the top.
    return orderedPool[0]
  }

  // Circular: first member strictly after the cursor.
  const nextIdx = (lastIdx + 1) % orderedPool.length
  return orderedPool[nextIdx]
}

// ---------------------------------------------------------------------------
// Pool loading
// ---------------------------------------------------------------------------

/**
 * Loads the active, ordered pool of members for a department.
 *
 * Filters:
 *  - DepartmentMember.isActive = true  (member available right now)
 *  - department + org match            (tenant boundary, defense in depth)
 *
 * Order: position ASC, createdAt ASC (stable, deterministic).
 *
 * Returns [] when the DepartmentMember delegate is unavailable (migration not
 * landed) — the caller treats that as an empty / unprovisioned pool.
 *
 * NOTE: this only checks DepartmentMember.isActive. If you also want to gate by
 * the user's org-level availability (UserOrganization.isActive) or online
 * presence, layer that on top — kept out of v1 to stay minimal and to keep the
 * query backed by the composite index (departmentId, isActive, position).
 */
export async function loadActivePool(
  db: Db,
  departmentId: string,
  organizationId: string,
): Promise<RouletteCandidate[]> {
  const delegate = getDepartmentMemberDelegate(db)
  if (!delegate) return []

  const members = await delegate.findMany({
    where: {
      departmentId,
      organizationId,
      isActive: true,
    },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      userId: true,
      name: true,
      whatsapp: true,
      connectionId: true,
      position: true,
      user: { select: { name: true } },
    },
  })

  return members.map((m) => {
    // displayName precedence: platform user name → member name → 'Atendente'.
    const displayName = m.user?.name ?? m.name ?? 'Atendente'
    return {
      memberId: m.id,
      userId: m.userId ?? null,
      userName: displayName,
      displayName,
      whatsapp: m.whatsapp ?? null,
      connectionId: m.connectionId ?? null,
      position: m.position,
    }
  })
}

// ---------------------------------------------------------------------------
// Atomic select + advance
// ---------------------------------------------------------------------------

/**
 * Selects the next member of a department and advances the persisted cursor,
 * atomically.
 *
 * Steps (inside a transaction, with the Department row locked FOR UPDATE):
 *   1. Validate the department exists, belongs to `organizationId`, is active.
 *   2. Load the active, ordered member pool.
 *   3. Pick the next member after the cursor (circular).
 *   4. Advance the cursor: lastAssignedUserId = chosen.memberId, lastAssignedAt = now().
 *
 * CURSOR semantics (M1): the cursor is keyed by `DepartmentMember.id` (userId is
 * nullable now — a member can be a non-user). It is persisted in the DEDICATED
 * column `Department.lastAssignedMemberId`, which has NO physical FK (a plain
 * nullable String). We do NOT reuse `lastAssignedUserId`: that legacy column has a
 * REAL Postgres FK→User(id) (created in 20260603010000), so writing a memberId
 * there would violate the constraint. A stale cursor (member since deactivated) is
 * handled by `pickNextInOrder` (falls back to the first member).
 *
 * The row lock serializes concurrent dispatches for the SAME department so the
 * cursor can't be read-then-written by two webhooks racing — they queue and
 * each gets a distinct member (until the pool wraps).
 *
 * The cursor read/write uses `$queryRaw`/`$executeRaw` (quoted legacy table
 * "Department"), so it does NOT depend on the generated client exposing the new
 * round-robin columns. If the columns are missing the raw query throws and we
 * degrade to `feature_not_provisioned`.
 *
 * @returns SelectMemberResult — caller decides the fallback when ok=false.
 */
export async function selectNextMember(
  departmentId: string,
  organizationId: string,
  db: Db = database,
): Promise<SelectMemberResult> {
  // Fast pre-check: if the member delegate isn't there, the feature isn't
  // provisioned — skip the transaction entirely.
  if (!getDepartmentMemberDelegate(db)) {
    return { ok: false, reason: 'feature_not_provisioned' }
  }

  // If we were handed a transaction client, run inline; otherwise open one.
  const runner = isTransactionClient(db)
    ? (fn: (tx: Prisma.TransactionClient) => Promise<SelectMemberResult>) =>
        fn(db as Prisma.TransactionClient)
    : (fn: (tx: Prisma.TransactionClient) => Promise<SelectMemberResult>) =>
        (db as PrismaClient).$transaction(fn)

  try {
    return await runner(async (tx) => {
      // 1. Lock + validate the department row (FOR UPDATE serializes the cursor).
      //    Raw query because Prisma has no first-class row-lock API; we only
      //    select the cursor + guards. Quoted identifiers match the legacy
      //    PascalCase table "Department".
      const locked = await tx.$queryRaw<
        Array<{ id: string; lastAssignedMemberId: string | null; isActive: boolean }>
      >`
        SELECT "id", "lastAssignedMemberId", "isActive"
        FROM "Department"
        WHERE "id" = ${departmentId}
          AND "organizationId" = ${organizationId}
        FOR UPDATE
      `

      const dept = locked[0]
      if (!dept || !dept.isActive) {
        return { ok: false, reason: 'department_not_found' }
      }

      // 2. Load the ordered active pool.
      const pool = await loadActivePool(tx, departmentId, organizationId)
      if (pool.length === 0) {
        return { ok: false, reason: 'empty_pool' }
      }

      // 3. Pick the next member after the cursor (circular). The cursor is the
      //    last chosen DepartmentMember.id (stored in lastAssignedMemberId).
      const chosen = pickNextInOrder(pool, dept.lastAssignedMemberId)
      if (!chosen) {
        // Defensive — pool is non-empty so this shouldn't happen.
        return { ok: false, reason: 'empty_pool' }
      }

      // 4. Advance the cursor on the Department (raw — no typed-column dependency).
      //    Persist the chosen MEMBER id in the dedicated FK-free column
      //    `lastAssignedMemberId` (NOT lastAssignedUserId, which has a FK→User).
      await tx.$executeRaw`
        UPDATE "Department"
        SET "lastAssignedMemberId" = ${chosen.memberId},
            "lastAssignedAt" = ${new Date()},
            "updatedAt" = ${new Date()}
        WHERE "id" = ${departmentId}
      `

      return { ok: true, chosen, poolSize: pool.length }
    })
  } catch (error) {
    // Most likely cause when reached here: the round-robin columns don't exist
    // yet (migration not landed) → raw query fails. Treat as unprovisioned so
    // the tool falls back to transfer_to_human rather than surfacing a crash.
    const msg = error instanceof Error ? error.message : String(error)
    console.warn('[round-robin] selectNextMember failed, degrading:', msg)
    return { ok: false, reason: 'feature_not_provisioned' }
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/**
 * Heuristic to tell a TransactionClient from a full PrismaClient.
 * The transaction client does NOT expose `$transaction`.
 */
function isTransactionClient(db: Db): boolean {
  return typeof (db as PrismaClient).$transaction !== 'function'
}
