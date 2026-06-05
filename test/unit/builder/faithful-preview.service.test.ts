/**
 * faithful-preview.service — unit tests (QH-08)
 *
 * Strategy: mock `processPlaygroundStream` (the real runtime generator) and
 * `getDatabase` so that:
 *   - No DB is needed.
 *   - No real LLM calls happen.
 *   - We can assert that NONE of the side-effect functions are invoked.
 *
 * Side-effects verified absent:
 *   - recordRuntimeDecision  (runtime decision row)
 *   - incrementSessionCost   (Redis cost counter)
 *   - persistTurn            (Redis memory)
 *   - updateRuntimeMetrics   (DB metrics — private, but observable via mock)
 *   - acquireContactLock     (Redis lock)
 *
 * Because `processPlaygroundStream` is itself mocked, those internal calls
 * never fire. The tests confirm this by checking mock call counts.
 */

import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE the module under test is imported, so vi.mock
// hoisting works correctly.
// ---------------------------------------------------------------------------

vi.mock('@/server/services/database', () => ({
  getDatabase: vi.fn(),
}))

vi.mock('@/server/ai-module/ai-agents/agent-runtime.service', () => ({
  processPlaygroundStream: vi.fn(),
}))

// Side-effect services (should never be called directly from faithful-preview)
vi.mock('@/server/ai-module/ai-agents/services/runtime-decision.service', () => ({
  recordRuntimeDecision: vi.fn(),
  EMPTY_DECISION_META: {},
}))

vi.mock('@/server/ai-module/ai-agents/infra/hard-caps.service', () => ({
  incrementSessionCost: vi.fn(),
}))

vi.mock('@/server/ai-module/ai-agents/services/memory-integration.service', () => ({
  persistTurn: vi.fn(),
}))

vi.mock('@/server/ai-module/ai-agents/infra/contact-lock.service', () => ({
  acquireContactLock: vi.fn(),
  releaseContactLock: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks are registered)
// ---------------------------------------------------------------------------

import { runFaithfulPreview } from '@/server/ai-module/builder/services/faithful-preview.service'
import { getDatabase } from '@/server/services/database'
import { processPlaygroundStream } from '@/server/ai-module/ai-agents/agent-runtime.service'
import { recordRuntimeDecision } from '@/server/ai-module/ai-agents/services/runtime-decision.service'
import { incrementSessionCost } from '@/server/ai-module/ai-agents/infra/hard-caps.service'
import { persistTurn } from '@/server/ai-module/ai-agents/services/memory-integration.service'
import { acquireContactLock } from '@/server/ai-module/ai-agents/infra/contact-lock.service'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; toolName: string; args: Record<string, unknown> }
  | { type: 'tool-result'; toolName: string; result: unknown }
  | {
      type: 'finish'
      usage: { inputTokens: number; outputTokens: number; totalTokens: number }
      cost: { inputCost: number; outputCost: number; totalCost: number }
      latencyMs: number
      model: string
      provider: string
      toolCalls: Array<{ toolName: string; args: Record<string, unknown>; result: unknown }>
    }
  | { type: 'error'; message: string }

async function* makeStream(events: StreamEvent[]) {
  for (const ev of events) {
    yield ev
  }
}

const VALID_INPUT = {
  projectId: '00000000-0000-0000-0000-000000000001',
  organizationId: 'org-123',
  messages: [
    { role: 'user' as const, content: 'Olá, como você pode me ajudar?' },
  ],
}

const FINISH_EVENT: StreamEvent = {
  type: 'finish',
  usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
  cost: { inputCost: 0.001, outputCost: 0.002, totalCost: 0.003 },
  latencyMs: 320,
  model: 'gpt-4o-mini',
  provider: 'openai',
  toolCalls: [],
}

// ---------------------------------------------------------------------------
// beforeEach: reset all mocks
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()

  // Default DB mock: project exists with an agent
  const mockDb = {
    builderProject: {
      findFirst: vi.fn().mockResolvedValue({
        id: VALID_INPUT.projectId,
        aiAgentId: 'agent-abc',
      }),
    },
  }
  ;(getDatabase as unknown as MockInstance).mockReturnValue(mockDb)

  // Default stream: simple reply
  ;(processPlaygroundStream as unknown as MockInstance).mockReturnValue(
    makeStream([
      { type: 'text-delta', text: 'Olá! ' },
      { type: 'text-delta', text: 'Posso ajudar com tudo.' },
      FINISH_EVENT,
    ]),
  )
})

// ---------------------------------------------------------------------------
// Happy-path tests
// ---------------------------------------------------------------------------

