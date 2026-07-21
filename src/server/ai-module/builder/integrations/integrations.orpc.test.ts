/**
 * Builder Integrations (oRPC) — teste in-process do lote B6.
 *
 * Cobre: gate de feature-flag (off ⇒ 404 opaco), list mascarada (nunca
 * valores de credencial), role-gate lifecycle (user comum sem MASTER ⇒ 403)
 * e pause com espelho de status + AuditLog.
 *
 * Rodar:
 *   npx vitest run --config src/orpc/vitest.config.orpc.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'orpc-spike-test-secret-0123456789-abcdefghij'

const mockDb = vi.hoisted(() => {
  const fn = () => vi.fn()
  return {
    user: { findUnique: fn() },
    customRole: { findUnique: fn() },
    builderProject: { findFirst: fn() },
    customIntegration: { findMany: fn() },
    userOrganization: { findFirst: fn() },
    auditLog: { create: fn() },
  }
})

vi.mock('@/server/services/database', () => ({
  database: mockDb,
  getDatabase: () => mockDb,
}))
vi.mock(
  '@/server/ai-module/builder/integrations/integration.repository',
  async (importOriginal) => {
    const original = await importOriginal<
      typeof import('@/server/ai-module/builder/integrations/integration.repository')
    >()
    return {
      ...original,
      listIntegrations: vi.fn(),
      getIntegration: vi.fn(),
      createDraftIntegration: vi.fn(),
      updateCredentials: vi.fn(),
      setStatus: vi.fn(),
      deleteIntegration: vi.fn(),
      assertActiveIntegrationQuota: vi.fn(),
    }
  },
)
vi.mock('@/server/ai-module/builder/sources/builder-state-db', () => ({
  readBuilderStateByProject: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/server/ai-module/builder/refinement/refinement-state', () => ({
  invalidateProjectRefinement: vi.fn(),
}))
vi.mock('@/server/ai-module/builder/integrations/test-call.runner', () => ({
  runIntegrationTest: vi.fn(),
}))
vi.mock('@/server/ai-module/ai-agents/infra/rate-limit.service', () => ({
  checkFixedWindowQuota: vi.fn().mockResolvedValue({ allowed: true, resetMs: 0 }),
}))

import {
  listIntegrations,
  setStatus,
} from '@/server/ai-module/builder/integrations/integration.repository'
import { signAccessToken } from '@/lib/auth/jwt'
import { GET, POST } from '@/app/api/orpc/[[...rest]]/route'

const listFn = listIntegrations as unknown as ReturnType<typeof vi.fn>
const setStatusFn = setStatus as unknown as ReturnType<typeof vi.fn>

const BASE = 'http://localhost:3000/api/orpc'
const PROJECT_ID = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b51'
const INTEGRATION_ID = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b60'

function bearer(): string {
  const token = signAccessToken({
    userId: 'user-1',
    email: 'u@example.com',
    role: 'user',
    currentOrgId: 'org-1',
  } as Parameters<typeof signAccessToken>[0])
  return `Bearer ${token}`
}

function flagOnHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    authorization: bearer(),
    cookie: 'integration-builder-override=on',
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb.user.findUnique.mockResolvedValue({
    id: 'user-1',
    email: 'u@example.com',
    isActive: true,
    role: 'user',
    currentOrgId: 'org-1',
    organizations: [],
  })
})

describe('oRPC — builder integrations', () => {
  it('flag off responde 404 opaco (Recurso indisponível)', async () => {
    // Sem cookie de override e env default 'off'
    const res = await GET(
      new Request(`${BASE}/builder/integrations?projectId=${PROJECT_ID}`, {
        headers: { authorization: bearer() },
      }),
    )
    expect(res.status).toBe(404)
    expect(listFn).not.toHaveBeenCalled()
  })

  it('GET integrations lista MASCARADA — nunca ecoa valores de credencial', async () => {
    mockDb.builderProject.findFirst.mockResolvedValue({ id: PROJECT_ID })
    listFn.mockResolvedValue([
      {
        id: INTEGRATION_ID,
        displayName: 'CRM Notify',
        status: 'validated',
        triggerDescription: 'quando fechar venda',
        templateSlug: 'webhook-generic',
        lastTestAt: new Date('2026-07-20T10:00:00Z'),
        lastTestStatus: 'success',
        credentialFields: [
          { key: 'api_key', label: 'API Key', whereToGet: 'No painel do CRM' },
        ],
      },
    ])
    mockDb.customIntegration.findMany.mockResolvedValue([
      { id: INTEGRATION_ID, credentials: { api_key: 'ciphertext-super-secreto' } },
    ])

    const res = await GET(
      new Request(`${BASE}/builder/integrations?projectId=${PROJECT_ID}`, {
        headers: flagOnHeaders(),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { integrations: Array<Record<string, unknown>> }
    }
    expect(body.data.integrations[0]).toMatchObject({
      id: INTEGRATION_ID,
      hasCredentials: true,
      credentialFields: [
        expect.objectContaining({ key: 'api_key', filled: true }),
      ],
    })
    // O ciphertext NUNCA aparece na resposta
    expect(JSON.stringify(body)).not.toContain('ciphertext-super-secreto')
  })

  it('lifecycle nega user comum sem MASTER da org (403)', async () => {
    mockDb.userOrganization.findFirst.mockResolvedValue(null)

    const res = await POST(
      new Request(`${BASE}/builder/integrations/${INTEGRATION_ID}/pause`, {
        method: 'POST',
        headers: flagOnHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({}),
      }),
    )

    expect(res.status).toBe(403)
    expect(setStatusFn).not.toHaveBeenCalled()
  })

  it('POST pause (MASTER) espelha status paused e escreve AuditLog', async () => {
    mockDb.userOrganization.findFirst.mockResolvedValue({ id: 'membership-1' })
    setStatusFn.mockResolvedValue({
      id: INTEGRATION_ID,
      displayName: 'CRM Notify',
      builderProjectId: PROJECT_ID,
    })
    mockDb.auditLog.create.mockResolvedValue({})

    const res = await POST(
      new Request(`${BASE}/builder/integrations/${INTEGRATION_ID}/pause`, {
        method: 'POST',
        headers: flagOnHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({}),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { id: INTEGRATION_ID, status: 'paused' },
      error: null,
    })
    expect(setStatusFn).toHaveBeenCalledWith('org-1', INTEGRATION_ID, 'paused')
    expect(mockDb.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'integration.paused' }),
      }),
    )
  })
})
