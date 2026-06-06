/**
 * Tests for revert_prompt tool (QH-07d).
 *
 * Strategy mirrors edit-prompt-section.tool.test.ts: the execute handler is
 * DB-dependent, so we mock `@/server/services/database` (no real DB) and drive
 * the raw Vercel AI SDK execute function.
 *
 * DB mock (builderPromptVersion.findFirst is called up to twice per run):
 *   call 1 → active version resolution
 *   call 2 → target version resolution (explicit id OR "previous")
 *
 * Cases covered:
 *   1. happy path — target: 'previous' rolls back and creates rollback draft
 *   2. happy path — explicit targetVersionId rolls back
 *   3. guard — no version history (active findFirst → null) → success=false
 *   4. guard — no earlier version for "previous" → success=false, no persist
 *   5. guard — target not found by id → success=false, no persist
 *   6. guard — agent not in project → success=false, no persist
 *   7. guard — neither targetVersionId nor target provided → success=false
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks (hoisted before any imports that touch them)
// ---------------------------------------------------------------------------

const mockFindFirstProject = vi.hoisted(() => vi.fn())
const mockFindFirstVersion = vi.hoisted(() => vi.fn())
const mockCreateVersion = vi.hoisted(() => vi.fn())

vi.mock('@/server/services/database', () => ({
  database: {
    builderProject: {
      findFirst: mockFindFirstProject,
    },
    builderPromptVersion: {
      findFirst: mockFindFirstVersion,
      create: mockCreateVersion,
    },
  },
}))

// ---------------------------------------------------------------------------
// Imports after mocks are registered
// ---------------------------------------------------------------------------

import { revertPromptTool } from './revert-prompt.tool'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CTX = {
  projectId: 'proj-test',
  organizationId: 'org-test',
  userId: 'user-test',
}

const AGENT_ID = '00000000-0000-0000-0000-000000000001'
const TARGET_VERSION_ID = '00000000-0000-0000-0000-0000000000a2'

// Helper: extract the raw Vercel AI SDK execute function from the tool.
function getExecute(t: ReturnType<typeof revertPromptTool>) {
  return (t as unknown as { execute: (...a: unknown[]) => Promise<unknown> }).execute
}

describe('revertPromptTool — handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default happy-path stubs: project guard passes.
    mockFindFirstProject.mockResolvedValue({ id: 'proj-1' })
    mockCreateVersion.mockResolvedValue({ id: 'ver-new-1' })
  })

  // -------------------------------------------------------------------------
  // 1. happy path — target: 'previous'
  // -------------------------------------------------------------------------
  it('previous: rolls back to the version below active and creates a rollback draft', async () => {
    mockFindFirstVersion
      // active version
      .mockResolvedValueOnce({ id: 'ver-5', versionNumber: 5 })
      // previous version
      .mockResolvedValueOnce({ id: 'ver-4', versionNumber: 4, content: 'PROMPT V4' })

    const execute = getExecute(revertPromptTool(CTX))

    const result = (await execute({
      agentId: AGENT_ID,
      target: 'previous',
    })) as {
      success: boolean
      versionNumber?: number
      versionId?: string
      revertedToVersionNumber?: number
    }

    expect(result.success).toBe(true)
    expect(result.versionNumber).toBe(6)
    expect(result.versionId).toBe('ver-new-1')
    expect(result.revertedToVersionNumber).toBe(4)

    expect(mockCreateVersion).toHaveBeenCalledOnce()
    const createCall = mockCreateVersion.mock.calls[0]![0] as {
      data: { content: string; createdBy: string; versionNumber: number }
    }
    expect(createCall.data.content).toBe('PROMPT V4')
    expect(createCall.data.createdBy).toBe('rollback')
    expect(createCall.data.versionNumber).toBe(6)
  })

  // -------------------------------------------------------------------------
  // 2. happy path — explicit targetVersionId
  // -------------------------------------------------------------------------
  it('targetVersionId: rolls back to the exact version requested', async () => {
    mockFindFirstVersion
      .mockResolvedValueOnce({ id: 'ver-5', versionNumber: 5 })
      .mockResolvedValueOnce({ id: TARGET_VERSION_ID, versionNumber: 2, content: 'PROMPT V2' })

    const execute = getExecute(revertPromptTool(CTX))

    const result = (await execute({
      agentId: AGENT_ID,
      targetVersionId: TARGET_VERSION_ID,
      description: 'desfaz mudança ruim',
    })) as { success: boolean; revertedToVersionNumber?: number; revertedToVersionId?: string }

    expect(result.success).toBe(true)
    expect(result.revertedToVersionNumber).toBe(2)
    expect(result.revertedToVersionId).toBe(TARGET_VERSION_ID)
    const createCall = mockCreateVersion.mock.calls[0]![0] as { data: { content: string } }
    expect(createCall.data.content).toBe('PROMPT V2')
  })

  // -------------------------------------------------------------------------
  // 3. guard — no version history
  // -------------------------------------------------------------------------
  it('returns success=false when the agent has no prompt version history', async () => {
    mockFindFirstVersion.mockResolvedValueOnce(null) // active resolution → none

    const execute = getExecute(revertPromptTool(CTX))

    const result = (await execute({
      agentId: AGENT_ID,
      target: 'previous',
    })) as { success: boolean; message: string }

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/no prompt version history/i)
    expect(mockCreateVersion).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 4. guard — no earlier version for "previous"
  // -------------------------------------------------------------------------
  it('returns success=false when there is no earlier version to revert to', async () => {
    mockFindFirstVersion
      .mockResolvedValueOnce({ id: 'ver-1', versionNumber: 1 }) // active
      .mockResolvedValueOnce(null) // no previous

    const execute = getExecute(revertPromptTool(CTX))

    const result = (await execute({
      agentId: AGENT_ID,
      target: 'previous',
    })) as { success: boolean; message: string }

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/no earlier version/i)
    expect(mockCreateVersion).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 5. guard — target id not found
  // -------------------------------------------------------------------------
  it('returns success=false when the explicit target version is not found', async () => {
    mockFindFirstVersion
      .mockResolvedValueOnce({ id: 'ver-5', versionNumber: 5 }) // active
      .mockResolvedValueOnce(null) // target id miss

    const execute = getExecute(revertPromptTool(CTX))

    const result = (await execute({
      agentId: AGENT_ID,
      targetVersionId: TARGET_VERSION_ID,
    })) as { success: boolean; message: string }

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/target version not found/i)
    expect(mockCreateVersion).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 6. guard — agent not in the active project
  // -------------------------------------------------------------------------
  it('returns success=false when the agent does not belong to the active project', async () => {
    mockFindFirstProject.mockResolvedValue(null)

    const execute = getExecute(revertPromptTool(CTX))

    const result = (await execute({
      agentId: AGENT_ID,
      target: 'previous',
    })) as { success: boolean; message: string }

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/does not belong/i)
    expect(mockFindFirstVersion).not.toHaveBeenCalled()
    expect(mockCreateVersion).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 7. guard — neither targetVersionId nor target provided
  // -------------------------------------------------------------------------
  it('returns success=false when no target selector is provided', async () => {
    const execute = getExecute(revertPromptTool(CTX))

    const result = (await execute({
      agentId: AGENT_ID,
    })) as { success: boolean; message: string }

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/targetVersionId.*previous|previous.*targetVersionId/i)
    expect(mockFindFirstProject).not.toHaveBeenCalled()
    expect(mockCreateVersion).not.toHaveBeenCalled()
  })
})
