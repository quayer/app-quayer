import { describe, it, expect, vi, beforeEach } from 'vitest'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const SOURCE_ID = '22222222-2222-4222-8222-222222222222'
const ORG_ID = 'org-1'
const USER_ID = 'user-1'
const CONVERSATION_ID = 'conv-1'
const COLLECTION_ID = 'col-1'
const SOURCE_VALUE = 'https://vibraresidencial.com.br'

const store = vi.hoisted(() => ({
  builderState: null as unknown,
  sourceStatus: 'ready',
}))

const mockLoadProject = vi.hoisted(() =>
  vi.fn(async () => ({ id: PROJECT_ID, aiAgentId: null, metadata: null })),
)
vi.mock('../knowledge/knowledge-helpers', () => ({
  loadProject: mockLoadProject,
}))

vi.mock('@/server/core/auth/procedures/api-key.procedure', () => ({
  authOrApiKeyProcedure: () => ({ name: 'authOrApiKeyProcedure', handler: vi.fn() }),
}))

const mockEnqueueSourceEnrich = vi.hoisted(() =>
  vi.fn(async () => ({ enqueued: true, transport: 'sync' as const })),
)
vi.mock('@/server/services/jobs/source-enrich.queue', () => ({
  enqueueSourceEnrich: mockEnqueueSourceEnrich,
}))

const mockKnowledgeCollectionFindFirst = vi.hoisted(() =>
  vi.fn(async () => ({ id: COLLECTION_ID })),
)
const mockKnowledgeSourceFindMany = vi.hoisted(() =>
  vi.fn(async () => [
    {
      id: SOURCE_ID,
      source: SOURCE_VALUE,
      type: 'url',
      status: store.sourceStatus,
      chunkCount: 3,
      error: null,
    },
  ]),
)
const mockKnowledgeSourceFindFirst = vi.hoisted(() =>
  vi.fn(async () => ({
    id: SOURCE_ID,
    source: SOURCE_VALUE,
    status: store.sourceStatus,
    chunkCount: 3,
    error: null,
  })),
)
const mockConversationFindFirst = vi.hoisted(() =>
  vi.fn(async () => ({ id: CONVERSATION_ID, builderState: store.builderState })),
)
const mockConversationFindUnique = vi.hoisted(() =>
  vi.fn(async () => ({ builderState: store.builderState })),
)
const mockConversationUpdateMany = vi.hoisted(() =>
  vi.fn(
    async (args: { data: { builderState: unknown } }): Promise<{ count: number }> => {
      store.builderState = args.data.builderState
      return { count: 1 }
    },
  ),
)

vi.mock('@/server/services/database', () => {
  const conversationDelegate = {
    findFirst: mockConversationFindFirst,
    findUnique: mockConversationFindUnique,
    updateMany: mockConversationUpdateMany,
  }
  const db = {
    knowledgeCollection: { findFirst: mockKnowledgeCollectionFindFirst },
    knowledgeSource: {
      findMany: mockKnowledgeSourceFindMany,
      findFirst: mockKnowledgeSourceFindFirst,
    },
    builderProjectConversation: conversationDelegate,
    $transaction: vi.fn(
      async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
        fn({ builderProjectConversation: conversationDelegate }),
    ),
  }
  return {
    database: db,
    getDatabase: () => db,
  }
})

import { sourcesRoutes } from './sources.routes'
import { parseBuilderState } from '../cards/builder-state'

type ResponseResult = { _status: number; _body: unknown; _kind: string }

function makeResponse() {
  let _status = 200
  let _body: unknown = null
  const response = {
    success(body: unknown) {
      _body = body
      _status = 200
      return { _status, _body, _kind: 'success' as const }
    },
    badRequest(msg: string) {
      _status = 400
      _body = { error: msg }
      return { _status, _body, _kind: 'badRequest' as const }
    },
    unauthorized(msg: string) {
      _status = 401
      _body = { error: msg }
      return { _status, _body, _kind: 'unauthorized' as const }
    },
    notFound(msg: string) {
      _status = 404
      _body = { error: msg }
      return { _status, _body, _kind: 'notFound' as const }
    },
  }
  return response
}

