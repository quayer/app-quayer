/**
 * Builder Module — Source-enrich JOB HANDLER (Orayon Uplift, W4 source-ingestion)
 *
 * The ASYNC worker body for the `quayer:source-enrich` queue. Given a set of
 * already-created `KnowledgeSource` ids (one per pasted site/IG), every source is
 * enriched CONCURRENTLY (fan-out capped at `SOURCE_ENRICH_CONCURRENCY`), and per
 * source the work is itself parallel — a single FETCH (the floor) then THREE
 * mutually-independent steps via `Promise.allSettled` (all consume the SAME
 * fetched text/HTML; see specs/source-ingestion-parallel/plan.md):
 *   1. embed + persist chunks → pgvector (RAG) — `embedAndPersistSource`.
 *   2. LLM synthesis (source-synthesis.prompt + the niche-researcher
 *      `runLLMSubAgent` pattern + BYOK org-key resolution) → a `SourceProposal`
 *      `{ businessName, services[], audience, differentiators[], tone, address, description }`.
 *   3. Onda D image extraction (website-first; gated/fail-open).
 * Each source PATCHes `builderState.sourceIngestion` INCREMENTALLY the instant it
 * settles: its `sources[].status` + images mirror, plus its `proposed` (PROPOSED
 * values only — never owned fields, never `*_confirmed` sentinels) as soon as a
 * grounded synthesis lands, all scoped by `organizationId`. The card (poll 2s)
 * sees real progress and the user can "Aceitar" the moment a proposal exists.
 *
 * ANTI-HALLUCINATION: synthesis writes ONLY `proposed`. The owned builderState
 * fields + `confirmations.source` flip to TRUE only when the user clicks
 * "Aceitar" on the `source_progress` card (apply-card-submit.ts, a different
 * agent). The ONE exception in the other direction: when a NON-EMPTY proposal
 * lands AFTER an accept (link pasted post-accept), the atomic patch flips
 * `confirmations.source` back to FALSE (`reopenOnProposal`) so the card
 * resurfaces for review instead of the proposal landing silently. Cross-source
 * AND cross-batch, the persisted `proposed` is MERGED (first-wins scalars / union
 * lists — `mergeProposal` at the write boundary), never overwritten, so the N
 * concurrent per-source PATCHes are safe by construction.
 *
 * FAIL-SAFE (mirrors session-close.job): NEVER throws. The fetch + embed/persist
 * seam (`fetchSource`/`embedAndPersistSource`) persists per-source errors to
 * `KnowledgeSource.error`/`status`; we mirror that status into builderState and
 * keep going. Synthesis/image failures degrade gracefully (the source stays
 * `ready` for RAG, just no proposed fields/images from it) — `allSettled` ensures
 * one step's failure never sinks the others. The aggregate result is always
 * returned, and `enrichSource` itself never throws (so the `Promise.all` fan-out
 * can't be sunk by one bad source).
 *
 * Runs ON THE WORKER, never inline in the SSE turn (see source-enrich.queue.ts).
 *
 * Exported handler: `runSourceEnrich` — MUST match the symbol that
 * `source-enrich.queue.ts` lazy-imports (`RunSourceEnrich` contract).
 *
 * Contract: docs/builder/ORAYON_UPLIFT_SPEC.md (§5 source-ingestion + decisions).
 */

import pLimit from 'p-limit'

import { database } from '@/server/services/database'
import { logger } from '@/server/services/logger'
import {
  fetchSource,
  embedAndPersistSource,
  type FetchSourceResult,
} from '@/server/ai-module/ai-agents/knowledge/knowledge-ingestion.service'
import { runLLMSubAgent } from '../sub-agents/base'
import type { SubAgentContext } from '../sub-agents/types'
import type { SourceProposal } from '../cards/builder-state'
import {
  hasAnyProposalField,
  patchSourceIngestionAtomic,
  type SourceImagesMirror,
  type SourceSynthesisMirror,
} from './builder-state-db'
import { extractImagesForSource } from './image-pipeline'
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
const SYNTHESIS_TIMEOUT_MS = 45_000
/** One retry for transient LLM/parse failures (initial attempt + one retry). */
const SYNTHESIS_MAX_ATTEMPTS = 2

