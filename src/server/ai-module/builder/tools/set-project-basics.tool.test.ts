/**
 * Tests for set_project_basics tool.
 *
 * Strategy mirrors revert-prompt.tool.test.ts: mock `@/server/services/database`
 * (no real DB) and drive the raw Vercel AI SDK execute function. The
 * `$transaction` mock immediately invokes the callback with a `tx` whose
 * methods are the same hoisted mocks, so we can assert the in-transaction
 * reads/writes.
 *
 * Cases covered:
 *   1. objective only — patches builderState.project.objective; does NOT touch
 *      builder_projects.name
 *   2. name only — patches builderState.project.name AND builder_projects.name
 *   3. both — patches both fields; applied echoes both
 *   4. preserves unrelated builderState (confirmations, persona, …) on write
 *   5. guard — conversation not found (cross-org/missing) → success=false
 *   6. schema — refine rejects an empty input ({}, no objective nor name)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks (hoisted before any imports that touch them)
// ---------------------------------------------------------------------------

const mockConvFindFirst = vi.hoisted(() => vi.fn())
const mockConvUpdateMany = vi.hoisted(() => vi.fn())
const mockProjectUpdateMany = vi.hoisted(() => vi.fn())
const mockTransaction = vi.hoisted(() => vi.fn())

vi.mock('@/server/services/database', () => {
  const tx = {
    builderProjectConversation: {
      findFirst: mockConvFindFirst,
      updateMany: mockConvUpdateMany,
    },
    builderProject: {
      updateMany: mockProjectUpdateMany,
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

// ---------------------------------------------------------------------------
// Imports after mocks are registered
// ---------------------------------------------------------------------------

import {
  setProjectBasicsTool,
  setProjectBasicsInputSchema,
} from './set-project-basics.tool'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CTX = {
  projectId: 'proj-test',
  organizationId: 'org-test',
  userId: 'user-test',
}

/** Existing state with unrelated owned fields that MUST survive the patch. */
const EXISTING_STATE = {
  project: { name: 'Nome antigo' },
  persona: { tone: 'cordial' },
  confirmations: { persona: true },
}

// Helper: extract the raw Vercel AI SDK execute function from the tool.
function getExecute(t: ReturnType<typeof setProjectBasicsTool>) {
  return (t as unknown as { execute: (...a: unknown[]) => Promise<unknown> }).execute
}

/** The builderState written in the (single) conversation updateMany call. */
function writtenState(): {
  project: { name?: string; objective?: string }
  persona: { tone?: string }
  confirmations: { persona: boolean }
} {
  expect(mockConvUpdateMany).toHaveBeenCalledOnce()
  const call = mockConvUpdateMany.mock.calls[0]![0] as {
    where: { id: string; organizationId: string }
    data: { builderState: ReturnType<typeof writtenState> }
  }
  expect(call.where).toEqual({ id: 'conv-1', organizationId: 'org-test' })
  return call.data.builderState
}

