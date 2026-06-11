/**
 * Integration Builder — builderState `integration` subtree DB access (Wave 2, T21)
 *
 * Single home for the RACE-SAFE read+merge+write of ONLY the `integration`
 * subtree of `BuilderProjectConversation.builderState`. Mirrors the
 * `patchSourceIngestionAtomic` idiom (sources/builder-state-db.ts): re-read the
 * FRESHEST state inside a `$transaction` (org-scoped), deep-merge ONLY the
 * `integration` fields onto it, and write the whole state back with the single
 * `BuilderState → Prisma.InputJsonValue` boundary cast. Because the read AND the
 * write live in the same serialized transaction, a concurrent applyCardSubmit
 * (which read-modifies-writes the WHOLE state) cannot interleave and clobber
 * confirmations / owned fields / the `sourceIngestion` subtree written between
 * our read and write.
 *
 * Keyed by `projectId` (not conversationId): the conversation is 1:1 with the
 * project (`projectId` is unique on `BuilderProjectConversation`), and every
 * Integration Builder caller already proved org ownership of the PROJECT (the
 * POST /integrations route resolves the proposal via `readBuilderStateByProject`).
 * The `projectId` + `organizationId` pair in the WHERE clause makes a cross-org
 * id a no-op (count 0), never a write.
 *
 * 🚨 SECURITY INVARIANT (NFR-03 transparency + credential safety — load-bearing):
 * credential VALUES NEVER pass through this function and are NEVER written to
 * `builderState`. This patch carries ONLY the proposal METADATA
 * (`proposed`: platform/templateSlug/triggerDescription/whatDataSent/sources) and
 * a reference to the draft (`draftIntegrationId`). Real credentials live
 * encrypted in `CustomIntegration.credentials` — see integration.schemas.ts.
 *
 * RULES: TS strict, zero `any`, the org guard is on the write path. The ONLY cast
 * is the canonical JSON write boundary (`BuilderState → Prisma.InputJsonValue`).
 */

import { Prisma } from '@prisma/client'

import { database } from '@/server/services/database'
import {
  parseBuilderState,
  patchBuilderState,
  integrationProposalSchema,
  type DeepPartial,
  type BuilderState,
} from '../cards/builder-state'
import { z } from 'zod'

/**
 * The proposal metadata an integration patch may carry. Derived from the
 * `integrationProposalSchema` exported by builder-state.ts (T06) so the shape
 * stays in lockstep with the canonical state — NO new type is declared here.
 * (`platform`, optional `templateSlug`/`triggerDescription`/`whatDataSent`,
 * optional cited `sources`.) Credential values are NOT part of this shape.
 */
export type IntegrationProposalPatch = z.infer<typeof integrationProposalSchema>

/**
 * What an atomic `integration` patch may change. All optional, mirroring the
 * `integration` subtree shape `{ proposed?, draftIntegrationId? }`. A field left
 * `undefined` is carried through untouched (deepMerge ignores `undefined`), so a
 * `proposed`-only patch never drops an existing `draftIntegrationId` and a
 * `draftIntegrationId`-only patch never drops an existing `proposed`.
 */
export interface IntegrationStatePatch {
  /**
   * Proposal metadata to merge into `integration.proposed`. Deep-merged onto the
   * persisted proposal (deepMerge: scalars/arrays replaced wholesale, `undefined`
   * leaves carried through). NEVER carries credential values.
   */
  proposed?: IntegrationProposalPatch
  /**
   * Reference to the draft integration row (`CustomIntegration.id`). The proposal
   * + this ref are the ONLY things stored in `builderState.integration`.
   */
  draftIntegrationId?: string
}

/**
 * Race-safe read-modify-write of ONLY the `builderState.integration` subtree,
 * scoped by `organizationId` and wrapped in a `$transaction` so a concurrent
 * applyCardSubmit (which read-modifies-writes the WHOLE state) cannot interleave
 * and clobber other subtrees (confirmations, sourceIngestion, persona, …)
 * written between our read and write.
 *
 * The read AND the write happen inside the same serialized transaction: we
 * re-read the freshest state in-tx (rather than trusting a stale snapshot the
 * caller may hold) and deep-merge ONLY the `integration` fields onto it — every
 * other top-level key is carried through untouched from the latest committed
 * value. Within the `integration` subtree the merge is shallow per field
 * (`proposed` / `draftIntegrationId` independently mergeable), so updating one
 * never drops the other.
 *
 * 🚨 Credential VALUES never pass through here (see file header) — only the
 * proposal metadata + `draftIntegrationId`.
 *
 * FAIL-SAFE: returns silently (`void`, no throw) when the project's conversation
 * isn't owned by the org or doesn't exist yet (count 0).
 */
export async function patchIntegrationStateAtomic(args: {
  projectId: string
  organizationId: string
  patch: IntegrationStatePatch
}): Promise<void> {
  const { projectId, organizationId, patch } = args

  await database.$transaction(async (tx) => {
    // Re-read the FRESHEST state inside the transaction (org-scoped). Anything a
    // concurrent applyCardSubmit committed before us is included here and will
    // be carried through deepMerge untouched.
    const row = await tx.builderProjectConversation.findFirst({
      where: { projectId, organizationId },
      select: { builderState: true },
    })
    if (!row) return

    const current = parseBuilderState(row.builderState)

    // Build the `integration` subtree patch. Only the fields PRESENT on `patch`
    // are attached; deepMerge ignores `undefined`, so a proposed-only patch keeps
    // an existing draftIntegrationId and vice-versa. The `proposed` object is
    // deep-merged onto the persisted one (scalars/arrays last-write-wins).
    const integrationPatch: NonNullable<DeepPartial<BuilderState>['integration']> = {
      ...(patch.proposed !== undefined ? { proposed: patch.proposed } : {}),
      ...(patch.draftIntegrationId !== undefined
        ? { draftIntegrationId: patch.draftIntegrationId }
        : {}),
    }

    // Nothing to write (empty patch): no-op rather than a redundant write.
    if (Object.keys(integrationPatch).length === 0) return

    const subtreePatch: DeepPartial<BuilderState> = {
      integration: integrationPatch,
    }

    const next = patchBuilderState(current, subtreePatch)

    await tx.builderProjectConversation.updateMany({
      where: { projectId, organizationId },
      data: { builderState: next as unknown as Prisma.InputJsonValue },
    })
  })
}
