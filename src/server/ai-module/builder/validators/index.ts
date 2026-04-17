/**
 * US-012: Prompt Validation Orchestrator
 *
 * Runs all four validators (anatomy, blacklist, ambiguity, journey)
 * and aggregates results into a single ValidationResult.
 *
 * pass = true only when there are zero 'error' severity issues.
 * Warnings are informational and do NOT block.
 */

// ---------------------------------------------------------------------------
// Shared types (used by all validators)
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  validator: 'anatomy' | 'blacklist' | 'ambiguity' | 'journey'
  severity: 'error' | 'warning'
  message: string
}

export interface ValidationResult {
  pass: boolean
  issues: ValidationIssue[]
}

// ---------------------------------------------------------------------------
// Re-export individual validators
// ---------------------------------------------------------------------------

export { validateAnatomy } from './whatsapp-prompt-anatomy'
export { validateBlacklist } from './blacklist'
export { validateAmbiguity } from './ambiguity'
export { validateJourney } from './journey'

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

import { validateAnatomy } from './whatsapp-prompt-anatomy'
import { validateBlacklist } from './blacklist'
import { validateAmbiguity } from './ambiguity'
import { validateJourney } from './journey'

/**
 * Run all prompt validators and return a unified result.
 *
 * @param prompt        The full system prompt text to validate.
 * @param enabledTools  Optional list of tool names enabled for this agent.
 * @returns             Aggregated ValidationResult — pass is true only if
 *                      there are zero 'error' severity issues.
 */
export function validatePrompt(
  prompt: string,
  enabledTools?: string[]
): ValidationResult {
  const results: ValidationResult[] = [
    validateAnatomy(prompt),
    validateBlacklist(prompt),
    validateAmbiguity(prompt),
    validateJourney(prompt, enabledTools ?? []),
  ]

  const allIssues = results.flatMap((r) => r.issues)

  return {
    pass: allIssues.every((issue) => issue.severity !== 'error'),
    issues: allIssues,
  }
}
