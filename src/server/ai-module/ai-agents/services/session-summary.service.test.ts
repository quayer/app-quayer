/**
 * session-summary.service — unit tests (TDD)
 *
 * Cobre:
 *  - summarizeSession: mensagens curtas, fluxo feliz com OpenAI, erro 5xx,
 *    model customizado, language/maxWords no prompt.
 *  - persistSessionSummary: sucesso e erro (não lança).
 *  - loadPreviousSessionSummary: hit, miss, sem summary no aiAgentContext,
 *    filtro excludeSessionId.
 *
 * Rodar:
 *   npx vitest run src/server/ai-module/ai-agents/services/session-summary.service.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  summarizeSession,
  persistSessionSummary,
  loadPreviousSessionSummary,
} from './session-summary.service'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOpenAIResponse(
  content = 'cliente Joao buscou orcamento de barbearia, fechou em R$ 50',
  ok = true,
  status = 200
) {
  const body = { choices: [{ message: { content } }] }
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

function buildMessages(n: number): Array<{ role: string; content: string }> {
  const msgs: Array<{ role: string; content: string }> = []
  for (let i = 0; i < n; i++) {
    msgs.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `mensagem ${i}`,
    })
  }
  return msgs
}

function buildChatSessionMock(findFirstReturn: any) {
  return {
    chatSession: {
      findFirst: vi.fn().mockResolvedValue(findFirstReturn),
      update: vi.fn().mockResolvedValue({}),
    },
  }
}

// ---------------------------------------------------------------------------
// summarizeSession
// ---------------------------------------------------------------------------

describe('summarizeSession', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('1. messages.length < 3 → null (não vale resumir)', async () => {
    const result = await summarizeSession(buildMessages(2), {
      openaiApiKey: 'sk-test',
    })

    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('2. OpenAI responde 200 → SessionSummary completo', async () => {
    fetchMock.mockResolvedValueOnce(makeOpenAIResponse('resumo final'))

    const result = await summarizeSession(buildMessages(10), {
      openaiApiKey: 'sk-test',
    })

    expect(result).not.toBeNull()
    expect(result?.summary).toBe('resumo final')
    expect(result?.messageCount).toBe(10)
    expect(result?.model).toBe('gpt-4o-mini')
    expect(typeof result?.generatedAt).toBe('string')
    expect(() => new Date(result!.generatedAt).toISOString()).not.toThrow()
  })

  it('3. OpenAI 500 → null', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => 'server error',
    } as unknown as Response)

    const result = await summarizeSession(buildMessages(5), {
      openaiApiKey: 'sk-test',
    })

    expect(result).toBeNull()
  })

  it('4. usa model customizado no payload', async () => {
    fetchMock.mockResolvedValueOnce(makeOpenAIResponse('ok'))

    await summarizeSession(buildMessages(5), {
      openaiApiKey: 'sk-test',
      model: 'gpt-4o',
    })

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    )
    expect(body.model).toBe('gpt-4o')
  })

  it('5. inclui language pt-BR no prompt do system', async () => {
    fetchMock.mockResolvedValueOnce(makeOpenAIResponse('ok'))

    await summarizeSession(buildMessages(5), {
      openaiApiKey: 'sk-test',
    })

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    )
    const systemMsg = body.messages.find((m: any) => m.role === 'system')
    expect(systemMsg).toBeDefined()
    expect(systemMsg.content).toMatch(/pt-BR/)
  })

  it('6. inclui maxWords no prompt do system', async () => {
    fetchMock.mockResolvedValueOnce(makeOpenAIResponse('ok'))

    await summarizeSession(buildMessages(5), {
      openaiApiKey: 'sk-test',
      maxWords: 120,
    })

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    )
    const systemMsg = body.messages.find((m: any) => m.role === 'system')
    expect(systemMsg.content).toMatch(/120/)
  })
})

// ---------------------------------------------------------------------------
// persistSessionSummary
// ---------------------------------------------------------------------------

describe('persistSessionSummary', () => {
  const summary = {
    summary: 'resumo do atendimento',
    generatedAt: '2026-05-12T10:00:00.000Z',
    messageCount: 10,
    model: 'gpt-4o-mini',
  }

  it('7. Sucesso → true e chama chatSession.update com aiAgentContext.summary', async () => {
    const db = buildChatSessionMock(null)

    const ok = await persistSessionSummary(db as any, 'sess-1', summary)

    expect(ok).toBe(true)
    expect(db.chatSession.update).toHaveBeenCalledOnce()
    const call = db.chatSession.update.mock.calls[0][0]
    expect(call.where).toEqual({ id: 'sess-1' })
    expect(call.data.aiAgentContext).toMatchObject({ summary })
  })

  it('8. Update lança → false e log warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const db = {
      chatSession: {
        findFirst: vi.fn(),
        update: vi.fn().mockRejectedValue(new Error('db down')),
      },
    }

    const ok = await persistSessionSummary(db as any, 'sess-1', summary)

    expect(ok).toBe(false)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// loadPreviousSessionSummary
// ---------------------------------------------------------------------------

describe('loadPreviousSessionSummary', () => {
  it('9. ChatSession encontrada com summary → retorna SessionSummary', async () => {
    const stored = {
      summary: 'sumario anterior',
      generatedAt: '2026-05-11T09:00:00.000Z',
      messageCount: 8,
      model: 'gpt-4o-mini',
    }
    const db = buildChatSessionMock({
      id: 'sess-old',
      aiAgentContext: { summary: stored },
    })

    const result = await loadPreviousSessionSummary(
      db as any,
      '+5511999999999',
      'org-1'
    )

    expect(result).toEqual(stored)
    expect(db.chatSession.findFirst).toHaveBeenCalledOnce()
    const args = db.chatSession.findFirst.mock.calls[0][0]
    expect(args.where.contactPhone).toBe('+5511999999999')
    expect(args.where.organizationId).toBe('org-1')
    expect(args.where.status).toBe('CLOSED')
    expect(args.orderBy).toEqual({ closedAt: 'desc' })
  })

  it('10. Nenhuma sessão CLOSED → null', async () => {
    const db = buildChatSessionMock(null)

    const result = await loadPreviousSessionSummary(
      db as any,
      '+5511999999999',
      'org-1'
    )

    expect(result).toBeNull()
  })

  it('11. aiAgentContext sem summary → null', async () => {
    const db = buildChatSessionMock({
      id: 'sess-x',
      aiAgentContext: { other: 'data' },
    })

    const result = await loadPreviousSessionSummary(
      db as any,
      '+5511999999999',
      'org-1'
    )

    expect(result).toBeNull()
  })

  it('12. excludeSessionId filtra (where id.not)', async () => {
    const db = buildChatSessionMock(null)

    await loadPreviousSessionSummary(db as any, '+5511999999999', 'org-1', {
      excludeSessionId: 'sess-current',
    })

    const args = db.chatSession.findFirst.mock.calls[0][0]
    expect(args.where.id).toEqual({ not: 'sess-current' })
  })
})
