/**
 * Builder Module — builderState DB access (Orayon Uplift, W4 source-ingestion)
 *
 * Single home for reading/writing the `BuilderProjectConversation.builderState`
 * JSONB column. The `builderState` column is now part of the generated Prisma
 * client (Json? → `JsonValue | null`), so reads are fully typed and the ONLY
 * cast left is the write boundary: a `BuilderState` object → `Prisma.InputJsonValue`
 * (the canonical pattern used across the repo for JSON columns). Centralizing it
 * here means that boundary cast lives in exactly ONE place.
 *
 * Also owns the `sourceIngestion` merge/patch logic shared by the chat hook, the
 * POST /sources/ingest route, and the async enrich job:
 *   - `mergeSources`             — dedupe-by-CANONICAL-value source list merge (pure).
 *   - `mergeProposal`/`dedupeUnion`/`hasAnyProposalField` — pure SourceProposal
 *      merge semantics (scalars: first non-empty wins; lists: case-insensitive
 *      union). Used intra-job (source-enrich) AND cross-batch at the write
 *      boundary below, so two pastes in separate messages merge exactly like
 *      two pastes in the same message.
 *   - `patchSourceIngestionAtomic` — RACE-SAFE read+merge+write of ONLY the
 *      `sourceIngestion` subtree (plus the `confirmations.source` reopen flip,
 *      see `reopenOnProposal`) inside a `$transaction`, so a concurrent
 *      applyCardSubmit (which writes the WHOLE state) can't be clobbered.
 *
 * RULES: TS strict, zero `any`, EVERY query filtered by organizationId on the
 * write path. Reads that only need the column (by id/projectId) are read-only and
 * the caller is responsible for the org guard before acting on the result.
 */

import { Prisma } from '@prisma/client'

import { database } from '@/server/services/database'
import {
  parseBuilderState,
  patchBuilderState,
  type BuilderState,
  type DeepPartial,
  type SourceProposal,
  type SourceIngestionItem,
} from '../cards/builder-state'
import { canonicalizeSourceValue } from './url-extractor'

// ---------------------------------------------------------------------------
// Reads (typed — `builderState` is in the generated client)
// ---------------------------------------------------------------------------

/**
 * Read the raw `builderState` JSON for a conversation by id. Returns the stored
 * value (object/null) for `parseBuilderState` to coerce — never throws on
 * null/garbage/partial. NOT org-scoped: the caller must already own the row (or
 * guard the org before acting on the result).
 */
export async function readBuilderStateColumn(
  conversationId: string,
): Promise<unknown> {
  const row = await database.builderProjectConversation.findUnique({
    where: { id: conversationId },
    select: { builderState: true },
  })
  return row?.builderState ?? null
}

/**
 * Read the raw `builderState` JSON for a conversation by projectId (saves a
 * round-trip when the caller already proved org ownership of the project).
 * 1:1 with the conversation (projectId is unique).
 */
export async function readBuilderStateByProject(
  projectId: string,
): Promise<unknown> {
  const row = await database.builderProjectConversation.findUnique({
    where: { projectId },
    select: { builderState: true },
  })
  return row?.builderState ?? null
}

/**
 * Read the fully-resolved `BuilderState` for a conversation, tenant-scoped.
 * Returns `null` when the conversation does not belong to the org (so the caller
 * can short-circuit). On a hit the JSON is always coerced to a valid state.
 */
export async function readBuilderStateForOrg(
  conversationId: string,
  organizationId: string,
): Promise<BuilderState | null> {
  const row = await database.builderProjectConversation.findFirst({
    where: { id: conversationId, organizationId },
    select: { builderState: true },
  })
  if (!row) return null
  return parseBuilderState(row.builderState)
}

// ---------------------------------------------------------------------------
// Writes (org-scoped; the ONE cast to Prisma.InputJsonValue lives here)
// ---------------------------------------------------------------------------

/**
 * Single tenant-filtered write of the whole `builderState`. The `organizationId`
 * is in the WHERE clause so a cross-org id is a no-op (count 0), never a write.
 * Returns the number of rows written (0 = not owned / not found).
 */
export async function writeBuilderState(
  conversationId: string,
  organizationId: string,
  next: BuilderState,
): Promise<number> {
  const { count } = await database.builderProjectConversation.updateMany({
    where: { id: conversationId, organizationId },
    data: { builderState: next as unknown as Prisma.InputJsonValue },
  })
  return count
}

// ---------------------------------------------------------------------------
// sourceIngestion merge (pure)
// ---------------------------------------------------------------------------

