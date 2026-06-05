/**
 * Unit tests — teachAgentTool (QH-07b)
 *
 * Strategy: mock the heavy infrastructure (Prisma, ingestSourceRefs,
 * enqueueSourceEnrich, patchSourceIngestionAtomic) and verify the tool's
 * orchestration logic:
 *   - org boundary enforced (project not found → graceful error)
 *   - conversation not found → graceful error
 *   - url kind delegates to ingestSourceRefs
 *   - text kind creates KnowledgeSource + seeds state + enqueues job
 *   - success returns status='learning' + correct label
 *   - thrown errors are caught and returned as { success: false }
 *
 * Hermetic: no real DB, no network.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Infrastructure mocks (set up BEFORE importing the module under test)
// vi.hoisted() ensures these refs are available inside vi.mock factories,
// which are hoisted to the top of the file by Vitest's transform.
// ---------------------------------------------------------------------------

const {
  mockLoadProject,
  mockEnsureCollectionIdOrThrow,
  mockIngestSourceRefs,
  mockEnqueueSourceEnrich,
  mockPatchSourceIngestionAtomic,
  mockDbKnowledgeSourceCreate,
  mockDbConversationFindFirst,
} = vi.hoisted(() => ({
  mockLoadProject: vi.fn(),
  mockEnsureCollectionIdOrThrow: vi.fn(),
  mockIngestSourceRefs: vi.fn(),
  mockEnqueueSourceEnrich: vi.fn(),
  mockPatchSourceIngestionAtomic: vi.fn(),
  mockDbKnowledgeSourceCreate: vi.fn(),
  mockDbConversationFindFirst: vi.fn(),
}))

vi.mock('@/server/ai-module/builder/knowledge/knowledge-helpers', () => ({
  loadProject: mockLoadProject,
  ensureCollectionIdOrThrow: mockEnsureCollectionIdOrThrow,
}))

vi.mock('@/server/ai-module/builder/sources/ingest-source-refs', () => ({
  ingestSourceRefs: mockIngestSourceRefs,
}))

vi.mock('@/server/services/jobs/source-enrich.queue', () => ({
  enqueueSourceEnrich: mockEnqueueSourceEnrich,
}))

vi.mock('@/server/ai-module/builder/sources/builder-state-db', () => ({
  patchSourceIngestionAtomic: mockPatchSourceIngestionAtomic,
}))

vi.mock('@/server/services/database', () => ({
  database: {
    builderProjectConversation: {
      findFirst: mockDbConversationFindFirst,
    },
    knowledgeSource: {
      create: mockDbKnowledgeSourceCreate,
    },
  },
}))

// ---------------------------------------------------------------------------
// Import SUT after mocks are in place
// ---------------------------------------------------------------------------

import { teachAgentTool } from './teach-agent.tool'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CTX = {
  projectId: 'proj-uuid-001',
  organizationId: 'org-uuid-001',
  userId: 'user-uuid-001',
}

const PROJECT_ROW = {
  id: 'proj-uuid-001',
  aiAgentId: 'agent-uuid-001',
  metadata: {},
}

const CONVERSATION_ID = 'conv-uuid-001'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extracts the execute function from the AI SDK tool wrapper. */
async function executeInput(input: unknown) {
  const builtTool = teachAgentTool(CTX)
  // The tool() helper from the AI SDK stores execute on the tool object.
  // buildBuilderTool shallow-copies it, so execute lives at builtTool.execute.
  const executeFn = (builtTool as unknown as { execute: (i: unknown) => Promise<unknown> }).execute
  return executeFn(input)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('teachAgentTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default happy-path stubs
    mockLoadProject.mockResolvedValue(PROJECT_ROW)
    mockDbConversationFindFirst.mockResolvedValue({ id: CONVERSATION_ID })
    mockIngestSourceRefs.mockResolvedValue({ collectionId: 'coll-1', sources: [] })
    mockEnsureCollectionIdOrThrow.mockResolvedValue('coll-1')
    mockDbKnowledgeSourceCreate.mockResolvedValue({ id: 'ks-uuid-001' })
    mockPatchSourceIngestionAtomic.mockResolvedValue(true)
    mockEnqueueSourceEnrich.mockResolvedValue(undefined)
  })

  // ── Metadata ──────────────────────────────────────────────────────────────

  it('has __metadata with name=teach_agent and isReadOnly=false', () => {
    const t = teachAgentTool(CTX) as unknown as { __metadata: Record<string, unknown> }
    expect(t.__metadata.name).toBe('teach_agent')
    expect(t.__metadata.isReadOnly).toBe(false)
    expect(t.__metadata.requiresApproval).toBe(false)
  })

  // ── Project not found ─────────────────────────────────────────────────────

  it('returns success=false when project not found in org', async () => {
    mockLoadProject.mockResolvedValue(null)
    const result = await executeInput({
      source: { kind: 'url', value: 'https://acme.com.br' },
    })
    expect(result).toMatchObject({ success: false })
    expect(mockIngestSourceRefs).not.toHaveBeenCalled()
  })

  // ── Conversation not found ────────────────────────────────────────────────

  it('returns success=false when conversation not found', async () => {
    mockDbConversationFindFirst.mockResolvedValue(null)
    const result = await executeInput({
      source: { kind: 'url', value: 'https://acme.com.br' },
    })
    expect(result).toMatchObject({ success: false })
    expect(mockIngestSourceRefs).not.toHaveBeenCalled()
  })

  // ── URL kind ──────────────────────────────────────────────────────────────

  it('delegates url sources to ingestSourceRefs with correct args', async () => {
    const result = await executeInput({
      source: { kind: 'url', value: 'https://acme.com.br/precos' },
      goal: 'tabela de preços',
    })

    expect(result).toMatchObject({
      success: true,
      status: 'learning',
      sourceKind: 'url',
    })

    expect(mockIngestSourceRefs).toHaveBeenCalledOnce()
    expect(mockIngestSourceRefs).toHaveBeenCalledWith({
      project: PROJECT_ROW,
      conversationId: CONVERSATION_ID,
      organizationId: CTX.organizationId,
      userId: CTX.userId,
      refs: [{ value: 'https://acme.com.br/precos', type: 'url' }],
    })

    // Text path helpers must NOT be called
    expect(mockDbKnowledgeSourceCreate).not.toHaveBeenCalled()
    expect(mockEnqueueSourceEnrich).not.toHaveBeenCalled()
  })

  it('url result message includes the URL and the goal', async () => {
    const result = await executeInput({
      source: { kind: 'url', value: 'https://acme.com.br' },
      goal: 'informações de produtos',
    }) as { message: string }
    expect(result.message).toContain('https://acme.com.br')
    expect(result.message).toContain('informações de produtos')
  })

  // ── Text kind ─────────────────────────────────────────────────────────────

  it('creates KnowledgeSource and enqueues job for text sources', async () => {
    const content = 'Preço do produto A: R$50. Preço do produto B: R$80.'
    const result = await executeInput({
      source: { kind: 'text', value: content },
    })

    expect(result).toMatchObject({
      success: true,
      status: 'learning',
      sourceKind: 'text',
    })

    // Must NOT call ingestSourceRefs (url-only pipeline)
    expect(mockIngestSourceRefs).not.toHaveBeenCalled()

    // Must ensure collection
    expect(mockEnsureCollectionIdOrThrow).toHaveBeenCalledWith(
      PROJECT_ROW,
      CTX.organizationId,
    )

    // Must create the KnowledgeSource with type='text' and source=content
    expect(mockDbKnowledgeSourceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'text',
          source: content,
          status: 'pending',
          organizationId: CTX.organizationId,
        }),
      }),
    )

    // Must seed the builderState
    expect(mockPatchSourceIngestionAtomic).toHaveBeenCalledWith(
      CONVERSATION_ID,
      CTX.organizationId,
      expect.objectContaining({
        seedSources: expect.arrayContaining([
          expect.objectContaining({ sourceId: 'ks-uuid-001', status: 'pending' }),
        ]),
      }),
    )

    // Must enqueue the async job with the new sourceId
    expect(mockEnqueueSourceEnrich).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: CTX.organizationId,
        userId: CTX.userId,
        projectId: CTX.projectId,
        conversationId: CONVERSATION_ID,
        sourceIds: ['ks-uuid-001'],
      }),
    )
  })

  // ── Error handling ────────────────────────────────────────────────────────

  it('catches thrown errors and returns success=false', async () => {
    mockIngestSourceRefs.mockRejectedValue(new Error('Redis down'))
    const result = await executeInput({
      source: { kind: 'url', value: 'https://acme.com.br' },
    })
    expect(result).toMatchObject({ success: false, message: 'Redis down' })
  })

  it('handles non-Error throws gracefully', async () => {
    mockIngestSourceRefs.mockRejectedValue('boom')
    const result = await executeInput({
      source: { kind: 'url', value: 'https://acme.com.br' },
    })
    expect(result).toMatchObject({ success: false })
    expect((result as { message: string }).message).toBeTruthy()
  })
})