/**
 * Quantas fontes enriquecemos EM PARALELO no mesmo job (S03/M1 fan-out). Para 1
 * URL é no-op; para N fontes corta ~N× o wall-clock. Capado em 5 para não
 * estourar rate-limit do provider LLM/embedding em picos (o retry×3 da fila
 * cobre falhas transitórias) — ver specs/source-ingestion-parallel/plan.md §M1.
 */
const SOURCE_ENRICH_CONCURRENCY = 5

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
  /** Per-source synthesis outcome, independent from the RAG ingestion status. */
  synthesis: SourceSynthesisMirror
  /**
   * Image-catalog outcome mirrored into builderState (Onda D). ALWAYS present so
   * every source seeded with `imagesStatus:'pending'` settles (ready|error) —
   * including the gated paths (no html / imagesEnabled=false / ingest error),
   * otherwise the card's images poll would spin forever.
   */
  images: SourceImagesMirror
  /** First error encountered (ingestion or synthesis), for logging only. */
  error?: string
}

// ---------------------------------------------------------------------------
// enrichSource — single source (ingest + synthesize). NEVER throws.
// ---------------------------------------------------------------------------

/**
 * Enrich a SINGLE source. Fail-safe — any failure is captured into the returned
 * result (and persisted to `KnowledgeSource.error` by the ingestion seam), NEVER
 * thrown (so `Promise.all` over sources can't be sunk by one bad source).
 *
 * STRUCTURE (S02/M1 intra-source concurrency — see specs/source-ingestion-parallel):
 *   1. FETCH (await, sequential — it's the floor: one page over the network).
 *   2. The THREE post-fetch steps run CONCURRENTLY via `Promise.allSettled`, as
 *      they're mutually independent (all consume the SAME fetched text/HTML,
 *      none depends on another's output):
 *        a. embed + persist chunks into pgvector (RAG);
 *        b. LLM synthesis of the proposal;
 *        c. Onda D image extraction (website-first; gated/short-circuits).
 *      `allSettled` (not `all`) so one step's failure never sinks the others —
 *      the per-step fail-open behavior is preserved (each step swallows its own
 *      error into its branch of the result). Wall-clock per source goes from
 *      `fetch + embed + synth` to `fetch + max(embed, synth, images)`.
 *
 * @param sourceId        KnowledgeSource id (already created, org-owned).
 * @param conversationId  BuilderProjectConversation id (synthesis ctx + PATCH).
 * @param organizationId  Tenant boundary — passed to `fetchSource` as
 *                        `expectedOrganizationId` and to the LLM context.
 * @param userId          For BYOK org-key resolution (credentialResolver).
 * @param projectId       For BYOK org-key resolution (credentialResolver).
 * @param traceId         Correlation id (from the BullMQ carrier) for the timer log.
 */
