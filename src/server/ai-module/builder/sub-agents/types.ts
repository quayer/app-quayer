/**
 * Quayer Builder — Sub-Agent Contract
 *
 * Defines the uniform interface for specialized processors used by the
 * Builder meta-agent. A sub-agent is a typed function with structured
 * input/output that encapsulates one cognitive concern:
 *
 *   - NicheResearcher → web research + synthesis
 *   - PromptWriter    → Prompt Anatomy generation
 *   - Validator       → 4-check QA pipeline
 *   - DeployRunner    → saga orchestration + rollback
 *
 * Sub-agents do NOT replace tools. A Builder tool may invoke zero, one,
 * or many sub-agents internally. Sub-agents are invisible to the LLM —
 * they are composition units inside the tool implementation.
 */

import type { z } from 'zod'

/**
 * Ambient execution context shared by every sub-agent invocation.
 *
 * Mirrors `BuilderToolExecutionContext` from `tools/create-agent.tool.ts`
 * but adds an optional AbortSignal for cooperative cancellation.
 */
export interface SubAgentContext {
  readonly organizationId: string
  readonly userId: string
  readonly projectId: string
  /** Optional AbortSignal propagated from the tool's own timeout/cancel */
  readonly signal?: AbortSignal
}

/**
 * Static metadata attached to every sub-agent. Used by callers to reason
 * about safety (readOnly, concurrency) without inspecting internals.
 *
 * Defaults are fail-closed (same policy as `BuilderToolMetadata`).
 */
export interface SubAgentMetadata {
  /** Kebab-case identifier (e.g. 'validator', 'niche-researcher') */
  readonly name: string
  /** True if the sub-agent performs no mutations */
  readonly isReadOnly: boolean
  /** True if multiple invocations can safely run concurrently */
  readonly isConcurrencySafe: boolean
  /** Hard upper bound on execution time (ms). Enforced by the runner. */
  readonly timeoutMs: number
}

/**
 * Tagged result envelope. Matches the tool output shape already used
 * across the Builder toolset so callers can forward without reshaping.
 */
export type SubAgentResult<TOutput> =
  | {
      readonly success: true
      readonly data: TOutput
      /** Wall-clock duration (ms) */
      readonly durationMs: number
    }
  | {
      readonly success: false
      /** Human-readable error message, ready to surface to the LLM */
      readonly error: string
      /** Optional machine-readable code for routing (e.g. 'TIMEOUT', 'UPSTREAM_503') */
      readonly code?: string
      readonly durationMs: number
    }

/**
 * The canonical sub-agent shape. Implementations must provide a static
 * `metadata` field and a `run` method that never throws — errors are
 * always captured in a SubAgentResult.
 *
 * `TInput` is typically inferred from a Zod schema so callers get both
 * runtime validation and static typing.
 */
export interface SubAgent<TInput, TOutput> {
  readonly metadata: SubAgentMetadata
  run(
    input: TInput,
    context: SubAgentContext,
  ): Promise<SubAgentResult<TOutput>>
}

/** Extract the output type of a sub-agent. */
export type SubAgentOutput<T> = T extends SubAgent<unknown, infer O>
  ? O
  : never

/** Extract the input type of a sub-agent. */
export type SubAgentInput<T> = T extends SubAgent<infer I, unknown>
  ? I
  : never

/** Derive a SubAgent signature from a Zod input schema + explicit output. */
export type SubAgentFromSchema<
  TSchema extends z.ZodTypeAny,
  TOutput,
> = SubAgent<z.infer<TSchema>, TOutput>
