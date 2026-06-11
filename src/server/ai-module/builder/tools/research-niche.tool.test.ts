/**
 * Tests for research_niche tool — T26 (proposta de handoff por nicho regulado).
 *
 * Strategy mirrors set-project-basics.tool.test.ts: mock `@/server/services/database`
 * (no real DB) plus the niche-researcher sub-agent, and drive the raw Vercel AI SDK
 * execute function. The `$transaction` mock immediately invokes the callback with a
 * `tx` whose methods are the same hoisted mocks, so we can assert the
 * in-transaction reads/writes.
 *
 * Cases covered (spec critério):
 *   1. nicho regulado (advocacia) → `capturedProposals.handoff = { mode, reason }`
 *      gravado; sentinel `confirmations.handoff` INTOCADO (false).
 *   2. nicho regulado (saúde/clínica) → idem (1º padrão que casa).
 *   3. nicho comum (barbearia) → NENHUM write (proposta não gravada).
 *   4. sub-agent falha → tool propaga o erro e NÃO grava proposta.
 *   5. fail-open — erro de DB na escrita da proposta NÃO derruba o resultado da pesquisa.
 *   6. a proposta preserva subtrees não relacionadas + nunca flipa o sentinel.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks (hoisted before any imports that touch them)
// ---------------------------------------------------------------------------

const mockConvFindFirst = vi.hoisted(() => vi.fn())
const mockConvUpdateMany = vi.hoisted(() => vi.fn())
const mockTransaction = vi.hoisted(() => vi.fn())
const mockSubAgentRun = vi.hoisted(() => vi.fn())

vi.mock('@/server/services/database', () => {
  const tx = {
    builderProjectConversation: {
      findFirst: mockConvFindFirst,
      updateMany: mockConvUpdateMany,
    },
  }
  return {
    database: {
      ...tx,
      $transaction: mockTransaction.mockImplementation(
        async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
      ),
    },
  }
})

vi.mock('../sub-agents', () => ({
  nicheResearcherSubAgent: { run: mockSubAgentRun },
}))

// ---------------------------------------------------------------------------
// Imports after mocks are registered
// ---------------------------------------------------------------------------

import { researchNicheTool } from './research-niche.tool'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CTX = {
  projectId: 'proj-test',
  organizationId: 'org-test',
  userId: 'user-test',
}

/** Existing state with an unrelated owned field + the (unset) handoff sentinel. */
const EXISTING_STATE = {
  project: { name: 'Nome antigo' },
  confirmations: { handoff: false },
}

const SUCCESS_INSIGHTS = {
  success: true as const,
  data: {
    regulations: ['Reg A'],
    vocabulary: ['termo'],
    typicalFlows: ['fluxo'],
    warnings: ['aviso'],
    sources: [],
    fromLLMKnowledgeOnly: false,
  },
}

// Helper: extract the raw Vercel AI SDK execute function from the tool.
function getExecute(t: ReturnType<typeof researchNicheTool>) {
  return (t as unknown as { execute: (...a: unknown[]) => Promise<unknown> })
    .execute
}

/** The builderState written in the (single) conversation updateMany call. */
function writtenState(): {
  project: { name?: string }
  capturedProposals?: { handoff?: { mode?: string; reason?: string } }
  confirmations: { handoff: boolean }
} {
  expect(mockConvUpdateMany).toHaveBeenCalledOnce()
  const call = mockConvUpdateMany.mock.calls[0]![0] as {
    where: { id: string; organizationId: string }
    data: { builderState: ReturnType<typeof writtenState> }
  }
  expect(call.where).toEqual({ id: 'conv-1', organizationId: 'org-test' })
  return call.data.builderState
}