export async function enrichSource(
  sourceId: string,
  conversationId: string,
  organizationId: string,
  userId: string,
  projectId: string,
  traceId?: string,
): Promise<EnrichSourceResult> {
  const t0 = Date.now()

  // ── ETAPA 1 — FETCH (sequencial; piso do wall-clock). fetchSource é fail-safe:
  //    uma falha de fetch já marca status=error na fonte; só relança fonte
  //    ausente/cross-org (que devem matar a fonte deste lote, nunca o job).
  let fetched: FetchSourceResult
  try {
    fetched = await fetchSource(sourceId, {
      expectedOrganizationId: organizationId,
    })
  } catch (err) {
    const message = errorMessage(err)
    logger.warn('[source-enrich.job] fetch failed for source', {
      traceId,
      sourceId,
      error: message,
    })
    logStepTimings(traceId, sourceId, {
      fetchMs: Date.now() - t0,
      embedMs: 0,
      synthMs: 0,
      imagesMs: 0,
      totalMs: Date.now() - t0,
    })
    return {
      sourceId,
      status: 'error',
      images: { imagesStatus: 'error', imagesCount: 0 },
      synthesis: {
        synthesisStatus: 'error',
        synthesisError: 'Não consegui ler a fonte para organizar as informações.',
      },
      error: message,
    }
  }
  const fetchMs = Date.now() - t0

  // Resolve source metadata ONCE (org-scoped) — reused by the image hook and the
  // synthesis copy (single query for both). Cheap; kept before the fan-out.
  const meta = await resolveSourceMeta(sourceId, organizationId)
  const text = fetched.text
  const grounded = text.replace(/\s/g, '').length >= SOURCE_TEXT_MIN_CHARS

  // ── ETAPA 2 — as TRÊS etapas pós-fetch EM PARALELO (allSettled, fail-open por
  //    etapa). Cada step retorna seu próprio resultado tipado; nenhuma lança.
  const embedStart = Date.now()
  let embedMs = 0
  let synthMs = 0
  let imagesMs = 0

  const [embedSettled, synthSettled, imagesSettled] = await Promise.allSettled([
    // (a) embed + persist — etapa 2 isolada de ingestSource. Fail-safe: devolve
    //     {status:'error'} em vez de lançar; marca a fonte error internamente.
    embedAndPersistSource(fetched.source, text).finally(() => {
      embedMs = Date.now() - embedStart
    }),
    // (b) síntese — SÓ quando há texto aterrável (caso contrário pula sem custo
    //     de LLM). Devolve a proposta (ou undefined p/ ungrounded/falha).
    synthesizeProposal({
      sourceId,
      conversationId,
      meta,
      text,
      grounded,
      ctx: { organizationId, userId, projectId },
      traceId,
    }).finally(() => {
      synthMs = Date.now() - embedStart
    }),
    // (c) Onda D — extração de imagens (website-first; FAIL-OPEN ABSOLUTO). NÃO
    //     depende do texto (imagens != texto). Gate: só sites (`type==='url'`;
    //     NÃO instagram) e `imagesEnabled`. O pipeline já é fail-open e
    //     short-circuita sem storage/imagesEnabled; o espelho SEMPRE settla
    //     (caminhos gateados reportam ready com 0) para o poll do card parar.
    extractImagesMirror({
      sourceId,
      meta,
      organizationId,
      userId,
      projectId,
      html: fetched.extractedHtml,
      traceId,
    }).finally(() => {
      imagesMs = Date.now() - embedStart
    }),
  ])

  // allSettled NUNCA rejeita; mas as branches são fail-open por construção
  // (cada uma resolve um valor de erro). Defensivo: um rejected improvável
  // (bug interno) vira o pior caso da etapa, sem derrubar enrichSource.
  const embed: { status: 'ready' | 'error'; error?: string } =
    embedSettled.status === 'fulfilled'
      ? embedSettled.value
      : { status: 'error', error: errorMessage(embedSettled.reason) }
  const synthesis: SynthesisOutcome =
    synthSettled.status === 'fulfilled'
      ? synthSettled.value
      : synthesisErrorOutcome(errorMessage(synthSettled.reason))
  const proposal = synthesis.proposal
  const images: SourceImagesMirror =
    imagesSettled.status === 'fulfilled'
      ? imagesSettled.value
      : { imagesStatus: 'error', imagesCount: 0 }

  logStepTimings(traceId, sourceId, {
    fetchMs,
    embedMs,
    synthMs,
    imagesMs,
    totalMs: Date.now() - t0,
  })

  // O status da FONTE é o da ingestão RAG (embed/persist). Síntese/imagens são
  // best-effort: falham fail-open sem mudar o status (espelha o comportamento
  // serial anterior, onde só ingestSource decidia ready|error).
  return {
    sourceId,
    status: embed.status,
    images,
    synthesis: synthesis.mirror,
    ...(proposal ? { proposal } : {}),
    ...(embed.error ? { error: embed.error } : {}),
  }
}

// ---------------------------------------------------------------------------
// Post-fetch steps (each NEVER throws — fail-open per step)
// ---------------------------------------------------------------------------

/** Args do passo de síntese (etapa 2b). */
interface SynthesizeArgs {
  sourceId: string
  conversationId: string
  meta: SourceMeta
  text: string
  /** Já calculado pelo caller (texto >= SOURCE_TEXT_MIN_CHARS sem espaços). */
  grounded: boolean
  ctx: SubAgentContext
  traceId?: string
}

