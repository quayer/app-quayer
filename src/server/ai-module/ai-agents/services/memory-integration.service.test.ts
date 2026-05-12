/**
 * memory-integration.service — unit tests
 *
 * Cobertura:
 *  - loadMemoryForAgent: Redis hit, Postgres fallback (empty/null/error),
 *    memoryWindow respeitado, mapeamento INBOUND/OUTBOUND.
 *  - persistTurn: push 2 entries, redis null no-op, erro silencioso.
 *
 * Rodar:
 *   npx vitest run src/server/ai-module/ai-agents/services/memory-integration.service.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock memory.service ANTES do import dinâmico
vi.mock('./memory.service', () => ({
  loadShortMemory: vi.fn(),
  pushToShortMemory: vi.fn(),
}))

import {
  loadMemoryForAgent,
  persistTurn,
} from './memory-integration.service'
import { loadShortMemory, pushToShortMemory } from './memory.service'

const mockedLoadShortMemory = vi.mocked(loadShortMemory)
const mockedPushToShortMemory = vi.mocked(pushToShortMemory)

// ---------------------------------------------------------------------------
// Helpers / fixtures
// ---------------------------------------------------------------------------

function fakeRedis(): any {
  // Stub mínimo de Redis. Os métodos reais são interceptados via mocks
  // de memory.service (loadShortMemory / pushToShortMemory).
  return {} as any
}

function buildPrismaMock(rows: Array<{ content: string | null; direction: string }>) {
  return {
    message: {
      findMany: vi.fn().mockResolvedValue(rows),
    },
  }
}

function buildPrismaThatThrows() {
  return {
    message: {
      findMany: vi.fn().mockRejectedValue(new Error('pg down')),
    },
  }
}

beforeEach(() => {
  mockedLoadShortMemory.mockReset()
  mockedPushToShortMemory.mockReset()
})

// ---------------------------------------------------------------------------
// loadMemoryForAgent
// ---------------------------------------------------------------------------

describe('loadMemoryForAgent', () => {
  it('1. Redis tem mensagens → retorna do Redis (não chama Prisma)', async () => {
    mockedLoadShortMemory.mockResolvedValue([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ])
    const prisma = buildPrismaMock([])

    const result = await loadMemoryForAgent(fakeRedis(), prisma, 'sess-1', 10)

    expect(result).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ])
    expect(prisma.message.findMany).not.toHaveBeenCalled()
  })

  it('2. Redis vazio + Postgres tem mensagens → retorna do Postgres', async () => {
    mockedLoadShortMemory.mockResolvedValue([])
    const prisma = buildPrismaMock([
      { content: 'oi', direction: 'INBOUND' },
      { content: 'olá', direction: 'OUTBOUND' },
    ])

    const result = await loadMemoryForAgent(fakeRedis(), prisma, 'sess-2', 10)

    expect(prisma.message.findMany).toHaveBeenCalledOnce()
    expect(result).toEqual([
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'olá' },
    ])
  })

  it('3. Redis null + Postgres tem mensagens → retorna do Postgres', async () => {
    const prisma = buildPrismaMock([
      { content: 'a', direction: 'INBOUND' },
    ])

    const result = await loadMemoryForAgent(null, prisma, 'sess-3', 10)

    expect(mockedLoadShortMemory).not.toHaveBeenCalled()
    expect(prisma.message.findMany).toHaveBeenCalledOnce()
    expect(result).toEqual([{ role: 'user', content: 'a' }])
  })

  it('4. Ambos vazios → retorna array vazio', async () => {
    mockedLoadShortMemory.mockResolvedValue([])
    const prisma = buildPrismaMock([])

    const result = await loadMemoryForAgent(fakeRedis(), prisma, 'sess-4', 10)

    expect(result).toEqual([])
  })

  it('5. Erro do Redis → fallback para Postgres', async () => {
    mockedLoadShortMemory.mockRejectedValue(new Error('redis down'))
    const prisma = buildPrismaMock([
      { content: 'recovered', direction: 'INBOUND' },
    ])

    const result = await loadMemoryForAgent(fakeRedis(), prisma, 'sess-5', 10)

    expect(prisma.message.findMany).toHaveBeenCalledOnce()
    expect(result).toEqual([{ role: 'user', content: 'recovered' }])
  })

  it('6. Respeita memoryWindow como limit', async () => {
    mockedLoadShortMemory.mockResolvedValue([])
    const prisma = buildPrismaMock([])

    await loadMemoryForAgent(fakeRedis(), prisma, 'sess-6', 5)

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5,
        where: { sessionId: 'sess-6' },
      })
    )
  })

  it('7. Mapeia INBOUND → user, OUTBOUND → assistant (Postgres path)', async () => {
    mockedLoadShortMemory.mockResolvedValue([])
    const prisma = buildPrismaMock([
      { content: 'msg1', direction: 'INBOUND' },
      { content: 'msg2', direction: 'OUTBOUND' },
      { content: null, direction: 'OUTBOUND' },
    ])

    const result = await loadMemoryForAgent(fakeRedis(), prisma, 'sess-7', 10)

    expect(result).toEqual([
      { role: 'user', content: 'msg1' },
      { role: 'assistant', content: 'msg2' },
      { role: 'assistant', content: '' },
    ])
  })
})

// ---------------------------------------------------------------------------
// persistTurn
// ---------------------------------------------------------------------------

describe('persistTurn', () => {
  it('8. Push 2 entries (user + assistant) no Redis', async () => {
    mockedPushToShortMemory.mockResolvedValue(undefined)

    await persistTurn(fakeRedis(), 'sess-8', 'pergunta', 'resposta')

    expect(mockedPushToShortMemory).toHaveBeenCalledTimes(2)
    expect(mockedPushToShortMemory).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      'sess-8',
      expect.objectContaining({ role: 'user', content: 'pergunta' })
    )
    expect(mockedPushToShortMemory).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      'sess-8',
      expect.objectContaining({ role: 'assistant', content: 'resposta' })
    )
  })

  it('9. Redis null → no-op silencioso', async () => {
    await persistTurn(null, 'sess-9', 'a', 'b')

    expect(mockedPushToShortMemory).not.toHaveBeenCalled()
  })

  it('10. Erro do Redis → log warning, não joga', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockedPushToShortMemory.mockRejectedValue(new Error('boom'))

    await expect(
      persistTurn(fakeRedis(), 'sess-10', 'a', 'b')
    ).resolves.toBeUndefined()

    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