/**
 * Merge newly-seeded sources into the existing list, deduped by the CANONICAL
 * value (`canonicalizeSourceValue` — no trailing slash, no tracking params), so
 * "https://acme.com.br" and a legacy-mirrored "https://acme.com.br/" collapse
 * into ONE entry. Last-write-wins so a re-paste refreshes status/sourceId, and
 * every surviving entry carries the canonical `value` (self-heals legacy
 * mirrors written before canonicalization). Order-preserving: existing refs
 * first, then the new ones. Pure — never touches the DB.
 */
export function mergeSources(
  current: BuilderState,
  incoming: SourceIngestionItem[],
): SourceIngestionItem[] {
  const byValue = new Map<string, SourceIngestionItem>()
  for (const item of [...current.sourceIngestion.sources, ...incoming]) {
    const value = canonicalizeSourceValue(item.value)
    byValue.set(value, { ...item, value })
  }
  return [...byValue.values()]
}

// ---------------------------------------------------------------------------
// SourceProposal merge (pure — shared intra-job AND cross-batch)
// ---------------------------------------------------------------------------

/**
 * Merge one proposal into the running aggregate. First non-empty wins for
 * scalar fields (businessName/audience/tone/address/description); list fields
 * union + dedupe (case-insensitive). Pure mutation of the `target` accumulator
 * (caller owns it).
 *
 * This is the SINGLE merge semantic for proposals: the enrich job uses it to
 * fold the sources of ONE batch, and `patchSourceIngestionAtomic` applies it
 * against the ALREADY-PERSISTED `proposed` so a second batch (a link pasted in
 * a later message) never clobbers scalars nor replaces lists wholesale.
 */
export function mergeProposal(
  target: SourceProposal,
  add: SourceProposal,
): void {
  if (!target.businessName && add.businessName) {
    target.businessName = add.businessName
  }
  if (!target.audience && add.audience) target.audience = add.audience
  if (!target.tone && add.tone) target.tone = add.tone
  if (!target.address && add.address) target.address = add.address
  if (!target.description && add.description) {
    target.description = add.description
  }

  if (add.services && add.services.length > 0) {
    target.services = dedupeUnion(target.services, add.services)
  }
  if (add.differentiators && add.differentiators.length > 0) {
    target.differentiators = dedupeUnion(
      target.differentiators,
      add.differentiators,
    )
  }
}