interface SynthesisOutcome {
  proposal?: SourceProposal
  mirror: SourceSynthesisMirror
}

/**
 * Síntese do proposal a partir do MESMO texto extraído (sem re-fetch). NUNCA
 * lança — falha/parse-error/ungrounded vira `synthesisStatus:'error'` para o
 * poll expor uma saída de retry sem transformar isso em erro de RAG.
 */
async function synthesizeProposal(
  args: SynthesizeArgs,
): Promise<SynthesisOutcome> {
  const { sourceId, conversationId, meta, text, grounded, ctx, traceId } = args
  if (!grounded) {
    return synthesisErrorOutcome(
      'Texto insuficiente para organizar informações do negócio.',
    )
  }

  const synthInput: SourceSynthesisInput = {
    value: meta.value,
    type: instagramHostFromValue(meta.value) ? 'instagram' : 'url',
    text,
  }

  let lastError = 'Falha desconhecida na síntese.'
  for (let attempt = 1; attempt <= SYNTHESIS_MAX_ATTEMPTS; attempt += 1) {
    let llm: Awaited<ReturnType<typeof runLLMSubAgent>>
    try {
      llm = await runLLMSubAgent(
        {
          systemPrompt: SOURCE_SYNTHESIS_SYSTEM,
          userMessage: buildSourceSynthesisUserMessage(synthInput),
          temperature: SYNTHESIS_TEMPERATURE,
          maxOutputTokens: SYNTHESIS_MAX_TOKENS,
          timeoutMs: SYNTHESIS_TIMEOUT_MS,
        },
        ctx,
      )
    } catch (err) {
      lastError = errorMessage(err)
      logger.warn('[source-enrich.job] synthesis threw (retryable)', {
        traceId,
        sourceId,
        attempt,
        error: lastError,
      })
      continue
    }

    if (!llm.success) {
      lastError = llm.error
      logger.warn('[source-enrich.job] synthesis failed for source', {
        traceId,
        sourceId,
        conversationId,
        attempt,
        error: llm.error,
      })
      continue
    }

    const parsed = parseSourceSynthesisJSON(llm.data.text)
    if (!parsed.ok) {
      lastError = parsed.message
      logger.warn('[source-enrich.job] could not parse synthesis JSON', {
        traceId,
        sourceId,
        attempt,
        error: parsed.message,
      })
      continue
    }

    if (parsed.ungrounded) {
      return synthesisErrorOutcome(
        'Li o conteúdo, mas não encontrei campos do negócio para propor.',
      )
    }

    return {
      proposal: parsed.value,
      mirror: { synthesisStatus: 'ready', synthesisError: '' },
    }
  }

  return synthesisErrorOutcome(lastError)
}

function synthesisErrorOutcome(message: string): SynthesisOutcome {
  return {
    mirror: {
      synthesisStatus: 'error',
      synthesisError: message.slice(0, 500),
    },
  }
}

/** Args do passo de extração de imagens (etapa 2c). */
interface ExtractImagesArgs {
  sourceId: string
  meta: SourceMeta
  organizationId: string
  userId: string
  projectId: string
  /** HTML cru do MESMO fetch ('' quando não é site servindo HTML). */
  html: string
  traceId?: string
}

/**
 * Onda D — extração de imagens (website-first; FAIL-OPEN ABSOLUTO). NUNCA lança:
 * qualquer falha vira `imagesStatus:'error'`. Caminhos gateados (sem html /
 * instagram / opt-out / sem storage) reportam `ready` com 0 para o poll do card
 * parar. O espelho SEMPRE settla.
 */
async function extractImagesMirror(
  args: ExtractImagesArgs,
): Promise<SourceImagesMirror> {
  const { sourceId, meta, organizationId, userId, projectId, html, traceId } =
    args
  if (!(html.length > 0 && meta.type === 'url' && meta.imagesEnabled)) {
    return { imagesStatus: 'ready', imagesCount: 0 }
  }
  try {
    const imagesResult = await extractImagesForSource({
      sourceId,
      collectionId: meta.collectionId,
      organizationId,
      userId,
      projectId,
      html,
      baseUrl: meta.value,
      awaitCaptions: false,
    })
    return { imagesStatus: 'ready', imagesCount: imagesResult.persisted }
  } catch (err) {
    logger.warn('[source-enrich.job] image extraction failed (fail-open)', {
      traceId,
      sourceId,
      error: errorMessage(err),
    })
    return { imagesStatus: 'error', imagesCount: 0 }
  }
}

