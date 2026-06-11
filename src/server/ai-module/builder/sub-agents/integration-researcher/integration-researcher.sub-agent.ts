/**
 * IntegrationResearcher Sub-Agent
 *
 * Investigates how to integrate with an arbitrary SaaS platform that is NOT in
 * the curated catalog (e.g. "RD Station", "Pipedrive"). It is the PURE
 * investigation step — caching (T28), quota (T29) and registration in
 * `propose_integration` (T30) are orchestrated by the caller, NOT here.
 *
 * Flow (mirrors `niche-researcher.sub-agent.ts`):
 *   1. Validate the platform name (non-empty, reasonable length).
 *   2. Tavily web search via the canonical `tavily-client.ts`. If Tavily is
 *      unavailable / errors / returns nothing → `{ status: 'unavailable' }`.
 *      We NEVER fall back to LLM training knowledge for endpoints (FR-02).
 *   3. Synthesize an `IntegrationBlueprint` via `runLLMSubAgent` (JSON-only),
 *      parse + validate the shape (malformed → treated as empty).
 *   4. POST-PARSE FR-02 FILTER: drop any endpoint whose `sourceUrl` is not one
 *      of the Tavily snippet URLs (a hallucinated endpoint). Count dropped.
 *   5. No usable endpoints after filtering → `{ status: 'empty' }` (caller
 *      falls back to a generic webhook, FR-11). Else `{ status: 'found' }`.
 *
 * Hard discipline (FR-02): the ONLY endpoints that survive are those whose
 * `sourceUrl` was actually returned by Tavily. An endpoint the LLM hallucinated
 * from its own training data cannot cite a real snippet URL, so it is dropped.
 */

import { runLLMSubAgent } from '../base'
import type { SubAgentContext } from '../types'
// Canonical Tavily client lives under niche-researcher/ (single shared impl —
// see its docstring). No fetch logic is duplicated.
import {
  searchTavily,
  type TavilySearchItem,
} from '../niche-researcher/tavily-client'
import { logger } from '@/server/services/logger'
import {
  buildIntegrationResearcherPrompt,
  type IntegrationAuthType,
  type IntegrationBlueprint,
  type IntegrationCredentialBlueprint,
  type IntegrationEndpointBlueprint,
  type IntegrationResearcherSnippet,
} from './integration-researcher.prompt'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RunIntegrationResearcherArgs {
  /** Platform name as typed by the user. Ex: "RD Station", "Pipedrive". */
  platform: string
  /** Org of the calling tool — resolves BYOK key + Builder agent config. */
  organizationId?: string
}

/**
 * Outcome of a pure investigation run.
 *
 *   - `found`       → at least one endpoint survived the FR-02 source filter.
 *   - `empty`       → invalid platform OR no usable endpoints. The caller falls
 *                     back to a generic webhook (FR-11).
 *   - `unavailable` → Tavily/LLM unavailable. The caller falls back DEGRADED —
 *                     it must NOT substitute LLM-knowledge endpoints (FR-02).
 */
export type IntegrationResearchOutcome =
  | { status: 'found'; blueprint: IntegrationBlueprint; sources: string[] }
  | { status: 'empty' }
  | { status: 'unavailable' }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLATFORM_MIN_LENGTH = 2
const PLATFORM_MAX_LENGTH = 120
const SEARCH_MAX_RESULTS = 6
const SYNTHESIS_TEMPERATURE = 0.2
const SYNTHESIS_MAX_TOKENS = 1800
const LLM_TIMEOUT_MS = 25_000

const VALID_AUTH_TYPES: ReadonlySet<IntegrationAuthType> = new Set<
  IntegrationAuthType
>(['bearer', 'header', 'query', 'basic'])

// ---------------------------------------------------------------------------
// JSON parsing helper
// ---------------------------------------------------------------------------

type ParseOk = { ok: true; value: IntegrationBlueprint }
type ParseErr = { ok: false; message: string }
type ParseResult = ParseOk | ParseErr

function isAuthType(value: unknown): value is IntegrationAuthType {
  return (
    typeof value === 'string' &&
    VALID_AUTH_TYPES.has(value as IntegrationAuthType)
  )
}

