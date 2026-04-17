/**
 * PromptWriter Sub-Agent
 *
 * Specialized sub-agent that generates a 5-section WhatsApp AI agent system
 * prompt (Papel + Objetivo + Regras de conduta + Limitações + Formato de
 * resposta) from a structured brief.
 *
 * Extracted from the inline logic in `tools/generate-prompt-anatomy.tool.ts`
 * so the same capability can be reused by other Builder tools and composed
 * with sibling sub-agents (NicheResearcher, Validator).
 *
 * Behavior:
 *   1. Zod-validate input (returns INVALID_INPUT on failure).
 *   2. Call the sub-LLM via `runLLMSubAgent` (60s timeout, temp 0.4).
 *   3. Parse the returned markdown into five named sections; missing or
 *      empty sections yield PARSE_ERROR.
 *   4. On LLM failure, forward the original error/code untouched.
 *
 * Flags: isReadOnly=true, isConcurrencySafe=false (LLM quota contention).
 */

import { z } from 'zod'
import { runLLMSubAgent } from '../base'
import type { SubAgent, SubAgentContext, SubAgentResult } from '../types'
import { SUB_LLM_SYSTEM, buildUserMessage } from './prompt-writer.prompt'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const promptWriterInputSchema = z.object({
  brief: z.string().min(20).max(4000),
  nicho: z.string().min(2).max(200),
  objetivo: z.string().min(10).max(500),
  nicheInsights: z
    .object({
      regulations: z.array(z.string()).optional(),
      vocabulary: z.array(z.string()).optional(),
      typicalFlows: z.array(z.string()).optional(),
      warnings: z.array(z.string()).optional(),
    })
    .optional(),
})

export type PromptWriterInput = z.infer<typeof promptWriterInputSchema>

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export interface PromptWriterSections {
  papel: string
  objetivo: string
  regras: string
  limitacoes: string
  formato: string
}

export interface PromptWriterOutput {
  /** Full assembled markdown (trimmed) as returned by the sub-LLM. */
  prompt: string
  sections: PromptWriterSections
}

// ---------------------------------------------------------------------------
// Section parsing
// ---------------------------------------------------------------------------

/**
 * Canonical section headers (case-insensitive). Order matters — this is also
 * the order we emit in the parsed output. The regex accepts any leading `#`
 * depth (`#`, `##`, `###`) and trailing whitespace, matching the template
 * in `templates/prompt-anatomy.ts`.
 */
const SECTION_HEADERS: ReadonlyArray<{
  key: keyof PromptWriterSections
  label: string
  regex: RegExp
}> = [
  { key: 'papel', label: 'Papel', regex: /^#+\s+Papel\s*$/i },
  { key: 'objetivo', label: 'Objetivo', regex: /^#+\s+Objetivo\s*$/i },
  {
    key: 'regras',
    label: 'Regras de conduta',
    regex: /^#+\s+Regras de conduta\s*$/i,
  },
  {
    key: 'limitacoes',
    label: 'Limitações',
    regex: /^#+\s+Limita[cç][oõ]es\s*$/i,
  },
  {
    key: 'formato',
    label: 'Formato de resposta',
    regex: /^#+\s+Formato de resposta\s*$/i,
  },
]

export interface ParseResult {
  sections: PromptWriterSections
  missing: string[]
}

/**
 * Parse a markdown prompt into the five canonical sections.
 *
 * Scans line-by-line for the known headers in any order, captures the content
 * between each header and the next (or EOF), and trims each block. Sections
 * that are missing or whose body is empty after trim end up in `missing`.
 *
 * Returns a `ParseResult`; never throws. Callers decide how to treat a
 * non-empty `missing` list (we map it to PARSE_ERROR in `run`).
 */
export function parsePromptSections(markdown: string): ParseResult {
  const lines = markdown.split(/\r?\n/)

  // Find every header line in document order along with its section key.
  interface HeaderHit {
    lineIndex: number
    key: keyof PromptWriterSections
  }
  const hits: HeaderHit[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const header of SECTION_HEADERS) {
      if (header.regex.test(line)) {
        hits.push({ lineIndex: i, key: header.key })
        break
      }
    }
  }

  const captured: Partial<PromptWriterSections> = {}

  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]
    const start = hit.lineIndex + 1
    const end = i + 1 < hits.length ? hits[i + 1].lineIndex : lines.length
    const body = lines.slice(start, end).join('\n').trim()
    // First occurrence wins — the sub-LLM is instructed never to repeat
    // headers but we stay defensive.
    if (captured[hit.key] === undefined) {
      captured[hit.key] = body
    }
  }

  const missing: string[] = []
  const sections: PromptWriterSections = {
    papel: '',
    objetivo: '',
    regras: '',
    limitacoes: '',
    formato: '',
  }

  for (const header of SECTION_HEADERS) {
    const body = captured[header.key]
    if (body === undefined || body.length === 0) {
      missing.push(header.label)
    } else {
      sections[header.key] = body
    }
  }

  return { sections, missing }
}

// ---------------------------------------------------------------------------
// Sub-agent implementation
// ---------------------------------------------------------------------------

export const promptWriterSubAgent: SubAgent<
  PromptWriterInput,
  PromptWriterOutput
> = {
  metadata: {
    name: 'prompt-writer',
    isReadOnly: true,
    isConcurrencySafe: false,
    timeoutMs: 60_000,
  },

  async run(
    input: PromptWriterInput,
    context: SubAgentContext,
  ): Promise<SubAgentResult<PromptWriterOutput>> {
    const started = Date.now()

    // 1. Validate input
    const parsed = promptWriterInputSchema.safeParse(input)
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')
      return {
        success: false,
        error: `Invalid input: ${issues}`,
        code: 'INVALID_INPUT',
        durationMs: Date.now() - started,
      }
    }

    const validInput = parsed.data

    // 2. Sub-LLM call
    const llm = await runLLMSubAgent(
      {
        systemPrompt: SUB_LLM_SYSTEM,
        userMessage: buildUserMessage(validInput),
        temperature: 0.4,
        maxOutputTokens: 2000,
        timeoutMs: 60_000,
      },
      context,
    )

    if (!llm.success) {
      return {
        success: false,
        error: llm.error,
        code: llm.code,
        durationMs: Date.now() - started,
      }
    }

    const prompt = llm.data.text

    // 3. Parse sections
    const { sections, missing } = parsePromptSections(prompt)
    if (missing.length > 0) {
      return {
        success: false,
        error: `Failed to parse prompt: missing or empty section(s): ${missing.join(', ')}`,
        code: 'PARSE_ERROR',
        durationMs: Date.now() - started,
      }
    }

    return {
      success: true,
      data: { prompt, sections },
      durationMs: Date.now() - started,
    }
  },
}
