/**
 * card-submit.routes — silent-submit (T90/FR-29) — unit tests (T102).
 *
 * Scope: the `submitCard` ROUTE wiring around `ackMode` (NOT `applyCardSubmit`,
 * which has its own co-located suite). We drive the REAL `igniter.mutation`
 * handler (`cardSubmitRoutes.submitCard.handler`) with a minimal request/response
 * harness — same approach as `communication/messages/list.routes.test.ts` — and
 * mock the route's collaborators so we can assert WHICH ones run per `ackMode`.
 *
 * Plan §7.1 / tasks T102:
 *   - `ackMode: 'silent'` (allowlisted card) → the flip persists and the response
 *     is plain JSON (`{ ok, builderState }`) with NO SSE: neither
 *     `ensureBuilderAgent` nor `buildSseResponse` is called.
 *   - a cardKey OUTSIDE `SILENT_ALLOWED_CARD_KEYS` with `silent` → 400, BEFORE any
 *     state write (`applyCardSubmit` never runs).
 *   - default mode (no `ackMode`) → unchanged conversational behavior: the flip
 *     persists AND the SSE turn streams (`ensureBuilderAgent` + `buildSseResponse`
 *     both run), byte-compatible with the pre-T90 wire.
 *
 * Rodar:
 *   npx vitest run src/server/ai-module/builder/cards/card-submit.routes.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — hoisted before any import that touches the route's collaborators.
// ---------------------------------------------------------------------------

const mockFindUnique = vi.hoisted(() => vi.fn())

vi.mock('@/server/services/database', () => ({
  database: {
    builderProjectConversation: {
      findUnique: mockFindUnique,
    },
  },
}))

// Auth procedure is a no-op stub: the harness injects `context.auth` directly,
// so the procedure body never needs to run.
vi.mock('@/server/core/auth/procedures/api-key.procedure', () => ({
  authOrApiKeyProcedure: () => ({ name: 'authOrApiKeyProcedure', handler: vi.fn() }),
}))

const mockApplyCardSubmit = vi.hoisted(() => vi.fn())
vi.mock('./handlers/apply-card-submit', () => ({
  applyCardSubmit: mockApplyCardSubmit,
}))

const mockApplyKnowledgeAck = vi.hoisted(() => vi.fn())
const mockApplyMediaAck = vi.hoisted(() => vi.fn())
vi.mock('./handlers/apply/journey-v2', () => ({
  applyKnowledgeAck: mockApplyKnowledgeAck,
  applyMediaAck: mockApplyMediaAck,
}))

const mockApplyRefinementRun = vi.hoisted(() => vi.fn())
vi.mock('./handlers/apply/refinement', () => ({
  applyRefinementRun: mockApplyRefinementRun,
}))

// The two SSE-only collaborators we assert are NOT called on the silent path.
const mockEnsureBuilderAgent = vi.hoisted(() => vi.fn())
vi.mock('../services/ensure-builder-agent', () => ({
  ensureBuilderAgent: mockEnsureBuilderAgent,
}))

const mockBuildSseResponse = vi.hoisted(() => vi.fn())
vi.mock('../chat/sse-stream', () => ({
  buildSseResponse: mockBuildSseResponse,
}))

const mockGetReadiness = vi.hoisted(() => vi.fn())
vi.mock('../state/readiness-resolver', () => ({
  getReadiness: mockGetReadiness,
}))

// ---------------------------------------------------------------------------
// Imports — only after the mocks are registered.
// ---------------------------------------------------------------------------

import { cardSubmitRoutes } from './card-submit.routes'
import { parseBuilderState } from './builder-state'

// ---------------------------------------------------------------------------
// Harness — minimal igniter-compatible request/response (mirrors list.routes).
// ---------------------------------------------------------------------------

type ResponseResult = { _status: number; _body: unknown; _kind: string }

function makeResponse() {
  let _status = 200
  let _body: unknown = null

  const response = {
    status(code: number) {
      _status = code
      return response
    },
    success(body: unknown) {
      _body = body
      _status = 200
      return { _status, _body, _kind: 'success' as const }
    },
    json(body: unknown) {
      _body = body
      _status = 200
      return { _status, _body, _kind: 'json' as const }
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
    forbidden(msg: string) {
      _status = 403
      _body = { error: msg }
      return { _status, _body, _kind: 'forbidden' as const }
    },
    notFound(msg: string) {
      _status = 404
      _body = { error: msg }
      return { _status, _body, _kind: 'notFound' as const }
    },
  }
  return response
}

interface InvokeArgs {
  params?: Record<string, string>
  body?: unknown
  currentOrgId?: string | null
  userId?: string
}

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const ORG_ID = 'org-1'
const CONV_ID = 'conv-1'
const USER_ID = 'user-1'

async function invoke({
  params = {},
  body,
  currentOrgId = ORG_ID,
  userId = USER_ID,
}: InvokeArgs): Promise<ResponseResult | Response> {
  const response = makeResponse()
  // O tipo do handler do Igniter (IgniterActionContext com realtime/plugins) não
  // sobrepõe o shape mínimo que injetamos no teste — cast via unknown é intencional.
  const handler = cardSubmitRoutes.submitCard.handler as unknown as (args: {
    request: { params?: Record<string, string>; body?: unknown }
    context: {
      auth?: { session?: { user?: { id: string; currentOrgId?: string | null } } }
    }
    response: ReturnType<typeof makeResponse>
  }) => Promise<ResponseResult | Response>

  return handler({
    request: { params, body },
    context: { auth: { session: { user: { id: userId, currentOrgId } } } },
    response,
  })
}

function asResult(res: ResponseResult | Response): ResponseResult {
  // The silent + error paths return our harness object; the SSE path returns a
  // real `Response` (only on the conversational branch — never asserted as a result).
  return res as ResponseResult
}

beforeEach(() => {
  vi.clearAllMocks()
  // applyCardSubmit succeeds by default (the flip persisted); per-test overrides
  // tune the failure variants. The route only consumes `ok`/`conversationId`/
  // `cardInstruction` from this.
  mockApplyCardSubmit.mockResolvedValue({
    ok: true,
    conversationId: CONV_ID,
    cardInstruction: 'ACK pt-BR seed',
  })
  mockApplyRefinementRun.mockResolvedValue({
    ok: true,
    conversationId: CONV_ID,
    cardInstruction: 'Refinamento concluído',
  })
  // findUnique backs BOTH the silent JSON response (builderState) and the
  // conversational stateSummary read.
  mockFindUnique.mockResolvedValue({
    builderState: { journeyVersion: 1 },
    stateSummary: null,
  })
  mockEnsureBuilderAgent.mockResolvedValue({ id: 'builder-agent-1' })
  mockGetReadiness.mockResolvedValue(undefined)
  // A sentinel Response so the conversational path returns something identity-able.
  mockBuildSseResponse.mockReturnValue(
    new Response('data: {}\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    }),
  )
})

// ---------------------------------------------------------------------------
// ackMode: 'silent' — allowlisted toggle → flip persists, JSON, NO SSE
// ---------------------------------------------------------------------------

describe('submitCard — ackMode "silent" (allowlisted Capabilities toggle)', () => {
  it('persiste o flip e responde JSON simples SEM SSE (pricing)', async () => {
    const res = asResult(
      await invoke({
        params: { id: PROJECT_ID, cardKey: 'pricing' },
        body: {
          cardKey: 'pricing',
          ackMode: 'silent',
          items: [{ name: 'Corte', priceCents: 5000 }],
          currency: 'BRL',
          disclosureStyle: 'exact',
        },
      }),
    )

    // 1) O flip persistiu pelo MESMO applyCardSubmit (estado aplicado).
    expect(mockApplyCardSubmit).toHaveBeenCalledTimes(1)

    // 2) Resposta é JSON simples — sem turno LLM, sem SSE.
    expect(res._kind).toBe('json')
    expect(res._status).toBe(200)
    expect(res._body).toMatchObject({ success: true, data: { ok: true } })

    // 3) NENHUMA chamada a ensureBuilderAgent / buildSseResponse (zero custo LLM).
    expect(mockEnsureBuilderAgent).not.toHaveBeenCalled()
    expect(mockBuildSseResponse).not.toHaveBeenCalled()
    // readiness só é resolvido no caminho conversacional.
    expect(mockGetReadiness).not.toHaveBeenCalled()
  })

  it('responde o builderState ATUAL parseado da conversa', async () => {
    mockFindUnique.mockResolvedValue({
      builderState: { journeyVersion: 2 },
      stateSummary: null,
    })

    const res = asResult(
      await invoke({
        params: { id: PROJECT_ID, cardKey: 'handoff' },
        body: {
          cardKey: 'handoff',
          ackMode: 'silent',
          mode: 'roleta',
          alsoSchedule: false,
          steps: [],
          members: [],
        },
      }),
    )

    expect(res._kind).toBe('json')
    expect(res._body).toEqual({
      success: true,
      data: {
        ok: true,
        builderState: parseBuilderState({ journeyVersion: 2 }),
      },
    })
    // O read do builderState foi pelo conversationId devolvido por applyCardSubmit.
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CONV_ID } }),
    )
    expect(mockBuildSseResponse).not.toHaveBeenCalled()
  })

  it('roteia o ack knowledge para o handler próprio e segue silent (sem SSE)', async () => {
    mockApplyKnowledgeAck.mockResolvedValue({
      ok: true,
      conversationId: CONV_ID,
      cardInstruction: 'ack knowledge',
    })

    const res = asResult(
      await invoke({
        params: { id: PROJECT_ID, cardKey: 'knowledge' },
        body: { cardKey: 'knowledge', ackMode: 'silent', action: 'ack' },
      }),
    )

    // O dispatch foi para o handler próprio do ack (nunca o entrypoint do union).
    expect(mockApplyKnowledgeAck).toHaveBeenCalledTimes(1)
    expect(mockApplyCardSubmit).not.toHaveBeenCalled()

    expect(res._kind).toBe('json')
    expect(res._body).toMatchObject({ success: true, data: { ok: true } })
    expect(mockEnsureBuilderAgent).not.toHaveBeenCalled()
    expect(mockBuildSseResponse).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// ackMode: 'silent' fora da allowlist → 400 ANTES de qualquer write
// ---------------------------------------------------------------------------

describe('submitCard — ackMode "silent" fora da allowlist → 400', () => {
  it('rejeita um card da jornada (agent_persona) com silent', async () => {
    const res = asResult(
      await invoke({
        params: { id: PROJECT_ID, cardKey: 'agent_persona' },
        body: {
          cardKey: 'agent_persona',
          ackMode: 'silent',
          persona: { name: 'Aurora' },
        },
      }),
    )

    expect(res._status).toBe(400)
    expect(res._kind).toBe('badRequest')
    // O 400 acontece ANTES de tocar no estado: nada foi aplicado nem transmitido.
    expect(mockApplyCardSubmit).not.toHaveBeenCalled()
    expect(mockEnsureBuilderAgent).not.toHaveBeenCalled()
    expect(mockBuildSseResponse).not.toHaveBeenCalled()
  })

  it('rejeita agent_review (composto) com silent', async () => {
    const res = asResult(
      await invoke({
        params: { id: PROJECT_ID, cardKey: 'agent_review' },
        body: {
          cardKey: 'agent_review',
          ackMode: 'silent',
          persona: {},
          offered: [],
          notOffered: [],
        },
      }),
    )

    expect(res._status).toBe(400)
    expect(mockApplyCardSubmit).not.toHaveBeenCalled()
    expect(mockBuildSseResponse).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Default mode (sem ackMode) → conversacional intacto (flip + SSE)
// ---------------------------------------------------------------------------

describe('submitCard — modo default (sem ackMode) permanece conversacional', () => {
  it('aplica o flip E transmite o turno via SSE (ensureBuilderAgent + buildSseResponse)', async () => {
    const res = await invoke({
      params: { id: PROJECT_ID, cardKey: 'pricing' },
      body: {
        cardKey: 'pricing',
        // sem ackMode — default 'conversational'
        items: [{ name: 'Corte', priceCents: 5000 }],
        currency: 'BRL',
        disclosureStyle: 'exact',
      },
    })

    // O flip persistiu pelo MESMO applyCardSubmit.
    expect(mockApplyCardSubmit).toHaveBeenCalledTimes(1)
    // O turno LLM foi montado e transmitido — caminho conversacional intocado.
    expect(mockEnsureBuilderAgent).toHaveBeenCalledTimes(1)
    expect(mockBuildSseResponse).toHaveBeenCalledTimes(1)
    // O retorno é o Response da SSE (não o objeto JSON da harness).
    expect(res).toBeInstanceOf(Response)
  })

  it('encaminha cardInstruction + agentConfigId + conversationId para a SSE', async () => {
    await invoke({
      params: { id: PROJECT_ID, cardKey: 'handoff' },
      body: {
        cardKey: 'handoff',
        mode: 'solo',
        alsoSchedule: false,
        steps: [],
        members: [],
      },
    })

    expect(mockBuildSseResponse).toHaveBeenCalledTimes(1)
    const sseParams = mockBuildSseResponse.mock.calls[0]![0] as {
      agentConfigId: string
      conversationId: string
      organizationId: string
      userId: string
      projectId: string
      userMessage: string
      cardInstruction: string
    }
    expect(sseParams.agentConfigId).toBe('builder-agent-1')
    expect(sseParams.conversationId).toBe(CONV_ID)
    expect(sseParams.organizationId).toBe(ORG_ID)
    expect(sseParams.userId).toBe(USER_ID)
    expect(sseParams.projectId).toBe(PROJECT_ID)
    // O ACK seed do applyCardSubmit semeia o turno (userMessage + cardInstruction).
    expect(sseParams.cardInstruction).toBe('ACK pt-BR seed')
    expect(sseParams.userMessage).toBe('ACK pt-BR seed')
  })

  it('um agent_persona conversacional (mesmo card barrado em silent) flui pela SSE', async () => {
    const res = await invoke({
      params: { id: PROJECT_ID, cardKey: 'agent_persona' },
      body: {
        cardKey: 'agent_persona',
        persona: { name: 'Aurora' },
      },
    })

    expect(mockApplyCardSubmit).toHaveBeenCalledTimes(1)
    expect(mockBuildSseResponse).toHaveBeenCalledTimes(1)
    expect(res).toBeInstanceOf(Response)
  })

  it('roteia refinement para o handler determinístico e transmite ACK via SSE', async () => {
    const res = await invoke({
      params: { id: PROJECT_ID, cardKey: 'refinement' },
      body: {
        cardKey: 'refinement',
        action: 'run',
      },
    })

    expect(mockApplyRefinementRun).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      organizationId: ORG_ID,
    })
    expect(mockApplyCardSubmit).not.toHaveBeenCalled()
    expect(mockBuildSseResponse).toHaveBeenCalledTimes(1)
    expect(res).toBeInstanceOf(Response)

    const sseParams = mockBuildSseResponse.mock.calls[0]![0] as {
      userMessage: string
      cardInstruction: string
    }
    expect(sseParams.cardInstruction).toBe('Refinamento concluído')
    expect(sseParams.userMessage).toBe('Refinamento concluído')
  })
})