function parseEndpoint(value: unknown): IntegrationEndpointBlueprint | null {
  if (typeof value !== 'object' || value === null) return null
  const o = value as Record<string, unknown>
  if (typeof o.purpose !== 'string' || o.purpose.trim().length === 0) {
    return null
  }
  if (typeof o.method !== 'string' || o.method.trim().length === 0) return null
  if (
    typeof o.urlTemplate !== 'string' ||
    o.urlTemplate.trim().length === 0
  ) {
    return null
  }
  if (!isAuthType(o.authType)) return null
  if (typeof o.sourceUrl !== 'string' || o.sourceUrl.trim().length === 0) {
    return null
  }
  return {
    purpose: o.purpose.trim(),
    method: o.method.trim().toUpperCase(),
    urlTemplate: o.urlTemplate.trim(),
    authType: o.authType,
    sourceUrl: o.sourceUrl.trim(),
  }
}

function parseCredential(value: unknown): IntegrationCredentialBlueprint | null {
  if (typeof value !== 'object' || value === null) return null
  const o = value as Record<string, unknown>
  if (typeof o.key !== 'string' || o.key.trim().length === 0) return null
  if (typeof o.label !== 'string' || o.label.trim().length === 0) return null
  if (typeof o.whereToGet !== 'string') return null
  if (!isAuthType(o.authType)) return null
  return {
    key: o.key.trim(),
    label: o.label.trim(),
    whereToGet: o.whereToGet.trim(),
    authType: o.authType,
  }
}

/**
 * Strip markdown fences and parse JSON into an IntegrationBlueprint. Never
 * throws — returns a tagged result. Malformed JSON or a missing/invalid shape
 * is reported as a parse error (the caller treats it as empty).
 */
export function parseIntegrationBlueprintJSON(raw: string): ParseResult {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, message: 'Empty LLM response' }
  }

  let cleaned = raw.trim()

  // Strip markdown code fences if present (e.g. ```json ... ```).
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
  } else {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')
    cleaned = cleaned.trim()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'JSON.parse failed'
    return { ok: false, message: `Invalid JSON: ${msg}` }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, message: 'JSON root must be an object' }
  }

  const obj = parsed as Record<string, unknown>
  if (!Array.isArray(obj.endpoints)) {
    return { ok: false, message: 'Missing or non-array key: "endpoints"' }
  }
  if (!Array.isArray(obj.credentials)) {
    return { ok: false, message: 'Missing or non-array key: "credentials"' }
  }

  const endpoints: IntegrationEndpointBlueprint[] = []
  for (const item of obj.endpoints) {
    const ep = parseEndpoint(item)
    // Skip malformed endpoint entries rather than failing the whole parse —
    // a single bad row should not discard otherwise-valid endpoints.
    if (ep) endpoints.push(ep)
  }

  const credentials: IntegrationCredentialBlueprint[] = []
  for (const item of obj.credentials) {
    const cred = parseCredential(item)
    if (cred) credentials.push(cred)
  }

  const notes =
    typeof obj.notes === 'string' && obj.notes.trim().length > 0
      ? obj.notes.trim()
      : undefined

  return { ok: true, value: { endpoints, credentials, notes } }
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

/**
 * Run the pure integration investigation for a single platform.
 *
 * NEVER throws — every failure is mapped to a tagged outcome so the caller
 * (T30 `propose_integration`) can branch deterministically. The caller layers
 * cache (T28) and quota (T29) on top of this function; this function only does
 * the search + synthesis + FR-02 filter.
 */
