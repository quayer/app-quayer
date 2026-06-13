/**
 * integration-lifecycle.routes — ACTIVATION GATES + `enabledTools` writeback —
 * unit tests (Wave 1, T48).
 *
 * Scope: the activate / pause / delete ROUTE wiring around the lifecycle gates
 * and the runtime-catalog mirror (`reconcileEnabledTools` →
 * `AIAgentConfig.enabledTools` + `AgentTool.description`). We drive the REAL
 * `igniter.mutation` handlers (`integrationLifecycleRoutes.*.handler`) with a
 * minimal request/response harness — same approach as
 * `cards/card-submit.routes.test.ts` / `communication/messages/list.routes.test.ts`
 * — and mock the route's collaborators so we can assert WHICH writes run.
 *
 * The role-gate (ADMIN/MASTER) is covered by T47 — here we set the user role to
 * MASTER (membership found) so the gate always passes and the tests isolate the
 * ACTIVATION gates. The flag is mocked ON. `reconcileEnabledTools` is kept REAL
 * (pure, zero IO) so the set-merge plan actually runs and the assertion is on the
 * resulting `AIAgentConfig.update` payload.
 *
 * tasks T48:
 *   1. activate WITHOUT `project.aiAgentId` → badRequest (no published agent).
 *   2. activate happy path → ensures the tool name into `enabledTools` via
 *      `reconcileEnabledTools` + composes `triggerDescription` into the
 *      `AgentTool.description`.
 *   3. delete → REMOVES the tool name from `enabledTools` BEFORE the composite delete.
 *   4. pause → does NOT touch `enabledTools`.
 *   5. activate requires `status === 'validated'` AND last test `success`.
 *   6. 4th activation → `assertActiveIntegrationQuota` (REAL) throws inside the
 *      transaction (count mocked to 3) → route maps it to badRequest.
 *
 * Zero `any`.
 *
 * Rodar:
 *   npx vitest run src/server/ai-module/builder/integrations/integration-lifecycle.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — hoisted before any import that touches the route's collaborators.
// ---------------------------------------------------------------------------

// --- Database (the route reaches the live client through `getDatabase()`). ---
const mockProjectFindFirst = vi.hoisted(() => vi.fn())
const mockAgentToolFindUnique = vi.hoisted(() => vi.fn())
const mockAgentConfigFindFirst = vi.hoisted(() => vi.fn())
const mockAgentConfigUpdate = vi.hoisted(() => vi.fn())
const mockAuditCreate = vi.hoisted(() => vi.fn())
const mockTransaction = vi.hoisted(() => vi.fn())

// Transaction-scoped (`tx`) spies — what the activate path writes atomically.
const mockTxIntegrationCount = vi.hoisted(() => vi.fn())
const mockTxIntegrationUpdate = vi.hoisted(() => vi.fn())
const mockTxAgentToolUpdate = vi.hoisted(() => vi.fn())
const mockTxAgentToolFindUnique = vi.hoisted(() => vi.fn())
const mockTxAgentConfigFindFirst = vi.hoisted(() => vi.fn())
const mockTxAgentConfigUpdate = vi.hoisted(() => vi.fn())
const mockInvalidateProjectRefinement = vi.hoisted(() => vi.fn())

/** The `tx` object handed to `db.$transaction(async (tx) => ...)`. */
const txClient = vi.hoisted(() => ({
  customIntegration: {
    count: mockTxIntegrationCount,
    update: mockTxIntegrationUpdate,
  },
  agentTool: {
    update: mockTxAgentToolUpdate,
    findUnique: mockTxAgentToolFindUnique,
  },
  aIAgentConfig: {
    findFirst: mockTxAgentConfigFindFirst,
    update: mockTxAgentConfigUpdate,
  },
}))

const dbClient = vi.hoisted(() => ({
  builderProject: { findFirst: mockProjectFindFirst },
  agentTool: { findUnique: mockAgentToolFindUnique },
  aIAgentConfig: {
    findFirst: mockAgentConfigFindFirst,
    update: mockAgentConfigUpdate,
  },
  auditLog: { create: mockAuditCreate },
  $transaction: mockTransaction,
}))

vi.mock('@/server/services/database', () => ({
  getDatabase: () => dbClient,
  database: dbClient,
}))

vi.mock('../refinement/refinement-state', () => ({
  invalidateProjectRefinement: mockInvalidateProjectRefinement,
}))

// Auth procedure is a no-op stub: the harness injects `context.auth` directly.
vi.mock('@/server/core/auth/procedures/api-key.procedure', () => ({
  authOrApiKeyProcedure: () => ({ name: 'authOrApiKeyProcedure', handler: vi.fn() }),
}))

