/**
 * US-012 (part 2): Journey / Tool-Funnel Consistency Validator
 *
 * Checks that the prompt and the list of enabled tools are consistent:
 *  - Scheduling mentions without check_availability tool
 *  - create_lead tool without data-collection mentions in prompt
 *  - Funnel stages without transfer_to_human tool
 *
 * All issues are **warnings** (informational, do not block).
 */

import type { ValidationIssue, ValidationResult } from './index'

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

interface JourneyRule {
  label: string
  /** Returns true if the rule is violated */
  check: (prompt: string, tools: string[]) => boolean
}

const JOURNEY_RULES: JourneyRule[] = [
  {
    label:
      'Prompt mentions scheduling/agendamento but enabledTools has no "check_availability" tool',
    check: (prompt, tools) => {
      const mentionsScheduling =
        /\b(agendamento|scheduling|agendar|marcar\s+hor[aá]rio|book\s+appointment)\b/i.test(
          prompt
        )
      const hasTool = tools.some((t) =>
        /^check_availability$/i.test(t)
      )
      return mentionsScheduling && !hasTool
    },
  },
  {
    label:
      'enabledTools has "create_lead" but prompt does not mention collecting name, phone, or data',
    check: (prompt, tools) => {
      const hasTool = tools.some((t) => /^create_lead$/i.test(t))
      const mentionsCollection =
        /\b(nome|name|telefone|phone|celular|dados|data|coletar|collect|captur)/i.test(
          prompt
        )
      return hasTool && !mentionsCollection
    },
  },
  {
    label:
      'Prompt has funnel stages but enabledTools has no "transfer_to_human" tool',
    check: (prompt, tools) => {
      const hasFunnel =
        /\b(funil|funnel|etapa|stage|qualifica[cç][aã]o|qualification|pipeline)\b/i.test(
          prompt
        )
      const hasTool = tools.some((t) =>
        /^transfer_to_human$/i.test(t)
      )
      return hasFunnel && !hasTool
    },
  },
]

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function validateJourney(
  prompt: string,
  enabledTools: string[]
): ValidationResult {
  const issues: ValidationIssue[] = []

  for (const rule of JOURNEY_RULES) {
    if (rule.check(prompt, enabledTools)) {
      issues.push({
        validator: 'journey',
        severity: 'warning',
        message: rule.label,
      })
    }
  }

  return {
    pass: true, // journey never blocks — warnings only
    issues,
  }
}
