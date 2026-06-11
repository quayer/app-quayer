/**
 * NFR-09 — provider LLM mock test-only (T89).
 *
 * Verifica:
 *  1. Guard duro: com NODE_ENV=production a env E2E_LLM_MOCK é IGNORADA.
 *  2. Sem a env (não-prod): getModel devolve o provider REAL inalterado.
 *  3. Com a env (não-prod): getModel devolve um mock determinístico compatível
 *     com a interface do AI SDK usada em streamText/generateText (texto e,
 *     opcionalmente, tool-calls roteáveis por env).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateText, streamText, stepCountIs } from 'ai'
import { getModel } from './provider-factory'

// NODE_ENV é trocado SÓ via vi.stubEnv (read-only no TS) e restaurado por
// vi.unstubAllEnvs() — fora deste loop de restore manual (que toca env vars
// deletadas no beforeEach).
const ENV_KEYS = [
  'E2E_LLM_MOCK',
  'E2E_LLM_MOCK_TEXT',
  'E2E_LLM_MOCK_TOOL_CALLS',
  'LITELLM_URL',
  'LITELLM_MASTER_KEY',
] as const

let snapshot: Record<string, string | undefined>

beforeEach(() => {
  snapshot = {}
  for (const k of ENV_KEYS) snapshot[k] = process.env[k]
  // Garante caminho direto (sem proxy) por default em cada teste.
  delete process.env.LITELLM_URL
  delete process.env.LITELLM_MASTER_KEY
  delete process.env.E2E_LLM_MOCK
  delete process.env.E2E_LLM_MOCK_TEXT
  delete process.env.E2E_LLM_MOCK_TOOL_CALLS
})

afterEach(() => {
  vi.unstubAllEnvs()
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k]
    else process.env[k] = snapshot[k]
  }
})

describe('getModel — mock test-only (NFR-09)', () => {
  it('IGNORA E2E_LLM_MOCK quando NODE_ENV=production (guard duro)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    process.env.E2E_LLM_MOCK = '1'
    const model = getModel('openai', 'gpt-4o-mini')
    // Provider real do AI SDK (openai), não o mock e2e.
    expect(model.provider).not.toContain('e2e-mock')
    expect(model.provider).toContain('openai')
  })

  it('sem a env, getModel devolve o provider real inalterado', () => {
    vi.stubEnv('NODE_ENV', 'test')
    const model = getModel('anthropic', 'claude-3-5-haiku')
    expect(model.provider).not.toContain('e2e-mock')
    expect(model.provider).toContain('anthropic')
  })

  it('com a env (não-prod), streamText consome o mock e produz texto determinístico', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    process.env.E2E_LLM_MOCK = '1'
    process.env.E2E_LLM_MOCK_TEXT = 'olá do mock'

    const model = getModel('anthropic', 'claude-3-5-haiku')
    expect(model.provider).toContain('e2e-mock')

    const result = streamText({ model, prompt: 'oi' })
    expect(await result.text).toBe('olá do mock')
  })

  it('com a env, generateText também devolve o texto determinístico', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    process.env.E2E_LLM_MOCK = '1'

    const model = getModel('openai', 'gpt-4o-mini')
    const result = await generateText({ model, prompt: 'oi' })
    expect(result.text).toContain('provider mock')
    expect(result.finishReason).toBe('stop')
  })

  it('E2E_LLM_MOCK_TOOL_CALLS roteia tool-calls determinísticas', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    process.env.E2E_LLM_MOCK = '1'
    process.env.E2E_LLM_MOCK_TOOL_CALLS = JSON.stringify([
      { toolName: 'buscar_media', input: { query: 'logo' } },
    ])

    const model = getModel('openai', 'gpt-4o-mini')
    const result = await generateText({
      model,
      prompt: 'oi',
      stopWhen: stepCountIs(1),
    })
    expect(result.finishReason).toBe('tool-calls')
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0]?.toolName).toBe('buscar_media')
  })

  it('E2E_LLM_MOCK_TOOL_CALLS inválido degrada para só texto (não quebra o run)', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    process.env.E2E_LLM_MOCK = '1'
    process.env.E2E_LLM_MOCK_TOOL_CALLS = 'not-json{'

    const model = getModel('openai', 'gpt-4o-mini')
    const result = await generateText({ model, prompt: 'oi' })
    expect(result.finishReason).toBe('stop')
    expect(result.text).toContain('provider mock')
  })
})
