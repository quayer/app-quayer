/**
 * integrations.routes — ROLE-GATE route tests (Wave 1, T47).
 *
 * Drives the REAL `igniter.mutation`/`igniter.query` handlers (from
 * `integrationsRoutes`) with a minimal request/response harness — same idiom as
 * `cards/card-submit.routes.test.ts` / `communication/messages/list.routes.test.ts`.
 *
 * What this suite asserts (T47 criteria):
 *  1. The role-gated LIFECYCLE/credentials mutations (updateIntegrationCredentials,
 *     testIntegration, activate, pause, resume, remove) return `forbidden` for a
 *     MANAGER, a USER, and a no-membership user.
 *  2. They are allowed (success) for an org MASTER and for a global UserRole.ADMIN
 *     (admin short-circuits WITHOUT any membership row).
 *  3. The reads (listProjectIntegrations, listTemplates) succeed for a MANAGER/USER
 *     — there is NO role-gate on reads, only org-scope.
 *
 * We exercise the REAL `assertIntegrationLifecycleRole` gate by mocking the DB so
 * its own `userOrganization.findFirst` returns the membership-under-test (per the
 * T47 brief — prefer mocking the db so the real gate runs). The repository, the
 * test runner, the quota service and the feature flag (forced ON) are mocked so
 * the routes reach the gate without 404'ing or hitting Redis/Prisma.
 *
 * Rodar:
 *   npx vitest run src/server/ai-module/builder/integrations/integrations.routes.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import { UserRole, OrganizationRole } from '@/lib/auth/roles'

// ---------------------------------------------------------------------------
// Mocks — hoisted before any import that touches the routes' collaborators.
// ---------------------------------------------------------------------------

// The role-gate's authoritative membership lookup + the db delegates the route
// handlers themselves touch (builderProject / auditLog / customIntegration /
// agentTool / aIAgentConfig / $transaction). `getDatabase()` and the `database`
// named export point at the SAME fake object.
const mockUserOrgFindFirst = vi.hoisted(() => vi.fn())
const mockBuilderProjectFindFirst = vi.hoisted(() => vi.fn())
const mockAuditLogCreate = vi.hoisted(() => vi.fn())
const mockCustomIntegrationFindMany = vi.hoisted(() => vi.fn())
const mockCustomIntegrationUpdate = vi.hoisted(() => vi.fn())
const mockAgentToolFindUnique = vi.hoisted(() => vi.fn())
const mockAgentToolUpdate = vi.hoisted(() => vi.fn())
const mockAgentConfigFindFirst = vi.hoisted(() => vi.fn())
const mockAgentConfigUpdate = vi.hoisted(() => vi.fn())

const fakeDb = vi.hoisted(() => {
  const db = {
    userOrganization: { findFirst: undefined as unknown },
    builderProject: { findFirst: undefined as unknown },
    auditLog: { create: undefined as unknown },
    customIntegration: { findMany: undefined as unknown, update: undefined as unknown },
    agentTool: { findUnique: undefined as unknown, update: undefined as unknown },
    aIAgentConfig: { findFirst: undefined as unknown, update: undefined as unknown },
    $transaction: undefined as unknown,
  }
  return db
})

vi.mock('@/server/services/database', () => ({
  database: fakeDb,
  getDatabase: () => fakeDb,
}))

// Auth procedure is a no-op stub: the harness injects `context.auth` directly.
vi.mock('@/server/core/auth/procedures/api-key.procedure', () => ({
  authOrApiKeyProcedure: () => ({ name: 'authOrApiKeyProcedure', handler: vi.fn() }),
}))

// Feature flag forced ON so routes don't 404 before reaching the gate.
vi.mock('@/lib/feature-flags/integration-builder', () => ({
  isIntegrationBuilderEnabled: () => true,
  INTEGRATION_BUILDER_OVERRIDE_COOKIE: 'integration-builder-override',
}))

// Crypto — the credentials route ciphers values via `encrypt`; this suite is
// about the role-gate, not the cipher, so stub it (avoids ENCRYPTION_KEY env).
vi.mock('@/lib/crypto', () => ({
  encrypt: (v: string) => `enc:${v}`,
  decrypt: (v: string) => v,
}))

// Quota service (testIntegration) — never hits Redis; always allows.
const mockCheckQuota = vi.hoisted(() => vi.fn())
vi.mock('@/server/ai-module/ai-agents/infra/rate-limit.service', () => ({
  checkFixedWindowQuota: mockCheckQuota,
}))

// Repository — the mutations' data layer (separate from the role-gate's db).
const mockGetIntegration = vi.hoisted(() => vi.fn())
const mockListIntegrations = vi.hoisted(() => vi.fn())
const mockSetStatus = vi.hoisted(() => vi.fn())
const mockDeleteIntegration = vi.hoisted(() => vi.fn())
const mockAssertActiveQuota = vi.hoisted(() => vi.fn())
const mockCreateDraft = vi.hoisted(() => vi.fn())
const mockUpdateCredentials = vi.hoisted(() => vi.fn())
vi.mock('./integration.repository', () => ({
  listIntegrations: mockListIntegrations,
  getIntegration: mockGetIntegration,
  setStatus: mockSetStatus,
  deleteIntegration: mockDeleteIntegration,
  assertActiveIntegrationQuota: mockAssertActiveQuota,
  createDraftIntegration: mockCreateDraft,
  updateCredentials: mockUpdateCredentials,
  // Error classes the routes `instanceof`-check.
  IntegrationNameConflictError: class IntegrationNameConflictError extends Error {},
  IntegrationQuotaError: class IntegrationQuotaError extends Error {},
}))

// Templates catalog — the reads return a static safe shape.
const mockListTemplates = vi.hoisted(() => vi.fn())
vi.mock('./templates', () => ({
  listIntegrationTemplates: mockListTemplates,
  getIntegrationTemplate: vi.fn(),
}))

// Test runner — never throws, never leaks secrets.
const mockRunTest = vi.hoisted(() => vi.fn())
vi.mock('./test-call.runner', () => ({
  runIntegrationTest: mockRunTest,
}))

// ---------------------------------------------------------------------------
// Imports — only after the mocks are registered.
// ---------------------------------------------------------------------------

import { integrationsRoutes } from './integrations.routes'

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

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const INTEGRATION_ID = '22222222-2222-4222-8222-222222222222'
const ORG_ID = 'org-1'
const USER_ID = 'user-1'

interface InvokeArgs {
  params?: Record<string, string>
  body?: unknown
  query?: Record<string, string>
  currentOrgId?: string | null
  userId?: string
  /** Global UserRole on the session user (admin short-circuits the gate). */
  role?: string
}

