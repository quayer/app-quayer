/**
 * NicheResearcher Sub-Agent
 *
 * Researches a business niche (e.g. "clínica veterinária") by:
 *   1. Searching the public web via Tavily for Brazilian regulatory +
 *      operational context.
 *   2. Synthesizing a structured `NicheInsights` object via a specialized
 *      LLM call (JSON-only output).
 *
 * Graceful degradation: if Tavily is unavailable (no API key, network error,
 * HTTP error) the sub-agent still runs — the LLM synthesizes from its prior
 * knowledge and the output flag `fromLLMKnowledgeOnly: true` signals the
 * reduced confidence to downstream callers.
 */

import { z } from 'zod'
import { runLLMSubAgent } from '../base'
import type { SubAgent, SubAgentContext, SubAgentResult } from '../types'
import {
  NICHE_SYNTHESIS_SYSTEM,
  buildSynthesisUserMessage,
} from './niche-researcher.prompt'
import { searchTavily, type TavilySearchItem } from './tavily-client'

// ---------------------------------------------------------------------------
// Schema + types
// ---------------------------------------------------------------------------

export const nicheResearcherInputSchema = z.object({
  nicho: z.string().min(2).max(200),
  businessDescription: z.string().max(1000).optional(),
})

export type NicheResearcherInput = z.infer<typeof nicheResearcherInputSchema>

export interface NicheInsightsSource {
  title: string
  url: string
}

export interface NicheInsights {
  regulations: string[]
  vocabulary: string[]
  typicalFlows: string[]
  warnings: string[]
  sources: NicheInsightsSource[]
  /** True when no Tavily key was available and insights came from LLM's prior knowledge only */
  fromLLMKnowledgeOnly: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 30_000
const LLM_TIMEOUT_MS = 25_000
const SYNTHESIS_TEMPERATURE = 0.2
const SYNTHESIS_MAX_TOKENS = 1500

// ---------------------------------------------------------------------------
// JSON parsing helper
// ---------------------------------------------------------------------------

type ParseOk = {
  ok: true
  value: Pick<
    NicheInsights,
    'regulations' | 'vocabulary' | 'typicalFlows' | 'warnings'
  >
}
type ParseErr = { ok: false; message: string }
type ParseResult = ParseOk | ParseErr

/**
 * Strip markdown fences (```json ... ``` or ``` ... ```) and parse JSON,
 * then validate the shape. Returns a tagged result — never throws.
 */
export function parseNicheInsightsJSON(raw: string): ParseResult {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, message: 'Empty LLM response' }
  }

  let cleaned = raw.trim()

  // Strip markdown code fences if present (e.g. ```json ... ```).
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
  } else {
    // Remove leading/trailing stray backticks
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')
    cleaned = cleaned.trim()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'JSON.parse failed'
    return { ok: false, message: `Invalid JSON: ${msg}` }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, message: 'JSON root must be an object' }
  }

  const obj = parsed as Record<string, unknown>
  const required = ['regulations', 'vocabulary', 'typicalFlows', 'warnings']
  for (const key of required) {
    if (!Array.isArray(obj[key])) {
      return {
        ok: false,
        message: `Missing or non-array key: "${key}"`,
      }
    }
    for (const item of obj[key] as unknown[]) {
      if (typeof item !== 'string') {
        return {
          ok: false,
          message: `Non-string entry in "${key}"`,
        }
      }
    }
  }

  return {
    ok: true,
    value: {
      regulations: obj.regulations as string[],
      vocabulary: obj.vocabulary as string[],
      typicalFlows: obj.typicalFlows as string[],
      warnings: obj.warnings as string[],
    },
  }
}

// ---------------------------------------------------------------------------
// Sub-agent implementation
// ---------------------------------------------------------------------------

export const nicheResearcherSubAgent: SubAgent<
  NicheResearcherInput,
  NicheInsights
> = {
  metadata: {
    name: 'niche-researcher',
    isReadOnly: true,
    isConcurrencySafe: true,
    timeoutMs: TIMEOUT_MS,
  },

  async run(
    input: NicheResearcherInput,
    context: SubAgentContext,
  ): Promise<SubAgentResult<NicheInsights>> {
    const started = Date.now()

    // Phase 1 — validate input.
    const parsedInput = nicheResearcherInputSchema.safeParse(input)
    if (!parsedInput.success) {
      return {
        success: false,
        error: `Invalid input: ${parsedInput.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ')}`,
        code: 'INVALID_INPUT',
        durationMs: Date.now() - started,
      }
    }
    const validated = parsedInput.data

    // Phase 2 — search web (best-effort, graceful degradation).
    let snippets: TavilySearchItem[] = []
    let fromLLMKnowledgeOnly = true

    const searchResult = await searchTavily(
      `${validated.nicho} regulação atendimento Brasil`,
      { signal: context.signal },
    )
    if (searchResult.ok) {
      snippets = searchResult.results
      fromLLMKnowledgeOnly = false
    }
    // else: NO_API_KEY | HTTP_ERROR | NETWORK — continue with empty snippets
    // and fromLLMKnowledgeOnly = true.

    // Phase 3 — synthesize via LLM.
    const llmResult = await runLLMSubAgent(
      {
        systemPrompt: NICHE_SYNTHESIS_SYSTEM,
        userMessage: buildSynthesisUserMessage(validated, snippets),
        temperature: SYNTHESIS_TEMPERATURE,
        maxOutputTokens: SYNTHESIS_MAX_TOKENS,
        timeoutMs: LLM_TIMEOUT_MS,
      },
      context,
    )

    if (!llmResult.success) {
      return {
        success: false,
        error: `LLM synthesis failed: ${llmResult.error}`,
        code: llmResult.code ?? 'UPSTREAM_ERROR',
        durationMs: Date.now() - started,
      }
    }

    // Phase 4 — parse JSON output.
    const parsed = parseNicheInsightsJSON(llmResult.data.text)
    if (!parsed.ok) {
      return {
        success: false,
        error: `Failed to parse LLM output: ${parsed.message}`,
        code: 'PARSE_ERROR',
        durationMs: Date.now() - started,
      }
    }

    // Phase 5 — attach sources + degradation flag.
    const sources: NicheInsightsSource[] = snippets.map((s) => ({
      title: s.title,
      url: s.url,
    }))

    const data: NicheInsights = {
      regulations: parsed.value.regulations,
      vocabulary: parsed.value.vocabulary,
      typicalFlows: parsed.value.typicalFlows,
      warnings: parsed.value.warnings,
      sources,
      fromLLMKnowledgeOnly,
    }

    return {
      success: true,
      data,
      durationMs: Date.now() - started,
    }
  },
}
