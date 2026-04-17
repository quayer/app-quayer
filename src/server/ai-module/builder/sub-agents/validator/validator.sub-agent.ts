/**
 * Quayer Builder — Validator Sub-Agent
 *
 * Wraps the existing `validatePrompt` function (anatomy, blacklist,
 * ambiguity, journey) with the uniform SubAgent contract.
 *
 * This is a pure-logic sub-agent — it performs NO LLM calls. Timing is
 * handled by the `measure` helper from `../base`.
 */

import { z } from 'zod'
import { measure } from '../base'
import type { SubAgent, SubAgentContext, SubAgentResult } from '../types'
import {
  validatePrompt,
  type ValidationResult,
} from '../../validators'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const validatorInputSchema = z.object({
  prompt: z.string().min(20),
  attachedTools: z.array(z.string()).default([]),
})

export type ValidatorInput = z.infer<typeof validatorInputSchema>

// ---------------------------------------------------------------------------
// Sub-agent implementation
// ---------------------------------------------------------------------------

const METADATA = {
  name: 'validator',
  isReadOnly: true,
  isConcurrencySafe: true,
  timeoutMs: 5_000,
} as const

export const validatorSubAgent: SubAgent<ValidatorInput, ValidationResult> = {
  metadata: METADATA,

  async run(
    input: ValidatorInput,
    context: SubAgentContext,
  ): Promise<SubAgentResult<ValidationResult>> {
    const started = Date.now()

    // Cooperative cancellation: short-circuit before doing any work
    if (context.signal?.aborted) {
      return {
        success: false,
        error: 'Aborted by caller signal',
        code: 'ABORTED',
        durationMs: Date.now() - started,
      }
    }

    // Runtime validation of input — Zod gives us both static typing and
    // defensive validation at the trust boundary.
    const parsed = validatorInputSchema.safeParse(input)
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ') || 'Invalid input',
        code: 'INVALID_INPUT',
        durationMs: Date.now() - started,
      }
    }

    return measure(() =>
      validatePrompt(parsed.data.prompt, parsed.data.attachedTools),
    )
  },
}