describe('researchNicheTool — proposta de handoff por nicho regulado (T26)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // findFirst call 1 → conversation lookup; call 2 (inside tx) → fresh state.
    mockConvFindFirst
      .mockResolvedValueOnce({ id: 'conv-1' })
      .mockResolvedValueOnce({ builderState: EXISTING_STATE })
    mockConvUpdateMany.mockResolvedValue({ count: 1 })
    mockSubAgentRun.mockResolvedValue(SUCCESS_INSIGHTS)
  })

  // -------------------------------------------------------------------------
  // 1. nicho regulado (advocacia)
  // -------------------------------------------------------------------------
  it('advocacia: grava capturedProposals.handoff com mode+reason e NÃO flipa o sentinel', async () => {
    const execute = getExecute(researchNicheTool(CTX))

    const result = (await execute({ nicho: 'escritório de advocacia' })) as {
      success: boolean
    }
    expect(result.success).toBe(true)

    const state = writtenState()
    expect(state.capturedProposals?.handoff?.mode).toBe('solo')
    expect(state.capturedProposals?.handoff?.reason).toMatch(/advocacia/i)
    // Sentinel INTOCADO — a proposta é prefill confirmável, nunca confirma sozinha.
    expect(state.confirmations.handoff).toBe(false)
    // Subtree não relacionada preservada.
    expect(state.project.name).toBe('Nome antigo')
  })

  // -------------------------------------------------------------------------
  // 2. nicho regulado (saúde / clínica)
  // -------------------------------------------------------------------------
  it('saúde (clínica): grava a proposta com reason de saúde', async () => {
    const execute = getExecute(researchNicheTool(CTX))

    const result = (await execute({ nicho: 'clínica odontológica' })) as {
      success: boolean
    }
    expect(result.success).toBe(true)

    const state = writtenState()
    expect(state.capturedProposals?.handoff?.mode).toBe('solo')
    expect(state.capturedProposals?.handoff?.reason).toMatch(/saúde/i)
    expect(state.confirmations.handoff).toBe(false)
  })

  // -------------------------------------------------------------------------
  // 3. nicho comum
  // -------------------------------------------------------------------------
  it('barbearia (nicho comum): NÃO grava nenhuma proposta', async () => {
    const execute = getExecute(researchNicheTool(CTX))

    const result = (await execute({ nicho: 'barbearia premium' })) as {
      success: boolean
    }
    expect(result.success).toBe(true)

    // Nicho comum não toca o builderState — nenhuma transação, nenhum write.
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockConvUpdateMany).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 3b. clínica veterinária (exemplo canônico de nicho COMUM) — falso-positivo evitado
  // -------------------------------------------------------------------------
  it('clínica veterinária: tratada como nicho comum (NÃO grava proposta de saúde)', async () => {
    const execute = getExecute(researchNicheTool(CTX))

    const result = (await execute({ nicho: 'clínica veterinária' })) as {
      success: boolean
    }
    expect(result.success).toBe(true)

    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockConvUpdateMany).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 4. sub-agent falha
  // -------------------------------------------------------------------------
  it('pesquisa falha: propaga o erro e NÃO grava proposta mesmo em nicho regulado', async () => {
    mockSubAgentRun.mockReset()
    mockSubAgentRun.mockResolvedValue({
      success: false,
      error: 'LLM synthesis failed',
      code: 'UPSTREAM_ERROR',
    })

    const execute = getExecute(researchNicheTool(CTX))

    const result = (await execute({ nicho: 'advocacia trabalhista' })) as {
      success: boolean
      message: string
    }
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/synthesis/i)

    // Sem sucesso → o branch da proposta nem roda.
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockConvUpdateMany).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 5. fail-open — erro de DB na escrita da proposta não derruba a pesquisa
  // -------------------------------------------------------------------------
  it('fail-open: erro de DB ao gravar a proposta NÃO falha o resultado da pesquisa', async () => {
    mockConvFindFirst.mockReset()
    mockConvFindFirst.mockRejectedValue(new Error('db down'))

    const execute = getExecute(researchNicheTool(CTX))

    const result = (await execute({ nicho: 'advocacia previdenciária' })) as {
      success: boolean
      regulations?: string[]
    }

    // A pesquisa de nicho continua bem-sucedida apesar da falha na proposta.
    expect(result.success).toBe(true)
    expect(result.regulations).toEqual(['Reg A'])
    expect(mockConvUpdateMany).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 6. conversa ausente → no-op (fail-open), pesquisa segue
  // -------------------------------------------------------------------------
  it('conversa não encontrada: no-op silencioso, pesquisa permanece bem-sucedida', async () => {
    mockConvFindFirst.mockReset()
    mockConvFindFirst.mockResolvedValue(null)

    const execute = getExecute(researchNicheTool(CTX))

    const result = (await execute({ nicho: 'consultório médico' })) as {
      success: boolean
    }
    expect(result.success).toBe(true)
    expect(mockConvUpdateMany).not.toHaveBeenCalled()
  })
})