async function invoke(action: 'sourcesStatus' | 'retrySourceSynthesis') {
  const response = makeResponse()
  const handler = sourcesRoutes[action].handler as unknown as (args: {
    request: { params: Record<string, string>; body?: unknown }
    context: {
      auth?: { session?: { user?: { id: string; currentOrgId?: string } } }
    }
    response: ReturnType<typeof makeResponse>
  }) => Promise<ResponseResult>

  return handler({
    request: { params: { id: PROJECT_ID, sourceId: SOURCE_ID } },
    context: {
      auth: { session: { user: { id: USER_ID, currentOrgId: ORG_ID } } },
    },
    response,
  })
}

function sourceState(overrides: Record<string, unknown> = {}) {
  return {
    sourceIngestion: {
      sources: [
        {
          value: SOURCE_VALUE,
          type: 'url',
          status: 'ready',
          sourceId: SOURCE_ID,
          imagesStatus: 'ready',
          synthesisStatus: 'error',
          synthesisError: 'timeout',
          synthesisAttempts: 0,
          ...overrides,
        },
      ],
    },
    confirmations: { source: false },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  store.sourceStatus = 'ready'
  store.builderState = sourceState()
  mockEnqueueSourceEnrich.mockResolvedValue({
    enqueued: true,
    transport: 'sync',
  })
})

describe('sourcesStatus — synthesis failure contract', () => {
  it('exposes retry metadata when a source is ready but synthesis failed', async () => {
    const res = await invoke('sourcesStatus')

    expect(res._status).toBe(200)
    const body = res._body as {
      sources: Array<{
        status: string
        synthesisStatus: string
        synthesisError: string
        synthesisAttempts: number
        canRetrySynthesis: boolean
        retrySynthesis: { method: string; path: string } | null
      }>
    }
    expect(body.sources[0]).toMatchObject({
      status: 'ready',
      synthesisStatus: 'error',
      synthesisError: 'timeout',
      synthesisAttempts: 0,
      canRetrySynthesis: true,
      retrySynthesis: {
        method: 'POST',
        path: `/api/v1/builder/projects/${PROJECT_ID}/sources/${SOURCE_ID}/synthesis/retry`,
      },
    })
  })

  it('keeps poll status processing while synthesis is still running', async () => {
    store.builderState = sourceState({
      synthesisStatus: 'running',
      synthesisError: undefined,
    })

    const res = await invoke('sourcesStatus')
    const body = res._body as {
      sources: Array<{ status: string; synthesisStatus: string }>
    }

    expect(body.sources[0]).toMatchObject({
      status: 'processing',
      synthesisStatus: 'running',
    })
  })
})

describe('retrySourceSynthesis', () => {
  it('marks the source running and enqueues a synthesis-only retry once', async () => {
    const res = await invoke('retrySourceSynthesis')

    expect(res._status).toBe(200)
    expect(res._body).toMatchObject({
      ok: true,
      queued: true,
      sourceId: SOURCE_ID,
      synthesisStatus: 'running',
      synthesisAttempts: 1,
      canRetrySynthesis: false,
    })
    expect(mockEnqueueSourceEnrich).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT_ID,
        conversationId: CONVERSATION_ID,
        sourceIds: [SOURCE_ID],
        mode: 'synthesis_retry',
        synthesisAttempt: 1,
      }),
      expect.objectContaining({
        jobId: `source-synthesis-retry:${PROJECT_ID}:${SOURCE_ID}:1`,
      }),
    )

    const state = parseBuilderState(store.builderState)
    const mirror = state.sourceIngestion.sources[0]
    expect(mirror.synthesisStatus).toBe('running')
    expect(mirror.synthesisAttempts).toBe(1)
    expect(mirror.synthesisError).toBeUndefined()
  })

  it('does not enqueue a duplicate retry while the source is already running', async () => {
    store.builderState = sourceState({
      synthesisStatus: 'running',
      synthesisAttempts: 1,
      synthesisError: undefined,
    })

    const res = await invoke('retrySourceSynthesis')

    expect(res._status).toBe(200)
    expect(res._body).toMatchObject({
      ok: true,
      queued: false,
      reason: 'already_running',
      synthesisStatus: 'running',
      synthesisAttempts: 1,
    })
    expect(mockEnqueueSourceEnrich).not.toHaveBeenCalled()
  })
})
