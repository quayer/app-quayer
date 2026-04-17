/**
 * NicheResearcher Sub-Agent — unit tests.
 *
 * Strategy:
 *   - Mock `./tavily-client` so we never hit the network.
 *   - Mock `../base` so `runLLMSubAgent` returns deterministic text.
 *   - Assert tagged-result outcomes for each degradation branch.
 *
 * Plus a dedicated tavily-client unit test that stubs global `fetch` and
 * verifies the NO_API_KEY short-circuit performs zero network I/O.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks (must be declared before importing the sub-agent module)
// ---------------------------------------------------------------------------

vi.mock('./tavily-client', () => ({
  searchTavily: vi.fn(),
}))

vi.mock('../base', () => ({
  runLLMSubAgent: vi.fn(),
}))

import { runLLMSubAgent } from '../base'
import { nicheResearcherSubAgent } from './niche-researcher.sub-agent'
import { searchTavily } from './tavily-client'

const mockedSearchTavily = vi.mocked(searchTavily)
const mockedRunLLM = vi.mocked(runLLMSubAgent)

const CONTEXT = {
  organizationId: 'org_1',
  userId: 'user_1',
  projectId: 'proj_1',
} as const

function validInsightsJSON(): string {
  return JSON.stringify({
    regulations: [
      'CRMV — veterinário não pode prescrever por WhatsApp sem consulta presencial',
    ],
    vocabulary: ['castração', 'vermifugação', 'FeLV'],
    typicalFlows: ['agendamento de consulta', 'orçamento de cirurgia'],
    warnings: ['nunca sugerir medicamento humano para animal'],
  })
}

function llmSuccess(text: string) {
  return {
    success: true as const,
    data: { text, durationMs: 10 },
    durationMs: 10,
  }
}

function llmFailure(error: string, code: string) {
  return {
    success: false as const,
    error,
    code,
    durationMs: 5,
  }
}

beforeEach(() => {
  mockedSearchTavily.mockReset()
  mockedRunLLM.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Sub-agent tests
// ---------------------------------------------------------------------------

describe('nicheResearcherSubAgent', () => {
  describe('metadata', () => {
    it('exposes the expected static metadata', () => {
      expect(nicheResearcherSubAgent.metadata).toEqual({
        name: 'niche-researcher',
        isReadOnly: true,
        isConcurrencySafe: true,
        timeoutMs: 30_000,
      })
    })
  })

  describe('happy path', () => {
    it('returns insights with sources when Tavily + LLM succeed', async () => {
      mockedSearchTavily.mockResolvedValueOnce({
        ok: true,
        results: [
          { title: 'Source A', url: 'https://a.example', snippet: 'alpha' },
          { title: 'Source B', url: 'https://b.example', snippet: 'beta' },
          { title: 'Source C', url: 'https://c.example', snippet: 'gamma' },
        ],
      })
      mockedRunLLM.mockResolvedValueOnce(llmSuccess(validInsightsJSON()))

      const result = await nicheResearcherSubAgent.run(
        { nicho: 'clínica veterinária' },
        CONTEXT,
      )

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.regulations.length).toBeGreaterThan(0)
      expect(result.data.vocabulary).toContain('castração')
      expect(result.data.typicalFlows).toContain('agendamento de consulta')
      expect(result.data.warnings.length).toBeGreaterThan(0)
      expect(result.data.sources).toHaveLength(3)
      expect(result.data.sources[0]).toEqual({
        title: 'Source A',
        url: 'https://a.example',
      })
      expect(result.data.fromLLMKnowledgeOnly).toBe(false)
    })
  })

  describe('graceful degradation', () => {
    it('proceeds with empty snippets when TAVILY_API_KEY is missing', async () => {
      mockedSearchTavily.mockResolvedValueOnce({
        ok: false,
        reason: 'NO_API_KEY',
        message: 'TAVILY_API_KEY not configured',
      })
      mockedRunLLM.mockResolvedValueOnce(llmSuccess(validInsightsJSON()))

      const result = await nicheResearcherSubAgent.run(
        { nicho: 'barbearia' },
        CONTEXT,
      )

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.sources).toEqual([])
      expect(result.data.fromLLMKnowledgeOnly).toBe(true)
    })

    it('proceeds with empty snippets on Tavily network error', async () => {
      mockedSearchTavily.mockResolvedValueOnce({
        ok: false,
        reason: 'NETWORK',
        message: 'socket hang up',
      })
      mockedRunLLM.mockResolvedValueOnce(llmSuccess(validInsightsJSON()))

      const result = await nicheResearcherSubAgent.run(
        { nicho: 'pet shop' },
        CONTEXT,
      )

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.sources).toEqual([])
      expect(result.data.fromLLMKnowledgeOnly).toBe(true)
    })
  })

  describe('parsing robustness', () => {
    it('returns PARSE_ERROR when the LLM returns invalid JSON', async () => {
      mockedSearchTavily.mockResolvedValueOnce({ ok: true, results: [] })
      mockedRunLLM.mockResolvedValueOnce(llmSuccess('this is not JSON at all'))

      const result = await nicheResearcherSubAgent.run(
        { nicho: 'academia' },
        CONTEXT,
      )

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('PARSE_ERROR')
    })

    it('strips ```json fences and parses successfully', async () => {
      mockedSearchTavily.mockResolvedValueOnce({ ok: true, results: [] })
      const fenced = `\`\`\`json\n${validInsightsJSON()}\n\`\`\``
      mockedRunLLM.mockResolvedValueOnce(llmSuccess(fenced))

      const result = await nicheResearcherSubAgent.run(
        { nicho: 'odontologia' },
        CONTEXT,
      )

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.regulations.length).toBeGreaterThan(0)
    })

    it('returns PARSE_ERROR when a required key is missing', async () => {
      mockedSearchTavily.mockResolvedValueOnce({ ok: true, results: [] })
      const broken = JSON.stringify({
        regulations: ['x'],
        vocabulary: ['y'],
        typicalFlows: ['z'],
        // warnings missing
      })
      mockedRunLLM.mockResolvedValueOnce(llmSuccess(broken))

      const result = await nicheResearcherSubAgent.run(
        { nicho: 'restaurante' },
        CONTEXT,
      )

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('PARSE_ERROR')
    })
  })

  describe('input validation', () => {
    it('rejects nicho shorter than 2 chars', async () => {
      const result = await nicheResearcherSubAgent.run(
        { nicho: 'a' },
        CONTEXT,
      )

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('INVALID_INPUT')
      // Must not have called the web / LLM
      expect(mockedSearchTavily).not.toHaveBeenCalled()
      expect(mockedRunLLM).not.toHaveBeenCalled()
    })
  })

  describe('LLM upstream errors', () => {
    it('propagates LLM failure code', async () => {
      mockedSearchTavily.mockResolvedValueOnce({ ok: true, results: [] })
      mockedRunLLM.mockResolvedValueOnce(
        llmFailure('timeout', 'TIMEOUT'),
      )

      const result = await nicheResearcherSubAgent.run(
        { nicho: 'clínica veterinária' },
        CONTEXT,
      )

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('TIMEOUT')
    })
  })
})

// ---------------------------------------------------------------------------
// tavily-client isolated test (NO_API_KEY short-circuit → no fetch call)
// ---------------------------------------------------------------------------

describe('tavily-client (isolated)', () => {
  it('returns NO_API_KEY without calling fetch when TAVILY_API_KEY is unset', async () => {
    // We need the REAL implementation here, not the mocked one above.
    vi.resetModules()
    vi.doUnmock('./tavily-client')

    const prev = process.env.TAVILY_API_KEY
    delete process.env.TAVILY_API_KEY

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => {
        throw new Error('fetch should not be called')
      })

    try {
      // Re-import using dynamic import so the un-mocked module is loaded.
      const realClient = await import('./tavily-client')
      const result = await realClient.searchTavily('qualquer consulta')

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('NO_API_KEY')
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
      if (prev !== undefined) process.env.TAVILY_API_KEY = prev
    }
  })
})
