import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockConnectionFindFirst = vi.hoisted(() => vi.fn())
const mockConnectionUpdate = vi.hoisted(() => vi.fn())
const mockConnectionCreate = vi.hoisted(() => vi.fn())
const mockAttachConnectionToProjectAgent = vi.hoisted(() => vi.fn())

const dbClient = vi.hoisted(() => ({
  connection: {
    findFirst: mockConnectionFindFirst,
    update: mockConnectionUpdate,
    create: mockConnectionCreate,
  },
}))

vi.mock('@/server/services/database', () => ({
  getDatabase: () => dbClient,
  database: dbClient,
}))

vi.mock('@/server/core/auth/procedures/api-key.procedure', () => ({
  authOrApiKeyProcedure: () => ({ name: 'authOrApiKeyProcedure', handler: vi.fn() }),
}))

vi.mock('./attach-to-agent', () => ({
  attachConnectionToProjectAgent: mockAttachConnectionToProjectAgent,
}))

vi.mock('./channel-credentials.crypto', () => ({
  encryptSecretColumns: (columns: Record<string, unknown>) => columns,
  lastFour: (value: string | null | undefined) => value?.slice(-4) ?? null,
}))

import { channelCredentialsRoutes } from './channel-credentials.routes'

function makeResponse() {
  let _status = 200
  let _body: unknown = null

  const response = {
    success(body: unknown) {
      _status = 200
      _body = body
      return { _status, _body, _kind: 'success' as const }
    },
    badRequest(message: string) {
      _status = 400
      _body = { error: message }
      return { _status, _body, _kind: 'badRequest' as const }
    },
    unauthorized(message: string) {
      _status = 401
      _body = { error: message }
      return { _status, _body, _kind: 'unauthorized' as const }
    },
    notFound(message: string) {
      _status = 404
      _body = { error: message }
      return { _status, _body, _kind: 'notFound' as const }
    },
  }

  return response
}

type SaveBody =
  | {
      kind: 'instagram'
      igAccountId: string
      pageAccessToken: string
      appSecret: string
      verifyToken: string
      projectId?: string
      connectionId?: string
      name?: string
    }
  | {
      kind: 'whatsapp_cloud'
      accessToken: string
      phoneNumberId: string
      wabaId: string
      verifyToken: string
      projectId?: string
      connectionId?: string
      name?: string
    }

async function invokeSave(body: SaveBody) {
  return channelCredentialsRoutes.save.handler({
    request: { body },
    context: {
      auth: {
        session: {
          user: { id: 'user-1', currentOrgId: 'org-1' },
        },
      },
    },
    response: makeResponse(),
  } as never)
}

beforeEach(() => {
  mockConnectionFindFirst.mockReset()
  mockConnectionUpdate.mockReset()
  mockConnectionCreate.mockReset()
  mockAttachConnectionToProjectAgent.mockReset()
  mockAttachConnectionToProjectAgent.mockResolvedValue(undefined)
})

describe('channelCredentialsRoutes.save', () => {
  it('creates Instagram credentials as CONNECTED and links BuilderProject via AgentDeployment', async () => {
    mockConnectionCreate.mockResolvedValue({
      id: 'conn-ig',
      name: 'Instagram da loja',
      provider: 'INSTAGRAM_META',
      channel: 'INSTAGRAM',
      status: 'CONNECTED',
    })

    const result = await invokeSave({
      kind: 'instagram',
      igAccountId: '17841400000000000',
      pageAccessToken: 'EAAB-page-access-token-long-enough',
      appSecret: 'app-secret-long-enough',
      verifyToken: 'verify-token',
      projectId: '11111111-1111-4111-8111-111111111111',
      name: 'Instagram da loja',
    })

    expect(result).toMatchObject({
      _kind: 'success',
      _body: {
        connectionId: 'conn-ig',
        channel: 'INSTAGRAM',
        status: 'CONNECTED',
        created: true,
      },
    })

    const createArg = mockConnectionCreate.mock.calls[0]?.[0] as {
      data: Record<string, unknown>
    }
    expect(createArg.data.status).toBe('CONNECTED')
    expect(createArg.data.channel).toBe('INSTAGRAM')
    expect(createArg.data.provider).toBe('INSTAGRAM_META')
    expect(createArg.data.projectId).toBeUndefined()
    expect(mockAttachConnectionToProjectAgent).toHaveBeenCalledWith(
      dbClient,
      '11111111-1111-4111-8111-111111111111',
      'conn-ig',
      'org-1',
    )
  })

  it('updates manual channel credentials back to CONNECTED', async () => {
    mockConnectionFindFirst.mockResolvedValue({ id: 'conn-cloud' })
    mockConnectionUpdate.mockResolvedValue({
      id: 'conn-cloud',
      name: 'Cloud API',
      provider: 'WHATSAPP_CLOUD_API',
      channel: 'WHATSAPP',
      status: 'CONNECTED',
    })

    const result = await invokeSave({
      kind: 'whatsapp_cloud',
      connectionId: '22222222-2222-4222-8222-222222222222',
      accessToken: 'EAAB-cloud-access-token-long-enough',
      phoneNumberId: '109999999999',
      wabaId: '102333333333',
      verifyToken: 'verify-token',
    })

    expect(result).toMatchObject({
      _kind: 'success',
      _body: {
        connectionId: 'conn-cloud',
        channel: 'WHATSAPP',
        status: 'CONNECTED',
        created: false,
      },
    })

    const updateArg = mockConnectionUpdate.mock.calls[0]?.[0] as {
      data: Record<string, unknown>
    }
    expect(updateArg.data.status).toBe('CONNECTED')
    expect(updateArg.data.channel).toBe('WHATSAPP')
    expect(updateArg.data.provider).toBe('WHATSAPP_CLOUD_API')
  })
})
