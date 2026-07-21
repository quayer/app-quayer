/**
 * Builder Deploy (oRPC) — teste in-process do lote B4.
 *
 * Cobre: publishVersion com gate de refinamento, status com degradação
 * best-effort (delegate ausente ⇒ data null + warning) e o gate admin-only
 * do rollback (403 para user comum).
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
    // builderDeployment ausente por padrão — simula tabela não provisionada
  } as Record<string, Record<string, ReturnType<typeof vi.fn>>>
})

vi.mock('@/server/services/database', () => ({
  database: mockDb,
  getDatabase: () => mockDb,
}))
vi.mock('@/server/ai-module/builder/deploy/deploy-flow.orchestrator', () => ({
  executeDeployFlow: vi.fn(),
  assertNoCriticalRefinementPublishBlocker: vi.fn(),
}))
vi.mock('@/server/ai-module/builder/deploy/publish-version.handler', () => ({
  publishVersion: vi.fn(),
}))
vi.mock('@/server/ai-module/builder/deploy/rollback.handler', () => ({
  rollbackDeployment: vi.fn(),
}))

import {
  assertNoCriticalRefinementPublishBlocker,
} from '@/server/ai-module/builder/deploy/deploy-flow.orchestrator'
import { publishVersion as publishVersionStep } from '@/server/ai-module/builder/deploy/publish-version.handler'
import { rollbackDeployment } from '@/server/ai-module/builder/deploy/rollback.handler'
import { signAccessToken } from '@/lib/auth/jwt'
import { GET, POST } from '@/orpc/serve'

const publishStepFn = publishVersionStep as unknown as ReturnType<typeof vi.fn>
const blockerFn = assertNoCriticalRefinementPublishBlocker as unknown as ReturnType<typeof vi.fn>
const rollbackFn = rollbackDeployment as unknown as ReturnType<typeof vi.fn>

const BASE = 'http://localhost:3000/api/v1'
const PROJECT_ID = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b51'
const VERSION_ID = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b56'
const DEPLOYMENT_ID = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b57'

function bearer(role = 'user'): string {
  const token = signAccessToken({
    userId: 'user-1',
    email: 'u@example.com',
    role,
    currentOrgId: 'org-1',
  } as Parameters<typeof signAccessToken>[0])
  return `Bearer ${token}`
}

function jsonHeaders(role = 'user'): Record<string, string> {
  return { authorization: bearer(role), 'content-type': 'application/json' }
}

function authedUser(role = 'user') {
  return {
    id: 'user-1',
    email: 'u@example.com',
    isActive: true,
    role,
    currentOrgId: 'org-1',
    organizations: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb.user.findUnique.mockResolvedValue(authedUser())
})

describe('oRPC — builder deploy', () => {
  it('POST deploy/publish-version promove a versão com o gate de refinamento', async () => {
    mockDb.builderProject.findFirst.mockResolvedValue({
      id: PROJECT_ID,
      aiAgentId: 'ag-1',
    })
    blockerFn.mockResolvedValue(undefined)
    publishStepFn.mockResolvedValue({
      versionNumber: 3,
      publishedAt: '2026-07-21T12:00:00.000Z',
    })

    const res = await POST(
      new Request(`${BASE}/builder/deploy/publish-version`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ projectId: PROJECT_ID, promptVersionId: VERSION_ID }),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      success: true,
      data: { versionNumber: 3 },
      message: 'Versão publicada',
    })
    expect(blockerFn).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      organizationId: 'org-1',
    })
  })

  it('publish-version sem agente publicado responde 400', async () => {
    mockDb.builderProject.findFirst.mockResolvedValue({
      id: PROJECT_ID,
      aiAgentId: null,
    })

    const res = await POST(
      new Request(`${BASE}/builder/deploy/publish-version`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ projectId: PROJECT_ID, promptVersionId: VERSION_ID }),
      }),
    )

    expect(res.status).toBe(400)
    expect(publishStepFn).not.toHaveBeenCalled()
  })

  it('GET deploy/{projectId}/status degrada quando a tabela não existe', async () => {
    // mockDb NÃO tem builderDeployment ⇒ delegate null ⇒ payload mínimo
    const res = await GET(
      new Request(`${BASE}/builder/deploy/${PROJECT_ID}/status`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: {
        success: true,
        data: null,
        warning: 'BuilderDeployment table not available',
      },
      error: null,
    })
  })

  it('POST rollback nega user comum (403 admin-only)', async () => {
    const res = await POST(
      new Request(`${BASE}/builder/deploy/${DEPLOYMENT_ID}/rollback`, {
        method: 'POST',
        headers: jsonHeaders('user'),
        body: JSON.stringify({}),
      }),
    )

    expect(res.status).toBe(403)
    expect(rollbackFn).not.toHaveBeenCalled()
  })

  it('POST rollback admin com posse via project executa a compensação', async () => {
    mockDb.user.findUnique.mockResolvedValue(authedUser('admin'))
    mockDb.builderProject.findFirst.mockResolvedValue({ id: PROJECT_ID })
    ;(mockDb as Record<string, unknown>).builderDeployment = {
      findFirst: vi.fn(),
      findUnique: vi.fn().mockResolvedValue({
        id: DEPLOYMENT_ID,
        projectId: PROJECT_ID,
      }),
    }
    rollbackFn.mockResolvedValue({ rolledBack: true })

    try {
      const res = await POST(
        new Request(`${BASE}/builder/deploy/${DEPLOYMENT_ID}/rollback`, {
          method: 'POST',
          headers: jsonHeaders('admin'),
          body: JSON.stringify({}),
        }),
      )

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        data: { success: true, data: { rolledBack: true } },
        error: null,
      })
      expect(rollbackFn).toHaveBeenCalledWith(DEPLOYMENT_ID, 'user-1')
    } finally {
      delete (mockDb as Record<string, unknown>).builderDeployment
    }
  })
})
