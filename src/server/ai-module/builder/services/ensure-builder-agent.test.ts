/**
 * Tests for ensureBuilderAgent (anti-stale prompt fix).
 *
 * Strategy mirrors the builder tools tests: mock `@/server/services/database`
 * and `buildResolvedSystemPrompt`, then drive the service directly.
 *
 * Cases covered:
 *   1. create path — upsert.create carries the RESOLVED prompt (not the raw
 *      template) and, since the fresh row already matches, no update happens
 *   2. existing row with the SAME prompt (hash igual) → no update (no-op)
 *   3. existing row with a STALE prompt (hash divergente) → UPDATE systemPrompt
 *   4. builderPromptHash — deterministic 16-char hex, divergent for new content
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks (hoisted before any imports that touch them)
// ---------------------------------------------------------------------------

const mockUpsert = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())
const mockFindUnique = vi.hoisted(() => vi.fn())

vi.mock('@/server/services/database', () => ({
  database: {
    aIAgentConfig: {
      upsert: mockUpsert,
      update: mockUpdate,
      findUnique: mockFindUnique,
    },
  },
}))

const RESOLVED_PROMPT =
  'PROMPT RESOLVIDO — skills summary já substituído (sem token literal).'

vi.mock('../chat/handlers/build-system-prompt', () => ({
  buildResolvedSystemPrompt: vi.fn(async () => RESOLVED_PROMPT),
}))

// ---------------------------------------------------------------------------
// Imports after mocks are registered
// ---------------------------------------------------------------------------

import { ensureBuilderAgent, builderPromptHash } from './ensure-builder-agent'

const ORG_ID = 'org-test'

describe('ensureBuilderAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // 1. create path — resolved prompt persisted; fresh row → no update
  // -------------------------------------------------------------------------
  it('creates with the RESOLVED prompt and skips the update when fresh', async () => {
    mockUpsert.mockResolvedValue({
      id: 'agent-1',
      systemPrompt: RESOLVED_PROMPT,
    })

    const agent = await ensureBuilderAgent(ORG_ID)

    expect(mockUpsert).toHaveBeenCalledOnce()
    const upsertArgs = mockUpsert.mock.calls[0]![0] as {
      create: { systemPrompt: string }
      update: Record<string, unknown>
    }
    expect(upsertArgs.create.systemPrompt).toBe(RESOLVED_PROMPT)
    expect(upsertArgs.create.systemPrompt).not.toContain('{{SKILLS_SUMMARY}}')
    expect(upsertArgs.update).toEqual({})

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(agent).toEqual({ id: 'agent-1', systemPrompt: RESOLVED_PROMPT })
  })

  // -------------------------------------------------------------------------
  // 2. existing row, same hash → no-op
  // -------------------------------------------------------------------------
  it('does NOT update when the stored prompt hash matches the resolved one', async () => {
    mockUpsert.mockResolvedValue({
      id: 'agent-1',
      systemPrompt: RESOLVED_PROMPT,
    })

    await ensureBuilderAgent(ORG_ID)

    expect(mockUpdate).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 3. existing row, divergent hash → UPDATE systemPrompt
  // -------------------------------------------------------------------------
  it('updates the systemPrompt when the stored prompt is stale (hash divergente)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockUpsert.mockResolvedValue({
      id: 'agent-1',
      systemPrompt: 'PROMPT VELHO com {{SKILLS_SUMMARY}} literal',
    })
    mockUpdate.mockResolvedValue({
      id: 'agent-1',
      systemPrompt: RESOLVED_PROMPT,
    })

    const agent = await ensureBuilderAgent(ORG_ID)

    expect(mockUpdate).toHaveBeenCalledOnce()
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'agent-1' },
      data: { systemPrompt: RESOLVED_PROMPT },
    })
    expect(agent).toEqual({ id: 'agent-1', systemPrompt: RESOLVED_PROMPT })
    logSpy.mockRestore()
  })

  it('updates when the existing row has a NULL systemPrompt', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockUpsert.mockResolvedValue({ id: 'agent-1', systemPrompt: null })
    mockUpdate.mockResolvedValue({
      id: 'agent-1',
      systemPrompt: RESOLVED_PROMPT,
    })

    await ensureBuilderAgent(ORG_ID)

    expect(mockUpdate).toHaveBeenCalledOnce()
    logSpy.mockRestore()
  })

  it('recovers from P2002 on upsert by re-reading the existing builder agent', async () => {
    mockUpsert.mockRejectedValue({ code: 'P2002' })
    mockFindUnique.mockResolvedValue({
      id: 'agent-1',
      systemPrompt: RESOLVED_PROMPT,
    })

    const agent = await ensureBuilderAgent(ORG_ID)

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: {
        organizationId_name: {
          organizationId: ORG_ID,
          name: '__quayer_builder__',
        },
      },
    })
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(agent).toEqual({ id: 'agent-1', systemPrompt: RESOLVED_PROMPT })
  })
})

describe('builderPromptHash', () => {
  it('is deterministic and 16-char hex', () => {
    const a = builderPromptHash('conteúdo X')
    const b = builderPromptHash('conteúdo X')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{16}$/)
  })

  it('diverges for different content', () => {
    expect(builderPromptHash('prompt v1')).not.toBe(builderPromptHash('prompt v2'))
  })
})