// Flag ON for every test (the route 404s when off).
vi.mock('@/lib/feature-flags/integration-builder', () => ({
  isIntegrationBuilderEnabled: () => true,
  INTEGRATION_BUILDER_OVERRIDE_COOKIE: 'integration-builder-override',
}))

// Role-gate ALLOWS (MASTER/admin) — T47 owns the deny path; this suite isolates
// the activation gates.
const mockAssertRole = vi.hoisted(() => vi.fn())
vi.mock('./integration-access', () => ({
  assertIntegrationLifecycleRole: mockAssertRole,
}))

// Repository — getIntegration / setStatus / deleteIntegration mocked; the quota
// assertion + the typed error are kept REAL (the route does `instanceof` on it
// and we want the count→throw path to exercise the real code).
const mockGetIntegration = vi.hoisted(() => vi.fn())
const mockSetStatus = vi.hoisted(() => vi.fn())
const mockDeleteIntegration = vi.hoisted(() => vi.fn())
vi.mock('./integration.repository', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./integration.repository')>()
  return {
    ...actual,
    getIntegration: mockGetIntegration,
    setStatus: mockSetStatus,
    deleteIntegration: mockDeleteIntegration,
  }
})

// ---------------------------------------------------------------------------
// Imports — only after the mocks are registered. `reconcileEnabledTools` is the
// REAL pure helper (no IO) so the plan actually computes.
// ---------------------------------------------------------------------------

import { integrationLifecycleRoutes } from './integration-lifecycle.routes'

// ---------------------------------------------------------------------------
// Harness — minimal igniter-compatible request/response (mirrors card-submit).
// ---------------------------------------------------------------------------

type ResponseResult = { _status: number; _body: unknown; _kind: string }

function makeResponse() {
  let _status = 200
  let _body: unknown = null

  const response = {
    status(code: number) {
      _status = code
      return response
    },
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
    forbidden(msg: string) {
      _status = 403
      _body = { error: msg }
      return { _status, _body, _kind: 'forbidden' as const }
    },
    notFound(msg: string) {
      _status = 404
      _body = { error: msg }
      return { _status, _body, _kind: 'notFound' as const }
    },
  }
  return response
}

const ORG_ID = 'org-1'
const USER_ID = 'user-master-1'
const PROJECT_ID = 'proj-1'
const AGENT_ID = 'agent-1'
const INTEGRATION_ID = 'int-1'
const AGENT_TOOL_ID = 'tool-1'
const TOOL_NAME = 'rd_station_lead'

type HandlerKey = keyof typeof integrationLifecycleRoutes

interface InvokeArgs {
  route: HandlerKey
  params?: Record<string, string>
  body?: unknown
  currentOrgId?: string | null
  userId?: string
  role?: string | null
}

async function invoke({
  route,
  params = {},
  body,
  currentOrgId = ORG_ID,
  userId = USER_ID,
  role = 'USER', // MASTER membership found via the (mocked) role-gate.
}: InvokeArgs): Promise<ResponseResult> {
  const response = makeResponse()
  // O tipo do handler do Igniter (IgniterActionContext com realtime/plugins) não
  // sobrepõe o shape mínimo que injetamos no teste — cast via unknown é intencional.
  const handler = integrationLifecycleRoutes[route].handler as unknown as (args: {
    request: {
      params?: Record<string, string>
      body?: unknown
      headers: { get(name: string): string | null }
    }
    context: {
      auth?: {
        session?: {
          user?: { id: string; currentOrgId?: string | null; role?: string | null }
        }
      }
    }
    response: ReturnType<typeof makeResponse>
  }) => Promise<ResponseResult>

  return handler({
    request: { params, body, headers: { get: () => null } },
    context: { auth: { session: { user: { id: userId, currentOrgId, role } } } },
    response,
  })
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function validatedIntegration(over: Record<string, unknown> = {}) {
  return {
    id: INTEGRATION_ID,
    organizationId: ORG_ID,
    builderProjectId: PROJECT_ID,
    agentToolId: AGENT_TOOL_ID,
    displayName: 'RD Station',
    triggerDescription: 'Quando o lead pedir orçamento, registre no RD Station.',
    status: 'validated',
    lastTestStatus: 'success',
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockInvalidateProjectRefinement.mockResolvedValue(undefined)

  // Role-gate passes by default (T47 covers the deny path).
  mockAssertRole.mockResolvedValue({ allowed: true })

  // Project HAS a published agent by default.
  mockProjectFindFirst.mockResolvedValue({ id: PROJECT_ID, aiAgentId: AGENT_ID })

  // The transaction runner just invokes the callback with our `tx` spy.
  mockTransaction.mockImplementation(
    async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient),
  )

  // Inside the tx: quota OK (0 active), tool resolves to TOOL_NAME, agent exists
  // with an empty enabledTools so the ensure appends.
  mockTxIntegrationCount.mockResolvedValue(0)
  mockTxIntegrationUpdate.mockResolvedValue({ id: INTEGRATION_ID })
  mockTxAgentToolUpdate.mockResolvedValue({ id: AGENT_TOOL_ID })
  mockTxAgentToolFindUnique.mockResolvedValue({ name: TOOL_NAME })
  mockTxAgentConfigFindFirst.mockResolvedValue({ id: AGENT_ID, enabledTools: [] })
  mockTxAgentConfigUpdate.mockResolvedValue({ id: AGENT_ID })

  // Outside the tx (delete path).
  mockAgentToolFindUnique.mockResolvedValue({ name: TOOL_NAME })
  mockAgentConfigFindFirst.mockResolvedValue({
    id: AGENT_ID,
    enabledTools: [TOOL_NAME, 'get_pricing'],
  })
  mockAgentConfigUpdate.mockResolvedValue({ id: AGENT_ID })
  mockAuditCreate.mockResolvedValue({ id: 'audit-1' })

  mockSetStatus.mockResolvedValue({
    id: INTEGRATION_ID,
    displayName: 'RD Station',
    agentToolId: AGENT_TOOL_ID,
  })
  mockDeleteIntegration.mockResolvedValue({ id: INTEGRATION_ID })
})

