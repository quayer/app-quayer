/**
 * Builder Module — Source-enrich JOB HANDLER (Orayon Uplift, W4 source-ingestion)
 *
 * The ASYNC worker body for the `quayer:source-enrich` queue. Given a set of
 * already-created `KnowledgeSource` ids (one per pasted site/IG), for EACH source:
 *   1. `ingestSource()` — extract → chunk → embed → pgvector (RAG). Reused as-is;
 *      it now also returns the raw `extractedText` so we synthesize from the SAME
 *      fetch (no second network round-trip, no re-entry into the SSRF guard).
 *   2. LLM synthesis (source-synthesis.prompt + the niche-researcher
 *      `runLLMSubAgent` pattern + BYOK org-key resolution) → a `SourceProposal`
 *      `{ businessName, services[], audience, differentiators[], tone }`.
 * Then it PATCHes `builderState.sourceIngestion.proposed` (PROPOSED values only —
 * never owned fields, never `*_confirmed` sentinels) and updates each source's
 * `builderState.sourceIngestion.sources[].status`, all scoped by `organizationId`.
 *
 * ANTI-HALLUCINATION: synthesis writes ONLY `proposed`. The owned builderState
 * fields + `confirmations.source` flip ONLY when the user clicks "Aceitar" on the
 * `source_progress` card (handled in apply-card-submit.ts, a different agent).
 *
 * FAIL-SAFE (mirrors session-close.job): NEVER throws. Per-source ingestion
 * errors are already persisted to `KnowledgeSource.error`/`status` by
 * `ingestSource`; we mirror that status into builderState and keep going.
 * Synthesis failures degrade gracefully (the source stays `ready` for RAG, just
 * no proposed fields from it). The aggregate result is always returned.
 *
 * Runs ON THE WORKER, never inline in the SSE turn (see source-enrich.queue.ts).
 *
 * Exported handler: `runSourceEnrich` — MUST match the symbol that
 * `source-enrich.queue.ts` lazy-imports (`RunSourceEnrich` contract).
 *
 * Contract: docs/builder/ORAYON_UPLIFT_SPEC.md (§5 source-ingestion + decisions).
 */

import { database } from '@/server/services/database'
import { ingestSource } from '@/server/ai-module/ai-agents/knowledge/knowledge-ingestion.service'
import { runLLMSubAgent } from '../sub-agents/base'
import type { SubAgentContext } from '../sub-agents/types'
import type { SourceProposal } from '../cards/builder-state'
import { patchSourceIngestionAtomic } from './builder-state-db'
import {
  SOURCE_SYNTHESIS_SYSTEM,
  SOURCE_TEXT_MIN_CHARS,
  buildSourceSynthesisUserMessage,
  parseSourceSynthesisJSON,
  type SourceSynthesisInput,
} from './source-synthesis.prompt'
import type {
  SourceEnrichJobPayload,
  SourceEnrichResult,
} from '@/server/services/jobs/source-enrich.queue'

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/** Synthesis sampling — low temp for faithful extraction (matches niche-researcher). */
const SYNTHESIS_TEMPERATURE = 0.2
/** Hard cap on the synthesis output. Proposals are small; ~1500 is generous. */
const SYNTHESIS_MAX_TOKENS = 1500
/** Per-source synthesis timeout (ms). The whole job is async — be patient but bounded. */
const SYNTHESIS_TIMEOUT_MS = 25_000

// Hosts treated as Instagram (mirrors url-extractor / text-extraction). We only
// use this to pick the synthesis copy ('perfil de Instagram' vs 'site'); the
// fetch path itself is identical (instagram.com is just a guarded URL fetch).
const INSTAGRAM_HOSTS: ReadonlySet<string> = new Set([
  'instagram.com',
  'www.instagram.com',
])

// ---------------------------------------------------------------------------
// Per-source result
// ---------------------------------------------------------------------------

/** Outcome of enriching ONE source (ingestion + optional synthesis). */
export interface EnrichSourceResult {
  sourceId: string
  /** Final ingestion status mirrored into builderState. */
  status: 'ready' | 'error'
  /** Proposal synthesized from this source (undefined when ungrounded/failed). */
  proposal?: SourceProposal
  /** First error encountered (ingestion or synthesis), for logging only. */
  error?: string
}

// ---------------------------------------------------------------------------
// enrichSource — single source (ingest + synthesize). NEVER throws.
// ---------------------------------------------------------------------------

