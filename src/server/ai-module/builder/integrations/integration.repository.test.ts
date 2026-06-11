/**
 * integration.repository — Vitest unit (Integration Builder Wave 1, T44).
 *
 * Unidades puras do wrapper org-scoped do Integration Builder. Pina o CONTRATO
 * load-bearing descrito no header do repo (não relaxar):
 *
 *   1. Quota de ativas: `assertActiveIntegrationQuota` conta `status='active' +
 *      deletedAt:null` e lança `IntegrationQuotaError` em >= MAX (3); passa em 2.
 *      Soft-deletes NUNCA contam (where carrega `deletedAt: null`).
 *   2. Org-scoping: get/list/update/delete TODOS filtram por `organizationId`
 *      (+ `deletedAt: null` onde aplicável) — asserto o `where` passado ao Prisma.
 *   3. Recreate-after-delete: `deleteIntegration` num $transaction (a) SOFT-deleta
 *      a CustomIntegration (`deletedAt` + `agentToolId: null`) e (b) HARD-deleta o
 *      AgentTool via `deleteMany` org-scoped → libera o nome snake_case; em
 *      seguida `createDraftIntegration` com o MESMO toolName tem sucesso (pré-check
 *      não acha AgentTool vivo).
 *   4. createDraftIntegration: cria AgentTool (`isActive:false`, `type:'CUSTOM'`,
 *      `name=toolName`) e depois a CustomIntegration (`status:'draft'`); conflito
 *      de nome (pré-check OU P2002) → `IntegrationNameConflictError`.
 *   5. recordTestResult / setStatus: success transiciona draft→validated;
 *      setStatus('active') espelha `AgentTool.isActive=true`; pause espelha false.
 *
 * Estratégia de mock (espelha materialize-team.handler.test.ts e
 * projects.repository.journey.test.ts): `vi.hoisted` para cada delegate +
 * `vi.mock('@/server/services/database', () => ({ database, getDatabase: () =>
 * database }))`. O `$transaction` mockado invoca o callback com o PRÓPRIO
 * databaseMock, então `tx.<model>.<op>` resolve nos mesmos mocks hoisted — o que
 * permite asserir as chamadas dentro da transação. Zero `any` (mocks tipados via
 * `as unknown as` apenas na fronteira do mock / leitura de `mock.calls`).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { RequestSpec, CredentialFields } from './integration.schemas'

// ---------------------------------------------------------------------------
// Hoisted mocks — delegates de Prisma + $transaction
// ---------------------------------------------------------------------------

const mockIntegrationFindFirst = vi.hoisted(() => vi.fn())
const mockIntegrationFindMany = vi.hoisted(() => vi.fn())
const mockIntegrationCreate = vi.hoisted(() => vi.fn())
const mockIntegrationUpdate = vi.hoisted(() => vi.fn())
const mockIntegrationCount = vi.hoisted(() => vi.fn())
const mockAgentToolFindFirst = vi.hoisted(() => vi.fn())
const mockAgentToolCreate = vi.hoisted(() => vi.fn())
const mockAgentToolUpdate = vi.hoisted(() => vi.fn())
const mockAgentToolDeleteMany = vi.hoisted(() => vi.fn())
const mockTestCallCreate = vi.hoisted(() => vi.fn())

const databaseMock = vi.hoisted(() => ({
  customIntegration: {
    findFirst: mockIntegrationFindFirst,
    findMany: mockIntegrationFindMany,
    create: mockIntegrationCreate,
    update: mockIntegrationUpdate,
    count: mockIntegrationCount,
  },
  agentTool: {
    findFirst: mockAgentToolFindFirst,
    create: mockAgentToolCreate,
    update: mockAgentToolUpdate,
    deleteMany: mockAgentToolDeleteMany,
  },
  integrationTestCall: {
    create: mockTestCallCreate,
  },
  // $transaction(callback) → invoca o callback com o próprio databaseMock, então
  // os tx.<model>.<op> são os MESMOS mocks hoisted (asserções dentro da tx).
  $transaction: vi.fn(
    async (fn: (tx: typeof databaseMock) => Promise<unknown>) => fn(databaseMock),
  ),
}))

vi.mock('@/server/services/database', () => ({
  database: databaseMock,
  getDatabase: () => databaseMock,
}))

// ---------------------------------------------------------------------------
// Imports após o registro dos mocks
// ---------------------------------------------------------------------------

import {
  assertActiveIntegrationQuota,
  getIntegration,
  listIntegrations,
  updateCredentials,
  createDraftIntegration,
  recordTestResult,
  setStatus,
  deleteIntegration,
  IntegrationQuotaError,
  IntegrationNameConflictError,
  MAX_ACTIVE_INTEGRATIONS,
  type CreateDraftIntegrationInput,
} from './integration.repository'
import { Prisma } from '@prisma/client'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG = 'org-1'
const OTHER_ORG = 'org-2'
const PROJECT = 'proj-1'
const USER = 'user-1'
const INTEGRATION_ID = 'integ-1'
const AGENT_TOOL_ID = 'tool-1'
const TOOL_NAME = 'consultar_cep'

const REQUEST_SPEC: RequestSpec = {
  method: 'GET',
  url: 'https://example.com/api',
  auth: { type: 'bearer', credentialKey: 'api_key' },
  parameterMapping: [
    { name: 'cep', description: 'CEP a consultar', required: true },
  ],
}

const CREDENTIAL_FIELDS: CredentialFields = [
  { key: 'api_key', label: 'API Key', whereToGet: 'Painel do provedor' },
]

function draftInput(
  overrides: Partial<CreateDraftIntegrationInput> = {},
): CreateDraftIntegrationInput {
  return {
    organizationId: ORG,
    builderProjectId: PROJECT,
    createdById: USER,
    displayName: 'Consulta CEP',
    toolName: TOOL_NAME,
    requestSpec: REQUEST_SPEC,
    credentialFields: CREDENTIAL_FIELDS,
    ...overrides,
  }
}

/** Lê o primeiro argumento da n-ésima chamada de um mock sem `any`. */
function firstArg<T>(mock: ReturnType<typeof vi.fn>, callIndex = 0): T {
  return mock.mock.calls[callIndex]![0] as T
}

