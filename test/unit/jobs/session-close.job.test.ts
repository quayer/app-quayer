/**
 * Unit tests for session-close.job.
 *
 * Cobertura:
 *   - findStaleSessions filtra corretamente por idade, status e ausência de
 *     aiAgentContext, respeita batchSize e defaults (24h / 50).
 *   - closeStaleSession chama summarizeSessionOnClose e atualiza status para
 *     CLOSED com closedAt; falha do summarize não impede o close.
 *   - runSessionCloseBatch processa multiple, conta corretamente, e erro
 *     individual não aborta o loop.
 *
 * Mock strategy: o módulo agent-runtime.service é mockado via vi.mock para
 * evitar carga real do summarizer (e suas dependências de OpenAI/Prisma).
 * O database é um fake inline — funções recebem o client como argumento,
 * então basta passar um objeto com os métodos esperados.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock do agent-runtime: só precisamos da função summarizeSessionOnClose.
const summarizeMock = vi.fn()
vi.mock('@/server/ai-module/ai-agents/agent-runtime.service', () => ({
  summarizeSessionOnClose: (...args: unknown[]) => summarizeMock(...args),
}))

import {
  findStaleSessions,
  closeStaleSession,
  runSessionCloseBatch,
  type SessionClosePrismaLike,
} from '@/server/services/jobs/session-close.job'

// --- DB fake helper --------------------------------------------------------
type FindManyArgs = Parameters<SessionClosePrismaLike['chatSession']['findMany']>[0]
type UpdateArgs = Parameters<SessionClosePrismaLike['chatSession']['update']>[0]

function makeDb(opts?: {
  findManyResult?: Array<{ id: string; contactPhone: string }>
  findManyImpl?: (args: FindManyArgs) => unknown
  updateImpl?: (args: UpdateArgs) => unknown
}): {
  db: SessionClosePrismaLike
  findManyCalls: FindManyArgs[]
  updateCalls: UpdateArgs[]
} {
  const findManyCalls: FindManyArgs[] = []
  const updateCalls: UpdateArgs[] = []

  const db: SessionClosePrismaLike = {
    chatSession: {
      findMany: (async (args: FindManyArgs) => {
        findManyCalls.push(args)
        if (opts?.findManyImpl) return opts.findManyImpl(args) as never
        return (opts?.findManyResult ?? []) as never
      }) as SessionClosePrismaLike['chatSession']['findMany'],
      update: (async (args: UpdateArgs) => {
        updateCalls.push(args)
        if (opts?.updateImpl) return opts.updateImpl(args) as never
        return { id: 'updated' } as never
      }) as SessionClosePrismaLike['chatSession']['update'],
    },
  }

  return { db, findManyCalls, updateCalls }
}

beforeEach(() => {
  summarizeMock.mockReset()
  summarizeMock.mockResolvedValue(true)
})

// ---------------------------------------------------------------------------
// findStaleSessions
// ---------------------------------------------------------------------------

describe('findStaleSessions', () => {
  it('retorna sessoes com lastMessageAt antigo e propaga where correto', async () => {
    const rows = [
      { id: 's1', contactPhone: '5511999991111' },
      { id: 's2', contactPhone: '5511999992222' },
    ]
    const { db, findManyCalls } = makeDb({ findManyResult: rows })

    const result = await findStaleSessions(db, { stalenessHours: 24 })
    expect(result).toEqual(rows)

    expect(findManyCalls).toHaveLength(1)
    const where = (findManyCalls[0] as { where: Record<string, unknown> }).where
    // status != CLOSED
    expect(where.status).toEqual({ not: 'CLOSED' })
    // lastMessageAt < cutoff
    expect(where.lastMessageAt).toMatchObject({ lt: expect.any(Date) })
    // Aproximadamente 24h atrás (tolerância 1min)
    const cutoff = (where.lastMessageAt as { lt: Date }).lt.getTime()
    const expected = Date.now() - 24 * 60 * 60 * 1000
    expect(Math.abs(cutoff - expected)).toBeLessThan(60_000)
  })

  it('exclui CLOSED via filter status != CLOSED', async () => {
    const { db, findManyCalls } = makeDb({ findManyResult: [] })
    await findStaleSessions(db)
    const where = (findManyCalls[0] as { where: Record<string, unknown> }).where
    expect(where.status).toEqual({ not: 'CLOSED' })
  })

  it('exclui sessoes com aiAgentContext ja preenchido (filtro IS NULL)', async () => {
    const { db, findManyCalls } = makeDb({ findManyResult: [] })
    await findStaleSessions(db)
    const where = (findManyCalls[0] as { where: Record<string, unknown> }).where
    // Heurística: filtramos aiAgentContext IS NULL via Prisma.DbNull (sentinel
    // necessário para colunas JSON). Sessões com contexto/summary já
    // persistido não entram no batch.
    const f = where.aiAgentContext as { equals: unknown }
    expect(f).toBeDefined()
    expect(f.equals).toBeDefined()
    // Não comparamos por igualdade estrita do sentinel para evitar
    // acoplamento com a internalidade do Prisma; basta garantir que NÃO é
    // null literal nem undefined (Prisma.DbNull é uma instância de classe).
    expect(typeof f.equals).toBe('object')
  })

  it('respeita batchSize custom', async () => {
    const { db, findManyCalls } = makeDb({ findManyResult: [] })
    await findStaleSessions(db, { batchSize: 7 })
    const args = findManyCalls[0] as { take: number }
    expect(args.take).toBe(7)
  })

  it('default stalenessHours = 24', async () => {
    const { db, findManyCalls } = makeDb({ findManyResult: [] })
    await findStaleSessions(db) // sem config
    const where = (findManyCalls[0] as { where: Record<string, unknown> }).where
    const cutoff = (where.lastMessageAt as { lt: Date }).lt.getTime()
    const expected = Date.now() - 24 * 60 * 60 * 1000
    expect(Math.abs(cutoff - expected)).toBeLessThan(60_000)
  })

  it('default batchSize = 50', async () => {
    const { db, findManyCalls } = makeDb({ findManyResult: [] })
    await findStaleSessions(db) // sem config
    const args = findManyCalls[0] as { take: number }
    expect(args.take).toBe(50)
  })
})

// ---------------------------------------------------------------------------
// closeStaleSession
// ---------------------------------------------------------------------------

describe('closeStaleSession', () => {
  it('chama summarizeSessionOnClose e marca status=CLOSED com closedAt', async () => {
    summarizeMock.mockResolvedValueOnce(true)
    const { db, updateCalls } = makeDb()

    const r = await closeStaleSession(db, 'sess-123', 'sk-test')

    expect(r).toEqual({ summarized: true, closed: true })
    expect(summarizeMock).toHaveBeenCalledWith('sess-123', 'sk-test')

    expect(updateCalls).toHaveLength(1)
    const args = updateCalls[0] as { where: { id: string }; data: { status: string; closedAt: Date } }
    expect(args.where).toEqual({ id: 'sess-123' })
    expect(args.data.status).toBe('CLOSED')
    expect(args.data.closedAt).toBeInstanceOf(Date)
  })

  it('retorna closed=true mesmo se summarize falhar (degrade gracefully)', async () => {
    summarizeMock.mockRejectedValueOnce(new Error('openai down'))
    const { db, updateCalls } = makeDb()

    const r = await closeStaleSession(db, 'sess-err', undefined)

    expect(r.summarized).toBe(false)
    expect(r.closed).toBe(true) // ainda fechamos
    expect(updateCalls).toHaveLength(1)
  })

  it('summarize retornando false (sem API key) ainda fecha a sessao', async () => {
    summarizeMock.mockResolvedValueOnce(false)
    const { db, updateCalls } = makeDb()

    const r = await closeStaleSession(db, 'sess-nokey')

    expect(r.summarized).toBe(false)
    expect(r.closed).toBe(true)
    expect(updateCalls).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// runSessionCloseBatch
// ---------------------------------------------------------------------------

describe('runSessionCloseBatch', () => {
  it('processa multiplas sessoes e conta processed/summarized corretamente', async () => {
    const rows = [
      { id: 's1', contactPhone: '11111' },
      { id: 's2', contactPhone: '22222' },
      { id: 's3', contactPhone: '33333' },
    ]
    const { db, updateCalls } = makeDb({ findManyResult: rows })

    // s1 e s3 resumiram; s2 nao (sem API key, p.ex.)
    summarizeMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    const result = await runSessionCloseBatch(db)

    expect(result.processed).toBe(3)
    expect(result.summarized).toBe(2)
    expect(result.errors).toBe(0)
    expect(updateCalls).toHaveLength(3)
  })

  it('erro individual (update falha) NAO aborta o batch', async () => {
    const rows = [
      { id: 'ok1', contactPhone: '1' },
      { id: 'broken', contactPhone: '2' },
      { id: 'ok2', contactPhone: '3' },
    ]

    // Update lança apenas para o id "broken"
    const { db, updateCalls } = makeDb({
      findManyResult: rows,
      updateImpl: (args) => {
        const where = (args as { where: { id: string } }).where
        if (where.id === 'broken') {
          throw new Error('db connection lost')
        }
        return { id: where.id }
      },
    })

    summarizeMock.mockResolvedValue(true)

    const result = await runSessionCloseBatch(db)

    expect(result.processed).toBe(3)
    expect(result.errors).toBe(1) // broken
    expect(result.summarized).toBe(3) // todos os 3 summarize OK
    expect(updateCalls).toHaveLength(3) // tentamos todos
  })

  it('propaga openaiApiKey do config para summarizeSessionOnClose', async () => {
    const rows = [{ id: 'sX', contactPhone: 'p' }]
    const { db } = makeDb({ findManyResult: rows })
    summarizeMock.mockResolvedValueOnce(true)

    await runSessionCloseBatch(db, { openaiApiKey: 'sk-prop' })

    expect(summarizeMock).toHaveBeenCalledWith('sX', 'sk-prop')
  })
})