/**
 * Enrich a SINGLE source: ingest into RAG, then synthesize a proposal from the
 * extracted text. Fail-safe — any failure is captured into the returned result
 * (and persisted to `KnowledgeSource.error` by `ingestSource`), never thrown.
 *
 * @param sourceId        KnowledgeSource id (already created, org-owned).
 * @param conversationId  BuilderProjectConversation id (synthesis ctx + later PATCH).
 * @param organizationId  Tenant boundary — passed to `ingestSource` as
 *                        `expectedOrganizationId` and to the LLM context.
 * @param userId          For BYOK org-key resolution (credentialResolver).
 * @param projectId       For BYOK org-key resolution (credentialResolver).
 */
export async function enrichSource(
  sourceId: string,
  conversationId: string,
  organizationId: string,
  userId: string,
  projectId: string,
): Promise<EnrichSourceResult> {
  // 1. Ingest into RAG. ingestSource is itself fail-safe: it marks the source
  //    ready|error and persists the error — it only throws when the source/table
  //    is missing, which we catch here so the job never dies.
  let ingest: Awaited<ReturnType<typeof ingestSource>>
  try {
    ingest = await ingestSource(sourceId, {
      expectedOrganizationId: organizationId,
    })
  } catch (err) {
    const message = errorMessage(err)
    console.error(
      '[source-enrich.job] ingestSource threw for source',
      sourceId,
      message,
    )
    return { sourceId, status: 'error', error: message }
  }

  if (ingest.status === 'error') {
    // Error already persisted to KnowledgeSource by ingestSource.
    return { sourceId, status: 'error', error: ingest.error }
  }

  // 2. Synthesize a proposal from the SAME extracted text (no re-fetch).
  const text = ingest.extractedText ?? ''
  if (text.replace(/\s/g, '').length < SOURCE_TEXT_MIN_CHARS) {
    // Too thin to ground anything — the source is in RAG; just no proposal.
    return { sourceId, status: 'ready' }
  }

  const sourceValue = await resolveSourceValue(sourceId, organizationId)
  const synthInput: SourceSynthesisInput = {
    value: sourceValue,
    type: instagramHostFromValue(sourceValue) ? 'instagram' : 'url',
    text,
  }

  const ctx: SubAgentContext = { organizationId, userId, projectId }

  const llm = await runLLMSubAgent(
    {
      systemPrompt: SOURCE_SYNTHESIS_SYSTEM,
      userMessage: buildSourceSynthesisUserMessage(synthInput),
      temperature: SYNTHESIS_TEMPERATURE,
      maxOutputTokens: SYNTHESIS_MAX_TOKENS,
      timeoutMs: SYNTHESIS_TIMEOUT_MS,
    },
    ctx,
  )

  if (!llm.success) {
    // Graceful degradation — the source is ingested (RAG works); we just have
    // no proposed fields from it. Not an ingestion error.
    console.warn(
      '[source-enrich.job] synthesis failed for source',
      sourceId,
      `(conversation ${conversationId})`,
      llm.error,
    )
    return { sourceId, status: 'ready', error: llm.error }
  }

  const parsed = parseSourceSynthesisJSON(llm.data.text)
  if (!parsed.ok) {
    console.warn(
      '[source-enrich.job] could not parse synthesis JSON for source',
      sourceId,
      parsed.message,
    )
    return { sourceId, status: 'ready', error: parsed.message }
  }

  // `ungrounded` (no fields) is a VALID answer — return ready with no proposal.
  if (parsed.ungrounded) {
    return { sourceId, status: 'ready' }
  }

  return { sourceId, status: 'ready', proposal: parsed.value }
}

// ---------------------------------------------------------------------------
// runSourceEnrich — the queue HANDLER. NEVER throws.
// ---------------------------------------------------------------------------

/**
 * Process a full enrich job: enrich every source, merge the proposals, and PATCH
 * `builderState.sourceIngestion.{proposed,sources[].status}` once, org-scoped.
 *
 * Matches the `RunSourceEnrich` contract from source-enrich.queue.ts so the
 * worker (and the dev sync fallback) can call it directly.
 */