/** Transaction client mínimo (assertActiveIntegrationQuota recebe `tx`). */
const txStub = databaseMock as unknown as Prisma.TransactionClient

beforeEach(() => {
  vi.clearAllMocks()
  // Re-arma o $transaction (clearAllMocks zera a implementation).
  databaseMock.$transaction.mockImplementation(
    async (fn: (tx: typeof databaseMock) => Promise<unknown>) => fn(databaseMock),
  )
})

// ===========================================================================
// 1. Quota de ativas
// ===========================================================================

describe('assertActiveIntegrationQuota', () => {
  it('lança IntegrationQuotaError quando ja ha MAX (3) ativas', async () => {
    mockIntegrationCount.mockResolvedValue(MAX_ACTIVE_INTEGRATIONS)

    await expect(
      assertActiveIntegrationQuota(txStub, ORG),
    ).rejects.toBeInstanceOf(IntegrationQuotaError)
  })

  it('passa (nao lança) com 2 ativas — abaixo do cap', async () => {
    mockIntegrationCount.mockResolvedValue(2)

    await expect(
      assertActiveIntegrationQuota(txStub, ORG),
    ).resolves.toBeUndefined()
  })

  it('conta apenas status=active + deletedAt:null, org-scoped (soft-deletes nao contam)', async () => {
    mockIntegrationCount.mockResolvedValue(0)

    await assertActiveIntegrationQuota(txStub, ORG)

    expect(mockIntegrationCount).toHaveBeenCalledTimes(1)
    const arg = firstArg<{ where: Record<string, unknown> }>(mockIntegrationCount)
    expect(arg.where).toEqual({
      organizationId: ORG,
      status: 'active',
      deletedAt: null,
    })
  })
})

// ===========================================================================
// 2. Org-scoping (reads + write resolution + delete)
// ===========================================================================

