/**
 * Tests for propose_field_values tool (jornada-builder-v2 T23, FR-02).
 *
 * Strategy mirrors set-project-basics.tool.test.ts: mock
 * `@/server/services/database` (no real DB) and drive the raw Vercel AI SDK
 * execute function. The `$transaction` mock immediately invokes the callback
 * with a `tx` whose methods are the same hoisted mocks, so we can assert the
 * in-transaction reads/writes.
 *
 * Cases covered:
 *   ATOMICITY
 *     1. single domain (hours) — exactly one conversation updateMany inside the
 *        transaction; NO builder_projects write; NEVER flips a sentinel.
 *     2. multiple domains in one call — single write; all forwarded under
 *        capturedProposals.*; unrelated state preserved.
 *     3. existing capturedProposals of another domain survive the patch (deepMerge
 *        never deletes); a confirmed sentinel is preserved, never set.
 *     4. guard — conversation not found (cross-org/missing) → success=false, no write.
 *   WHITELIST
 *     5. .strict() rejects an unknown top-level key (LLM can't write arbitrary shape).
 *     6. domain sub-shapes drop unknown keys / clamp max-lengths; refine rejects empty.
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
  proposeFieldValuesTool,
  proposeFieldValuesInputSchema,
} from './propose-field-values.tool'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CTX = {
  projectId: 'proj-test',
  organizationId: 'org-test',
  userId: 'user-test',
}

/** Existing state with an owned/confirmed field + a foreign proposal domain. */
const EXISTING_STATE = {
  persona: { tone: 'cordial' },
  confirmations: { persona: true },
  capturedProposals: { persona: { tone: 'formal' } },
}

// Helper: extract the raw Vercel AI SDK execute function from the tool.
function getExecute(t: ReturnType<typeof proposeFieldValuesTool>) {
  return (t as unknown as { execute: (...a: unknown[]) => Promise<unknown> })
    .execute
}

interface WrittenState {
  persona?: { tone?: string }
  confirmations?: Record<string, boolean>
  capturedProposals?: {
    persona?: { tone?: string }
    services?: { offered?: string[] }
    hours?: { preset?: string }
    handoff?: { mode?: string; reason?: string }
    pricing?: { items?: Array<{ name: string; priceCents: number }> }
    activation?: { mode?: string }
  }
}

/** The builderState written in the (single) conversation updateMany call. */
function writtenState(): WrittenState {
  expect(mockConvUpdateMany).toHaveBeenCalledOnce()
  const call = mockConvUpdateMany.mock.calls[0]![0] as {
    where: { id: string; organizationId: string }
    data: { builderState: WrittenState }
  }
  expect(call.where).toEqual({ id: 'conv-1', organizationId: 'org-test' })
  return call.data.builderState
}

/** Sentinel keys that are true in the written state (proves nothing got flipped). */
function trueSentinels(state: WrittenState): string[] {
  return Object.entries(state.confirmations ?? {})
    .filter(([, v]) => v === true)
    .map(([k]) => k)
}