export async function runSourceEnrich(
  payload: SourceEnrichJobPayload,
): Promise<SourceEnrichResult> {
  const { organizationId, userId, projectId, conversationId, sourceIds } =
    payload

  let processed = 0
  let ingested = 0
  let errors = 0

  // Accumulate per-source outcomes; merge into one proposal at the end.
  const merged: SourceProposal = {}
  const statusBySourceId = new Map<string, 'ready' | 'error'>()

  for (const sourceId of sourceIds) {
    processed += 1
    let outcome: EnrichSourceResult
    try {
      outcome = await enrichSource(
        sourceId,
        conversationId,
        organizationId,
        userId,
        projectId,
      )
    } catch (err) {
      // enrichSource is fail-safe, but stay defensive: one bad source must not
      // abort the batch.
      console.error(
        '[source-enrich.job] unexpected error enriching source',
        sourceId,
        errorMessage(err),
      )
      outcome = { sourceId, status: 'error', error: errorMessage(err) }
    }

    statusBySourceId.set(sourceId, outcome.status)
    if (outcome.status === 'ready') ingested += 1
    else errors += 1

    if (outcome.proposal) mergeProposal(merged, outcome.proposal)
  }

  const proposalWritten = hasAnyProposalField(merged)

  // Single org-scoped PATCH of the conversation's builderState. Fail-safe — a
  // failure here only loses the proposal/status mirror, never the ingestion
  // (which is already persisted in pgvector + KnowledgeSource).
  try {
    await patchSourceIngestion(
      conversationId,
      organizationId,
      proposalWritten ? merged : undefined,
      statusBySourceId,
    )
  } catch (err) {
    console.error(
      '[source-enrich.job] failed to PATCH builderState.sourceIngestion',
      conversationId,
      errorMessage(err),
    )
  }

  return { processed, ingested, errors, proposalWritten }
}

// ---------------------------------------------------------------------------
// Proposal merge (PROPOSED-only; pure)
// ---------------------------------------------------------------------------

/**
 * Merge one source's proposal into the running aggregate. First non-empty wins
 * for scalar fields (businessName/audience/tone); list fields union + dedupe.
 * Pure mutation of the `target` accumulator (caller owns it).
 */
function mergeProposal(target: SourceProposal, add: SourceProposal): void {
  if (!target.businessName && add.businessName) {
    target.businessName = add.businessName
  }
  if (!target.audience && add.audience) target.audience = add.audience
  if (!target.tone && add.tone) target.tone = add.tone

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
function dedupeUnion(
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

function hasAnyProposalField(p: SourceProposal): boolean {
  return Boolean(
    p.businessName ||
      p.audience ||
      p.tone ||
      (p.services && p.services.length > 0) ||
      (p.differentiators && p.differentiators.length > 0),
  )
}

// ---------------------------------------------------------------------------
// builderState PATCH (org-scoped; race-safe via builder-state-db atomic patch)
// ---------------------------------------------------------------------------

/**
 * Deep-merge the new `proposed` + per-source `status` into the conversation's
 * `builderState.sourceIngestion`, scoped by `organizationId`.
 *
 * RACE-SAFE: delegates to `patchSourceIngestionAtomic`, which reads+merges+writes
 * inside a `$transaction` and touches ONLY the `sourceIngestion` subtree. This
 * prevents the previous read-modify-write of the WHOLE state from clobbering a
 * concurrent applyCardSubmit's confirmations/owned fields (LOW #20/#22).
 *
 * Writes ONLY `sourceIngestion` (proposed + sources[].status). Owned fields and
 * `confirmations.source` are NEVER touched here — those flip on "Aceitar".
 */
async function patchSourceIngestion(
  conversationId: string,
  organizationId: string,
  proposed: SourceProposal | undefined,
  statusBySourceId: Map<string, 'ready' | 'error'>,
): Promise<void> {
  const patched = await patchSourceIngestionAtomic(
    conversationId,
    organizationId,
    {
      statusBySourceId,
      // Only attach `proposed` when we actually have grounded fields, so a
      // failed/ungrounded batch never clobbers an existing proposal with {}.
      ...(proposed ? { proposed } : {}),
    },
  )
  if (!patched) {
    console.warn(
      '[source-enrich.job] conversation not found for org (skipped PATCH)',
      conversationId,
    )
  }
}

// ---------------------------------------------------------------------------
// Source value resolution (org-scoped)
// ---------------------------------------------------------------------------

/**
 * Resolve the source's URL/handle (`KnowledgeSource.source`) for synthesis copy.
 * Org-scoped — never reads a source from another tenant. Returns '' if missing
 * (the synthesis still runs on the text; only the label is generic).
 */
async function resolveSourceValue(
  sourceId: string,
  organizationId: string,
): Promise<string> {
  const row = await database.knowledgeSource.findFirst({
    where: { id: sourceId, organizationId },
    select: { source: true },
  })
  return row?.source ?? ''
}

/** True when a source value points at an Instagram host (best-effort parse). */
function instagramHostFromValue(value: string): boolean {
  if (!value) return false
  try {
    const host = new URL(value).hostname.toLowerCase()
    return INSTAGRAM_HOSTS.has(host)
  } catch {
    // Bare "instagram.com/acme" without scheme.
    return /(^|\.)instagram\.com\//i.test(value)
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
