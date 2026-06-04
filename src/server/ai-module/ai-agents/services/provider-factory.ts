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

/**
 * Build a Vercel AI SDK model instance for the given provider.
 *
 * Resolution order for API key:
 *   1. Explicit `apiKey` parameter (BYOK) — passado adiante ao LiteLLM quando ativo
 *   2. Environment variable for the provider (direto) ou LITELLM_MASTER_KEY (proxy)
 */
export function getModel(provider: string, model: string, apiKey?: string) {
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
