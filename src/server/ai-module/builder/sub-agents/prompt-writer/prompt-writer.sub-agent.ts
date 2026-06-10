/**
 * PromptWriter Sub-Agent
 *
 * Specialized sub-agent that generates the FULL 10-section WhatsApp AI agent
 * system prompt (Papel + Objetivo + Tom de voz + Comunicação + Ferramentas +
 * Regras críticas + Fluxo + Gatilhos + Limitações + Encerramento) from a
 * structured brief plus the data already collected via Builder cards.
 *
 * Section list is the shared checklist (`templates/prompt-section-checklist.ts`)
 * — the SAME source consumed by the anatomy validator, so writer output and
 * validator expectations can never drift.
 *
 * Behavior:
 *   1. Zod-validate input (returns INVALID_INPUT on failure).
 *   2. Call the sub-LLM via `runLLMSubAgent` (60s timeout, temp 0.4).
 *   3. Parse the returned markdown into the ten named sections; missing or
 *      empty sections yield PARSE_ERROR.
 *   4. On LLM failure, forward the original error/code untouched.
 *
 * Input extras (all optional):
 *   - `builderContext`    — builderState projection (tools, hours, handoff,
 *     activation, identity, services) so the prompt reflects collected data.
 *   - `validatorFeedback` — error list from a failed validation; used by the
 *     caller's self-correction retry (see generate-prompt-anatomy.tool.ts).
 *
 * Flags: isReadOnly=true, isConcurrencySafe=false (LLM quota contention).
 */

import { z } from 'zod'
import { runLLMSubAgent } from '../base'
import type { SubAgent, SubAgentContext, SubAgentResult } from '../types'
import {
  REQUIRED_PROMPT_SECTIONS,
  type PromptSectionKey,
} from '../../templates/prompt-section-checklist'
import { promptWriterBuilderContextSchema } from './builder-context'
import { SUB_LLM_SYSTEM, buildUserMessage } from './prompt-writer.prompt'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const promptWriterInputSchema = z.object({
  brief: z.string().min(20).max(4000),
  nicho: z.string().min(2).max(200),
  objetivo: z.string().min(10).max(500),
  attachedTools: z.array(z.string()).default([]),
  nicheInsights: z
    .object({
      regulations: z.array(z.string()).optional(),
      vocabulary: z.array(z.string()).optional(),
      typicalFlows: z.array(z.string()).optional(),
      warnings: z.array(z.string()).optional(),
    })
    .optional(),
  /** builderState projection — data already collected via cards. */
  builderContext: promptWriterBuilderContextSchema.optional(),
  /** Validator errors from a failed attempt (self-correction retry). */
  validatorFeedback: z.array(z.string()).max(30).optional(),
})

export type PromptWriterInput = z.infer<typeof promptWriterInputSchema>

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

/**
 * One string per canonical checklist section, PLUS the legacy `formato` alias
 * (mirror of `comunicacao`) kept so the frontend prompt-insights tab — which
 * narrows on the old 5-key shape — keeps rendering without changes.
 */
export type PromptWriterSections = Record<PromptSectionKey, string> & {
  /** @deprecated alias of `comunicacao` — legacy frontend compatibility. */
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
 * Canonical section headers, derived from the shared checklist. Order matters
 * — this is also the order we emit in the parsed output. Each `headingPattern`
 * accepts any leading `#` depth (`#`, `##`, `###`), missing diacritics, and
 * heading-suffix variations (e.g. "Comunicação operacional").
 */
const SECTION_HEADERS: ReadonlyArray<{
  key: PromptSectionKey
  label: string
  regex: RegExp
}> = REQUIRED_PROMPT_SECTIONS.map((section) => ({
  key: section.key,
  label: section.heading,
  regex: section.headingPattern,
}))

export interface ParseResult {
  sections: PromptWriterSections
  missing: string[]
}

function emptySections(): PromptWriterSections {
  const out = {} as Record<PromptSectionKey, string>
  for (const header of SECTION_HEADERS) out[header.key] = ''
  return { ...out, formato: '' }
}

/**
 * Parse a markdown prompt into the ten canonical sections.
 *
 * Scans line-by-line for the known headers in any order, captures the content
 * between each header and the next (or EOF), and trims each block. Sections
 * that are missing or whose body is empty after trim end up in `missing`.
 *
 * Extra headers the writer is allowed to add (e.g. "# Horário de atendimento")
 * also terminate the previous section's body, so optional sections never leak
 * into a canonical one.
 *
 * Returns a `ParseResult`; never throws. Callers decide how to treat a
 * non-empty `missing` list (we map it to PARSE_ERROR in `run`).
 */
export function parsePromptSections(markdown: string): ParseResult {
  const lines = markdown.split(/\r?\n/)

  // Find every header line in document order along with its section key.
  // Unknown headings (key=null) still act as section terminators.
  interface HeaderHit {
    lineIndex: number
    key: PromptSectionKey | null
  }
  const hits: HeaderHit[] = []
  const anyHeading = /^#{1,3}\s+\S/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const known = SECTION_HEADERS.find((header) => header.regex.test(line))
    if (known) {
      hits.push({ lineIndex: i, key: known.key })
    } else if (anyHeading.test(line)) {
      hits.push({ lineIndex: i, key: null })
    }
  }

  const captured: Partial<Record<PromptSectionKey, string>> = {}

  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]
    if (hit.key === null) continue
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
  const sections = emptySections()

  for (const header of SECTION_HEADERS) {
    const body = captured[header.key]
    if (body === undefined || body.length === 0) {
      missing.push(header.label)
    } else {
      sections[header.key] = body
    }
  }

  // Legacy alias — keep the frontend's 5-key narrowing intact.
  sections.formato = sections.comunicacao

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

    // 2. Sub-LLM call (10 sections ≈ 700 palavras → ~3000 output tokens)
    const llm = await runLLMSubAgent(
      {
        systemPrompt: SUB_LLM_SYSTEM,
        userMessage: buildUserMessage(validInput),
        temperature: 0.4,
        maxOutputTokens: 3000,
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
