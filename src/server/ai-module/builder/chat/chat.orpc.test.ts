/**
 * Builder Chat (oRPC) — teste in-process do lote B2.
 *
 * Cobre: paginação do listMessages (nextCursor), posse por org (403),
 * readiness com envelope {success,data} e o 400 de compact exausto.
 * DB e handlers de domínio mockados; auth real.
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
    builderProjectConversation: { findUnique: fn() },
    builderProjectMessage: { findMany: fn() },
  }
})

vi.mock('@/server/services/database', () => ({
  database: mockDb,
  getDatabase: () => mockDb,
}))
vi.mock('@/server/ai-module/builder/chat/handlers/compact-if-needed', () => ({
  compactIfNeeded: vi.fn(),
}))
vi.mock('@/server/ai-module/builder/state/readiness-resolver', () => ({
  getReadiness: vi.fn(),
}))

import { compactIfNeeded } from '@/server/ai-module/builder/chat/handlers/compact-if-needed'
import { getReadiness } from '@/server/ai-module/builder/state/readiness-resolver'
import { signAccessToken } from '@/lib/auth/jwt'
import { GET, POST } from '@/app/api/orpc/[[...rest]]/route'

const compactFn = compactIfNeeded as unknown as ReturnType<typeof vi.fn>
const readinessFn = getReadiness as unknown as ReturnType<typeof vi.fn>

const BASE = 'http://localhost:3000/api/orpc'
const PROJECT_ID = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b51'

function authedUser() {
  return {
    id: 'user-1',
    email: 'u@example.com',
    isActive: true,
    role: 'user',
    currentOrgId: 'org-1',
    organizations: [],
  }
}

function bearer(): string {
  const token = signAccessToken({
    userId: 'user-1',
    email: 'u@example.com',
    role: 'user',
    currentOrgId: 'org-1',
  } as Parameters<typeof signAccessToken>[0])
  return `Bearer ${token}`
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb.user.findUnique.mockResolvedValue(authedUser())
})

describe('oRPC — builder chat', () => {
  it('GET chat/messages pagina newest-first e expõe nextCursor', async () => {
    mockDb.builderProjectConversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      organizationId: 'org-1',
    })
    // limit=2 e 3 linhas devolvidas -> hasMore, corta para 2 e aponta cursor
    mockDb.builderProjectMessage.findMany.mockResolvedValue([
      { id: 'm3', content: 'c' },
      { id: 'm2', content: 'b' },
      { id: 'm1', content: 'a' },
    ])

    const res = await GET(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/chat/messages?limit=2`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: {
        success: true,
        data: [
          { id: 'm3', content: 'c' },
          { id: 'm2', content: 'b' },
        ],
        nextCursor: 'm2',
      },
      error: null,
    })
    expect(mockDb.builderProjectMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3, orderBy: { createdAt: 'desc' } }),
    )
  })

  it('conversa de outra org responde 403 (posse preservada)', async () => {
    mockDb.builderProjectConversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      organizationId: 'org-OUTRA',
    })

    const res = await GET(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/chat/messages`, {
        headers: { authorization: bearer() },
      }),
    )
    expect(res.status).toBe(403)
    expect(mockDb.builderProjectMessage.findMany).not.toHaveBeenCalled()
  })

  it('GET readiness responde o snapshot no envelope {success,data}', async () => {
    mockDb.builderProjectConversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      organizationId: 'org-1',
    })
    readinessFn.mockResolvedValue({ nextStep: 'identity', completeness: 0.4 })

    const res = await GET(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/readiness`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { success: true, data: { nextStep: 'identity', completeness: 0.4 } },
      error: null,
    })
    expect(readinessFn).toHaveBeenCalledWith('conv-1', 'org-1')
  })

  it('POST compact exausto responde 400 com a copy do original', async () => {
    mockDb.builderProjectConversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      organizationId: 'org-1',
    })
    mockDb.builderProjectMessage.findMany.mockResolvedValue([
      { role: 'user', content: 'oi' },
    ])
    compactFn.mockResolvedValue({ exhausted: true, compacted: false, messages: [] })

    const res = await POST(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/chat/compact`, {
        method: 'POST',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )

    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain('muito longa')
  })

  it('POST compact bem-sucedido responde contagem de mensagens', async () => {
    mockDb.builderProjectConversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      organizationId: 'org-1',
    })
    mockDb.builderProjectMessage.findMany.mockResolvedValue([
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'olá' },
    ])
    compactFn.mockResolvedValue({
      exhausted: false,
      compacted: true,
      messages: [{ role: 'system', content: 'resumo' }],
    })

    const res = await POST(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/chat/compact`, {
        method: 'POST',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { success: true, compacted: true, messages: 1 },
      error: null,
    })
  })
})