// ===========================================================================
// 1) activate WITHOUT project.aiAgentId → badRequest (no published agent)
// ===========================================================================

describe('activate — gate: agente publicado', () => {
  it('rejeita com badRequest quando o projeto não tem aiAgentId', async () => {
    mockGetIntegration.mockResolvedValue(validatedIntegration())
    mockProjectFindFirst.mockResolvedValue({ id: PROJECT_ID, aiAgentId: null })

    const res = await invoke({
      route: 'activateIntegration',
      params: { id: INTEGRATION_ID },
    })

    expect(res._status).toBe(400)
    expect(res._kind).toBe('badRequest')
    expect(res._body).toEqual({
      error: 'O projeto ainda não tem um agente publicado.',
    })
    // O gate barra ANTES de abrir a transação de ativação.
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockTxAgentConfigUpdate).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// 5) activate requires status==='validated' AND last test success
// ===========================================================================

describe('activate — gate: validated + último teste success', () => {
  it('rejeita uma integração em draft (status != validated)', async () => {
    mockGetIntegration.mockResolvedValue(
      validatedIntegration({ status: 'draft' }),
    )

    const res = await invoke({
      route: 'activateIntegration',
      params: { id: INTEGRATION_ID },
    })

    expect(res._status).toBe(400)
    expect(res._body).toEqual({
      error: 'Teste a integração com sucesso antes de ativar.',
    })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('rejeita quando o último teste não teve sucesso (lastTestStatus != success)', async () => {
    mockGetIntegration.mockResolvedValue(
      validatedIntegration({ lastTestStatus: 'auth_error' }),
    )

    const res = await invoke({
      route: 'activateIntegration',
      params: { id: INTEGRATION_ID },
    })

    expect(res._status).toBe(400)
    expect(res._body).toEqual({
      error: 'Teste a integração com sucesso antes de ativar.',
    })
    expect(mockTransaction).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// 2) activate happy path → ensure tool into enabledTools + triggerDescription
//    composed into AgentTool.description
// ===========================================================================

describe('activate — happy path (writeback de enabledTools)', () => {
  it('anexa o nome da tool ao enabledTools via reconcileEnabledTools', async () => {
    mockGetIntegration.mockResolvedValue(validatedIntegration())

    const res = await invoke({
      route: 'activateIntegration',
      params: { id: INTEGRATION_ID },
    })

    expect(res._kind).toBe('success')
    expect(res._body).toEqual({ id: INTEGRATION_ID, status: 'active' })

    // O AIAgentConfig.update recebeu o nome da tool ADICIONADO (set-merge: a base
    // estava vazia, então o array final é exatamente [TOOL_NAME]).
    expect(mockTxAgentConfigUpdate).toHaveBeenCalledTimes(1)
    expect(mockTxAgentConfigUpdate).toHaveBeenCalledWith({
      where: { id: AGENT_ID },
      data: { enabledTools: { set: [TOOL_NAME] } },
    })
  })

  it('compõe o triggerDescription na AgentTool.description e marca isActive=true', async () => {
    mockGetIntegration.mockResolvedValue(validatedIntegration())

    await invoke({
      route: 'activateIntegration',
      params: { id: INTEGRATION_ID },
    })

    expect(mockTxAgentToolUpdate).toHaveBeenCalledWith({
      where: { id: AGENT_TOOL_ID },
      data: {
        isActive: true,
        description: 'Quando o lead pedir orçamento, registre no RD Station.',
      },
    })
  })

  it('preserva tools desconhecidas e não duplica quando a tool já está presente', async () => {
    mockGetIntegration.mockResolvedValue(validatedIntegration())
    // Agente já tem a tool + uma custom: reconcile NÃO deve mudar nada (no-op).
    mockTxAgentConfigFindFirst.mockResolvedValue({
      id: AGENT_ID,
      enabledTools: [TOOL_NAME, 'minha_tool_custom'],
    })

    await invoke({
      route: 'activateIntegration',
      params: { id: INTEGRATION_ID },
    })

    // plan.changed === false → o UPDATE é pulado (sem write no-op).
    expect(mockTxAgentConfigUpdate).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// 6) 4th activation rejected within the transaction (count → 3 → quota throws)
// ===========================================================================

describe('activate — gate: limite de 3 ativas (dentro da transação)', () => {
  it('mapeia IntegrationQuotaError para badRequest quando já há 3 ativas', async () => {
    mockGetIntegration.mockResolvedValue(validatedIntegration())
    // 3 já ativas → assertActiveIntegrationQuota (REAL) lança dentro do tx.
    mockTxIntegrationCount.mockResolvedValue(3)

    const res = await invoke({
      route: 'activateIntegration',
      params: { id: INTEGRATION_ID },
    })

    expect(res._status).toBe(400)
    expect(res._kind).toBe('badRequest')
    expect(res._body).toEqual({
      error: 'Limite de 3 integrações ativas atingido.',
    })
    // A quota barrou ANTES de qualquer write da ativação.
    expect(mockTxIntegrationUpdate).not.toHaveBeenCalled()
    expect(mockTxAgentConfigUpdate).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// 3) delete → REMOVE the tool name from enabledTools BEFORE the composite delete
// ===========================================================================

describe('delete — remove a key do enabledTools ANTES do delete composto', () => {
  it('chama reconcileEnabledTools com remove e atualiza o agente antes de deleteIntegration', async () => {
    mockGetIntegration.mockResolvedValue(validatedIntegration({ status: 'active' }))

    let updateOrder = -1
    let deleteOrder = -1
    let seq = 0
    mockAgentConfigUpdate.mockImplementation(async () => {
      updateOrder = seq++
      return { id: AGENT_ID }
    })
    mockDeleteIntegration.mockImplementation(async () => {
      deleteOrder = seq++
      return { id: INTEGRATION_ID }
    })

    const res = await invoke({
      route: 'removeIntegration',
      params: { id: INTEGRATION_ID },
    })

    expect(res._kind).toBe('success')
    expect(res._body).toEqual({ id: INTEGRATION_ID, deleted: true })

    // enabledTools tinha [TOOL_NAME, 'get_pricing']; o remove tira só TOOL_NAME e
    // PRESERVA a outra entrada.
    expect(mockAgentConfigUpdate).toHaveBeenCalledTimes(1)
    expect(mockAgentConfigUpdate).toHaveBeenCalledWith({
      where: { id: AGENT_ID },
      data: { enabledTools: { set: ['get_pricing'] } },
    })

    // O writeback aconteceu ANTES do delete composto (libera o @@unique do nome).
    expect(updateOrder).toBeGreaterThanOrEqual(0)
    expect(deleteOrder).toBeGreaterThan(updateOrder)
  })
})

// ===========================================================================
// 4) pause → does NOT touch enabledTools
// ===========================================================================

describe('pause — NÃO toca enabledTools', () => {
  it('pausa sem chamar AIAgentConfig.update (a tool fica anexada, só inativa)', async () => {
    const res = await invoke({
      route: 'pauseIntegration',
      params: { id: INTEGRATION_ID },
    })

    expect(res._kind).toBe('success')
    expect(res._body).toEqual({ id: INTEGRATION_ID, status: 'paused' })

    // O pause delega a setStatus('paused') e NÃO mexe no enabledTools de jeito nenhum.
    expect(mockSetStatus).toHaveBeenCalledWith(ORG_ID, INTEGRATION_ID, 'paused')
    expect(mockAgentConfigUpdate).not.toHaveBeenCalled()
    expect(mockTxAgentConfigUpdate).not.toHaveBeenCalled()
    // Pause não usa o reconcile via transação tampouco.
    expect(mockTransaction).not.toHaveBeenCalled()
  })
})