// ---------------------------------------------------------------------------
// Step timers (S01/M4 — observability; one structured line per source)
// ---------------------------------------------------------------------------

interface StepTimings {
  fetchMs: number
  embedMs: number
  synthMs: number
  imagesMs: number
  totalMs: number
}

/** Log estruturado com os deltas de cada etapa (sem URLs/segredos). */
function logStepTimings(
  traceId: string | undefined,
  sourceId: string,
  timings: StepTimings,
): void {
  logger.info('[source-enrich.job] step timings', {
    traceId,
    sourceId,
    ...timings,
  })
}

// ---------------------------------------------------------------------------
// runSourceEnrich — the queue HANDLER. NEVER throws.
// ---------------------------------------------------------------------------

/**
 * Process a full enrich job: enrich every source CONCURRENTLY (fan-out, capped at
 * `SOURCE_ENRICH_CONCURRENCY`) and PATCH the conversation's
 * `builderState.sourceIngestion` INCREMENTALLY — each source's status/images
 * mirror + its grounded `proposed` are written via the race-safe atomic patch AS
 * SOON AS that source settles. The card (poll 2s) reflects real progress and the
 * user can "Aceitar" the moment a proposal exists (S03/S04 — M1/M3).
 *
 * Matches the `RunSourceEnrich` contract from source-enrich.queue.ts so the
 * worker (and the dev sync fallback) can call it directly. The `traceId` (from
 * the BullMQ carrier) is threaded into the per-source step-timing logs.
 */
export async function runSourceEnrich(
  payload: SourceEnrichJobPayload,
  traceId?: string,
): Promise<SourceEnrichResult> {
  const { organizationId, userId, projectId, conversationId, sourceIds } =
    payload

  if (payload.mode === 'synthesis_retry') {
    return runSourceSynthesisRetry(payload, traceId)
  }

  const limit = pLimit(SOURCE_ENRICH_CONCURRENCY)

  // S03 — fan out: each source is enriched under the concurrency limiter and, AS
  // IT SETTLES, patches ITS OWN slice of builderState (S04 incremental). The
  // atomic patch is race-safe (read+merge+write of the subtree) AND its merge is
  // first-wins/union, so N concurrent calls are safe by construction. enrichSource
  // never throws, so Promise.all can't be sunk by one bad source.
  const outcomes = await Promise.all(
    sourceIds.map((sourceId) =>
      limit(async () => {
        await patchSourceSynthesisMirror(
          conversationId,
          organizationId,
          sourceId,
          { synthesisStatus: 'running', synthesisError: '' },
          traceId,
        )

        const outcome = await enrichSource(
          sourceId,
          conversationId,
          organizationId,
          userId,
          projectId,
          traceId,
        )

        // S04 — incremental PATCH the instant this source settles: its status +
        // images mirror, and (only when grounded) its proposal. Fail-safe — a
        // lost mirror never loses the ingestion (persisted in pgvector +
        // KnowledgeSource); the merge is first-wins so this never clobbers a
        // proposal an earlier source already wrote.
        const proposal =
          outcome.proposal && hasAnyProposalField(outcome.proposal)
            ? outcome.proposal
            : undefined
        try {
          await patchSourceIngestion(
            conversationId,
            organizationId,
            proposal,
            new Map<string, 'ready' | 'error'>([
              [sourceId, outcome.status],
            ]),
            new Map<string, SourceImagesMirror>([[sourceId, outcome.images]]),
            new Map<string, SourceSynthesisMirror>([
              [sourceId, outcome.synthesis],
            ]),
          )
        } catch (err) {
          logger.error(
            '[source-enrich.job] failed to PATCH builderState.sourceIngestion',
            { traceId, conversationId, sourceId, error: errorMessage(err) },
          )
        }

        return outcome
      }),
    ),
  )

  // Reduce the resolved outcomes into the aggregate result (no racy mid-loop
  // mutation — collect then fold).
  let ingested = 0
  let errors = 0
  let proposalWritten = false
  for (const outcome of outcomes) {
    if (outcome.status === 'ready') ingested += 1
    else errors += 1
    if (outcome.proposal && hasAnyProposalField(outcome.proposal)) {
      proposalWritten = true
    }
  }

  return { processed: outcomes.length, ingested, errors, proposalWritten }
}

