/**
 * custom-tools — X-Webhook-Secret deve ir DECIFRADO no header.
 *
 * Bug original (achado no /plan do integration-builder, 2026-06-10):
 * create-custom-tool grava `encrypt(secret)` e o executor enviava o
 * ciphertext cru — o webhook do cliente nunca validava. O executor agora
 * decifra na hora do envio, com fail-open para rows legadas em claro.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.ENCRYPTION_KEY = 'test-key-exactly-32-chars-padded'

vi.mock('@/server/services/database', () => ({
  database: { agentTool: { findMany: vi.fn() } },
}))

import { database } from '@/server/services/database'
import { encrypt } from '@/lib/crypto'
import { getCustomTools } from './custom-tools'

const findMany = database.agentTool.findMany as ReturnType<typeof vi.fn>

function mockRow(webhookSecret: string | null) {
  return {
    name: 'minha_tool',
    description: 'tool custom de teste',
    parameters: { type: 'object', properties: {} },
    webhookUrl: 'https://example.com/hook',
    webhookSecret,
    webhookTimeout: 5000,
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

  it('fail-open: row legada em claro vai como está', async () => {
    const headers = await executeAndCaptureHeaders('segredo-legado-em-claro')
    expect(headers['X-Webhook-Secret']).toBe('segredo-legado-em-claro')
  })

  it('sem segredo: header ausente', async () => {
    const headers = await executeAndCaptureHeaders(null)
    expect(headers['X-Webhook-Secret']).toBeUndefined()
  })
})