describe('setProjectBasicsTool — handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // findFirst call 1 → conversation lookup; call 2 (inside tx) → fresh state.
    mockConvFindFirst
      .mockResolvedValueOnce({ id: 'conv-1' })
      .mockResolvedValueOnce({ builderState: EXISTING_STATE })
    mockConvUpdateMany.mockResolvedValue({ count: 1 })
    mockProjectUpdateMany.mockResolvedValue({ count: 1 })
  })

  // -------------------------------------------------------------------------
  // 1. objective only
  // -------------------------------------------------------------------------
  it('objective only: writes project.objective and does NOT touch builder_projects', async () => {
    const execute = getExecute(setProjectBasicsTool(CTX))

    const result = (await execute({
      objective: 'Qualificar leads e agendar consultas',
    })) as { success: boolean; applied: { objective?: string; name?: string } }

    expect(result.success).toBe(true)
    expect(result.applied).toEqual({
      objective: 'Qualificar leads e agendar consultas',
    })

    const state = writtenState()
    expect(state.project.objective).toBe('Qualificar leads e agendar consultas')
    // name untouched (kept from existing state)
    expect(state.project.name).toBe('Nome antigo')
    expect(mockProjectUpdateMany).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 2. name only
  // -------------------------------------------------------------------------
  it('name only: writes project.name and mirrors builder_projects.name (org-scoped)', async () => {
    const execute = getExecute(setProjectBasicsTool(CTX))

    const result = (await execute({ name: 'Clínica Sorriso' })) as {
      success: boolean
      applied: { objective?: string; name?: string }
    }

    expect(result.success).toBe(true)
    expect(result.applied).toEqual({ name: 'Clínica Sorriso' })

    const state = writtenState()
    expect(state.project.name).toBe('Clínica Sorriso')
    expect(state.project.objective).toBeUndefined()

    expect(mockProjectUpdateMany).toHaveBeenCalledOnce()
    expect(mockProjectUpdateMany).toHaveBeenCalledWith({
      where: { id: 'proj-test', organizationId: 'org-test' },
      data: { name: 'Clínica Sorriso' },
    })
  })

  // -------------------------------------------------------------------------
  // 3. both fields
  // -------------------------------------------------------------------------
  it('both: writes objective + name and echoes both in applied', async () => {
    const execute = getExecute(setProjectBasicsTool(CTX))

    const result = (await execute({
      objective: 'Vender planos',
      name: 'Academia Forte',
    })) as { success: boolean; applied: { objective?: string; name?: string } }

    expect(result.success).toBe(true)
    expect(result.applied).toEqual({
      objective: 'Vender planos',
      name: 'Academia Forte',
    })

    const state = writtenState()
    expect(state.project).toMatchObject({
      objective: 'Vender planos',
      name: 'Academia Forte',
    })
    expect(mockProjectUpdateMany).toHaveBeenCalledOnce()
  })

  // -------------------------------------------------------------------------
  // 4. unrelated state preserved
  // -------------------------------------------------------------------------
  it('preserves unrelated builderState subtrees (persona, confirmations)', async () => {
    const execute = getExecute(setProjectBasicsTool(CTX))

    await execute({ objective: 'Atender dúvidas' })

    const state = writtenState()
    expect(state.persona.tone).toBe('cordial')
    expect(state.confirmations.persona).toBe(true)
  })

  // -------------------------------------------------------------------------
  // 5. guard — conversation not found
  // -------------------------------------------------------------------------
  it('returns success=false when the conversation is not found in the org', async () => {
    mockConvFindFirst.mockReset()
    mockConvFindFirst.mockResolvedValue(null)

    const execute = getExecute(setProjectBasicsTool(CTX))

    const result = (await execute({ objective: 'Qualquer' })) as {
      success: boolean
      message: string
    }

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/conversa.*não encontrada/i)
    expect(mockConvUpdateMany).not.toHaveBeenCalled()
    expect(mockProjectUpdateMany).not.toHaveBeenCalled()
  })
})

describe('setProjectBasicsInputSchema', () => {
  it('rejects an empty input (neither objective nor name)', () => {
    const parsed = setProjectBasicsInputSchema.safeParse({})
    expect(parsed.success).toBe(false)
  })

  it('accepts objective-only and name-only inputs (trimmed)', () => {
    expect(
      setProjectBasicsInputSchema.safeParse({ objective: '  vender mais  ' }),
    ).toMatchObject({ success: true, data: { objective: 'vender mais' } })
    expect(
      setProjectBasicsInputSchema.safeParse({ name: 'Loja X' }),
    ).toMatchObject({ success: true, data: { name: 'Loja X' } })
  })

  it('rejects over-limit values (objective > 300, name > 80)', () => {
    expect(
      setProjectBasicsInputSchema.safeParse({ objective: 'x'.repeat(301) })
        .success,
    ).toBe(false)
    expect(
      setProjectBasicsInputSchema.safeParse({ name: 'x'.repeat(81) }).success,
    ).toBe(false)
  })
})