async function runSourceSynthesisRetry(
  payload: SourceEnrichJobPayload,
  traceId?: string,
): Promise<SourceEnrichResult> {
  const { organizationId, userId, projectId, conversationId, sourceIds } =
    payload

  const outcomes = await Promise.all(
    sourceIds.map(async (sourceId) => {
      await patchSourceSynthesisMirror(
        conversationId,
        organizationId,
        sourceId,
        { synthesisStatus: 'running', synthesisError: '' },
        traceId,
      )

      const outcome = await synthesizeFromPersistedChunks({
        sourceId,
        conversationId,
        organizationId,
        userId,
        projectId,
        traceId,
      })

      const proposal =
        outcome.proposal && hasAnyProposalField(outcome.proposal)
          ? outcome.proposal
          : undefined

      try {
        await patchSourceIngestion(
          conversationId,
          organizationId,
          proposal,
          new Map<string, 'ready' | 'error'>(),
          new Map<string, SourceImagesMirror>(),
          new Map<string, SourceSynthesisMirror>([
            [sourceId, outcome.synthesis],
          ]),
        )
      } catch (err) {
        logger.error(
          '[source-enrich.job] failed to PATCH synthesis retry result',
          { traceId, conversationId, sourceId, error: errorMessage(err) },
        )
      }

      return outcome
    }),
  )

  let errors = 0
  let proposalWritten = false
  for (const outcome of outcomes) {
    if (outcome.synthesis.synthesisStatus === 'error') errors += 1
    if (outcome.proposal && hasAnyProposalField(outcome.proposal)) {
      proposalWritten = true
    }
  }

  return {
    processed: outcomes.length,
    ingested: outcomes.length - errors,
    errors,
    proposalWritten,
  }
}

interface PersistedSynthesisArgs {
  sourceId: string
  conversationId: string
  organizationId: string
  userId: string
  projectId: string
  traceId?: string
}

interface PersistedSynthesisOutcome {
  sourceId: string
  proposal?: SourceProposal
  synthesis: SourceSynthesisMirror
}

async function synthesizeFromPersistedChunks(
  args: PersistedSynthesisArgs,
): Promise<PersistedSynthesisOutcome> {
  const {
    sourceId,
    conversationId,
    organizationId,
    userId,
    projectId,
    traceId,
  } = args

  try {
    const [meta, chunks] = await Promise.all([
      resolveSourceMeta(sourceId, organizationId),
      database.knowledgeChunk.findMany({
        where: { sourceId, collection: { organizationId } },
        orderBy: { ordinal: 'asc' },
        select: { content: true },
      }),
    ])

    if (chunks.length === 0) {
      return {
        sourceId,
        synthesis: synthesisErrorOutcome(
          'Não encontrei conteúdo salvo para tentar organizar de novo.',
        ).mirror,
      }
    }

    const text = chunks.map((chunk) => chunk.content).join('\n\n')
    const outcome = await synthesizeProposal({
      sourceId,
      conversationId,
      meta,
      text,
      grounded: text.replace(/\s/g, '').length >= SOURCE_TEXT_MIN_CHARS,
      ctx: { organizationId, userId, projectId },
      traceId,
    })

    return {
      sourceId,
      synthesis: outcome.mirror,
      ...(outcome.proposal ? { proposal: outcome.proposal } : {}),
    }
  } catch (err) {
    return {
      sourceId,
      synthesis: synthesisErrorOutcome(errorMessage(err)).mirror,
    }
  }
}