describe('org-scoping', () => {
  it('getIntegration filtra por id + organizationId + deletedAt:null', async () => {
    mockIntegrationFindFirst.mockResolvedValue(null)

    await getIntegration(ORG, INTEGRATION_ID)

    const arg = firstArg<{ where: Record<string, unknown> }>(
      mockIntegrationFindFirst,
    )
    expect(arg.where).toEqual({
      id: INTEGRATION_ID,
      organizationId: ORG,
      deletedAt: null,
    })
  })

  it('getIntegration retorna null para outra org (nao vaza existencia)', async () => {
    mockIntegrationFindFirst.mockResolvedValue(null)

    const result = await getIntegration(OTHER_ORG, INTEGRATION_ID)

    expect(result).toBeNull()
    expect(firstArg<{ where: { organizationId: string } }>(
      mockIntegrationFindFirst,
    ).where.organizationId).toBe(OTHER_ORG)
  })

  it('listIntegrations filtra por organizationId + builderProjectId + deletedAt:null e nunca seleciona credentials', async () => {
    mockIntegrationFindMany.mockResolvedValue([])

    await listIntegrations(ORG, PROJECT)

    const arg = firstArg<{
      where: Record<string, unknown>
      select: Record<string, boolean>
    }>(mockIntegrationFindMany)
    expect(arg.where).toEqual({
      organizationId: ORG,
      builderProjectId: PROJECT,
      deletedAt: null,
    })
    // LIST_SELECT omite explicitamente o campo `credentials`.
    expect(arg.select).not.toHaveProperty('credentials')
  })

  it('updateCredentials resolve ownership org-scoped antes de escrever por id', async () => {
    mockIntegrationFindFirst.mockResolvedValue({ id: INTEGRATION_ID })
    mockIntegrationUpdate.mockResolvedValue({ id: INTEGRATION_ID })

    await updateCredentials(ORG, INTEGRATION_ID, { api_key: 'enc:xyz' })

    expect(
      firstArg<{ where: Record<string, unknown> }>(mockIntegrationFindFirst)
        .where,
    ).toEqual({ id: INTEGRATION_ID, organizationId: ORG, deletedAt: null })
    // Write por primary key resolvido pelo findFirst org-scoped.
    expect(
      firstArg<{ where: { id: string } }>(mockIntegrationUpdate).where,
    ).toEqual({ id: INTEGRATION_ID })
  })

  it('updateCredentials retorna null quando nao encontra/nao pertence (sem write)', async () => {
    mockIntegrationFindFirst.mockResolvedValue(null)

    const result = await updateCredentials(ORG, INTEGRATION_ID, { k: 'v' })

    expect(result).toBeNull()
    expect(mockIntegrationUpdate).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// 3. Delete composito + recreate-after-delete
// ===========================================================================

describe('deleteIntegration', () => {
  it('SOFT-deleta a integration (deletedAt + agentToolId:null) E HARD-deleta o AgentTool org-scoped', async () => {
    mockIntegrationFindFirst.mockResolvedValue({
      id: INTEGRATION_ID,
      agentToolId: AGENT_TOOL_ID,
    })
    mockIntegrationUpdate.mockResolvedValue({ id: INTEGRATION_ID })
    mockAgentToolDeleteMany.mockResolvedValue({ count: 1 })

    const result = await deleteIntegration(ORG, INTEGRATION_ID)

    expect(result).toEqual({ id: INTEGRATION_ID })

    // (a) soft-delete: deletedAt setado + agentToolId nulo (retém agentToolId:null).
    const updateArg = firstArg<{
      where: { id: string }
      data: { deletedAt: Date; agentToolId: null }
    }>(mockIntegrationUpdate)
    expect(updateArg.where).toEqual({ id: INTEGRATION_ID })
    expect(updateArg.data.deletedAt).toBeInstanceOf(Date)
    expect(updateArg.data.agentToolId).toBeNull()

    // (b) hard-delete do AgentTool, org-scoped (deleteMany defence-in-depth).
    expect(mockAgentToolDeleteMany).toHaveBeenCalledTimes(1)
    expect(
      firstArg<{ where: Record<string, unknown> }>(mockAgentToolDeleteMany)
        .where,
    ).toEqual({ id: AGENT_TOOL_ID, organizationId: ORG })
  })

  it('retorna null e nao toca nada quando nao encontra/cross-org', async () => {
    mockIntegrationFindFirst.mockResolvedValue(null)

    const result = await deleteIntegration(OTHER_ORG, INTEGRATION_ID)

    expect(result).toBeNull()
    expect(databaseMock.$transaction).not.toHaveBeenCalled()
    expect(mockIntegrationUpdate).not.toHaveBeenCalled()
    expect(mockAgentToolDeleteMany).not.toHaveBeenCalled()
  })

  it('recreate-after-delete: apos delete liberar o nome, createDraftIntegration com o MESMO toolName tem sucesso', async () => {
    // --- delete primeiro ---
    mockIntegrationFindFirst.mockResolvedValueOnce({
      id: INTEGRATION_ID,
      agentToolId: AGENT_TOOL_ID,
    })
    mockIntegrationUpdate.mockResolvedValue({ id: INTEGRATION_ID })
    mockAgentToolDeleteMany.mockResolvedValue({ count: 1 })

    await deleteIntegration(ORG, INTEGRATION_ID)

    // O hard-delete do AgentTool liberou o @@unique([organizationId, name]).
    // Agora o pre-check de unicidade NAO acha AgentTool vivo com esse nome.
    mockAgentToolFindFirst.mockResolvedValue(null)
    mockAgentToolCreate.mockResolvedValue({ id: 'tool-2' })
    mockIntegrationCreate.mockResolvedValue({ id: 'integ-2', status: 'draft' })

    const recreated = await createDraftIntegration(draftInput())

    expect(recreated).toEqual({ id: 'integ-2', status: 'draft' })
    // Pre-check rodou org-scoped pelo MESMO toolName e nao encontrou conflito.
    const precheck = firstArg<{ where: { organizationId: string; name: string } }>(
      mockAgentToolFindFirst,
    )
    expect(precheck.where).toEqual({ organizationId: ORG, name: TOOL_NAME })
  })
})

// ===========================================================================
// 4. createDraftIntegration
// ===========================================================================

describe('createDraftIntegration', () => {
  it('cria AgentTool inativo (type CUSTOM, name=toolName) e depois a CustomIntegration em draft', async () => {
    mockAgentToolFindFirst.mockResolvedValue(null)
    mockAgentToolCreate.mockResolvedValue({ id: AGENT_TOOL_ID })
    mockIntegrationCreate.mockResolvedValue({ id: INTEGRATION_ID, status: 'draft' })

    const result = await createDraftIntegration(draftInput())

    expect(result).toEqual({ id: INTEGRATION_ID, status: 'draft' })

    // AgentTool: isActive false, type CUSTOM, name = toolName, org-scoped.
    const toolArg = firstArg<{
      data: {
        organizationId: string
        name: string
        type: string
        isActive: boolean
      }
    }>(mockAgentToolCreate)
    expect(toolArg.data.organizationId).toBe(ORG)
    expect(toolArg.data.name).toBe(TOOL_NAME)
    expect(toolArg.data.type).toBe('CUSTOM')
    expect(toolArg.data.isActive).toBe(false)

    // CustomIntegration: status draft, vinculada ao AgentTool criado, org-scoped.
    const integArg = firstArg<{
      data: {
        organizationId: string
        builderProjectId: string
        agentToolId: string
        status: string
      }
    }>(mockIntegrationCreate)
    expect(integArg.data.status).toBe('draft')
    expect(integArg.data.organizationId).toBe(ORG)
    expect(integArg.data.builderProjectId).toBe(PROJECT)
    expect(integArg.data.agentToolId).toBe(AGENT_TOOL_ID)
  })

  it('pre-check acha AgentTool existente → IntegrationNameConflictError (sem abrir transacao)', async () => {
    mockAgentToolFindFirst.mockResolvedValue({ id: 'existing-tool' })

    await expect(createDraftIntegration(draftInput())).rejects.toBeInstanceOf(
      IntegrationNameConflictError,
    )
    expect(databaseMock.$transaction).not.toHaveBeenCalled()
    expect(mockAgentToolCreate).not.toHaveBeenCalled()
  })

  it('race no INSERT (P2002) → IntegrationNameConflictError tipado', async () => {
    mockAgentToolFindFirst.mockResolvedValue(null)
    // A transacao explode com o erro de unique do Prisma.
    databaseMock.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    )

    const err = await createDraftIntegration(draftInput()).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(IntegrationNameConflictError)
    expect((err as IntegrationNameConflictError).toolName).toBe(TOOL_NAME)
  })
})

// ===========================================================================
// 5. recordTestResult / setStatus
// ===========================================================================

describe('recordTestResult', () => {
  it('success transiciona draft → validated e grava IntegrationTestCall na mesma tx', async () => {
    mockIntegrationFindFirst.mockResolvedValue({
      id: INTEGRATION_ID,
      status: 'draft',
    })
    mockTestCallCreate.mockResolvedValue({ id: 'call-1' })
    mockIntegrationUpdate.mockResolvedValue({ id: INTEGRATION_ID, status: 'validated' })

    await recordTestResult({
      organizationId: ORG,
      id: INTEGRATION_ID,
      requestedById: USER,
      outcome: 'success',
      success: true,
      httpStatus: 200,
      durationMs: 123,
    })

    // Audit row na transacao, org-scoped.
    expect(mockTestCallCreate).toHaveBeenCalledTimes(1)
    expect(
      firstArg<{ data: { organizationId: string; outcome: string } }>(
        mockTestCallCreate,
      ).data.organizationId,
    ).toBe(ORG)

    // Update promove para validated + carimba validatedAt, zera errorClass.
    const updArg = firstArg<{
      data: { status?: string; lastTestErrorClass: string | null; validatedAt?: Date }
    }>(mockIntegrationUpdate)
    expect(updArg.data.status).toBe('validated')
    expect(updArg.data.lastTestErrorClass).toBeNull()
    expect(updArg.data.validatedAt).toBeInstanceOf(Date)
  })

  it('falha NAO promove status e grava lastTestErrorClass = outcome', async () => {
    mockIntegrationFindFirst.mockResolvedValue({
      id: INTEGRATION_ID,
      status: 'draft',
    })
    mockTestCallCreate.mockResolvedValue({ id: 'call-2' })
    mockIntegrationUpdate.mockResolvedValue({ id: INTEGRATION_ID, status: 'draft' })

    await recordTestResult({
      organizationId: ORG,
      id: INTEGRATION_ID,
      requestedById: USER,
      outcome: 'auth_error',
      success: false,
      httpStatus: 401,
      durationMs: 50,
    })

    const updArg = firstArg<{
      data: { status?: string; lastTestErrorClass: string | null }
    }>(mockIntegrationUpdate)
    expect(updArg.data.status).toBeUndefined()
    expect(updArg.data.lastTestErrorClass).toBe('auth_error')
  })

  it('NAO faz downgrade de uma integration active mesmo em success', async () => {
    mockIntegrationFindFirst.mockResolvedValue({
      id: INTEGRATION_ID,
      status: 'active',
    })
    mockTestCallCreate.mockResolvedValue({ id: 'call-3' })
    mockIntegrationUpdate.mockResolvedValue({ id: INTEGRATION_ID, status: 'active' })

    await recordTestResult({
      organizationId: ORG,
      id: INTEGRATION_ID,
      requestedById: USER,
      outcome: 'success',
      success: true,
      durationMs: 10,
    })

    expect(
      firstArg<{ data: { status?: string } }>(mockIntegrationUpdate).data.status,
    ).toBeUndefined()
  })

  it('retorna null e nao abre transacao quando nao encontra/cross-org', async () => {
    mockIntegrationFindFirst.mockResolvedValue(null)

    const result = await recordTestResult({
      organizationId: OTHER_ORG,
      id: INTEGRATION_ID,
      requestedById: USER,
      outcome: 'success',
      success: true,
      durationMs: 1,
    })

    expect(result).toBeNull()
    expect(databaseMock.$transaction).not.toHaveBeenCalled()
  })
})

describe('setStatus', () => {
  it("active espelha AgentTool.isActive = true na mesma tx", async () => {
    mockIntegrationFindFirst.mockResolvedValue({
      id: INTEGRATION_ID,
      agentToolId: AGENT_TOOL_ID,
    })
    mockIntegrationUpdate.mockResolvedValue({ id: INTEGRATION_ID, status: 'active' })
    mockAgentToolUpdate.mockResolvedValue({ id: AGENT_TOOL_ID })

    await setStatus(ORG, INTEGRATION_ID, 'active', {
      field: 'activated',
      userId: USER,
    })

    expect(
      firstArg<{ data: { status: string } }>(mockIntegrationUpdate).data.status,
    ).toBe('active')
    // Mirror do flag do catalogo de runtime.
    const toolArg = firstArg<{
      where: { id: string }
      data: { isActive: boolean }
    }>(mockAgentToolUpdate)
    expect(toolArg.where).toEqual({ id: AGENT_TOOL_ID })
    expect(toolArg.data.isActive).toBe(true)
  })

  it('paused espelha AgentTool.isActive = false', async () => {
    mockIntegrationFindFirst.mockResolvedValue({
      id: INTEGRATION_ID,
      agentToolId: AGENT_TOOL_ID,
    })
    mockIntegrationUpdate.mockResolvedValue({ id: INTEGRATION_ID, status: 'paused' })
    mockAgentToolUpdate.mockResolvedValue({ id: AGENT_TOOL_ID })

    await setStatus(ORG, INTEGRATION_ID, 'paused')

    expect(
      firstArg<{ data: { isActive: boolean } }>(mockAgentToolUpdate).data
        .isActive,
    ).toBe(false)
  })

  it('resolve ownership org-scoped e carimba o actor validated', async () => {
    mockIntegrationFindFirst.mockResolvedValue({
      id: INTEGRATION_ID,
      agentToolId: AGENT_TOOL_ID,
    })
    mockIntegrationUpdate.mockResolvedValue({ id: INTEGRATION_ID })
    mockAgentToolUpdate.mockResolvedValue({ id: AGENT_TOOL_ID })

    await setStatus(ORG, INTEGRATION_ID, 'validated', {
      field: 'validated',
      userId: USER,
    })

    expect(
      firstArg<{ where: Record<string, unknown> }>(mockIntegrationFindFirst)
        .where,
    ).toEqual({ id: INTEGRATION_ID, organizationId: ORG, deletedAt: null })
    const updArg = firstArg<{
      data: { validatedById?: string; validatedAt?: Date }
    }>(mockIntegrationUpdate)
    expect(updArg.data.validatedById).toBe(USER)
    expect(updArg.data.validatedAt).toBeInstanceOf(Date)
  })

  it('quando agentToolId ja foi nulado (pos-delete), nao tenta espelhar o AgentTool', async () => {
    mockIntegrationFindFirst.mockResolvedValue({
      id: INTEGRATION_ID,
      agentToolId: null,
    })
    mockIntegrationUpdate.mockResolvedValue({ id: INTEGRATION_ID, status: 'paused' })

    await setStatus(ORG, INTEGRATION_ID, 'paused')

    expect(mockAgentToolUpdate).not.toHaveBeenCalled()
  })

  it('retorna null e nao abre transacao quando nao encontra/cross-org', async () => {
    mockIntegrationFindFirst.mockResolvedValue(null)

    const result = await setStatus(OTHER_ORG, INTEGRATION_ID, 'active')

    expect(result).toBeNull()
    expect(databaseMock.$transaction).not.toHaveBeenCalled()
  })
})
