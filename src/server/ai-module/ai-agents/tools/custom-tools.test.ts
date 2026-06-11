/**
 * custom-tools — X-Webhook-Secret deve ir DECIFRADO no header (v1 webhook) +
 * exposição de tools backed por uma CustomIntegration ACTIVE (T20/T45).
 *
 * Bug original (achado no /plan do integration-builder, 2026-06-10):
 * create-custom-tool grava `encrypt(secret)` e o executor enviava o
 * ciphertext cru — o webhook do cliente nunca validava. O executor agora
 * decifra na hora do envio, com fail-open para rows legadas em claro.
 *
 * T45 estende o suite: rows SEM webhookUrl mas COM uma integração ACTIVE são
 * expostas à LLM e delegam o execute ao `runIntegrationCall`; o filtro
 * active/paused é aplicado no WHERE (cláusula OR), então validamos o SHAPE da
 * query além da delegação do execute.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.ENCRYPTION_KEY = 'test-key-exactly-32-chars-padded'

vi.mock('@/server/services/database', () => ({
  database: {
    agentTool: { findMany: vi.fn() },
    customIntegration: { update: vi.fn() },
  },
}))

vi.mock('./integration-executor', () => ({
  runIntegrationCall: vi.fn(),
}))

// Logger is mocked so the (sanitized) writeback-failure warning is observable in
// the swallow test without polluting test output.
vi.mock('@/server/services/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { database } from '@/server/services/database'
import { encrypt } from '@/lib/crypto'
import { logger } from '@/server/services/logger'
import { runIntegrationCall } from './integration-executor'
import { getCustomTools } from './custom-tools'

const findMany = database.agentTool.findMany as ReturnType<typeof vi.fn>
const integrationUpdate = database.customIntegration
  .update as ReturnType<typeof vi.fn>
const runIntegrationCallMock = runIntegrationCall as ReturnType<typeof vi.fn>
const loggerWarn = logger.warn as ReturnType<typeof vi.fn>

function mockRow(webhookSecret: string | null) {
  return {
    name: 'minha_tool',
    description: 'tool custom de teste',
    parameters: { type: 'object', properties: {} },
    webhookUrl: 'https://example.com/hook',
    webhookSecret,
    webhookTimeout: 5000,
    // Default: nenhuma integração backing (v1 webhook puro). O source acessa
    // `row.customIntegration`, então o mock precisa entregar a relação.
    customIntegration: null,
  }
}

/**
 * Linha SEM webhookUrl backed por uma CustomIntegration. O filtro active/paused
 * é do WHERE no DB; aqui controlamos `status`/`deletedAt` para refletir o que o
 * filtro deixaria passar e validar a delegação do execute.
 */
function mockIntegrationRow(
  status: string,
  opts: { deletedAt?: Date | null } = {},
) {
  return {
    id: 'tool-int-1',
    name: 'tool_integracao',
    description: 'tool backed por integração',
    parameters: { type: 'object', properties: {} },
    webhookUrl: null,
    webhookSecret: null,
    webhookTimeout: 5000,
    customIntegration: {
      id: 'int-1',
      status,
      deletedAt: opts.deletedAt ?? null,
      requestSpec: {
        method: 'GET',
        url: 'https://api.example.com/data',
        auth: { type: 'bearer', credentialKey: 'api_key' },
      },
      credentials: null,
      organizationId: 'org-1',
    },
  }
}

const ctx = { organizationId: 'org-1' } as Parameters<typeof getCustomTools>[1]

async function executeAndCaptureHeaders(secret: string | null) {
  findMany.mockResolvedValue([mockRow(secret)])
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  )
  vi.stubGlobal('fetch', fetchMock)

  const tools = await getCustomTools(['minha_tool'], ctx)
  const tool = tools['minha_tool']
  expect(tool).toBeDefined()
  await (tool as { execute: (i: unknown, o: unknown) => Promise<unknown> }).execute(
    {},
    { toolCallId: 't1', messages: [] },
  )

  const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
  return headers
}

describe('getCustomTools — X-Webhook-Secret', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('decifra o segredo cifrado antes de enviar no header', async () => {
    const headers = await executeAndCaptureHeaders(encrypt('segredo-do-cliente'))
    expect(headers['X-Webhook-Secret']).toBe('segredo-do-cliente')
  })

  it('v1 webhook: header carrega o plaintext DECIFRADO, nunca o ciphertext', async () => {
    // Cobre explicitamente o fix do webhookSecret v1 (T45 critério 4): o valor
    // gravado é cifrado; o header de saída deve ser o plaintext, não o cipher.
    const plaintext = 'token-secreto-v1'
    const ciphertext = encrypt(plaintext)
    expect(ciphertext).not.toBe(plaintext) // pré-condição: realmente cifrado

    const headers = await executeAndCaptureHeaders(ciphertext)

    expect(headers['X-Webhook-Secret']).toBe(plaintext)
    expect(headers['X-Webhook-Secret']).not.toBe(ciphertext)
  })

  it('fail-open: row legada em claro vai como está', async () => {
    const headers = await executeAndCaptureHeaders('segredo-legado-em-claro')
    expect(headers['X-Webhook-Secret']).toBe('segredo-legado-em-claro')
  })

  it('sem segredo: header ausente', async () => {
    const headers = await executeAndCaptureHeaders(null)
    expect(headers['X-Webhook-Secret']).toBeUndefined()
  })
})