async function patchSourceSynthesisMirror(
  conversationId: string,
  organizationId: string,
  sourceId: string,
  mirror: SourceSynthesisMirror,
  traceId?: string,
): Promise<void> {
  try {
    await patchSourceIngestionAtomic(conversationId, organizationId, {
      synthesisBySourceId: new Map<string, SourceSynthesisMirror>([
        [sourceId, mirror],
      ]),
    })
  } catch (err) {
    logger.warn('[source-enrich.job] failed to PATCH synthesis mirror', {
      traceId,
      conversationId,
      sourceId,
      error: errorMessage(err),
    })
  }
}

// ---------------------------------------------------------------------------
// Proposal merge — `mergeProposal`/`hasAnyProposalField` live in
// builder-state-db.ts (the write boundary reuses the SAME semantics
// cross-batch, so intra-job and cross-batch merging can never diverge).
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
 * Writes ONLY `sourceIngestion` (proposed + sources[].status). Owned fields are
 * NEVER touched here, and `confirmations.source` only ever flips TRUE on
 * "Aceitar" — the one move made from here is the OPPOSITE direction
 * (`reopenOnProposal`): a grounded proposal landing after an accept flips it
 * back to FALSE inside the same atomic patch, so the card resurfaces for
 * review (instead of silently mutating `proposed` behind a confirmed step).
 */
async function patchSourceIngestion(
  conversationId: string,
  organizationId: string,
  proposed: SourceProposal | undefined,
  statusBySourceId: Map<string, 'ready' | 'error'>,
  imagesBySourceId: Map<string, SourceImagesMirror>,
  synthesisBySourceId: Map<string, SourceSynthesisMirror>,
): Promise<void> {
  const patched = await patchSourceIngestionAtomic(
    conversationId,
    organizationId,
    {
      statusBySourceId,
      // Onda D — settla o espelho imagesStatus/imagesCount de cada fonte (o
      // poll de imagens do source_progress card depende disso para parar).
      imagesBySourceId,
      synthesisBySourceId,
      // Only attach `proposed` when we actually have grounded fields, so a
      // failed/ungrounded batch never clobbers an existing proposal with {}
      // (and never reopens an accepted card for nothing). The write boundary
      // MERGES it onto the persisted proposal (first-wins scalars, union
      // lists) and flips `confirmations.source` back to false when the card
      // had already been accepted (reopen-for-review).
      ...(proposed ? { proposed, reopenOnProposal: true } : {}),
    },
  )
  if (!patched) {
    logger.warn('[source-enrich.job] conversation not found for org (skipped PATCH)', {
      conversationId,
    })
  }
}

// ---------------------------------------------------------------------------
// Source value resolution (org-scoped)
// ---------------------------------------------------------------------------

/** Org-scoped metadata of a source, resolved in ONE query for both the synthesis
 *  copy (value/type) and the Onda D image hook (collectionId/type/imagesEnabled). */
interface SourceMeta {
  /** `KnowledgeSource.source` — URL/handle, '' when missing. */
  value: string
  /** Collection the source belongs to (image rows carry it; '' when missing). */
  collectionId: string
  /** Source kind — 'url' gates the website-first image extraction. */
  type: string
  /** Per-source visual-catalog toggle (Onda D). Defaults true when unreadable. */
  imagesEnabled: boolean
}

/**
 * Resolve the source's metadata (`source`/`collectionId`/`type`/`imagesEnabled`)
 * in a single org-scoped query. Used by BOTH the synthesis copy and the Onda D
 * image hook. Org-scoped — never reads a source from another tenant. Returns a
 * generic/empty shape (with `imagesEnabled:false`) when the row is missing for
 * the org, so a missing source never triggers image extraction.
 */
async function resolveSourceMeta(
  sourceId: string,
  organizationId: string,
): Promise<SourceMeta> {
  const row = await database.knowledgeSource.findFirst({
    where: { id: sourceId, organizationId },
    select: {
      source: true,
      collectionId: true,
      type: true,
      imagesEnabled: true,
    },
  })
  return {
    value: row?.source ?? '',
    collectionId: row?.collectionId ?? '',
    type: row?.type ?? '',
    // Missing row → false (no row to enable); present row → its flag.
    imagesEnabled: row?.imagesEnabled ?? false,
  }
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
