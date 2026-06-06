/**
 * outbound-retry.queue — unit tests (QH-02).
 *
 * Foco no PRODUCER `enqueueOutboundRetry`:
 *   1. Caminho BullMQ: adiciona o job com `delay = delayMs` e fecha a conexão.
 *   2. Fail-safe sem REDIS_URL (e sync off): não enfileira e NÃO lança.
 *   3. Fail-safe quando `queue.add` rejeita: NÃO lança (turno não pode cair).
 *
 * Estratégia: mock do módulo 'bullmq' (Queue/Worker) com spies em memória.
 *
 * Rodar:
 *   npx vitest run src/server/communication/services/outbound-retry.queue.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock 'bullmq' — captura construção da Queue + add/close.
// ---------------------------------------------------------------------------

const { queueAdd, queueClose, queueCtor, QueueMock, WorkerMock } = vi.hoisted(() => {
  const queueAdd = vi.fn(
    async (
      _name: string,
      _data: { attempt: number; agentText: string; _trace?: { id: string } },
      _opts: { delay: number },
    ) => ({ id: 'job-1' }),
  )
  const queueClose = vi.fn(async () => undefined)
  const queueCtor = vi.fn()
  class QueueMock {
    constructor(name: string, opts: unknown) {
      queueCtor(name, opts)
    }
    add = queueAdd
    close = queueClose
  }
  class WorkerMock {
    constructor(_name: string, _proc: unknown, _opts: unknown) {}
  }
  return { queueAdd, queueClose, queueCtor, QueueMock, WorkerMock }
})

vi.mock('bullmq', () => ({ Queue: QueueMock, Worker: WorkerMock }))

import {
  enqueueOutboundRetry,
  OUTBOUND_RETRY_QUEUE,
  OUTBOUND_RETRY_JOB_NAME,
  type OutboundRetryJobPayload,
} from './outbound-retry.queue'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildPayload(overrides: Partial<OutboundRetryJobPayload> = {}): OutboundRetryJobPayload {
  return {
    connectionId: 'conn-1',
    sessionId: 'sess-1',
    organizationId: 'org-1',
    contactPhone: '5511999999999',
    agentText: 'resposta do agente',
    attempt: 1,
    ...overrides,
  }
}

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.OUTBOUND_RETRY_SYNC = ''
  process.env.REDIS_URL = 'redis://localhost:6379'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('enqueueOutboundRetry — caminho BullMQ', () => {
  it('adiciona o job na fila certa com delay = delayMs e fecha a conexão', async () => {
    await enqueueOutboundRetry(buildPayload({ attempt: 2 }), { delayMs: 1500 })

    expect(queueCtor).toHaveBeenCalledOnce()
    expect(queueCtor.mock.calls[0][0]).toBe(OUTBOUND_RETRY_QUEUE)

    expect(queueAdd).toHaveBeenCalledOnce()
    const [jobName, data, opts] = queueAdd.mock.calls[0]
    expect(jobName).toBe(OUTBOUND_RETRY_JOB_NAME)
    expect(data.attempt).toBe(2)
    expect(data.agentText).toBe('resposta do agente')
    expect(opts.delay).toBe(1500)

    // Producer efêmero sempre fecha a conexão (mesmo em sucesso).
    expect(queueClose).toHaveBeenCalledOnce()
  })

  it('clampa delay negativo/NaN para 0 (não quebra o add)', async () => {
    await enqueueOutboundRetry(buildPayload(), { delayMs: -50 })
    expect(queueAdd.mock.calls[0][2].delay).toBe(0)
  })

  it('QH-13: anexa o carrier _trace com o traceId fornecido (correlação cross-worker)', async () => {
    await enqueueOutboundRetry(buildPayload(), {
      delayMs: 1000,
      traceId: '11111111-1111-4111-8111-111111111111',
    })

    const [, data] = queueAdd.mock.calls[0]
    expect(data._trace?.id).toBe('11111111-1111-4111-8111-111111111111')
    // O payload de negócio é preservado lado a lado com o carrier.
    expect(data.agentText).toBe('resposta do agente')
  })

  it('LANÇA quando queue.add rejeita (caller roteia à dead-letter) — e ainda fecha a conexão', async () => {
    queueAdd.mockRejectedValueOnce(new Error('redis down'))

    await expect(
      enqueueOutboundRetry(buildPayload(), { delayMs: 1000 }),
    ).rejects.toThrow('redis down')

    // finally fecha a conexão mesmo no caminho de erro.
    expect(queueClose).toHaveBeenCalledOnce()
  })
})

describe('enqueueOutboundRetry — falha de agendamento sinaliza ao caller', () => {
  it('sem REDIS_URL e sync off: LANÇA (não enfileira) para o caller fazer dead-letter', async () => {
    delete process.env.REDIS_URL

    await expect(
      enqueueOutboundRetry(buildPayload(), { delayMs: 1000 }),
    ).rejects.toThrow(/REDIS_URL/)

    // Nunca chega a construir a fila nem adicionar o job.
    expect(queueAdd).not.toHaveBeenCalled()
    expect(queueCtor).not.toHaveBeenCalled()
  })
})