describe('getCustomTools — backing por CustomIntegration (T20/T45)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('WHERE inclui o OR webhookUrl|customIntegration ACTIVE', async () => {
    findMany.mockResolvedValue([])
    await getCustomTools(['tool_integracao'], ctx)

    const where = findMany.mock.calls[0]?.[0]?.where as {
      OR?: Array<Record<string, unknown>>
    }
    expect(where.OR).toEqual([
      { webhookUrl: { not: null } },
      { customIntegration: { status: 'active', deletedAt: null } },
    ])
  })

  it('row SEM webhookUrl mas COM integração ACTIVE é exposta à LLM', async () => {
    findMany.mockResolvedValue([mockIntegrationRow('active')])

    const tools = await getCustomTools(['tool_integracao'], ctx)

    expect(tools['tool_integracao']).toBeDefined()
  })

  it('execute da row de integração delega ao runIntegrationCall', async () => {
    runIntegrationCallMock.mockResolvedValue({
      outcome: 'success',
      bodySnippet: '{"ok":true}',
    })
    findMany.mockResolvedValue([mockIntegrationRow('active')])

    const tools = await getCustomTools(['tool_integracao'], ctx)
    const tool = tools['tool_integracao']
    expect(tool).toBeDefined()

    const result = await (
      tool as { execute: (i: unknown, o: unknown) => Promise<unknown> }
    ).execute({ foo: 'bar' }, { toolCallId: 't1', messages: [] })

    expect(runIntegrationCallMock).toHaveBeenCalledTimes(1)
    const callArgs = runIntegrationCallMock.mock.calls[0]
    // params (3º arg) repassados; opts.mode='production' + integrationId.
    expect(callArgs?.[2]).toEqual({ foo: 'bar' })
    expect(callArgs?.[3]).toMatchObject({ mode: 'production', integrationId: 'int-1' })
    expect(result).toEqual({ success: true, data: { ok: true } })
  })

  it('row SEM webhookUrl E SEM integração NÃO é exposta', async () => {
    // O filtro do DB já tiraria essa row; replicamos um row que (por defeito de
    // dados) chega sem webhookUrl e sem integração — o source faz `continue`.
    const orphan = {
      ...mockIntegrationRow('active'),
      webhookUrl: null,
      customIntegration: null,
    }
    findMany.mockResolvedValue([orphan])

    const tools = await getCustomTools(['tool_integracao'], ctx)

    expect(tools['tool_integracao']).toBeUndefined()
    expect(runIntegrationCallMock).not.toHaveBeenCalled()
  })

  it('integração PAUSED não delega ao executor (não vira tool de integração)', async () => {
    // O WHERE do DB exige status 'active'; se uma row paused vazar (sem
    // webhookUrl), o guard `status === 'active'` no source impede a delegação.
    const paused = mockIntegrationRow('paused')
    findMany.mockResolvedValue([paused])

    const tools = await getCustomTools(['tool_integracao'], ctx)

    // Sem webhookUrl e integração não-active → row é pulada (continue).
    expect(tools['tool_integracao']).toBeUndefined()
    expect(runIntegrationCallMock).not.toHaveBeenCalled()
  })
})

/**
 * T31 — refinamento do writeback de erro de PRODUÇÃO no branch de integração.
 *
 * Quando o executor (que já fez seu retry de produção) devolve uma falha
 * PERSISTENTE (5xx/rede), o execute da tool deve:
 *  1. resolver `{ success: false, userFacingHint }` com um hint NEUTRO em pt-BR
 *     (sem status, sem URL, sem credencial — FR-10/NFR-07);
 *  2. marcar a CustomIntegration `status='error'` (writeback fail-open);
 *  3. NUNCA lançar — nem na falha do executor, nem se o próprio writeback no DB
 *     estourar (o turno tem que sobreviver).
 */