describe('proposeFieldValuesTool — handler (atomicity)', () => {
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
  // 1. single domain — one write, no project mirror, no sentinel flip
  // -------------------------------------------------------------------------
  it('single domain (hours): one conversation write inside tx, no builder_projects write, no sentinel flip', async () => {
    const execute = getExecute(proposeFieldValuesTool(CTX))

    const result = (await execute({ hours: { preset: '9h-18h seg-sex' } })) as {
      success: boolean
      proposed: string[]
    }

    expect(result.success).toBe(true)
    expect(result.proposed).toEqual(['hours'])

    // Atomic: exactly one transaction and one conversation updateMany.
    expect(mockTransaction).toHaveBeenCalledOnce()
    const state = writtenState() // asserts toHaveBeenCalledOnce internally
    expect(state.capturedProposals?.hours?.preset).toBe('9h-18h seg-sex')

    // NEVER touches builder_projects and NEVER flips a sentinel. The state is
    // fully resolved through parseBuilderState so confirmations has every key;
    // the invariant is that the ONLY true sentinel is the pre-existing persona.
    expect(mockProjectUpdateMany).not.toHaveBeenCalled()
    expect(trueSentinels(state)).toEqual(['persona'])
    expect(state.confirmations?.hours).toBe(false)
  })

  // -------------------------------------------------------------------------
  // 2. multiple domains — single write, all forwarded, unrelated preserved
  // -------------------------------------------------------------------------
  it('multiple domains: single write forwarding all under capturedProposals.*', async () => {
    const execute = getExecute(proposeFieldValuesTool(CTX))

    const result = (await execute({
      services: { offered: ['corte', 'barba'] },
      handoff: { mode: 'roleta', reason: 'nicho regulado' },
    })) as { success: boolean; proposed: string[] }

    expect(result.success).toBe(true)
    expect(result.proposed).toEqual(['services', 'handoff'])

    const state = writtenState()
    expect(state.capturedProposals?.services?.offered).toEqual(['corte', 'barba'])
    expect(state.capturedProposals?.handoff).toEqual({
      mode: 'roleta',
      reason: 'nicho regulado',
    })
    // Owned/confirmed subtree preserved.
    expect(state.persona?.tone).toBe('cordial')
    expect(state.confirmations?.persona).toBe(true)
  })

  // -------------------------------------------------------------------------
  // 3. foreign proposal domain survives (deepMerge never deletes)
  // -------------------------------------------------------------------------
  it('preserves an existing proposal of another domain and never flips a sentinel', async () => {
    const execute = getExecute(proposeFieldValuesTool(CTX))

    await execute({ activation: { mode: 'keyword' } })

    const state = writtenState()
    // New domain landed…
    expect(state.capturedProposals?.activation?.mode).toBe('keyword')
    // …without clobbering the pre-existing persona proposal.
    expect(state.capturedProposals?.persona?.tone).toBe('formal')
    // The persona sentinel stays exactly as it was, and nothing new is set.
    expect(trueSentinels(state)).toEqual(['persona'])
  })

  // -------------------------------------------------------------------------
  // 4. guard — conversation not found
  // -------------------------------------------------------------------------
  it('returns success=false when the conversation is not found in the org (no write)', async () => {
    mockConvFindFirst.mockReset()
    mockConvFindFirst.mockResolvedValue(null)

    const execute = getExecute(proposeFieldValuesTool(CTX))

    const result = (await execute({ hours: { preset: 'qualquer' } })) as {
      success: boolean
      message: string
    }

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/conversa.*não encontrada/i)
    expect(mockConvUpdateMany).not.toHaveBeenCalled()
    expect(mockProjectUpdateMany).not.toHaveBeenCalled()
  })
})

describe('proposeFieldValuesInputSchema (whitelist)', () => {
  it('rejects an empty input (no domain at all)', () => {
    expect(proposeFieldValuesInputSchema.safeParse({}).success).toBe(false)
  })

  it('rejects an unknown top-level domain via .strict() (LLM cannot write arbitrary shape)', () => {
    const parsed = proposeFieldValuesInputSchema.safeParse({
      persona: { tone: 'formal' },
      // not a real capturedProposals domain — strict() must reject the whole input
      project: { name: 'hack' },
    })
    expect(parsed.success).toBe(false)
  })

  it('drops unknown keys inside a domain sub-shape (closed whitelist per domain)', () => {
    const parsed = proposeFieldValuesInputSchema.safeParse({
      persona: { tone: 'formal', injected: 'x' },
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.persona).toEqual({ tone: 'formal' })
      expect(
        (parsed.data.persona as Record<string, unknown>).injected,
      ).toBeUndefined()
    }
  })

  it('enforces per-field max-lengths (persona.tone > 300 rejected)', () => {
    expect(
      proposeFieldValuesInputSchema.safeParse({
        persona: { tone: 'x'.repeat(301) },
      }).success,
    ).toBe(false)
  })

  it('accepts a valid single-domain proposal', () => {
    expect(
      proposeFieldValuesInputSchema.safeParse({
        handoff: { mode: 'roleta', reason: 'advocacia' },
      }),
    ).toMatchObject({
      success: true,
      data: { handoff: { mode: 'roleta', reason: 'advocacia' } },
    })
  })
})
