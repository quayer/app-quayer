/**
 * Logs (oRPC) — teste in-process do controller portado.
 *
 * Cobre: gate admin (403 com as mensagens do original, 401 sem token),
 * envelope Igniter, conversão de datas na query, POST /logs/analyze com e
 * sem body, o 404 do analyzeError (catch do original) e a precedência das
 * rotas estáticas /logs/{stats,sources,analyses}.
 *
 * loggerService e aiLogAnalyzer mockados (services de domínio); auth real.
 *
 * Rodar:
 *   npx vitest run --config src/orpc/vitest.config.orpc.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'orpc-spike-test-secret-0123456789-abcdefghij'

vi.mock('@/server/services/database', () => ({
  database: {
    user: { findUnique: vi.fn() },
    customRole: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/logs/logger.service', () => ({
  loggerService: { query: vi.fn(), getStats: vi.fn(), log: vi.fn() },
}))
vi.mock('@/lib/logs/ai-analyzer.service', () => ({
  aiLogAnalyzer: { analyzeLogs: vi.fn(), analyzeError: vi.fn(), getRecentAnalyses: vi.fn() },
}))

import { database } from '@/server/services/database'
import { loggerService } from '@/lib/logs/logger.service'
import { aiLogAnalyzer } from '@/lib/logs/ai-analyzer.service'
import { signAccessToken } from '@/lib/auth/jwt'
import { GET, POST } from '@/orpc/serve'

const db = database as unknown as { user: { findUnique: ReturnType<typeof vi.fn> } }
const logger = loggerService as unknown as {
  query: ReturnType<typeof vi.fn>
  getStats: ReturnType<typeof vi.fn>
  log: ReturnType<typeof vi.fn>
}
const analyzer = aiLogAnalyzer as unknown as {
  analyzeLogs: ReturnType<typeof vi.fn>
  analyzeError: ReturnType<typeof vi.fn>
  getRecentAnalyses: ReturnType<typeof vi.fn>
}

const BASE = 'http://localhost:3000/api/v1'

function userWithRole(role: string) {
  return {
    id: 'user-1',
    email: 'u@example.com',
    isActive: true,
    role,
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

describe('oRPC — gate admin do módulo logs', () => {
  it('nega usuário não-admin com 403 e a mensagem do original', async () => {
    db.user.findUnique.mockResolvedValue(userWithRole('user'))

    const res = await GET(
      new Request(`${BASE}/logs`, { headers: { authorization: bearer() } }),
    )

    expect(res.status).toBe(403)
    expect(JSON.stringify(await res.json())).toContain('Acesso negado. Apenas administradores.')
    expect(logger.query).not.toHaveBeenCalled()
  })

  it('nega sem token com 401', async () => {
    const res = await GET(new Request(`${BASE}/logs`))
    expect(res.status).toBe(401)
  })
})

describe('oRPC — GET /logs (list)', () => {
  it('lista com filtros, convertendo datas como o original', async () => {
    db.user.findUnique.mockResolvedValue(userWithRole('admin'))
    logger.query.mockResolvedValue({ logs: [{ id: 'log-1' }], total: 1 })

    const res = await GET(
      new Request(
        `${BASE}/logs?level=ERROR&source=api&startDate=2026-07-01T00:00:00Z&limit=50`,
        { headers: { authorization: bearer() } },
      ),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { data: { logs: [{ id: 'log-1' }], total: 1 } },
      error: null,
    })
    expect(logger.query).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'ERROR',
        source: 'api',
        startDate: new Date('2026-07-01T00:00:00Z'),
        endDate: undefined,
        limit: 50,
        offset: 0,
      }),
    )
  })
})

describe('oRPC — rotas estáticas de /logs', () => {
  it('GET /logs/stats usa o period default', async () => {
    db.user.findUnique.mockResolvedValue(userWithRole('admin'))
    logger.getStats.mockResolvedValue({ total: 42 })

    const res = await GET(
      new Request(`${BASE}/logs/stats`, { headers: { authorization: bearer() } }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { data: { total: 42 } }, error: null })
    expect(logger.getStats).toHaveBeenCalledWith('day')
  })

  it('GET /logs/sources responde a lista estática', async () => {
    db.user.findUnique.mockResolvedValue(userWithRole('admin'))

    const res = await GET(
      new Request(`${BASE}/logs/sources`, { headers: { authorization: bearer() } }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { data: string[] } }
    expect(body.data.data).toContain('whatsapp')
    expect(body.data.data).toHaveLength(10)
  })

  it('GET /logs/analyses lista análises recentes com limit default', async () => {
    db.user.findUnique.mockResolvedValue(userWithRole('admin'))
    analyzer.getRecentAnalyses.mockResolvedValue([{ id: 'an-1' }])

    const res = await GET(
      new Request(`${BASE}/logs/analyses`, { headers: { authorization: bearer() } }),
    )

    expect(res.status).toBe(200)
    expect(analyzer.getRecentAnalyses).toHaveBeenCalledWith(10)
  })
})

describe('oRPC — POST /logs (create)', () => {
  it('cria entrada com o contexto do user admin', async () => {
    db.user.findUnique.mockResolvedValue(userWithRole('admin'))
    logger.log.mockResolvedValue({ id: 'log-9' })

    const res = await POST(
      new Request(`${BASE}/logs`, {
        method: 'POST',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
        body: JSON.stringify({ level: 'INFO', message: 'teste manual', source: 'api' }),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { data: { id: 'log-9' } }, error: null })
    expect(logger.log).toHaveBeenCalledWith(
      'INFO',
      'teste manual',
      expect.objectContaining({ source: 'api', context: { userId: 'user-1' } }),
    )
  })

  it('valida body com 400 (level obrigatório)', async () => {
    db.user.findUnique.mockResolvedValue(userWithRole('admin'))

    const res = await POST(
      new Request(`${BASE}/logs`, {
        method: 'POST',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'sem level', source: 'api' }),
      }),
    )
    expect(res.status).toBe(400)
    expect(logger.log).not.toHaveBeenCalled()
  })
})

describe('oRPC — análise por IA', () => {
  it('POST /logs/analyze funciona com body vazio (opcional no original)', async () => {
    db.user.findUnique.mockResolvedValue(userWithRole('admin'))
    analyzer.analyzeLogs.mockResolvedValue({ summary: 'ok' })

    const res = await POST(
      new Request(`${BASE}/logs/analyze`, {
        method: 'POST',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )

    expect(res.status).toBe(200)
    expect(analyzer.analyzeLogs).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 500 }),
    )
  })

  it('POST /logs/analyze/{id} devolve 404 quando o analyzer lança (catch do original)', async () => {
    db.user.findUnique.mockResolvedValue(userWithRole('admin'))
    analyzer.analyzeError.mockRejectedValue(new Error('Log não encontrado'))

    const res = await POST(
      new Request(`${BASE}/logs/analyze/log-x`, {
        method: 'POST',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
      }),
    )

    expect(res.status).toBe(404)
    expect(JSON.stringify(await res.json())).toContain('Log não encontrado')
  })

  it('POST /logs/analyze/{id} com sucesso', async () => {
    db.user.findUnique.mockResolvedValue(userWithRole('admin'))
    analyzer.analyzeError.mockResolvedValue({ diagnosis: 'x' })

    const res = await POST(
      new Request(`${BASE}/logs/analyze/log-1`, {
        method: 'POST',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
      }),
    )

    expect(res.status).toBe(200)
    expect(analyzer.analyzeError).toHaveBeenCalledWith('log-1')
  })
})