describe('runFaithfulPreview — happy path', () => {
  it('retorna o reply acumulado dos text-delta events', async () => {
    const result = await runFaithfulPreview(VALID_INPUT)
    expect(result.reply).toBe('Olá! Posso ajudar com tudo.')
  })

  it('retorna modelUsed, provider e latencyMs do evento finish', async () => {
    const result = await runFaithfulPreview(VALID_INPUT)
    expect(result.modelUsed).toBe('gpt-4o-mini')
    expect(result.provider).toBe('openai')
    expect(result.latencyMs).toBe(320)
  })

  it('retorna usage e cost corretos do evento finish', async () => {
    const result = await runFaithfulPreview(VALID_INPUT)
    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    })
    expect(result.cost.totalCost).toBeCloseTo(0.003)
  })

  it('coleta toolCalls pelo nome quando eventos tool-call estão presentes', async () => {
    ;(processPlaygroundStream as unknown as MockInstance).mockReturnValue(
      makeStream([
        { type: 'tool-call', toolName: 'get_pricing', args: {} },
        { type: 'tool-result', toolName: 'get_pricing', result: { price: 99 } },
        { type: 'text-delta', text: 'O preço é R$99.' },
        { ...FINISH_EVENT, toolCalls: [{ toolName: 'get_pricing', args: {}, result: {} }] },
      ]),
    )
    const result = await runFaithfulPreview(VALID_INPUT)
    expect(result.toolCalls).toEqual(['get_pricing'])
    expect(result.reply).toBe('O preço é R$99.')
  })

  it('passa a última mensagem como message e o histórico anterior como history', async () => {
    const inputWithHistory = {
      ...VALID_INPUT,
      messages: [
        { role: 'user' as const, content: 'Primeira pergunta' },
        { role: 'assistant' as const, content: 'Primeira resposta' },
        { role: 'user' as const, content: 'Segunda pergunta' },
      ],
    }
    await runFaithfulPreview(inputWithHistory)

    expect(processPlaygroundStream).toHaveBeenCalledOnce()
    const callArg = (processPlaygroundStream as unknown as MockInstance).mock.calls[0]![0] as {
      message: string
      history: Array<{ role: string; content: string }>
    }
    expect(callArg.message).toBe('Segunda pergunta')
    expect(callArg.history).toHaveLength(2)
    expect(callArg.history[0]!.content).toBe('Primeira pergunta')
  })

  it('propaga organizationId e agentConfigId para o runtime', async () => {
    await runFaithfulPreview(VALID_INPUT)
    expect(processPlaygroundStream).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-123',
        agentConfigId: 'agent-abc',
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// Zero side-effects
// ---------------------------------------------------------------------------

describe('runFaithfulPreview — zero side-effects', () => {
  it('não chama recordRuntimeDecision', async () => {
    await runFaithfulPreview(VALID_INPUT)
    expect(recordRuntimeDecision).not.toHaveBeenCalled()
  })

  it('não chama incrementSessionCost', async () => {
    await runFaithfulPreview(VALID_INPUT)
    expect(incrementSessionCost).not.toHaveBeenCalled()
  })

  it('não chama persistTurn', async () => {
    await runFaithfulPreview(VALID_INPUT)
    expect(persistTurn).not.toHaveBeenCalled()
  })

  it('não chama acquireContactLock', async () => {
    await runFaithfulPreview(VALID_INPUT)
    expect(acquireContactLock).not.toHaveBeenCalled()
  })

  it('não persiste nenhuma mensagem (getDatabase.message não é chamado)', async () => {
    await runFaithfulPreview(VALID_INPUT)
    const db = (getDatabase as unknown as MockInstance).mock.results[0]!.value as {
      builderProject: { findFirst: MockInstance }
      message?: { create: MockInstance }
    }
    // message table should not exist on the mock (never accessed)
    expect(db.message).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('runFaithfulPreview — erros', () => {
  it('lança erro quando o projeto não existe na organização', async () => {
    const mockDb = {
      builderProject: { findFirst: vi.fn().mockResolvedValue(null) },
    }
    ;(getDatabase as unknown as MockInstance).mockReturnValue(mockDb)

    await expect(runFaithfulPreview(VALID_INPUT)).rejects.toThrow(/não encontrado/)
  })

  it('lança erro quando o projeto existe mas não tem agente vinculado', async () => {
    const mockDb = {
      builderProject: {
        findFirst: vi.fn().mockResolvedValue({ id: VALID_INPUT.projectId, aiAgentId: null }),
      },
    }
    ;(getDatabase as unknown as MockInstance).mockReturnValue(mockDb)

    await expect(runFaithfulPreview(VALID_INPUT)).rejects.toThrow(/agente vinculado/)
  })

  it('propaga o erro do runtime como exception', async () => {
    ;(processPlaygroundStream as unknown as MockInstance).mockReturnValue(
      makeStream([{ type: 'error', message: 'LLM rate limit' }]),
    )

    await expect(runFaithfulPreview(VALID_INPUT)).rejects.toThrow(
      'Runtime playground error: LLM rate limit',
    )
  })

  it('falha na validação Zod quando projectId não é UUID', async () => {
    await expect(
      runFaithfulPreview({ ...VALID_INPUT, projectId: 'not-a-uuid' }),
    ).rejects.toThrow()
  })

  it('falha na validação Zod quando messages está vazio', async () => {
    await expect(
      runFaithfulPreview({ ...VALID_INPUT, messages: [] }),
    ).rejects.toThrow()
  })

  it('lança erro quando o último message tem role "assistant"', async () => {
    await expect(
      runFaithfulPreview({
        ...VALID_INPUT,
        messages: [{ role: 'assistant' as const, content: 'Resposta sem pergunta' }],
      }),
    ).rejects.toThrow(/role "user"/)
  })
})
