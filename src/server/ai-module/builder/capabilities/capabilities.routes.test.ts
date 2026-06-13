import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockLoadProject,
  mockResolveCollectionId,
  mockHasActiveCalendarConnection,
  mockAgentToolFindMany,
  mockMediaAssetCount,
  mockKnowledgeImageCount,
  mockKnowledgeSourceCount,
} = vi.hoisted(() => ({
  mockLoadProject: vi.fn(),
  mockResolveCollectionId: vi.fn(),
  mockHasActiveCalendarConnection: vi.fn(),
  mockAgentToolFindMany: vi.fn(),
  mockMediaAssetCount: vi.fn(),
  mockKnowledgeImageCount: vi.fn(),
  mockKnowledgeSourceCount: vi.fn(),
}))

vi.mock('@/server/core/auth/procedures/api-key.procedure', () => ({
  authOrApiKeyProcedure: () => ({ name: 'authOrApiKeyProcedure', handler: vi.fn() }),
}))

vi.mock('@/server/services/database', () => ({
  database: {
    agentTool: { findMany: mockAgentToolFindMany },
    mediaAsset: { count: mockMediaAssetCount },
    knowledgeImage: { count: mockKnowledgeImageCount },
    knowledgeSource: { count: mockKnowledgeSourceCount },
  },
}))

vi.mock('../deploy/enabled-tools-derivation', () => ({
  hasActiveCalendarConnection: mockHasActiveCalendarConnection,
}))

vi.mock('../knowledge/knowledge-helpers', () => ({
  loadProject: mockLoadProject,
  resolveCollectionId: mockResolveCollectionId,
}))

import { capabilitiesRoutes } from './capabilities.routes'

type ResponseResult = { _status: number; _body: unknown; _kind: string }

function makeResponse() {
  let _status = 200
  let _body: unknown = null

  const response = {
    success(body: unknown) {
      _status = 200
      _body = body
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

async function invoke(args: {
  projectId?: string
  user?: { id: string; currentOrgId?: string | null }
}) {
  const response = makeResponse()
  const handler = capabilitiesRoutes.getCapabilities.handler as unknown as (params: {
    request: { params: { id?: string } }
    context: { auth?: { session?: { user?: { id: string; currentOrgId?: string | null } } } }
    response: ReturnType<typeof makeResponse>
  }) => Promise<ResponseResult>

  return handler({
    request: { params: { id: args.projectId } },
    context: args.user
      ? { auth: { session: { user: args.user } } }
      : { auth: { session: {} } },
    response,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadProject.mockResolvedValue({
    id: 'proj-1',
    aiAgentId: null,
    metadata: {},
  })
  mockResolveCollectionId.mockResolvedValue(null)
  mockHasActiveCalendarConnection.mockResolvedValue(false)
  mockAgentToolFindMany.mockResolvedValue([])
  mockMediaAssetCount.mockResolvedValue(0)
  mockKnowledgeImageCount.mockResolvedValue(0)
  mockKnowledgeSourceCount.mockResolvedValue(0)
})

describe('capabilitiesRoutes.getCapabilities', () => {
  it('retorna 401 quando nao ha usuario autenticado', async () => {
    const res = await invoke({ projectId: 'proj-1' })

    expect(res._status).toBe(401)
    expect(res._kind).toBe('unauthorized')
    expect(mockLoadProject).not.toHaveBeenCalled()
    expect(mockAgentToolFindMany).not.toHaveBeenCalled()
  })

  it('retorna 404 quando o projeto nao existe na org ativa', async () => {
    mockLoadProject.mockResolvedValueOnce(null)

    const res = await invoke({
      projectId: 'proj-missing',
      user: { id: 'user-1', currentOrgId: 'org-1' },
    })

    expect(res._status).toBe(404)
    expect(res._kind).toBe('notFound')
    expect(mockLoadProject).toHaveBeenCalledWith('proj-missing', 'org-1')
    expect(mockResolveCollectionId).not.toHaveBeenCalled()
    expect(mockAgentToolFindMany).not.toHaveBeenCalled()
  })

  it('cross-org devolve 404 e nao consulta capacidades do projeto alheio', async () => {
    mockLoadProject.mockResolvedValueOnce(null)

    const res = await invoke({
      projectId: 'proj-from-other-org',
      user: { id: 'user-1', currentOrgId: 'org-1' },
    })

    expect(res._status).toBe(404)
    expect(mockLoadProject).toHaveBeenCalledWith('proj-from-other-org', 'org-1')
    expect(mockResolveCollectionId).not.toHaveBeenCalled()
    expect(mockMediaAssetCount).not.toHaveBeenCalled()
    expect(mockKnowledgeImageCount).not.toHaveBeenCalled()
    expect(mockKnowledgeSourceCount).not.toHaveBeenCalled()
  })
})
