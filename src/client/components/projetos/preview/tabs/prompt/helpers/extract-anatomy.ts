/**
 * extract-anatomy — pure helpers to pull the latest `generate_prompt_anatomy`
 * tool result out of a Builder conversation.
 *
 * The Builder backend (see `src/server/ai-module/builder/tools/generate-prompt-anatomy.tool.ts`)
 * wraps its LLM output in `promptWriterSubAgent` + `validatorSubAgent` and
 * returns:
 *
 *   {
 *     success: true,
 *     prompt: string,
 *     sections: {
 *       papel: string,
 *       objetivo: string,
 *       regras: string,
 *       limitacoes: string,
 *       formato: string,
 *     },
 *     validation: {
 *       ran: true,
 *       pass: boolean,
 *       issues: Array<{ validator, severity, message }>
 *     } | { ran: false, error: string, code: string }
 *   }
 *
 * (or `{ success: false, message, code }` on hard failure).
 *
 * We narrow the serialized `unknown` payload that lives in `ChatMessage.toolCalls[].result`
 * into the typed `PromptAnatomyResult` below — the UI treats anything that fails
 * narrowing as "no anatomy available" and renders the local heuristic insights
 * only. Score is derived from `validation.issues.severity` since the tool itself
 * does not emit a numeric score yet (documented below).
 */
import type { ChatMessage } from "@/client/components/projetos/types"

// ---------------------------------------------------------------------------
// Types mirroring the tool output (see generate-prompt-anatomy.tool.ts)
// ---------------------------------------------------------------------------

export interface PromptAnatomySections {
  papel: string
  objetivo: string
  regras: string
  limitacoes: string
  formato: string
}

export type ValidationSeverity = "error" | "warning" | "info"

export interface PromptAnatomyValidationIssue {
  validator: string
  severity: ValidationSeverity
  message: string
}

export interface PromptAnatomyValidation {
  ran: boolean
  pass: boolean
  issues: PromptAnatomyValidationIssue[]
}

/**
 * Frontend-facing shape. We derive `score` from validation because the tool
 * does not return a raw score; passing + no issues == 100, degrades by severity.
 */
export interface PromptAnatomyResult {
  prompt: string
  sections: PromptAnatomySections
  validation: PromptAnatomyValidation
  /** 0-100, derived from validation outcome. */
  score: number
}

// ---------------------------------------------------------------------------
// Narrowing helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function narrowSections(value: unknown): PromptAnatomySections | null {
  if (!isRecord(value)) return null
  const { papel, objetivo, regras, limitacoes, formato } = value
  if (
    typeof papel !== "string" ||
    typeof objetivo !== "string" ||
    typeof regras !== "string" ||
    typeof limitacoes !== "string" ||
    typeof formato !== "string"
  ) {
    return null
  }
  return { papel, objetivo, regras, limitacoes, formato }
}

function narrowValidation(value: unknown): PromptAnatomyValidation {
  // The backend returns `{ ran: false, error, code }` or `{ ran: true, pass, issues }`.
  // Both variants collapse to the same frontend shape (empty issues + pass=true
  // when QA was skipped, so we don't accidentally penalize the score).
  if (!isRecord(value)) {
    return { ran: false, pass: true, issues: [] }
  }
  const ran = value.ran === true
  if (!ran) {
    return { ran: false, pass: true, issues: [] }
  }
  const passRaw = value.pass
  const pass = typeof passRaw === "boolean" ? passRaw : true
  const rawIssues = Array.isArray(value.issues) ? value.issues : []
  const issues: PromptAnatomyValidationIssue[] = []
  for (const item of rawIssues) {
    if (!isRecord(item)) continue
    const severity = item.severity
    if (severity !== "error" && severity !== "warning" && severity !== "info") {
      continue
    }
    issues.push({
      validator: asString(item.validator),
      severity,
      message: asString(item.message),
    })
  }
  return { ran: true, pass, issues }
}

/**
 * Computes a 0-100 score from validation outcome.
 *
 * Rules:
 *   - Not pass        -> max 40 (still useful signal)
 *   - Each `error`    -> -20
 *   - Each `warning`  -> -8
 *   - Each `info`     -> -2
 *   - Clamped to [0, 100].
 */
function computeScore(validation: PromptAnatomyValidation): number {
  if (!validation.ran) return 75 // QA skipped — be slightly optimistic
  let score = validation.pass ? 100 : 40
  for (const issue of validation.issues) {
    if (issue.severity === "error") score -= 20
    else if (issue.severity === "warning") score -= 8
    else score -= 2
  }
  return Math.max(0, Math.min(100, score))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Walk the conversation backwards and return the latest successful
 * `generate_prompt_anatomy` tool result, or `null` if none exists.
 *
 * Failed calls (`success: false` or missing `prompt`/`sections`) are skipped so
 * a later successful attempt wins; if every call failed, returns `null`.
 */
export function getLatestPromptAnatomy(
  messages: ChatMessage[],
): PromptAnatomyResult | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg || msg.role !== "assistant" || !msg.toolCalls) continue
    for (let j = msg.toolCalls.length - 1; j >= 0; j--) {
      const tc = msg.toolCalls[j]
      if (!tc || tc.toolName !== "generate_prompt_anatomy") continue
      const result = tc.result
      if (!isRecord(result)) continue
      if (result.success !== true) continue
      const sections = narrowSections(result.sections)
      const prompt = asString(result.prompt)
      if (!sections || prompt.length === 0) continue
      const validation = narrowValidation(result.validation)
      return {
        prompt,
        sections,
        validation,
        score: computeScore(validation),
      }
    }
  }
  return null
}
