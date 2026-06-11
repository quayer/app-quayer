/**
 * Provider Factory — shared model instantiation for all AI modules.
 *
 * Único choke-point de criação de modelo: usado tanto pelo chat do projeto
 * (meta-agente Builder) quanto pelo agente publicado no WhatsApp (ambos rodam
 * em agent-runtime.service.ts) e pelos sub-LLM dos builder tools.
 *
 * ── LiteLLM ──────────────────────────────────────────────────────────────
 * Quando LITELLM_URL + LITELLM_MASTER_KEY estão setados, TODO o tráfego de LLM
 * passa pelo proxy LiteLLM (custo/observabilidade/fallback/rate-limit central).
 * Roteamos POR PROVIDER (não por um único endpoint OpenAI) de propósito: assim
 * o Anthropic continua usando createAnthropic → o prompt caching ephemeral
 * (providerOptions.anthropic.cacheControl em agent-runtime) é PRESERVADO via o
 * passthrough /anthropic do LiteLLM. Sem isso o ganho de 70-90% de custo some.
 *
 * Se LITELLM_URL não estiver setado, cai no comportamento direto (atual).
 *
 * ⚠️ Os sufixos de baseURL (/anthropic/v1, /v1) seguem o padrão de passthrough
 * do LiteLLM — confirmar contra a versão do proxy implantado (config em
 * infra/litellm/). É a parte que só valida com o proxy no ar.
 */

import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'

function litellmConfig(): { url: string; key: string } | null {
  const url = process.env.LITELLM_URL
  const key = process.env.LITELLM_MASTER_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/$/, ''), key }
}

// ── Mock determinístico test-only (NFR-09) ──────────────────────────────────
// Permite que os E2E v2 do Builder rodem SEM chave real de LLM, com respostas
// e tool-calls determinísticas. NUNCA pode ativar em produção: o guard duro
// `NODE_ENV !== 'production'` torna a env impossível de honrar lá. As envs são
// test-only e NÃO entram em .env.example/SECRETS (documentadas no harness de
// teste / fixture do Playwright).
//
// Envs honradas (apenas fora de production, e só quando E2E_LLM_MOCK=1):
//   E2E_LLM_MOCK            → "1" ativa o provider mock
//   E2E_LLM_MOCK_TEXT       → texto da resposta (default plausível)
//   E2E_LLM_MOCK_TOOL_CALLS → JSON: Array<{ toolName: string; input?: unknown }>
//                             quando presente/não-vazio, o turno emite tool-calls
//                             (finishReason "tool-calls") em vez de só texto

// Tipo do modelo retornado pelos providers reais (LanguageModelV3 do AI SDK).
// Reusado para tipar o mock sem reimportar tipos internos do provider.
type SdkModel = ReturnType<ReturnType<typeof createOpenAI>>

type MockToolCallScript = { toolName: string; input?: unknown }

const MOCK_DEFAULT_TEXT =
  'Resposta determinística do provider mock (E2E_LLM_MOCK). Sem chamada de LLM real.'

function e2eMockActive(): boolean {
  // Guard duro: em production a env é IGNORADA — impossível ativar o mock.
  if (process.env.NODE_ENV === 'production') return false
  return process.env.E2E_LLM_MOCK === '1'
}

function parseMockToolCalls(): MockToolCallScript[] {
  const raw = process.env.E2E_LLM_MOCK_TOOL_CALLS
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is MockToolCallScript =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { toolName?: unknown }).toolName === 'string',
    )
  } catch {
    // JSON inválido na fixture → degrada para "só texto" em vez de quebrar o run.
    return []
  }
}

/**
 * Constrói um LanguageModelV3 mock determinístico via `ai/test`.
 *
 * Carregado por `require` lazy (sync) DENTRO do branch test-only para que o
 * utilitário de teste do AI SDK nunca seja incluído no bundle de produção.
 * Roteia texto e/ou tool-calls por env (ver bloco acima).
 */
function e2eLlmMockModel(provider: string, model: string): SdkModel {
  const { MockLanguageModelV3, simulateReadableStream } = require('ai/test') as {
    MockLanguageModelV3: new (config: Record<string, unknown>) => unknown
    simulateReadableStream: <T>(opts: {
      chunks: T[]
      initialDelayInMs?: number | null
      chunkDelayInMs?: number | null
    }) => ReadableStream<T>
  }

  const text = process.env.E2E_LLM_MOCK_TEXT ?? MOCK_DEFAULT_TEXT
  const toolScripts = parseMockToolCalls()
  const hasToolCalls = toolScripts.length > 0

  const usage = {
    inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 0, text: 0, reasoning: 0 },
  }
  const finishReason = {
    unified: hasToolCalls ? ('tool-calls' as const) : ('stop' as const),
    raw: undefined,
  }

  const toolCallParts = toolScripts.map((tc, i) => ({
    type: 'tool-call' as const,
    toolCallId: `e2e-mock-tool-${i}`,
    toolName: tc.toolName,
    input: typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input ?? {}),
  }))

  const content = hasToolCalls ? toolCallParts : [{ type: 'text' as const, text }]

  const streamParts = [
    { type: 'stream-start' as const, warnings: [] },
    ...(hasToolCalls
      ? toolCallParts
      : [
          { type: 'text-start' as const, id: '0' },
          { type: 'text-delta' as const, id: '0', delta: text },
          { type: 'text-end' as const, id: '0' },
        ]),
    { type: 'finish' as const, usage, finishReason },
  ]

  return new MockLanguageModelV3({
    provider: `e2e-mock-${provider}`,
    modelId: model,
    doGenerate: async () => ({ content, finishReason, usage, warnings: [] }),
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: streamParts,
        initialDelayInMs: null,
        chunkDelayInMs: null,
      }),
    }),
  }) as SdkModel
}

/**
 * Build a Vercel AI SDK model instance for the given provider.
 *
 * Resolution order for API key:
 *   1. Explicit `apiKey` parameter (BYOK) — passado adiante ao LiteLLM quando ativo
 *   2. Environment variable for the provider (direto) ou LITELLM_MASTER_KEY (proxy)
 */
export function getModel(provider: string, model: string, apiKey?: string) {
  // ── Mock test-only (NFR-09) ───────────────────────────────────────────────
  // Em production o guard duro ignora a env → comportamento atual 100% intacto.
  if (e2eMockActive()) {
    return e2eLlmMockModel(provider, model)
  }

  const litellm = litellmConfig()

  // ── Caminho LiteLLM (migração) ────────────────────────────────────────────
  if (litellm) {
    // BYOK por org passa adiante (LiteLLM faz passthrough da key do cliente
    // quando configurado); caso contrário usa a master key do proxy.
    const key = apiKey || litellm.key
    if (provider === 'anthropic') {
      return createAnthropic({ apiKey: key, baseURL: `${litellm.url}/anthropic/v1` })(model)
    }
    // openai, openrouter e quaisquer outros models roteados pelo proxy
    // (LiteLLM resolve o provider real pelo NOME do model no model_list).
    return createOpenAI({ apiKey: key, baseURL: `${litellm.url}/v1` })(model)
  }

  // ── Caminho direto (sem proxy configurado) ────────────────────────────────
  switch (provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
      })
      return anthropic(model)
    }

    case 'openrouter': {
      const openrouter = createOpenAI({
        apiKey: apiKey || process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
      })
      return openrouter(model)
    }

    case 'openai':
    default: {
      const openai = createOpenAI({
        apiKey: apiKey || process.env.OPENAI_API_KEY,
      })
      return openai(model)
    }
  }
}