export async function runIntegrationResearcher(
  args: RunIntegrationResearcherArgs,
): Promise<IntegrationResearchOutcome> {
  const platformSlug = (args.platform ?? '').trim().toLowerCase()

  // Phase 1 — validate input. Invalid → empty (caller uses generic webhook).
  const trimmed = (args.platform ?? '').trim()
  if (
    trimmed.length < PLATFORM_MIN_LENGTH ||
    trimmed.length > PLATFORM_MAX_LENGTH
  ) {
    logStructured({
      platformSlug,
      sourceCount: 0,
      droppedEndpoints: 0,
      status: 'empty',
    })
    return { status: 'empty' }
  }

  // Phase 2 — Tavily web search. Anything other than a non-empty result set
  // means we cannot ground endpoints in real sources → unavailable. We NEVER
  // fall back to LLM training knowledge for endpoints (FR-02).
  const searchResult = await searchTavily(
    `${trimmed} API integration endpoints authentication`,
    { maxResults: SEARCH_MAX_RESULTS },
  )

  if (!searchResult.ok || searchResult.results.length === 0) {
    logStructured({
      platformSlug,
      sourceCount: 0,
      droppedEndpoints: 0,
      status: 'unavailable',
    })
    return { status: 'unavailable' }
  }

  const snippets: TavilySearchItem[] = searchResult.results
  const snippetUrls = new Set(snippets.map((s) => s.url))

  // Phase 3 — synthesize via LLM (JSON-only).
  const context: SubAgentContext = {
    organizationId: args.organizationId ?? '',
    userId: '',
    projectId: '',
  }
  const prompt = buildIntegrationResearcherPrompt({
    platform: trimmed,
    snippets: snippets.map(toPromptSnippet),
  })
  const llmResult = await runLLMSubAgent(
    {
      systemPrompt: prompt.system,
      userMessage: prompt.user,
      temperature: SYNTHESIS_TEMPERATURE,
      maxOutputTokens: SYNTHESIS_MAX_TOKENS,
      timeoutMs: LLM_TIMEOUT_MS,
    },
    context,
  )

  if (!llmResult.success) {
    // LLM unavailable (timeout/upstream/empty) → degraded fallback (FR-02:
    // caller must NOT substitute LLM-knowledge endpoints).
    logStructured({
      platformSlug,
      sourceCount: snippets.length,
      droppedEndpoints: 0,
      status: 'unavailable',
    })
    return { status: 'unavailable' }
  }

  // Phase 4 — parse JSON. Malformed → treat as empty (generic webhook, FR-11).
  const parsed = parseIntegrationBlueprintJSON(llmResult.data.text)
  if (!parsed.ok) {
    logStructured({
      platformSlug,
      sourceCount: snippets.length,
      droppedEndpoints: 0,
      status: 'empty',
    })
    return { status: 'empty' }
  }

  // Phase 5 — POST-PARSE FR-02 FILTER. Drop endpoints whose `sourceUrl` is NOT
  // among the Tavily snippet URLs — i.e. an endpoint the LLM hallucinated from
  // its own training knowledge (it cannot cite a real snippet URL).
  const keptEndpoints = parsed.value.endpoints.filter((ep) =>
    snippetUrls.has(ep.sourceUrl),
  )
  const droppedEndpoints = parsed.value.endpoints.length - keptEndpoints.length

  if (keptEndpoints.length === 0) {
    logStructured({
      platformSlug,
      sourceCount: snippets.length,
      droppedEndpoints,
      status: 'empty',
    })
    return { status: 'empty' }
  }

  // Sources = the snippet URLs actually cited by the surviving endpoints.
  const citedSources = Array.from(
    new Set(keptEndpoints.map((ep) => ep.sourceUrl)),
  )

  const blueprint: IntegrationBlueprint = {
    endpoints: keptEndpoints,
    credentials: parsed.value.credentials,
    notes: parsed.value.notes,
  }

  logStructured({
    platformSlug,
    sourceCount: citedSources.length,
    droppedEndpoints,
    status: 'found',
  })

  return { status: 'found', blueprint, sources: citedSources }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map a Tavily item to the prompt's snippet shape (`snippet` → `content`). */
function toPromptSnippet(item: TavilySearchItem): IntegrationResearcherSnippet {
  return { url: item.url, title: item.title, content: item.snippet }
}

interface IntegrationResearcherLogFields {
  platformSlug: string
  sourceCount: number
  droppedEndpoints: number
  status: IntegrationResearchOutcome['status']
}

/**
 * Emit the single structured log line for this run. `cacheHit` is intentionally
 * NOT logged here — T30's cache layer logs it separately.
 */
function logStructured(fields: IntegrationResearcherLogFields): void {
  logger.info('[integration-researcher]', { ...fields })
}
