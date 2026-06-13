/**
 * Unit tests da tool create_followup (TPRO-01 — agendamento de envio PROATIVO).
 *
 * Mocka db (ScheduledMessage.create + ChatSession.findUnique) e o producer da
 * fila (enqueueScheduledMessage). Prova:
 *   - cria ScheduledMessage com os campos certos (org/contato-scoped a partir do
 *     ctx + sessão) e enfileira com delayMs correto;
 *   - respeita defaults (maxAttempts=1, cancelIfCustomerReplies=true);
 *   - recusa scheduledAt inválido SEM tocar no db nem na fila;
 *   - NÃO envia (só agenda).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock do db: só os métodos que a tool usa.
const mockFindUnique = vi.fn()
const mockCreate = vi.fn()
vi.mock('@/server/services/database', () => ({
  database: {
    chatSession: { findUnique: (...a: unknown[]) => mockFindUnique(...a) },
    scheduledMessage: { create: (...a: unknown[]) => mockCreate(...a) },
  },
}))

// Mock do producer da fila — provamos o enqueue sem Redis.
const mockEnqueue = vi.fn()
vi.mock('@/server/services/jobs/scheduled-message.queue', () => ({
  enqueueScheduledMessage: (...a: unknown[]) => mockEnqueue(...a),
}))

import { createBuiltinTools } from './builtin-tools'
import type { ToolExecutionContext } from './builtin-tools'

function makeCtx(over: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return {
    sessionId: 'sess-1',
    contactId: 'contact-1',
    connectionId: 'conn-1',
    organizationId: 'org-1',
    ...over,
  }
}

interface FollowupInput {
  reason: string
  scheduledAt: string
  messageGoal?: string
  maxAttempts?: number
  cancelIfCustomerReplies?: boolean
}

async function runCreateFollowup(
  ctx: ToolExecutionContext,
  input: FollowupInput,
) {
  const execute = createBuiltinTools(ctx).create_followup.execute
  if (!execute) throw new Error('tool sem execute')
  // O Zod do AI SDK aplica os defaults antes do execute em runtime; aqui
  // chamamos o execute direto, então passamos os defaults explicitamente quando
  // o teste quer exercitá-los.
  return execute(input as never, {} as never)
}

beforeEach(() => {
  vi.useRealTimers()
  mockFindUnique.mockReset()
  mockCreate.mockReset()
  mockEnqueue.mockReset()
  mockFindUnique.mockResolvedValue({ contactPhone: '5511999999999' })
  mockCreate.mockResolvedValue({ id: 'sm-123' })
  mockEnqueue.mockResolvedValue({ enqueued: true, transport: 'bullmq' })
})

describe('create_followup', () => {
  it('cria ScheduledMessage com os campos certos e enfileira com delay (offset)', async () => {
    // Congela o tempo para um delay determinístico (+2h = 7_200_000 ms).
    const now = new Date('2026-06-13T10:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    const result = await runCreateFollowup(makeCtx(), {
      reason: 'cliente ia pensar no orçamento',
      scheduledAt: '+2h',
      messageGoal: 'perguntar se decidiu',
      maxAttempts: 3,
      cancelIfCustomerReplies: false,
    })

    // Telefone resolvido da sessão (org-scoped pelo ctx).
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'sess-1' },
      select: { contactPhone: true },
    })

    // ScheduledMessage criado com os campos certos.
    expect(mockCreate).toHaveBeenCalledTimes(1)
    const createArg = mockCreate.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(createArg.data).toMatchObject({
      organizationId: 'org-1',
      automationId: null,
      connectionId: 'conn-1',
      contactPhone: '5511999999999',
      sessionId: 'sess-1',
      reason: 'cliente ia pensar no orçamento',
      messageGoal: 'perguntar se decidiu',
      maxAttempts: 3,
      cancelIfCustomerReplies: false,
    })
    // scheduledAt = now + 2h
    expect((createArg.data.scheduledAt as Date).toISOString()).toBe(
      '2026-06-13T12:00:00.000Z',
    )

    // Enfileirado com o id criado + delay correto, SEM enviar.
    expect(mockEnqueue).toHaveBeenCalledTimes(1)
    const [payload, opts] = mockEnqueue.mock.calls[0] as [
      Record<string, unknown>,
      { delayMs: number },
    ]
    expect(payload).toMatchObject({
      scheduledMessageId: 'sm-123',
      organizationId: 'org-1',
      connectionId: 'conn-1',
      contactPhone: '5511999999999',
      sessionId: 'sess-1',
      scheduledAt: '2026-06-13T12:00:00.000Z',
      reason: 'cliente ia pensar no orçamento',
    })
    expect(opts.delayMs).toBe(2 * 60 * 60 * 1000)

    expect(result).toMatchObject({
      success: true,
      scheduledMessageId: 'sm-123',
      scheduledAt: '2026-06-13T12:00:00.000Z',
      enqueued: true,
    })

    vi.useRealTimers()
  })

  it('respeita os defaults (maxAttempts=1, cancelIfCustomerReplies=true)', async () => {
    // Simula o Zod aplicando defaults: o execute recebe os campos já com default.
    await runCreateFollowup(makeCtx(), {
      reason: 'retornar depois',
      scheduledAt: '+30m',
      maxAttempts: 1,
      cancelIfCustomerReplies: true,
    })

    const createArg = mockCreate.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(createArg.data).toMatchObject({
      maxAttempts: 1,
      cancelIfCustomerReplies: true,
      messageGoal: null,
    })
  })

  it('aceita ISO absoluto futuro e calcula o delay correto', async () => {
    const now = new Date('2026-06-13T10:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    await runCreateFollowup(makeCtx(), {
      reason: 'follow-up amanhã',
      scheduledAt: '2026-06-14T10:00:00.000Z',
      maxAttempts: 1,
      cancelIfCustomerReplies: true,
    })

    const [, opts] = mockEnqueue.mock.calls[0] as [unknown, { delayMs: number }]
    expect(opts.delayMs).toBe(24 * 60 * 60 * 1000)

    vi.useRealTimers()
  })

  it('recusa scheduledAt inválido sem tocar no db nem na fila', async () => {
    const result = await runCreateFollowup(makeCtx(), {
      reason: 'qualquer',
      scheduledAt: 'amanhã de manhã',
      maxAttempts: 1,
      cancelIfCustomerReplies: true,
    })

    expect(result).toMatchObject({ success: false })
    expect(mockFindUnique).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('recusa data no passado (offset não pode ser passado; ISO passado bloqueia)', async () => {
    const now = new Date('2026-06-13T10:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    const result = await runCreateFollowup(makeCtx(), {
      reason: 'tarde demais',
      scheduledAt: '2026-06-13T09:00:00.000Z', // 1h no passado
      maxAttempts: 1,
      cancelIfCustomerReplies: true,
    })

    expect(result).toMatchObject({ success: false })
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('falha graciosamente quando a sessão não tem telefone', async () => {
    mockFindUnique.mockResolvedValue(null)

    const result = await runCreateFollowup(makeCtx(), {
      reason: 'sem sessão',
      scheduledAt: '+1h',
      maxAttempts: 1,
      cancelIfCustomerReplies: true,
    })

    expect(result).toMatchObject({ success: false })
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })
})