/** A handler shape loose enough for every route in `integrationsRoutes`. */
type AnyHandler = (args: {
  request: {
    params?: Record<string, string>
    body?: unknown
    query?: Record<string, string>
    headers: { get(name: string): string | null }
  }
  context: {
    auth?: {
      session?: {
        user?: { id: string; currentOrgId?: string | null; role?: string }
      }
    }
  }
  response: ReturnType<typeof makeResponse>
}) => Promise<ResponseResult | Response>

async function invoke(
  routeKey: keyof typeof integrationsRoutes,
  {
    params = {},
    body,
    query = {},
    currentOrgId = ORG_ID,
    userId = USER_ID,
    role,
  }: InvokeArgs,
): Promise<ResponseResult> {
  const response = makeResponse()
  // The Igniter handler's real context type (realtime/plugins) does not overlap
  // the minimal shape we inject — cast via unknown is intentional.
  const handler = integrationsRoutes[routeKey].handler as unknown as AnyHandler
  const res = await handler({
    request: {
      params,
      body,
      query,
      // No override cookie — the flag mock already forces ON.
      headers: { get: () => null },
    },
    context: { auth: { session: { user: { id: userId, currentOrgId, role } } } },
    response,
  })
  return res as ResponseResult
}

// ---------------------------------------------------------------------------
// Default happy-path stubs (per-test overrides tune the variants).
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()

  // Role-gate authoritative membership lookup — default: no MASTER membership.
  // Tests that need a MASTER set this to `{ id: 'm1' }`.
  fakeDb.userOrganization.findFirst = mockUserOrgFindFirst
  mockUserOrgFindFirst.mockResolvedValue(null)

  // Org-scoped project lookup the handlers do AFTER the gate (and the reads do).
  fakeDb.builderProject.findFirst = mockBuilderProjectFindFirst
  mockBuilderProjectFindFirst.mockResolvedValue({
    id: PROJECT_ID,
    aiAgentId: 'agent-1',
  })

  fakeDb.auditLog.create = mockAuditLogCreate
  mockAuditLogCreate.mockResolvedValue({})

  // Presence-only credentials read used by the list route.
  fakeDb.customIntegration.findMany = mockCustomIntegrationFindMany
  mockCustomIntegrationFindMany.mockResolvedValue([])
  fakeDb.customIntegration.update = mockCustomIntegrationUpdate
  mockCustomIntegrationUpdate.mockResolvedValue({ id: INTEGRATION_ID })

  fakeDb.agentTool.findUnique = mockAgentToolFindUnique
  mockAgentToolFindUnique.mockResolvedValue({ name: 'enviar_lead_rd' })
  fakeDb.agentTool.update = mockAgentToolUpdate
  mockAgentToolUpdate.mockResolvedValue({})

  fakeDb.aIAgentConfig.findFirst = mockAgentConfigFindFirst
  mockAgentConfigFindFirst.mockResolvedValue({ id: 'agent-1', enabledTools: [] })
  fakeDb.aIAgentConfig.update = mockAgentConfigUpdate
  mockAgentConfigUpdate.mockResolvedValue({})

  // `$transaction(cb)` runs the callback against the same fake db (tx === db).
  fakeDb.$transaction = (cb: (tx: typeof fakeDb) => Promise<unknown>) => cb(fakeDb)

  // Quota: allow by default.
  mockCheckQuota.mockResolvedValue({ allowed: true, resetMs: 0 })

  // Repository defaults — an integration that PASSES the activate/resume gates.
  mockListIntegrations.mockResolvedValue([])
  mockGetIntegration.mockResolvedValue({
    id: INTEGRATION_ID,
    builderProjectId: PROJECT_ID,
    displayName: 'RD Station',
    status: 'validated',
    lastTestStatus: 'success',
    agentToolId: 'tool-1',
    triggerDescription: 'Quando um lead pedir contato',
    credentialFields: [
      { key: 'api_token', label: 'Token', whereToGet: 'painel RD' },
    ],
  })
  mockSetStatus.mockResolvedValue({ id: INTEGRATION_ID, displayName: 'RD Station' })
  mockDeleteIntegration.mockResolvedValue({ id: INTEGRATION_ID })
  mockAssertActiveQuota.mockResolvedValue(undefined)
  mockUpdateCredentials.mockResolvedValue({ id: INTEGRATION_ID })
  mockRunTest.mockResolvedValue({
    outcome: 'success',
    diagnosis: 'OK',
    httpStatus: 200,
    durationMs: 42,
  })
  mockListTemplates.mockReturnValue([
    {
      slug: 'rd-station-crm',
      displayName: 'RD Station',
      description: 'CRM',
      triggerDescription: 'lead',
      credentialFields: [
        { key: 'api_token', label: 'Token', whereToGet: 'painel RD' },
      ],
    },
  ])
})

