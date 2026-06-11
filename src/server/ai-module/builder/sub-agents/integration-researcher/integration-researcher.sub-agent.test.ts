/**
 * IntegrationResearcher Sub-Agent — unit tests (T52).
 *
 * Strategy (mirrors `niche-researcher.sub-agent.test.ts`):
 *   - Mock `../niche-researcher/tavily-client` so we never hit the network
 *     (this is the EXACT module the sub-agent imports `searchTavily` from).
 *   - Mock `../base` so `runLLMSubAgent` returns deterministic tagged results.
 *   - Assert the tagged outcome union for each branch of
 *     `runIntegrationResearcher` (found | empty | unavailable).
 *
 * Plus a dedicated `checkFixedWindowQuota('integrationResearch', orgId)` suite
 * that mirrors the redis-mock idiom of `rate-limit.service.test.ts`: it proves
 * the literal "11th request in the 24h window is refused" (limit 10/24h).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks (must be declared before importing the sub-agent module).
// The sub-agent imports `searchTavily` from '../niche-researcher/tavily-client'
// and `runLLMSubAgent` from '../base' — we mock those EXACT module specifiers.
// ---------------------------------------------------------------------------

vi.mock('../niche-researcher/tavily-client', () => ({
  searchTavily: vi.fn(),
}))

vi.mock('../base', () => ({
  runLLMSubAgent: vi.fn(),
}))

// Keep the logger silent + side-effect free during the unit run.
vi.mock('@/server/services/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { runLLMSubAgent } from '../base'
import { searchTavily } from '../niche-researcher/tavily-client'
import { runIntegrationResearcher } from './integration-researcher.sub-agent'

const mockedSearchTavily = vi.mocked(searchTavily)
const mockedRunLLM = vi.mocked(runLLMSubAgent)

const ORG_ID = 'org_t52'

// URLs that appear in the Tavily snippet set (the only valid `sourceUrl`s).
const URL_A = 'https://docs.rd.services/api/contacts'
const URL_B = 'https://docs.rd.services/api/auth'
const URL_HALLUCINATED = 'https://hallucinated.example/api'

// ---------------------------------------------------------------------------
// Mock builders
// ---------------------------------------------------------------------------

/** A successful Tavily result with snippets for URLs [A, B]. */
function tavilyWithAB() {
  return {
    ok: true as const,
    results: [
      { title: 'RD Contacts', url: URL_A, snippet: 'POST /platform/contacts' },
      { title: 'RD Auth', url: URL_B, snippet: 'Bearer token auth' },
    ],
  }
}

/** Wrap raw LLM text in the `runLLMSubAgent` success shape. */
function llmSuccess(text: string) {
  return {
    success: true as const,
    data: { text, durationMs: 10 },
    durationMs: 10,
  }
}

/** The `runLLMSubAgent` failure shape (timeout/upstream/empty). */
function llmFailure(error: string, code: string) {
  return {
    success: false as const,
    error,
    code,
    durationMs: 5,
  }
}

interface EndpointSeed {
  purpose: string
  method: string
  urlTemplate: string
  authType: 'bearer' | 'header' | 'query' | 'basic'
  sourceUrl: string
}

/** Build a valid blueprint JSON string from endpoint seeds + one credential. */
function blueprintJSON(endpoints: EndpointSeed[]): string {
  return JSON.stringify({
    endpoints,
    credentials: [
      {
        key: 'api_token',
        label: 'Token de API',
        whereToGet: 'Painel > Configurações > API',
        authType: 'bearer',
      },
    ],
    notes: 'Use o token no header Authorization.',
  })
}

const endpointA: EndpointSeed = {
  purpose: 'Criar um contato',
  method: 'POST',
  urlTemplate: 'https://api.rd.services/platform/contacts',
  authType: 'bearer',
  sourceUrl: URL_A,
}

const endpointHallucinated: EndpointSeed = {
  purpose: 'Endpoint inventado',
  method: 'GET',
  urlTemplate: 'https://api.rd.services/fake',
  authType: 'bearer',
  sourceUrl: URL_HALLUCINATED,
}

