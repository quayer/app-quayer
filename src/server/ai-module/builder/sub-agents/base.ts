/**
 * Quayer Builder — Sub-Agent Runtime Helpers
 *
 * Shared plumbing for authoring sub-agents:
 *
 *   - `runLLMSubAgent` wraps `generateText` with timeout, provider
 *     resolution from the Builder agent config, and structured error
 *     mapping into a SubAgentResult.
 *
 *   - `measure` times a pure (non-LLM) operation and wraps the return
 *     value in a SubAgentResult.
 *
 * Authors of individual sub-agents should prefer these helpers over
 * reimplementing timeout/provider plumbing.
 */

import { generateText } from 'ai'
import { getModel } from '@/server/ai-module/ai-agents/services/provider-factory'
import { database } from '@/server/services/database'
import { credentialResolver } from '@/lib/providers/credential-resolver.service'
import { BUILDER_RESERVED_NAME } from '../builder.constants'
import type { SubAgentContext, SubAgentResult } from './types'

// ---------------------------------------------------------------------------
// LLM helper
// ---------------------------------------------------------------------------

export interface RunLLMSubAgentParams {
  /** System prompt for the specialized LLM call */
  systemPrompt: string
  /** User-role content (already templated) */
  userMessage: string
  /** Sampling temperature. Default 0.4 (mirrors generate-prompt-anatomy) */
  temperature?: number
  /** Max output tokens. Default 2000 */
  maxOutputTokens?: number
  /** Hard timeout (ms). Default 60_000 */
  timeoutMs?: number
  /** Override provider/model (e.g. force gpt-4o-mini for cheap tasks) */
  modelOverride?: { provider: string; model: string }
}

export interface RunLLMSubAgentSuccess {
  text: string
  durationMs: number
}

/**
 * Execute a specialized LLM call with timeout + abort + provider resolution.
 *
 * Provider/model defaults are resolved from the Builder agent config in
 * the DB (same pattern as `tools/generate-prompt-anatomy.tool.ts`).
 * Pass `modelOverride` to force a cheaper/faster model for specific tasks.
 *
 * This function NEVER throws — errors are captured and returned as
 * `SubAgentResult.success === false` with a `code` for routing:
 *   - 'TIMEOUT'        — abort due to timeoutMs
 *   - 'ABORTED'        — caller signal fired before the call started
 *   - 'EMPTY_RESPONSE' — LLM returned empty text
 *   - 'UPSTREAM_ERROR' — anything else from the provider
 */
export async function runLLMSubAgent(
  params: RunLLMSubAgentParams,
  context: SubAgentContext,
): Promise<SubAgentResult<RunLLMSubAgentSuccess>> {
  const started = Date.now()
  const timeoutMs = params.timeoutMs ?? 60_000
  const temperature = params.temperature ?? 0.4
  const maxOutputTokens = params.maxOutputTokens ?? 2000

  // Short-circuit if caller already aborted before we start
  if (context.signal?.aborted) {
    return fail('Aborted by caller signal', 'ABORTED', started)
  }

  try {
    let provider = params.modelOverride?.provider
    let modelName = params.modelOverride?.model

    if (!provider || !modelName) {
      const builderAgent = await database.aIAgentConfig.findFirst({
        where: {
          organizationId: context.organizationId,
          name: BUILDER_RESERVED_NAME,
        },
        select: { provider: true, model: true },
      })
      provider = provider ?? builderAgent?.provider ?? 'openai'
      modelName = modelName ?? builderAgent?.model ?? 'gpt-4o-mini'
    }

    // Resolve BYOK key for sub-agents (mirrors stream-agent-response.ts)
    const resolved = await credentialResolver.resolve(
      'AI',
      provider,
      { organizationId: context.organizationId, projectId: context.projectId },
    )
    const apiKey = resolved?.credentials?.apiKey as string | undefined

    const model = getModel(provider, modelName, apiKey)

    const abortController = new AbortController()
    const onCallerAbort = () => abortController.abort()
    if (context.signal) {
      context.signal.addEventListener('abort', onCallerAbort, { once: true })
    }
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs)

    try {
      const result = await generateText({
        model,
        system: params.systemPrompt,
        messages: [{ role: 'user', content: params.userMessage }],
        temperature,
        maxOutputTokens,
        abortSignal: abortController.signal,
      })

      const text = (result.text ?? '').trim()

      if (!text) {
        return fail('LLM returned empty response', 'EMPTY_RESPONSE', started)
      }

      return {
        success: true,
        data: { text, durationMs: Date.now() - started },
        durationMs: Date.now() - started,
      }
    } finally {
      clearTimeout(timeoutId)
      context.signal?.removeEventListener('abort', onCallerAbort)
    }
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    const message = err instanceof Error ? err.message : 'Unknown LLM error'
    return fail(message, isAbort ? 'TIMEOUT' : 'UPSTREAM_ERROR', started)
  }
}

// ---------------------------------------------------------------------------
// Pure-function helper
// ---------------------------------------------------------------------------

/**
 * Measure a pure (non-LLM) operation and wrap the result in a SubAgentResult.
 *
 * Usage:
 *   return measure(() => validatePrompt(prompt, tools))
 */
export async function measure<T>(
  fn: () => T | Promise<T>,
): Promise<SubAgentResult<T>> {
  const started = Date.now()
  try {
    const data = await fn()
    return {
      success: true,
      data,
      durationMs: Date.now() - started,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return fail(message, 'RUNTIME_ERROR', started)
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function fail(
  error: string,
  code: string,
  started: number,
): SubAgentResult<never> {
  return {
    success: false,
    error,
    code,
    durationMs: Date.now() - started,
  }
}
