/**
 * Builder Module — step-engine shared primitives (anti-fork, risk R1).
 *
 * The deterministic step primitives (`StepDefinition`, `confirmed`, `hasText`)
 * live HERE so the v1 engine (`next-pending-step.ts`) and the v2 engine
 * (`journey-v2.ts`) REUSE them instead of duplicating. Duplicating these is
 * forbidden (jornada-builder-v2 plan, risco R1).
 *
 * NO IO. NO `any`. Pure predicates only.
 */

import type {
  BuilderState,
  ConfirmationKey,
} from '../cards/builder-state'
import type {
  StepEngineContext,
  StepId,
} from './readiness.types'

/**
 * A step definition. `isDone` is a pure predicate over (state, ctx); `requiredPaths`
 * are the canonical `BuilderState` field paths the step gates on (surfaced as
 * `requiredMissing` while incomplete).
 */
export interface StepDefinition {
  id: StepId
  title: string
  ask: string
  /** Canonical field paths this step needs filled (for requiredMissing). */
  requiredPaths: string[]
  /**
   * Optional steps never block the journey: they are never surfaced as the
   * active "next ask" while not-done, and they are excluded from the
   * `allStepsDone` / `isDeployReady` computation. The user may still complete
   * them via their inline card at any time.
   */
  optional?: boolean
  /**
   * Whether this step currently applies given the state (default: always). A
   * non-applicable step is treated as satisfied/non-blocking and is excluded
   * from the completeness ratio (so it neither counts as progress nor against
   * it). Used by the action-gated team/calendar steps.
   */
  applies?: (state: BuilderState) => boolean
  /** True when the step is satisfied. Pure. */
  isDone: (state: BuilderState, ctx: StepEngineContext) => boolean
  /** Which paths are still empty given the state (subset of requiredPaths). */
  missing: (state: BuilderState, ctx: StepEngineContext) => string[]
}

/** A confirmation sentinel is the canonical "this card was submitted" signal. */
export function confirmed(state: BuilderState, key: ConfirmationKey): boolean {
  return state.confirmations[key] === true
}

export function hasText(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().length > 0
}
