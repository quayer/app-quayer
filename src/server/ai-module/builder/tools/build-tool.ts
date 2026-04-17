/**
 * buildBuilderTool — Factory with fail-closed defaults (US-003)
 *
 * Wraps the Vercel AI SDK `tool()` helper, attaching Builder-specific metadata
 * to each tool definition. Metadata enables the orchestrator to make safe
 * decisions about concurrency, approval gates, and read/write classification
 * without inspecting tool internals.
 *
 * Defaults are **conservative (fail-closed)**:
 *   - isReadOnly = false        → assume write
 *   - isConcurrencySafe = false → assume NOT safe to parallelize
 *   - requiresApproval = false  → internal tools (no user gate by default)
 *
 * Usage:
 *   const myTool = buildBuilderTool({
 *     name: 'list_instances',
 *     tool: tool({ description, inputSchema, execute }),
 *     metadata: { isReadOnly: true, isConcurrencySafe: true },
 *   })
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Builder-specific metadata attached to every tool produced by the factory.
 */
export interface BuilderToolMetadata {
  /** Tool name (snake_case, matches the key in the toolset record) */
  name: string
  /** True if the tool performs no mutations (DB writes, external POSTs, etc.) */
  isReadOnly: boolean
  /** True if multiple instances can safely run in parallel */
  isConcurrencySafe: boolean
  /** True if the orchestrator should gate execution on user approval */
  requiresApproval: boolean
}

/**
 * Input to the `buildBuilderTool` factory.
 *
 * `T` is the Vercel AI SDK tool object returned by `tool()`. We use an
 * unconstrained generic to avoid variance issues with the SDK's internal
 * `FlexibleSchema<INPUT>` / `[schemaSymbol]` types.
 */
export interface BuilderToolDef<T> {
  /** Unique snake_case name for the tool */
  name: string
  /** The Vercel AI SDK tool instance (result of `tool({ ... })`) */
  tool: T
  /** Optional overrides — anything not provided uses BUILDER_TOOL_DEFAULTS */
  metadata?: Partial<Omit<BuilderToolMetadata, 'name'>>
}

/**
 * The enriched tool returned by the factory: the original Vercel AI SDK tool
 * plus a `__metadata` property carrying Builder-specific metadata.
 */
export type BuilderTool<T = unknown> = T & {
  __metadata: BuilderToolMetadata
}

// ---------------------------------------------------------------------------
// Defaults — conservative (fail-closed)
// ---------------------------------------------------------------------------

const BUILDER_TOOL_DEFAULTS: Omit<BuilderToolMetadata, 'name'> = {
  isReadOnly: false,
  isConcurrencySafe: false,
  requiresApproval: false,
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a `BuilderTool` by merging fail-closed defaults with caller
 * overrides and attaching the result as `__metadata` on the tool object.
 *
 * The original tool is not mutated — a shallow copy is returned.
 */
export function buildBuilderTool<T>(
  def: BuilderToolDef<T>,
): BuilderTool<T> {
  const metadata: BuilderToolMetadata = {
    ...BUILDER_TOOL_DEFAULTS,
    ...def.metadata,
    name: def.name,
  }

  // Shallow-copy so we never mutate the original tool() return value
  const enriched = Object.assign({}, def.tool, {
    __metadata: metadata,
  }) as BuilderTool<T>

  return enriched
}
