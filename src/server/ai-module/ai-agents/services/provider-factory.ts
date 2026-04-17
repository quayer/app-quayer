/**
 * Provider Factory — shared model instantiation for all AI modules.
 *
 * Extracted from agent-runtime.service.ts so that sub-LLM calls (e.g.
 * Builder tools like generate_prompt_anatomy) can reuse the same provider
 * resolution logic without duplicating env-var lookups or provider wiring.
 */

import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'

/**
 * Build a Vercel AI SDK model instance for the given provider.
 * Supports OpenAI, Anthropic, and OpenRouter (OpenAI-compatible).
 *
 * Resolution order for API key:
 *   1. Explicit `apiKey` parameter (BYOK)
 *   2. Environment variable for the provider
 */
export function getModel(provider: string, model: string, apiKey?: string) {
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