describe('getCustomTools — writeback de erro de integração (T31)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  function getIntegrationTool() {
    findMany.mockResolvedValue([mockIntegrationRow('active')])
    return getCustomTools(['tool_integracao'], ctx).then((tools) => {
      const tool = tools['tool_integracao']
      expect(tool).toBeDefined()
      return tool as { execute: (i: unknown, o: unknown) => Promise<unknown> }
    })
  }

  it('falha 5xx persistente → success:false + userFacingHint neutro, writeback status=error, sem throw', async () => {
    runIntegrationCallMock.mockResolvedValue({
      outcome: 'network',
      httpStatus: 503,
      durationMs: 12,
      diagnosis: 'serviço indisponível',
    })
    integrationUpdate.mockResolvedValue({})

    const tool = await getIntegrationTool()

    const result = (await tool.execute(
      { foo: 'bar' },
      { toolCallId: 't1', messages: [] },
    )) as { success: boolean; userFacingHint?: string }

    // 1. resultado seguro com hint neutro
    expect(result.success).toBe(false)
    expect(typeof result.userFacingHint).toBe('string')
    expect(result.userFacingHint).toMatch(/não consegui concluir/i)
    // hint NUNCA contém status / URL / credencial
    expect(result.userFacingHint).not.toMatch(/503|http|https?:\/\/|secret|token|credential/i)

    // 2. writeback flagou a integração como erro com código curto (o httpStatus)
    expect(integrationUpdate).toHaveBeenCalledTimes(1)
    const updateArg = integrationUpdate.mock.calls[0]?.[0] as {
      where: { id: string }
      data: { status: string; lastErrorAt: Date; lastErrorCode: string }
    }
    expect(updateArg.where).toEqual({ id: 'int-1' })
    expect(updateArg.data.status).toBe('error')
    expect(updateArg.data.lastErrorAt).toBeInstanceOf(Date)
    expect(updateArg.data.lastErrorCode).toBe('503')
  })

  it('falha de rede sem httpStatus → lastErrorCode usa a classe do outcome', async () => {
    runIntegrationCallMock.mockResolvedValue({
      outcome: 'timeout',
      durationMs: 10_000,
      diagnosis: 'tempo esgotado',
    })
    integrationUpdate.mockResolvedValue({})

    const tool = await getIntegrationTool()
    await tool.execute({}, { toolCallId: 't1', messages: [] })

    const updateArg = integrationUpdate.mock.calls[0]?.[0] as {
      data: { lastErrorCode: string }
    }
    // sem httpStatus → usa o membro do union (curto, value-free), nunca um payload
    expect(updateArg.data.lastErrorCode).toBe('timeout')
  })

  it('writeback que estoura no DB é engolido — execute ainda resolve a falha (sem throw) e loga sanitizado', async () => {
    runIntegrationCallMock.mockResolvedValue({
      outcome: 'network',
      httpStatus: 502,
      durationMs: 8,
      diagnosis: 'falha no upstream',
    })
    // O writeback de observabilidade falha — NÃO pode derrubar o turno.
    integrationUpdate.mockRejectedValue(new Error('db down'))

    const tool = await getIntegrationTool()

    const result = (await tool.execute(
      {},
      { toolCallId: 't1', messages: [] },
    )) as { success: boolean; userFacingHint?: string }

    // O erro do writeback foi engolido: o execute ainda resolve a falha segura.
    expect(result.success).toBe(false)
    expect(result.userFacingHint).toMatch(/não consegui concluir/i)

    // E a falha do writeback foi logada de forma sanitizada (sem segredos/URL/payload).
    expect(loggerWarn).toHaveBeenCalledTimes(1)
    const [, logFields] = loggerWarn.mock.calls[0] as [string, Record<string, unknown>]
    expect(logFields).toMatchObject({ integrationId: 'int-1', httpStatus: 502 })
    const serialized = JSON.stringify(logFields)
    expect(serialized).not.toMatch(/secret|token|credential|password|authorization/i)
  })

  it('CONTRATO never-throws: executor que LANÇA inesperado → success:false + hint, writeback best-effort, sem throw', async () => {
    // O executor é especificado para nunca lançar, mas o execute da tool tem que
    // honrar o contrato mesmo se algo inesperado estourar no caminho.
    runIntegrationCallMock.mockRejectedValue(new Error('boom inesperado'))
    integrationUpdate.mockResolvedValue({})

    const tool = await getIntegrationTool()

    let thrown = false
    let result: { success: boolean; userFacingHint?: string } | undefined
    try {
      result = (await tool.execute({}, { toolCallId: 't1', messages: [] })) as {
        success: boolean
        userFacingHint?: string
      }
    } catch {
      thrown = true
    }

    expect(thrown).toBe(false) // NUNCA propaga
    expect(result?.success).toBe(false)
    expect(result?.userFacingHint).toMatch(/não consegui concluir/i)
    // best-effort writeback com classe coarse 'network' (sem httpStatus)
    expect(integrationUpdate).toHaveBeenCalledTimes(1)
    const updateArg = integrationUpdate.mock.calls[0]?.[0] as {
      data: { status: string; lastErrorCode: string }
    }
    expect(updateArg.data.status).toBe('error')
    expect(updateArg.data.lastErrorCode).toBe('network')
  })
})
