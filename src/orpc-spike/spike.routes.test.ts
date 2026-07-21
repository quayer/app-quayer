/**
 * oRPC SPIKE — teste in-process do catch-all (prova do critério 1 e 4 do gate)
 *
 * Invoca o route handler Next (GET) com objetos Request reais:
 *   - 200 + shape { data: [...] } para GET /messages com JWT válido
 *   - 401 sem token (middleware requireAuth == authProcedure({required:true}))
 *   - 404 preservado (sessão de outra org)
 *   - precedência de rota estática: /messages/sessions NÃO casa /messages/{id}
 *
 * O JWT é assinado com o MESMO utilitário do app (signAccessToken) e validado
 * pelo MESMO validateBearerToken usado em produção — nada mockado na auth
 * além do banco (padrão dos testes existentes do módulo messages).
 *
 * Rodar:
 *   npx vitest run --config src/orpc-spike/vitest.config.spike.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// JWT_SECRET precisa existir ANTES do primeiro uso (lazy init em @/lib/auth/jwt).
process.env.JWT_SECRET = 'orpc-spike-test-secret-0123456789-abcdefghij'

// ---------------------------------------------------------------------------
// Mock do banco — mesmo padrão de src/server/communication/messages/*.test.ts
// ---------------------------------------------------------------------------
vi.mock('@/server/services/database', () => ({
  database: {
    user: { findUnique: vi.fn() },
    customRole: { findUnique: vi.fn() },
    message: { findMany: vi.fn(), findFirst: vi.fn() },
    chatSession: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}))

import { database } from '@/server/services/database'
import { signAccessToken } from '@/lib/auth/jwt'
import { GET } from '@/app/api/orpc-spike/[[...rest]]/route'

const db = database as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> }
  customRole: { findUnique: ReturnType<typeof vi.fn> }
  message: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> }
  chatSession: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> }
}

const BASE = 'http://localhost:3000/api/orpc-spike'

function authedUser() {
  return {
    id: 'user-1',
    email: 'u@example.com',
    isActive: true,
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
})

describe('oRPC spike — GET /messages (list)', () => {
  it('retorna 200 com { data: [...] } com sessão válida', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.chatSession.findFirst.mockResolvedValue({ id: 'sess-1' })
    db.message.findMany.mockResolvedValue([
      { id: 'msg-1', sessionId: 'sess-1', content: 'olá' },
      { id: 'msg-2', sessionId: 'sess-1', content: 'oi' },
    ])

    const res = await GET(
      new Request(`${BASE}/messages?sessionId=sess-1&limit=10&offset=0`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Array<{ id: string }> }
    expect(body).toEqual({
      data: [
        { id: 'msg-1', sessionId: 'sess-1', content: 'olá' },
        { id: 'msg-2', sessionId: 'sess-1', content: 'oi' },
      ],
    })

    // Mesmas queries Prisma do handler original (isolamento por org preservado)
    expect(db.chatSession.findFirst).toHaveBeenCalledWith({
      where: { id: 'sess-1', organizationId: 'org-1' },
      select: { id: true },
    })
    expect(db.message.findMany).toHaveBeenCalledWith({
      where: { sessionId: 'sess-1' },
      take: 10,
      skip: 0,
      orderBy: { createdAt: 'asc' },
    })
  })

  it('retorna 401 sem sessão (sem Authorization e sem cookie)', async () => {
    const res = await GET(new Request(`${BASE}/messages?sessionId=sess-1`))

    expect(res.status).toBe(401)
    // O banco nunca é tocado — o middleware barra antes do handler.
    expect(db.chatSession.findFirst).not.toHaveBeenCalled()
    expect(db.message.findMany).not.toHaveBeenCalled()
  })

  it('retorna 401 com token inválido', async () => {
    const res = await GET(
      new Request(`${BASE}/messages?sessionId=sess-1`, {
        headers: { authorization: 'Bearer token-invalido' },
      }),
    )
    expect(res.status).toBe(401)
  })

  it('retorna 404 quando a sessão não pertence à org (paridade com o original)', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.chatSession.findFirst.mockResolvedValue(null)

    const res = await GET(
      new Request(`${BASE}/messages?sessionId=sess-de-outra-org`, {
        headers: { authorization: bearer() },
      }),
    )
    expect(res.status).toBe(404)
  })
})

describe('oRPC spike — tabela de rotas (precedência e paths)', () => {
  it('GET /messages/sessions casa a rota estática, não /messages/{id}', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.chatSession.findMany.mockResolvedValue([{ id: 'sess-1', status: 'ACTIVE' }])

    const res = await GET(
      new Request(`${BASE}/messages/sessions?limit=5&offset=0`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Array<{ id: string }> }
    expect(body.data[0].id).toBe('sess-1')
    // Se tivesse casado /messages/{id}, teria consultado message.findFirst.
    expect(db.message.findFirst).not.toHaveBeenCalled()
    expect(db.chatSession.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      take: 5,
      skip: 0,
      orderBy: { lastMessageAt: 'desc' },
    })
  })

  it('GET /messages/{id} continua funcionando com path param', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.message.findFirst.mockResolvedValue({ id: 'msg-9', content: 'x' })

    const res = await GET(
      new Request(`${BASE}/messages/msg-9`, { headers: { authorization: bearer() } }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { id: string } }
    expect(body.data.id).toBe('msg-9')
    expect(db.message.findFirst).toHaveBeenCalledWith({
      where: { id: 'msg-9', session: { organizationId: 'org-1' } },
    })
  })

  it('auth via cookie httpOnly accessToken também funciona (paridade authProcedure)', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.chatSession.findMany.mockResolvedValue([])

    const token = bearer().slice('Bearer '.length)
    const res = await GET(
      new Request(`${BASE}/messages/sessions`, {
        headers: { cookie: `foo=bar; accessToken=${token}` },
      }),
    )
    expect(res.status).toBe(200)
  })
})