beforeEach(() => {
  mockedSearchTavily.mockReset()
  mockedRunLLM.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// runIntegrationResearcher
// ---------------------------------------------------------------------------

describe('runIntegrationResearcher', () => {
  describe('invalid input', () => {
    it('empty platform → { status: "empty" } without calling Tavily', async () => {
      const result = await runIntegrationResearcher({
        platform: '',
        organizationId: ORG_ID,
      })

      expect(result).toEqual({ status: 'empty' })
      expect(mockedSearchTavily).not.toHaveBeenCalled()
      expect(mockedRunLLM).not.toHaveBeenCalled()
    })

    it('whitespace-only platform → { status: "empty" } without calling Tavily', async () => {
      const result = await runIntegrationResearcher({
        platform: '   ',
        organizationId: ORG_ID,
      })

      expect(result).toEqual({ status: 'empty' })
      expect(mockedSearchTavily).not.toHaveBeenCalled()
      expect(mockedRunLLM).not.toHaveBeenCalled()
    })
  })

  describe('Tavily unavailable (NEVER falls back to LLM-knowledge — FR-02)', () => {
    it('Tavily client errors (ok:false) → { status: "unavailable" }, LLM NOT called', async () => {
      mockedSearchTavily.mockResolvedValueOnce({
        ok: false,
        reason: 'NETWORK',
        message: 'socket hang up',
      })

      const result = await runIntegrationResearcher({
        platform: 'RD Station',
        organizationId: ORG_ID,
      })

      expect(result).toEqual({ status: 'unavailable' })
      // FR-02: we must NOT synthesize endpoints from LLM training knowledge.
      expect(mockedRunLLM).not.toHaveBeenCalled()
    })

    it('Tavily NO_API_KEY → { status: "unavailable" }, LLM NOT called', async () => {
      mockedSearchTavily.mockResolvedValueOnce({
        ok: false,
        reason: 'NO_API_KEY',
        message: 'TAVILY_API_KEY not configured',
      })

      const result = await runIntegrationResearcher({
        platform: 'Pipedrive',
        organizationId: ORG_ID,
      })

      expect(result).toEqual({ status: 'unavailable' })
      expect(mockedRunLLM).not.toHaveBeenCalled()
    })

    it('Tavily returns empty results → { status: "unavailable" }, LLM NOT called', async () => {
      mockedSearchTavily.mockResolvedValueOnce({ ok: true, results: [] })

      const result = await runIntegrationResearcher({
        platform: 'Plataforma Obscura',
        organizationId: ORG_ID,
      })

      expect(result).toEqual({ status: 'unavailable' })
      expect(mockedRunLLM).not.toHaveBeenCalled()
    })
  })

  describe('LLM unavailable after a successful Tavily search', () => {
    it('runLLMSubAgent failure → { status: "unavailable" } (degraded, no LLM-knowledge sub)', async () => {
      mockedSearchTavily.mockResolvedValueOnce(tavilyWithAB())
      mockedRunLLM.mockResolvedValueOnce(llmFailure('timeout', 'TIMEOUT'))

      const result = await runIntegrationResearcher({
        platform: 'RD Station',
        organizationId: ORG_ID,
      })

      expect(result).toEqual({ status: 'unavailable' })
      // Tavily WAS searched, but the LLM was unavailable → degraded.
      expect(mockedSearchTavily).toHaveBeenCalledTimes(1)
      expect(mockedRunLLM).toHaveBeenCalledTimes(1)
    })
  })

  describe('post-parse FR-02 filter (drops hallucinated endpoints)', () => {
    it('drops an endpoint whose sourceUrl is NOT in the snippet set; keeps A only', async () => {
      mockedSearchTavily.mockResolvedValueOnce(tavilyWithAB())
      // LLM returns TWO endpoints: A (cited, kept) + hallucinated (dropped).
      mockedRunLLM.mockResolvedValueOnce(
        llmSuccess(blueprintJSON([endpointA, endpointHallucinated])),
      )

      const result = await runIntegrationResearcher({
        platform: 'RD Station',
        organizationId: ORG_ID,
      })

      expect(result.status).toBe('found')
      if (result.status !== 'found') return

      // The hallucinated endpoint (sourceUrl not in [A, B]) was dropped →
      // exactly ONE endpoint survives, and it is the A-cited one.
      expect(result.blueprint.endpoints).toHaveLength(1)
      expect(result.blueprint.endpoints[0].sourceUrl).toBe(URL_A)
      expect(result.blueprint.endpoints[0].urlTemplate).toBe(
        'https://api.rd.services/platform/contacts',
      )
      // Sources = only the snippet URLs actually cited by surviving endpoints.
      expect(result.sources).toEqual([URL_A])
    })
  })

  describe('all endpoints hallucinated', () => {
    it('every sourceUrl outside the snippet set → { status: "empty" }', async () => {
      mockedSearchTavily.mockResolvedValueOnce(tavilyWithAB())
      // Only a hallucinated endpoint → after the FR-02 filter, none survive.
      mockedRunLLM.mockResolvedValueOnce(
        llmSuccess(blueprintJSON([endpointHallucinated])),
      )

      const result = await runIntegrationResearcher({
        platform: 'RD Station',
        organizationId: ORG_ID,
      })

      expect(result).toEqual({ status: 'empty' })
    })
  })

  describe('found happy path', () => {
    it('valid snippets + cited endpoints → { status: "found", blueprint, sources }', async () => {
      mockedSearchTavily.mockResolvedValueOnce(tavilyWithAB())
      const endpointB: EndpointSeed = {
        purpose: 'Autenticar via OAuth',
        method: 'POST',
        urlTemplate: 'https://api.rd.services/auth/token',
        authType: 'bearer',
        sourceUrl: URL_B,
      }
      mockedRunLLM.mockResolvedValueOnce(
        llmSuccess(blueprintJSON([endpointA, endpointB])),
      )

      const result = await runIntegrationResearcher({
        platform: 'RD Station',
        organizationId: ORG_ID,
      })

      expect(result.status).toBe('found')
      if (result.status !== 'found') return

      expect(result.blueprint.endpoints).toHaveLength(2)
      expect(result.blueprint.credentials).toHaveLength(1)
      expect(result.blueprint.credentials[0].key).toBe('api_token')
      expect(result.blueprint.notes).toBe('Use o token no header Authorization.')
      // Both cited source URLs are present (de-duplicated set).
      expect(result.sources).toEqual(expect.arrayContaining([URL_A, URL_B]))
      expect(result.sources).toHaveLength(2)
    })
  })
})

// ---------------------------------------------------------------------------
// Quota literal — checkFixedWindowQuota('integrationResearch', orgId)
//
// integrationResearch: limit 10, windowMs 24h (FIXED_WINDOW_QUOTAS literal).
// Mirrors `rate-limit.service.test.ts`: mock @/server/services/redis with a
// controllable getRedis() returning { incr, pexpire, pttl }. INCR monotonic
// 1..10 → allowed; 11 → refused. This is the "11th in the 24h window is
// refused" assertion.
//
// NOTE: this suite mocks @/server/services/redis at module scope; it lives in
// the SAME file but only the rate-limit service consumes that mock (the
// sub-agent above never touches Redis directly).
// ---------------------------------------------------------------------------

const mockIncr = vi.fn()
const mockPexpire = vi.fn()
const mockPttl = vi.fn()

vi.mock('@/server/services/redis', () => ({
  getRedis: () => ({
    incr: mockIncr,
    pexpire: mockPexpire,
    pttl: mockPttl,
  }),
}))

import {
  checkFixedWindowQuota,
  FIXED_WINDOW_QUOTAS,
} from '@/server/ai-module/ai-agents/infra/rate-limit.service'

describe('checkFixedWindowQuota — integrationResearch quota literal (T52)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes the literal limit 10 / 24h window for integrationResearch', () => {
    expect(FIXED_WINDOW_QUOTAS.integrationResearch).toEqual({
      limit: 10,
      windowMs: 24 * 60 * 60 * 1000,
    })
  })

  it('first 10 requests allowed; the 11th in the 24h window is refused', async () => {
    const { limit } = FIXED_WINDOW_QUOTAS.integrationResearch // 10
    const ATTEMPTS = limit + 1 // 11

    mockPexpire.mockResolvedValue(1)
    mockPttl.mockResolvedValue(FIXED_WINDOW_QUOTAS.integrationResearch.windowMs)

    // INCR monotonic 1, 2, ..., 11 — a fixed window where the count only grows.
    let counter = 0
    mockIncr.mockImplementation(() => {
      counter += 1
      return Promise.resolve(counter)
    })

    const results: Array<{ allowed: boolean; remaining: number }> = []
    for (let i = 0; i < ATTEMPTS; i++) {
      results.push(
        await checkFixedWindowQuota('integrationResearch', 'org-research'),
      )
    }

    // Counts 1..10 allowed; the 11th (count=11) refused.
    for (let i = 0; i < limit; i++) {
      expect(results[i].allowed).toBe(true)
    }
    expect(results[limit].allowed).toBe(false) // 11th → allowed:false

    // `remaining` decreases monotonically to 0 (no refill within the window).
    expect(results[0].remaining).toBe(limit - 1) // count=1 → 9 remaining
    expect(results[limit - 1].remaining).toBe(0) // count=10 → 0 remaining
    expect(results[limit].remaining).toBe(0) // count=11 → clamped at 0

    // 11 calls → 11 INCRs against the dedicated namespaced key.
    expect(mockIncr).toHaveBeenCalledTimes(ATTEMPTS)
    expect(mockIncr).toHaveBeenCalledWith(
      'quota:fixed:integrationResearch:org-research',
    )
  })

  it('first call of the window anchors the 24h TTL via PEXPIRE (count === 1)', async () => {
    mockPttl.mockResolvedValue(FIXED_WINDOW_QUOTAS.integrationResearch.windowMs)
    mockPexpire.mockResolvedValue(1)

    mockIncr.mockResolvedValueOnce(1)
    await checkFixedWindowQuota('integrationResearch', 'org-ttl')

    expect(mockPexpire).toHaveBeenCalledTimes(1)
    expect(mockPexpire).toHaveBeenCalledWith(
      'quota:fixed:integrationResearch:org-ttl',
      24 * 60 * 60 * 1000,
    )
  })

  it('fail-open when redis.incr throws (degraded Redis must not block research)', async () => {
    mockIncr.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await checkFixedWindowQuota('integrationResearch', 'org-down')

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(FIXED_WINDOW_QUOTAS.integrationResearch.limit)
    expect(result.resetMs).toBe(FIXED_WINDOW_QUOTAS.integrationResearch.windowMs)
  })
})
