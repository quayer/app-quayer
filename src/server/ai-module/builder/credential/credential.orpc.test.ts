/**
 * Builder Credential (oRPC) — teste in-process do lote B5.
 *
 * Cobre: vínculo de chave incompatível (provider diferente ⇒ 400), limpeza do
 * vínculo (null) e rotação de apiKey (encrypt + reativação + last4).
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
    aIAgentConfig: { findUnique: fn(), update: fn() },
    organizationProvider: { findFirst: fn(), update: fn() },
  }
})

vi.mock('@/server/services/database', () => ({
  database: mockDb,
  getDatabase: () => mockDb,
}))
vi.mock('@/lib/crypto', () => ({
  encrypt: vi.fn((v: string) => `enc(${v})`),
}))

import { signAccessToken } from '@/lib/auth/jwt'
import { PATCH } from '@/app/api/orpc/[[...rest]]/route'

const BASE = 'http://localhost:3000/api/orpc'
const PROJECT_ID = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b51'
const KEY_ID = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b59'

function bearer(): string {
  const token = signAccessToken({
    userId: 'user-1',
    email: 'u@example.com',
    role: 'user',
    currentOrgId: 'org-1',
  } as Parameters<typeof signAccessToken>[0])
  return `Bearer ${token}`
}

function jsonHeaders(): Record<string, string> {
  return { authorization: bearer(), 'content-type': 'application/json' }
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

describe('oRPC — builder credential', () => {
  it('PATCH credential/{projectId} rejeita chave de provider incompatível (400)', async () => {
    mockDb.builderProject.findFirst.mockResolvedValue({ id: PROJECT_ID, aiAgentId: 'ag-1' })
    mockDb.aIAgentConfig.findUnique.mockResolvedValue({ provider: 'openai' })
    mockDb.organizationProvider.findFirst.mockResolvedValue({
      id: KEY_ID,
      provider: 'anthropic',
      category: 'AI',
      isActive: true,
    })

    const res = await PATCH(
      new Request(`${BASE}/builder/credential/${PROJECT_ID}`, {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify({ organizationProviderId: KEY_ID }),
      }),
    )

    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain('incompatível')
    expect(mockDb.aIAgentConfig.update).not.toHaveBeenCalled()
  })

  it('PATCH credential/{projectId} com null limpa o vínculo (fallback)', async () => {
    mockDb.builderProject.findFirst.mockResolvedValue({ id: PROJECT_ID, aiAgentId: 'ag-1' })
    mockDb.aIAgentConfig.update.mockResolvedValue({})

    const res = await PATCH(
      new Request(`${BASE}/builder/credential/${PROJECT_ID}`, {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify({ organizationProviderId: null }),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { organizationProviderId: null },
      error: null,
    })
    expect(mockDb.aIAgentConfig.update).toHaveBeenCalledWith({
      where: { id: 'ag-1' },
      data: { organizationProviderId: null },
    })
  })

  it('PATCH credential/keys/{id} rotaciona a apiKey (encrypt + reativa + last4)', async () => {
    mockDb.organizationProvider.findFirst.mockResolvedValue({
      id: KEY_ID,
      credentials: { apiKey: 'old', baseUrl: 'https://api.x.com' },
    })
    mockDb.organizationProvider.update.mockResolvedValue({
      id: KEY_ID,
      name: 'Chave OpenAI',
      isActive: true,
      updatedAt: new Date('2026-07-21T12:00:00Z'),
    })

    const res = await PATCH(
      new Request(`${BASE}/builder/credential/keys/${KEY_ID}`, {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify({ apiKey: 'sk-nova-chave-1234' }),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: {
        id: KEY_ID,
        name: 'Chave OpenAI',
        isActive: true,
        lastFour: '1234',
        updatedAt: '2026-07-21T12:00:00.000Z',
      },
      error: null,
    })
    // Encripta a nova chave, PRESERVA os campos extras e reativa o registro
    const updateArg = mockDb.organizationProvider.update.mock.calls[0][0] as {
      data: { credentials: Record<string, unknown>; isActive: boolean }
    }
    expect(updateArg.data.credentials).toEqual({
      apiKey: 'enc(sk-nova-chave-1234)',
      baseUrl: 'https://api.x.com',
    })
    expect(updateArg.data.isActive).toBe(true)
  })
})
