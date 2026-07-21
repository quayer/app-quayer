/**
 * Builder Projects (oRPC) — teste in-process do lote B1.
 *
 * Cobre: CRUD com envelope {success,...} preservado, derivação de nome
 * (FR-04) no create, 409 do updatePrompt com o payload de conflito no data,
 * métricas zeradas sem agente, attach/detach de canal e a degradação
 * fail-open do proactive history. Repository e serviços de domínio mockados;
 * auth real.
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
    connection: { findMany: fn(), findFirst: fn() },
    agentDeployment: { findFirst: fn(), updateMany: fn() },
    aIAgentConfig: { findFirst: fn() },
    chatSession: { count: fn(), findMany: fn() },
    message: { count: fn(), findFirst: fn() },
    scheduledMessage: { findMany: fn() },
  }
})

vi.mock('@/server/services/database', () => ({
  database: mockDb,
  getDatabase: () => mockDb,
}))
vi.mock('@/server/ai-module/builder/projects/projects.repository', () => ({
  builderProjectRepository: {
    listForOrg: vi.fn(),
    findByIdForOrg: vi.fn(),
    createWithInitialMessage: vi.fn(),
    hardDelete: vi.fn(),
    rename: vi.fn(),
    archive: vi.fn(),
    unarchive: vi.fn(),
    duplicate: vi.fn(),
    updateAgentRuntimeSettings: vi.fn(),
    updateAgentSystemPrompt: vi.fn(),
    listVersionsForProject: vi.fn(),
    rollbackToVersion: vi.fn(),
  },
}))
vi.mock('@/server/ai-module/builder/queries', () => ({
  listRecentProjects: vi.fn(),
}))
vi.mock('@/server/ai-module/builder/channel/attach-to-agent', () => ({
  attachConnectionToProjectAgent: vi.fn(),
}))

import { builderProjectRepository } from '@/server/ai-module/builder/projects/projects.repository'
import { listRecentProjects } from '@/server/ai-module/builder/queries'
import { attachConnectionToProjectAgent } from '@/server/ai-module/builder/channel/attach-to-agent'
import { signAccessToken } from '@/lib/auth/jwt'
import { GET, POST, PATCH, DELETE } from '@/app/api/orpc/[[...rest]]/route'

const repo = builderProjectRepository as unknown as Record<string, ReturnType<typeof vi.fn>>
const recentProjects = listRecentProjects as unknown as ReturnType<typeof vi.fn>
const attachFn = attachConnectionToProjectAgent as unknown as ReturnType<typeof vi.fn>

const BASE = 'http://localhost:3000/api/orpc'
const PROJECT_ID = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b51'
const CONNECTION_ID = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b52'

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

function jsonHeaders(): Record<string, string> {
  return { authorization: bearer(), 'content-type': 'application/json' }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb.user.findUnique.mockResolvedValue(authedUser())
})

describe('oRPC — CRUD de builder projects', () => {
  it('GET /builder/projects lista com envelope {success, data, total}', async () => {
    repo.listForOrg.mockResolvedValue({ data: [{ id: PROJECT_ID, name: 'Agente X' }], total: 1 })

    const res = await GET(
      new Request(`${BASE}/builder/projects?status=draft&limit=10`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { success: true, data: [{ id: PROJECT_ID, name: 'Agente X' }], total: 1 },
      error: null,
    })
    expect(repo.listForOrg).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', status: 'draft', limit: 10 }),
    )
  })

  it('POST /builder/projects/create deriva o nome do prompt (FR-04, sem URLs)', async () => {
    repo.createWithInitialMessage.mockResolvedValue({
      project: { id: PROJECT_ID },
      conversation: { id: 'conv-1' },
    })

    const res = await POST(
      new Request(`${BASE}/builder/projects/create`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({
          prompt: 'Agente de vendas da https://minhaloja.com.br com foco em conversão',
          type: 'ai_agent',
        }),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      success: true,
      data: { projectId: PROJECT_ID, conversationId: 'conv-1' },
    })
    // Nome derivado: 1ª linha SEM a URL
    const createArg = repo.createWithInitialMessage.mock.calls[0][0] as { name: string }
    expect(createArg.name).toBe('Agente de vendas da com foco em')
    expect(createArg.name).not.toContain('http')
  })

  it('GET /builder/projects/{id} responde 404 para projeto de outra org', async () => {
    repo.findByIdForOrg.mockResolvedValue(null)

    const res = await GET(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}`, {
        headers: { authorization: bearer() },
      }),
    )
    expect(res.status).toBe(404)
  })

  it('PATCH /builder/projects/{id}/rename renomeia com posse por org', async () => {
    repo.rename.mockResolvedValue({ id: PROJECT_ID, name: 'Novo Nome' })

    const res = await PATCH(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/rename`, {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify({ name: 'Novo Nome' }),
      }),
    )

    expect(res.status).toBe(200)
    expect(repo.rename).toHaveBeenCalledWith(PROJECT_ID, 'org-1', 'Novo Nome')
  })

  it('DELETE /builder/projects/{id} exclui permanentemente', async () => {
    repo.hardDelete.mockResolvedValue({ id: PROJECT_ID })

    const res = await DELETE(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}`, {
        method: 'DELETE',
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({ success: true, message: 'Projeto excluído permanentemente' })
  })

  it('id não-uuid responde 400 (validação de params preservada)', async () => {
    const res = await GET(
      new Request(`${BASE}/builder/projects/nao-e-uuid`, {
        headers: { authorization: bearer() },
      }),
    )
    expect(res.status).toBe(400)
    expect(repo.findByIdForOrg).not.toHaveBeenCalled()
  })
})

describe('oRPC — prompt do agente', () => {
  it('PATCH prompt salva e responde o shape do original', async () => {
    repo.updateAgentSystemPrompt.mockResolvedValue({
      conflict: false,
      agent: { id: 'ag-1', systemPrompt: 'novo prompt', updatedAt: new Date('2026-07-21T12:00:00Z') },
    })

    const res = await PATCH(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/prompt`, {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify({ systemPrompt: 'novo prompt' }),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({ success: true, message: 'Prompt salvo' })
  })

  it('precondição otimista: conflito responde 409 com o prompt atual no data', async () => {
    repo.updateAgentSystemPrompt.mockResolvedValue({
      conflict: true,
      current: {
        id: 'ag-1',
        systemPrompt: 'prompt do servidor',
        updatedAt: new Date('2026-07-21T13:00:00Z'),
      },
    })

    const res = await PATCH(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/prompt`, {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify({
          systemPrompt: 'minha edição',
          baseUpdatedAt: '2026-07-21T12:00:00.000Z',
        }),
      }),
    )

    expect(res.status).toBe(409)
    const body = JSON.stringify(await res.json())
    expect(body).toContain('prompt_conflict')
    expect(body).toContain('prompt do servidor')
  })
})

describe('oRPC — métricas e sidebar', () => {
  it('projeto sem agente publicado responde métricas zeradas', async () => {
    mockDb.builderProject.findFirst.mockResolvedValue({ id: PROJECT_ID, aiAgentId: null })

    const res = await GET(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/metrics`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: {
        messages24h: 0,
        conversations24h: 0,
        totalCalls: null,
        totalInputTokens: null,
        totalOutputTokens: null,
        totalCost: null,
        lastMessageAt: null,
      },
      error: null,
    })
  })

  it('sidebar degrada fail-open para lista vazia quando a query falha', async () => {
    recentProjects.mockRejectedValue(new Error('db down'))

    const res = await GET(
      new Request(`${BASE}/builder/sidebar`, { headers: { authorization: bearer() } }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { success: true, data: { recentProjects: [] } },
      error: null,
    })
  })
})

describe('oRPC — canal do projeto', () => {
  it('POST attach valida a connection da org e delega ao helper', async () => {
    mockDb.builderProject.findFirst.mockResolvedValue({ aiAgentId: 'ag-1' })
    mockDb.connection.findFirst.mockResolvedValue({
      id: CONNECTION_ID,
      name: 'WhatsApp Loja',
      phoneNumber: '5511999999999',
      status: 'CONNECTED',
    })
    attachFn.mockResolvedValue(undefined)

    const res = await POST(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/channel`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ connectionId: CONNECTION_ID }),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { connectionId: CONNECTION_ID, name: 'WhatsApp Loja' },
      error: null,
    })
    expect(attachFn).toHaveBeenCalledWith(expect.anything(), PROJECT_ID, CONNECTION_ID, 'org-1')
  })

  it('DELETE detach pausa deployments ativos', async () => {
    mockDb.builderProject.findFirst.mockResolvedValue({ aiAgentId: 'ag-1' })
    mockDb.agentDeployment.updateMany.mockResolvedValue({ count: 1 })

    const res = await DELETE(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/channel`, {
        method: 'DELETE',
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { detached: true }, error: null })
    expect(mockDb.agentDeployment.updateMany).toHaveBeenCalledWith({
      where: { agentConfigId: 'ag-1', status: 'ACTIVE' },
      data: { status: 'PAUSED', updatedAt: expect.any(Date) },
    })
  })
})

describe('oRPC — proactive history (fail-open)', () => {
  it('delegate scheduledMessage ausente degrada para lista vazia', async () => {
    mockDb.builderProject.findFirst.mockResolvedValue({ id: PROJECT_ID, aiAgentId: 'ag-1' })
    mockDb.chatSession.findMany.mockResolvedValue([{ id: 'sess-1' }])

    const saved = (mockDb as Record<string, unknown>).scheduledMessage
    delete (mockDb as Record<string, unknown>).scheduledMessage
    try {
      const res = await GET(
        new Request(`${BASE}/builder/projects/${PROJECT_ID}/proactive/history`, {
          headers: { authorization: bearer() },
        }),
      )
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ data: { items: [] }, error: null })
    } finally {
      ;(mockDb as Record<string, unknown>).scheduledMessage = saved
    }
  })
})