/** Case-insensitive, order-preserving union of two optional string lists. */
export function dedupeUnion(
  base: string[] | undefined,
  extra: string[],
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of [...(base ?? []), ...extra]) {
    const trimmed = v.trim()
    if (trimmed.length === 0) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

/** True when the proposal carries at least one grounded (non-empty) field. */
export function hasAnyProposalField(p: SourceProposal): boolean {
  return Boolean(
    p.businessName ||
      p.audience ||
      p.tone ||
      p.address ||
      p.description ||
      (p.services && p.services.length > 0) ||
      (p.differentiators && p.differentiators.length > 0),
  )
}

// ---------------------------------------------------------------------------
// Atomic sourceIngestion patch (race-safe read+merge+write of the subtree)
// ---------------------------------------------------------------------------

/** Image-catalog mirror of ONE source (Onda D — `imagesStatus`/`imagesCount`). */
export interface SourceImagesMirror {
  imagesStatus: NonNullable<SourceIngestionItem['imagesStatus']>
  /** Persisted-image count; omitted = leave the stored count untouched. */
  imagesCount?: number
}

/** What an atomic `sourceIngestion` patch may change. All optional. */
export interface SourceIngestionPatch {
  /**
   * Status overrides keyed by `KnowledgeSource.id`. Each matching
   * `sources[].sourceId` has its `status` refreshed; unknown ids are ignored.
   */
  statusBySourceId?: ReadonlyMap<string, string>
  /**
   * Image-catalog mirror overrides keyed by `KnowledgeSource.id` (Onda D).
   * Each matching `sources[].sourceId` has its `imagesStatus`/`imagesCount`
   * refreshed; unknown ids are ignored. This is the mirror the source_progress
   * card polls to know when the photo catalog has settled.
   */
  imagesBySourceId?: ReadonlyMap<string, SourceImagesMirror>
  /**
   * New refs to merge into `sources` (deduped by value). Used by the seed path
   * (chat hook / POST ingest) so a concurrent write can't drop earlier sources.
   */
  seedSources?: SourceIngestionItem[]
  /**
   * Synthesized proposal to attach. Only written when present AND non-empty, so
   * a failed/ungrounded batch never clobbers an existing proposal with `{}`.
   * MERGED against the already-persisted `proposed` with the `mergeProposal`
   * semantics (scalars: existing non-empty wins; lists: dedupe union) — a later
   * batch ADDS to the proposal, it never overwrites it.
   */
  proposed?: SourceProposal
  /**
   * When true AND `proposed` carries at least one grounded field AND the
   * CURRENT state has `confirmations.source === true` (the card was already
   * accepted), flip `confirmations.source` back to `false` in the SAME atomic
   * write. The step-engine only resurfaces the `source_progress` card while the
   * confirmation is false — without this flip, a proposal synthesized from a
   * link pasted AFTER the accept would land silently and never be reviewable.
   * Empty/ungrounded batches never reopen (they don't even attach `proposed`).
   */
  reopenOnProposal?: boolean
}

/**
 * Race-safe read-modify-write of ONLY the `sourceIngestion` subtree (plus the
 * single `confirmations.source` reopen flip when `reopenOnProposal` applies),
 * scoped by `organizationId` and wrapped in a `$transaction` so a concurrent
 * applyCardSubmit (which read-modifies-writes the WHOLE state) cannot interleave
 * and clobber confirmations/owned fields written between our read and write.
 *
 * Because the read AND the write happen inside the same serialized transaction,
 * we re-read the freshest state inside it (rather than trusting a stale snapshot
 * the caller may hold) and merge only the sourceIngestion fields onto it — every
 * other subtree (confirmations, persona, services, …) is carried through
 * untouched from whatever the latest committed value is.
 *
 * FAIL-SAFE: returns `false` (never throws) when the conversation isn't owned by
 * the org; ingestion errors are already persisted on `KnowledgeSource` by the
 * caller, so a lost mirror here is non-fatal.
 *
 * @returns `true` when a row was patched, `false` when not owned / not found.
 */
export async function patchSourceIngestionAtomic(
  conversationId: string,
  organizationId: string,
  patch: SourceIngestionPatch,
): Promise<boolean> {
  return database.$transaction(async (tx) => {
    // Re-read the FRESHEST state inside the transaction (org-scoped). Anything a
    // concurrent applyCardSubmit committed before us is included here and will
    // be carried through deepMerge untouched.
    const row = await tx.builderProjectConversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { builderState: true },
    })
    if (!row) return false

    const current = parseBuilderState(row.builderState)

    // Build the next `sources` list: start from current, merge any new seeds
    // (deduped), then refresh statuses by sourceId.
    let sources: SourceIngestionItem[] = current.sourceIngestion.sources
    if (patch.seedSources && patch.seedSources.length > 0) {
      sources = mergeSources(current, patch.seedSources)
    }
    if (patch.statusBySourceId && patch.statusBySourceId.size > 0) {
      const statuses = patch.statusBySourceId
      sources = sources.map((s) => {
        if (!s.sourceId) return s
        const updated = statuses.get(s.sourceId)
        return updated ? { ...s, status: updated } : s
      })
    }
    if (patch.imagesBySourceId && patch.imagesBySourceId.size > 0) {
      const mirrors = patch.imagesBySourceId
      sources = sources.map((s) => {
        if (!s.sourceId) return s
        const mirror = mirrors.get(s.sourceId)
        if (!mirror) return s
        return {
          ...s,
          imagesStatus: mirror.imagesStatus,
          ...(mirror.imagesCount !== undefined
            ? { imagesCount: mirror.imagesCount }
            : {}),
        }
      })
    }

    // Cross-batch proposal merge: fold the incoming proposal ONTO the persisted
    // one with the same semantics the job uses intra-batch (scalars: existing
    // non-empty wins; lists: dedupe union). Empty/ungrounded patches attach
    // nothing, so they can never clobber an existing proposal.
    let proposed: SourceProposal | undefined
    if (patch.proposed && hasAnyProposalField(patch.proposed)) {
      proposed = { ...(current.sourceIngestion.proposed ?? {}) }
      mergeProposal(proposed, patch.proposed)
    }

    // Reopen-on-proposal (opt-in): a grounded proposal landing AFTER the card
    // was accepted flips the confirmation back so the card resurfaces for
    // review. Checked against the FRESHEST in-transaction state (race-safe).
    const reopenSource =
      patch.reopenOnProposal === true &&
      proposed !== undefined &&
      current.confirmations.source === true

    const subtreePatch: DeepPartial<BuilderState> = {
      sourceIngestion: {
        // Arrays are replaced wholesale by patchBuilderState (last-write-wins).
        sources,
        // Only attach `proposed` when grounded fields exist.
        ...(proposed ? { proposed } : {}),
      },
      // deepMerge keeps every other confirmation flag untouched.
      ...(reopenSource ? { confirmations: { source: false } } : {}),
    }

    const next = patchBuilderState(current, subtreePatch)

    await tx.builderProjectConversation.updateMany({
      where: { id: conversationId, organizationId },
      data: { builderState: next as unknown as Prisma.InputJsonValue },
    })
    return true
  })
}