// ---------------------------------------------------------------------------
// The lifecycle/credentials mutations under role-gate. We sweep them all with
// the SAME role matrix so each scenario covers every gated route.
// ---------------------------------------------------------------------------

/** Routes that MUST pass `assertIntegrationLifecycleRole` before doing work. */
const GATED_MUTATIONS: {
  key: keyof typeof integrationsRoutes
  label: string
  body?: unknown
}[] = [
  {
    key: 'updateIntegrationCredentials',
    label: 'PATCH /integrations/:id/credentials',
    body: { values: { api_token: 'tok_live_123' } },
  },
  { key: 'testIntegration', label: 'POST /integrations/:id/test', body: {} },
  { key: 'activateIntegration', label: 'POST /integrations/:id/activate', body: {} },
  { key: 'pauseIntegration', label: 'POST /integrations/:id/pause', body: {} },
  { key: 'resumeIntegration', label: 'POST /integrations/:id/resume', body: {} },
  { key: 'removeIntegration', label: 'DELETE /integrations/:id', body: {} },
]

describe('integrations.routes — role-gate (T47)', () => {
  // -------------------------------------------------------------------------
  // 1) FORBIDDEN for MANAGER / USER / no membership
  // -------------------------------------------------------------------------
  describe('forbidden for non-MASTER, non-admin members', () => {
    for (const { key, label } of GATED_MUTATIONS) {
      it(`${label} → 403 for a MANAGER (no MASTER membership row)`, async () => {
        // The gate's findFirst filters `role: MASTER`; a MANAGER yields no row.
        mockUserOrgFindFirst.mockResolvedValue(null)
        const res = await invoke(key, {
          params: { id: INTEGRATION_ID },
          body: GATED_MUTATIONS.find((m) => m.key === key)?.body,
        })
        expect(res._kind).toBe('forbidden')
        expect(res._status).toBe(403)
      })

      it(`${label} → 403 for a USER`, async () => {
        mockUserOrgFindFirst.mockResolvedValue(null)
        const res = await invoke(key, {
          params: { id: INTEGRATION_ID },
          body: GATED_MUTATIONS.find((m) => m.key === key)?.body,
        })
        expect(res._kind).toBe('forbidden')
        expect(res._status).toBe(403)
      })

      it(`${label} → 403 for a user with NO membership`, async () => {
        mockUserOrgFindFirst.mockResolvedValue(null)
        const res = await invoke(key, {
          params: { id: INTEGRATION_ID },
          body: GATED_MUTATIONS.find((m) => m.key === key)?.body,
        })
        expect(res._kind).toBe('forbidden')
        expect(res._status).toBe(403)
        // The denied request never reached the data layer.
        expect(mockRunTest).not.toHaveBeenCalled()
        expect(mockSetStatus).not.toHaveBeenCalled()
        expect(mockDeleteIntegration).not.toHaveBeenCalled()
        expect(mockUpdateCredentials).not.toHaveBeenCalled()
      })
    }
  })

  // -------------------------------------------------------------------------
  // 2) ALLOWED for org MASTER and for global UserRole.ADMIN
  // -------------------------------------------------------------------------
  describe('allowed for org MASTER membership', () => {
    beforeEach(() => {
      // The gate's MASTER-filtered findFirst returns a membership row.
      mockUserOrgFindFirst.mockResolvedValue({ id: 'membership-1' })
    })

    for (const { key, label, body } of GATED_MUTATIONS) {
      it(`${label} → success for OrganizationRole.MASTER`, async () => {
        const res = await invoke(key, {
          params: { id: INTEGRATION_ID },
          body,
          // No global role → MASTER must come from the membership row.
          role: undefined,
        })
        expect(res._kind).toBe('success')
        expect(res._status).toBe(200)
        // Sanity: the gate consulted the membership (no admin short-circuit).
        expect(mockUserOrgFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              role: OrganizationRole.MASTER,
              organizationId: ORG_ID,
              userId: USER_ID,
            }),
          }),
        )
      })
    }
  })

  describe('allowed for global UserRole.ADMIN (short-circuits, no membership row)', () => {
    for (const { key, label, body } of GATED_MUTATIONS) {
      it(`${label} → success for an admin even with NO membership`, async () => {
        // No membership at all — the admin short-circuit must not touch the db.
        mockUserOrgFindFirst.mockResolvedValue(null)
        const res = await invoke(key, {
          params: { id: INTEGRATION_ID },
          body,
          role: UserRole.ADMIN,
        })
        expect(res._kind).toBe('success')
        expect(res._status).toBe(200)
        // ADMIN short-circuits BEFORE the membership lookup (no db hit).
        expect(mockUserOrgFindFirst).not.toHaveBeenCalled()
      })
    }
  })

  // -------------------------------------------------------------------------
  // 3) Reads are OPEN to all members (no role-gate, only org-scope)
  // -------------------------------------------------------------------------
  describe('reads open to any member (no role-gate)', () => {
    it('listProjectIntegrations → success for a MANAGER/USER (no MASTER membership)', async () => {
      mockUserOrgFindFirst.mockResolvedValue(null)
      const res = await invoke('listProjectIntegrations', {
        query: { projectId: PROJECT_ID },
        role: undefined,
      })
      expect(res._kind).toBe('success')
      expect(res._status).toBe(200)
      expect(res._body).toMatchObject({ integrations: [] })
      // No role-gate consulted on a read.
      expect(mockUserOrgFindFirst).not.toHaveBeenCalled()
      expect(mockListIntegrations).toHaveBeenCalledWith(ORG_ID, PROJECT_ID)
    })

    it('listTemplates → success for a MANAGER/USER (no MASTER membership)', async () => {
      mockUserOrgFindFirst.mockResolvedValue(null)
      const res = await invoke('listTemplates', { role: undefined })
      expect(res._kind).toBe('success')
      expect(res._status).toBe(200)
      expect(res._body).toMatchObject({
        templates: [expect.objectContaining({ slug: 'rd-station-crm' })],
      })
      expect(mockUserOrgFindFirst).not.toHaveBeenCalled()
    })
  })
})
