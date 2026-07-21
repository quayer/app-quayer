/**
 * persistMessage — dedup idempotente em P2002 (FASE A / FIX 3).
 *
 * Cenário de produção: o dedup Redis falha-open (Redis fora do ar) e o broker
 * reentrega o mesmo webhook. O create seco em `Message.waMessageId` (@unique)
 * estourava P2002 → 500 → retry do broker → loop. Agora P2002 é tratado como
 * dedup: busca e retorna a Message existente, sem erro (mesma semântica do
 * upsert em src/lib/webhook/processor.ts).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks (imports do módulo — leves, nada é exercitado além do DB/logger) ──

vi.mock('@/server/services/database', () => ({
  database: {
    message: { create: vi.fn(), findUnique: vi.fn() },
  },
}))

vi.mock('@/server/services/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/server/services/redis', () => ({
  getRedis: vi.fn(() => ({})),
}))

vi.mock('@/server/communication/services/bot-echo-guard.service', () => ({
  isBotEchoAny: vi.fn(),
}))

vi.mock('@/server/communication/services/inbound-pipeline.service', () => ({
  processInboundMessage: vi.fn(),
}))

vi.mock('@/lib/webhook/inbound-resilience', () => ({
  isDuplicateInbound: vi.fn(),
  pauseAiForOperatorTakeover: vi.fn(),
}))

vi.mock('@/lib/webhook/operator-commands', () => ({
  parseOperatorCommand: vi.fn(),
  applyOperatorCommand: vi.fn(),
}))

import { database } from '@/server/services/database'
import { logger } from '@/server/services/logger'
import { persistMessage } from './process-inbound'

const createMock = database.message.create as ReturnType<typeof vi.fn>
const findUniqueMock = database.message.findUnique as ReturnType<typeof vi.fn>

const INPUT: Parameters<typeof persistMessage>[0] = {
  session: { id: 'session-1' } as any,
  contactPhone: '5511999998888',
  connectionId: 'conn-1',
  externalMessageId: 'wamid.DUP-1',
  direction: 'IN',
  author: 'CUSTOMER' as any,
  enrichedContent: 'olá',
  data: { type: 'text' } as any,
}

/** Erro P2002 duck-typed, como o Prisma real (`code` no objeto do erro). */
function p2002(): Error & { code: string } {
  return Object.assign(new Error('Unique constraint failed on waMessageId'), {
    code: 'P2002',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('persistMessage — caminho feliz', () => {
  it('cria a Message e retorna o id', async () => {
    createMock.mockResolvedValue({ id: 'msg-new' })

    const id = await persistMessage(INPUT)

    expect(id).toBe('msg-new')
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(findUniqueMock).not.toHaveBeenCalled()
  })
})

describe('persistMessage — P2002 vira dedup idempotente (FIX 3)', () => {
  it('P2002 → busca a existente por waMessageId e retorna o id SEM lançar', async () => {
    createMock.mockRejectedValue(p2002())
    findUniqueMock.mockResolvedValue({ id: 'msg-existente' })

    const id = await persistMessage(INPUT)

    expect(id).toBe('msg-existente')
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { waMessageId: 'wamid.DUP-1' },
      select: { id: true },
    })
    // Dedup é observável: log estruturado, não erro.
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('idempotent dedup'),
      expect.objectContaining({ waMessageId: 'wamid.DUP-1' }),
    )
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('reentrega dupla (retry do broker) é estável: duas chamadas retornam o MESMO id', async () => {
    createMock
      .mockResolvedValueOnce({ id: 'msg-1' })
      .mockRejectedValueOnce(p2002())
    findUniqueMock.mockResolvedValue({ id: 'msg-1' })

    const first = await persistMessage(INPUT)
    const second = await persistMessage(INPUT)

    expect(first).toBe('msg-1')
    expect(second).toBe('msg-1')
  })

  it('erro que NÃO é P2002 continua propagando (sem mascarar falha real)', async () => {
    createMock.mockRejectedValue(
      Object.assign(new Error('connection reset'), { code: 'P1017' }),
    )

    await expect(persistMessage(INPUT)).rejects.toThrow('connection reset')
    expect(findUniqueMock).not.toHaveBeenCalled()
  })

  it('P2002 mas a row sumiu entre o create e a busca → propaga o erro original', async () => {
    createMock.mockRejectedValue(p2002())
    findUniqueMock.mockResolvedValue(null)

    await expect(persistMessage(INPUT)).rejects.toThrow(
      'Unique constraint failed',
    )
  })
})
