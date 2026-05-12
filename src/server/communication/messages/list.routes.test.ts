/**
 * Messages list.routes — TDD red phase tests
 *
 * Cobre as 3 actions esperadas em `./list.routes.ts`:
 *   - list          GET /
 *   - getById       GET /:id
 *   - listSessions  GET /sessions
 *
 * Estratégia:
 *   - Mockamos `@/server/services/database` com vi.mock antes do import.
 *   - Importamos `listRoutes` dinamicamente em cada teste para acessar os
 *     handlers REAIS do igniter.query (cada action expõe `.handler`).
 *   - Construímos requests/responses mínimos compatíveis com igniter.
 *
 * Estes testes vão falhar com "Cannot find module './list.routes'" até que o
 * arquivo seja implementado (red phase do TDD).
 *
 * Rodar:
 *   npx vitest run src/server/communication/messages/list.routes.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// --------------------------------------------------------------------------
// Mocks de módulos — declarados ANTES de imports do código de produção.
// --------------------------------------------------------------------------

vi.mock('@/server/services/database', () => ({
  database: {
    message: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    chatSession: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
  },
}))

vi.mock('@/server/core/auth/procedures/api-key.procedure', () => ({
  authOrApiKeyProcedure: () => ({ name: 'authOrApiKeyProcedure', handler: vi.fn() }),
}))

vi.mock('@/server/core/auth/procedures', () => ({
  authProcedure: () => ({ name: 'authProcedure', handler: vi.fn() }),
}))

// --------------------------------------------------------------------------
// Imports — só depois dos mocks.
// --------------------------------------------------------------------------

import { database } from '@/server/services/database'

// --------------------------------------------------------------------------
// Test helpers
// --------------------------------------------------------------------------

type AnyHandler = (args: {
  request: { query?: Record<string, unknown>; params?: Record<string, string>; body?: unknown }
  context: { auth?: { session?: { user?: { id: string; currentOrgId?: string | null; role?: string | null } } } }
  response: ReturnType<typeof makeResponse>
}) => Promise<unknown>

function makeResponse() {
  let _status = 200
  let _body: unknown = null

  const response = {
    status(code: number) {
      _status = code
      return response
    },
    json(body: unknown) {
      _body = body
      return { _status, _body, _kind: 'json' as const }
    },
    success(body: unknown) {
      _body = body
      _status = 200
      return { _status, _body, _kind: 'success' as const }
    },
    forbidden(msg: string) {
      _status = 403
      _body = { error: msg }
      return { _status, _body, _kind: 'forbidden' as const }
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
    get _status_code() {
      return _status
    },
    get _body_value() {
      return _body
    },
  }
  return response
}

function authedContext(overrides: Partial<{ id: string; currentOrgId: string | null; role: string }> = {}) {
  // currentOrgId honra null explícito (necessário para testar caminho "missing org"),
  // por isso usa `in` em vez de `??` — `??` trataria null como ausente.
  const currentOrgId = 'currentOrgId' in overrides ? overrides.currentOrgId : 'org-1'
  return {
    auth: {
      session: {
        user: {
          id: overrides.id ?? 'user-1',
          currentOrgId,
          role: overrides.role ?? 'member',
        },
      },
    },
  }
}

async function invoke(
  actionName: 'list' | 'getById' | 'listSessions',
  request: { query?: Record<string, unknown>; params?: Record<string, string>; body?: unknown } = {},
  ctxOverrides: Partial<{ id: string; currentOrgId: string | null; role: string }> = {},
) {
  // Import dinâmico para garantir que o erro de módulo apareça por teste.
  const mod = (await import('./list.routes')) as unknown as {
    listRoutes: Record<string, { handler: AnyHandler }>
  }
  const action = mod.listRoutes[actionName]
  if (!action || typeof action.handler !== 'function') {
    throw new Error(`Action "${actionName}" não está exposta em listRoutes`)
  }
  const response = makeResponse()
  return (await action.handler({
    request: { query: request.query ?? {}, params: request.params ?? {}, body: request.body },
    context: authedContext(ctxOverrides),
    response,
  })) as { _status: number; _body: unknown; _kind: string }
}

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

const ORG_ID = 'org-1'
const OTHER_ORG_ID = 'org-2'
const SESSION_ID = 'sess-1'
const OTHER_SESSION_ID = 'sess-2'

const sessionFixture = {
  id: SESSION_ID,
  organizationId: ORG_ID,
  contactPhone: '5511999999999',
  connectionId: 'conn-1',
  status: 'ACTIVE',
  lastMessageAt: new Date('2026-05-01T10:00:00Z'),
}

const otherOrgSessionFixture = {
  ...sessionFixture,
  id: OTHER_SESSION_ID,
  organizationId: OTHER_ORG_ID,
}

const messageFixtures = [
  {
    id: 'msg-1',
    sessionId: SESSION_ID,
    contactPhone: '5511999999999',
    direction: 'INBOUND',
    type: 'text',
    content: 'oi',
    createdAt: new Date('2026-05-01T10:00:00Z'),
  },
  {
    id: 'msg-2',
    sessionId: SESSION_ID,
    contactPhone: '5511999999999',
    direction: 'OUTBOUND',
    type: 'text',
    content: 'olá!',
    createdAt: new Date('2026-05-01T10:00:01Z'),
  },
]

// --------------------------------------------------------------------------
// Reset between tests
// --------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

// --------------------------------------------------------------------------
// list — GET /
// --------------------------------------------------------------------------

describe('listRoutes.list', () => {
  it('retorna mensagens da sessão filtradas pelo organizationId do usuário', async () => {
    ;(database.chatSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sessionFixture)
    ;(database.message.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(messageFixtures)
    ;(database.message.count as ReturnType<typeof vi.fn>).mockResolvedValue(2)

    const res = await invoke('list', { query: { sessionId: SESSION_ID } })

    // 1) Verifica posse: chatSession.findFirst foi chamado com organizationId
    expect(database.chatSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: SESSION_ID, organizationId: ORG_ID }),
      }),
    )

    // 2) Busca mensagens filtradas por sessionId
    expect(database.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ sessionId: SESSION_ID }),
      }),
    )

    expect(res._status).toBe(200)
    expect(res._body).toMatchObject({ data: messageFixtures })
  })

  it('rejeita sessão de outra organization com forbidden ou notFound', async () => {
    // Sessão existe MAS é de outra org → repo não retorna nada para essa org.
    ;(database.chatSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const res = await invoke('list', { query: { sessionId: OTHER_SESSION_ID } })

    expect([403, 404]).toContain(res._status)
    expect(database.message.findMany).not.toHaveBeenCalled()
  })

  it('respeita limit (max 100) e offset', async () => {
    ;(database.chatSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sessionFixture)
    ;(database.message.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(messageFixtures)
    ;(database.message.count as ReturnType<typeof vi.fn>).mockResolvedValue(2)

    await invoke('list', { query: { sessionId: SESSION_ID, limit: 25, offset: 50 } })

    expect(database.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 25, skip: 50 }),
    )
  })

  it('aplica default limit=50/offset=0 quando ausentes', async () => {
    ;(database.chatSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sessionFixture)
    ;(database.message.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(messageFixtures)
    ;(database.message.count as ReturnType<typeof vi.fn>).mockResolvedValue(2)

    await invoke('list', { query: { sessionId: SESSION_ID } })

    expect(database.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50, skip: 0 }),
    )
  })

  it('limit > 100 é normalizado/rejeitado (não passa 100 para o DB)', async () => {
    ;(database.chatSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sessionFixture)
    ;(database.message.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(database.message.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)

    const res = await invoke('list', { query: { sessionId: SESSION_ID, limit: 999 } })

    if (res._status === 400) {
      // Estratégia: rejeitar via zod
      expect(res._body).toMatchObject({ error: expect.any(String) })
    } else {
      // Estratégia: clampar para 100
      const call = (database.message.findMany as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
        | { take?: number }
        | undefined
      expect(call?.take).toBeLessThanOrEqual(100)
    }
  })

  it('ordena por createdAt asc (cronológico)', async () => {
    ;(database.chatSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sessionFixture)
    ;(database.message.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(messageFixtures)
    ;(database.message.count as ReturnType<typeof vi.fn>).mockResolvedValue(2)

    await invoke('list', { query: { sessionId: SESSION_ID } })

    expect(database.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: expect.objectContaining({ createdAt: 'asc' }) }),
    )
  })

  it('exige sessionId no query (400 quando ausente)', async () => {
    const res = await invoke('list', { query: {} })
    expect(res._status).toBe(400)
  })

  it('retorna 400 quando user não tem currentOrgId', async () => {
    const res = await invoke('list', { query: { sessionId: SESSION_ID } }, { currentOrgId: null })
    expect(res._status).toBe(400)
  })
})

// --------------------------------------------------------------------------
// getById — GET /:id
// --------------------------------------------------------------------------

describe('listRoutes.getById', () => {
  it('retorna mensagem quando pertence a sessão da org do usuário', async () => {
    const mensagem = {
      ...messageFixtures[0],
      session: { organizationId: ORG_ID },
    }
    ;(database.message.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mensagem)

    const res = await invoke('getById', { params: { id: 'msg-1' } })

    expect(database.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'msg-1',
          session: expect.objectContaining({ organizationId: ORG_ID }),
        }),
      }),
    )

    expect(res._status).toBe(200)
    expect(res._body).toMatchObject({ data: expect.objectContaining({ id: 'msg-1' }) })
  })

  it('retorna 404 quando a mensagem não existe', async () => {
    ;(database.message.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const res = await invoke('getById', { params: { id: 'msg-nao-existe' } })

    expect(res._status).toBe(404)
  })

  it('retorna forbidden ou notFound quando a mensagem é de outra org', async () => {
    // Implementação correta filtra por organizationId no where → findFirst retorna null.
    ;(database.message.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const res = await invoke('getById', { params: { id: 'msg-other-org' } })

    // Pode ser 403 (verificou e bloqueou) ou 404 (não existe na org). Ambos são aceitáveis
    // desde que o handler NÃO retorne os dados da mensagem cross-org.
    expect([403, 404]).toContain(res._status)
    expect(res._body).not.toMatchObject({ data: expect.objectContaining({ id: 'msg-other-org' }) })
  })

  it('retorna 400 quando user não tem currentOrgId', async () => {
    const res = await invoke('getById', { params: { id: 'msg-1' } }, { currentOrgId: null })
    expect(res._status).toBe(400)
  })
})

// --------------------------------------------------------------------------
// listSessions — GET /sessions
// --------------------------------------------------------------------------

describe('listRoutes.listSessions', () => {
  it('filtra sessões pelo organizationId do usuário', async () => {
    ;(database.chatSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sessionFixture])
    ;(database.chatSession.count as ReturnType<typeof vi.fn>).mockResolvedValue(1)

    const res = await invoke('listSessions', { query: {} })

    expect(database.chatSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_ID }),
      }),
    )

    expect(res._status).toBe(200)
    expect(res._body).toMatchObject({ data: [sessionFixture] })
  })

  it('aplica filtro de status quando passado', async () => {
    ;(database.chatSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sessionFixture])
    ;(database.chatSession.count as ReturnType<typeof vi.fn>).mockResolvedValue(1)

    await invoke('listSessions', { query: { status: 'ACTIVE' } })

    expect(database.chatSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_ID, status: 'ACTIVE' }),
      }),
    )
  })

  it('NÃO aplica filtro de status quando ausente', async () => {
    ;(database.chatSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sessionFixture])
    ;(database.chatSession.count as ReturnType<typeof vi.fn>).mockResolvedValue(1)

    await invoke('listSessions', { query: {} })

    const call = (database.chatSession.findMany as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
      | { where?: Record<string, unknown> }
      | undefined
    expect(call?.where).not.toHaveProperty('status')
  })

  it('ordena por lastMessageAt desc (mais recentes primeiro)', async () => {
    ;(database.chatSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sessionFixture])
    ;(database.chatSession.count as ReturnType<typeof vi.fn>).mockResolvedValue(1)

    await invoke('listSessions', { query: {} })

    expect(database.chatSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: expect.objectContaining({ lastMessageAt: 'desc' }),
      }),
    )
  })

  it('respeita limit (max 100) e offset', async () => {
    ;(database.chatSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(database.chatSession.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)

    await invoke('listSessions', { query: { limit: 10, offset: 20 } })

    expect(database.chatSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, skip: 20 }),
    )
  })

  it('retorna 400 quando user não tem currentOrgId', async () => {
    const res = await invoke('listSessions', { query: {} }, { currentOrgId: null })
    expect(res._status).toBe(400)
  })
})
