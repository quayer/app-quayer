/**
 * Tool Registry Service
 *
 * Provides a lightweight registry for AI agent tools, with support for:
 *  - Deferred tools: only the tool *name* ships in the system prompt; the model
 *    pulls the schema on demand via a `tool_search` call. This keeps the
 *    prompt small when there are many tools.
 *  - Result truncation: tool outputs exceeding `maxResultSizeChars` are
 *    truncated with an explicit suffix so the model knows content was dropped.
 *  - Keyword search: scoring-based ranking over deferred tool names, hints,
 *    and descriptions to power the ToolSearch tool.
 *
 * Architectural inspiration: Claude Code's ToolSearchTool (see
 * `inspiration/claude-code-leak/src/tools/ToolSearchTool/ToolSearchTool.ts`).
 *
 * IMPORTANT: This module is intentionally side-effect-free and dependency-free
 * so it can be unit-tested without DB/Redis/AI provider stubs.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolMetadata {
  name: string
  description: string
  /** 3-10 word capability phrase used to boost ranking in `searchTools`. */
  searchHint?: string
  /** If true, ship only the tool name in the system prompt (lazy schema). */
  shouldDefer?: boolean
  /** If true, the tool is ALWAYS loaded fully — overrides `shouldDefer`. */
  alwaysLoad?: boolean
  /** Cap on tool result size, in chars. Default `DEFAULT_MAX_RESULT_SIZE_CHARS`. */
  maxResultSizeChars?: number
  /** Hint to the runtime that this tool can run in parallel safely. */
  isConcurrencySafe?: boolean
  /** Hint to the runtime that this tool performs no mutations. */
  isReadOnly?: boolean
}

export interface ToolWithMeta extends ToolMetadata {
  /** Zod schema (kept opaque here to avoid pulling Zod into this file). */
  inputSchema: unknown
  execute: (input: any, ctx: any) => Promise<unknown>
}

export interface TruncationResult {
  content: string
  truncated: boolean
  omittedChars: number
}

export interface ParsedToolName {
  parts: string[]
  full: string
  isMcp: boolean
}

export interface PartitionedTools<T extends ToolMetadata = ToolMetadata> {
  loaded: T[]
  deferred: T[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_MAX_RESULT_SIZE_CHARS = 5000
export const DEFAULT_SEARCH_MAX_RESULTS = 5
export const TRUNCATION_SUFFIX_TEMPLATE = (omitted: number) =>
  `...[truncated, ${omitted} chars omitted]`

// ---------------------------------------------------------------------------
// Deferred-tool decision
// ---------------------------------------------------------------------------

/**
 * Decide whether a tool should ship only its name (deferred) or its full
 * schema (loaded) in the system prompt.
 *
 * `alwaysLoad` wins over `shouldDefer` so critical tools can never be
 * accidentally lazy-loaded.
 */
export function isDeferredTool(tool: ToolMetadata): boolean {
  if (tool.alwaysLoad === true) return false
  return tool.shouldDefer === true
}

/**
 * Split a list of tools into the two buckets used by prompt assembly:
 *  - `loaded`: full schema goes into the system prompt
 *  - `deferred`: only the name (+ hint) is exposed; schema fetched via ToolSearch
 */
export function partitionTools<T extends ToolMetadata>(
  tools: T[],
): PartitionedTools<T> {
  const loaded: T[] = []
  const deferred: T[] = []
  for (const tool of tools) {
    if (isDeferredTool(tool)) deferred.push(tool)
    else loaded.push(tool)
  }
  return { loaded, deferred }
}

// ---------------------------------------------------------------------------
// Result truncation
// ---------------------------------------------------------------------------

/**
 * Coerce an arbitrary tool result into a string and truncate it to
 * `maxResultSizeChars`, appending a `...[truncated, X chars omitted]` suffix
 * if any content was dropped.
 *
 * Behavior:
 *  - `null` / `undefined` → empty string, no truncation
 *  - strings → used as-is
 *  - everything else → `JSON.stringify` (with 2-space indent for readability)
 *  - non-serializable (circular refs) → `String(value)` fallback
 */
export function truncateToolResult(
  result: unknown,
  maxResultSizeChars: number = DEFAULT_MAX_RESULT_SIZE_CHARS,
): TruncationResult {
  if (result === null || result === undefined) {
    return { content: '', truncated: false, omittedChars: 0 }
  }

  let serialized: string
  if (typeof result === 'string') {
    serialized = result
  } else {
    try {
      serialized = JSON.stringify(result, null, 2) ?? String(result)
    } catch {
      serialized = String(result)
    }
  }

  if (serialized.length <= maxResultSizeChars) {
    return { content: serialized, truncated: false, omittedChars: 0 }
  }

  const omittedChars = serialized.length - maxResultSizeChars
  const truncatedPrefix = serialized.slice(0, maxResultSizeChars)
  const content = `${truncatedPrefix}${TRUNCATION_SUFFIX_TEMPLATE(omittedChars)}`
  return { content, truncated: true, omittedChars }
}

// ---------------------------------------------------------------------------
// Tool name parsing
// ---------------------------------------------------------------------------

/**
 * Break a tool name into normalized search parts.
 *
 *  - MCP tools (`mcp__server__action_name`) → lower-cased parts, `isMcp: true`
 *  - Regular tools — CamelCase + snake_case both supported. `SendMessage` and
 *    `send_message` both yield `['send', 'message']`, `isMcp: false`.
 *
 * The returned `full` is the space-joined lower-case form, used as a
 * fallback substring match when no part-level hit is found.
 */
export function parseToolName(name: string): ParsedToolName {
  if (name.startsWith('mcp__')) {
    const withoutPrefix = name.replace(/^mcp__/, '').toLowerCase()
    const parts = withoutPrefix
      .split('__')
      .flatMap(p => p.split('_'))
      .filter(Boolean)
    return {
      parts,
      full: withoutPrefix.replace(/__/g, ' ').replace(/_/g, ' '),
      isMcp: true,
    }
  }

  const parts = name
    .replace(/([a-z])([A-Z])/g, '$1 $2') // CamelCase → spaces
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  return {
    parts,
    full: parts.join(' '),
    isMcp: false,
  }
}

// ---------------------------------------------------------------------------
// Keyword search
// ---------------------------------------------------------------------------

/**
 * Escape regex meta-characters so a user-supplied term can be embedded in
 * a `\bterm\b` word-boundary pattern without exploding.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Pre-compile word-boundary regexes for all search terms (avoid recompiling
 * per tool × per term during the scoring loop).
 */
function compileTermPatterns(terms: string[]): Map<string, RegExp> {
  const patterns = new Map<string, RegExp>()
  for (const term of terms) {
    if (!patterns.has(term)) {
      patterns.set(term, new RegExp(`\\b${escapeRegExp(term)}\\b`))
    }
  }
  return patterns
}

/**
 * Scoring weights — kept as named constants so behavioral tests stay readable.
 * MCP names tend to be long and unique, so part-level hits there get a small
 * extra bump (+12 vs +10 / +6 vs +5). See ToolSearchTool reference.
 */
const SCORE = {
  PART_EXACT_REGULAR: 10,
  PART_EXACT_MCP: 12,
  PART_PARTIAL_REGULAR: 5,
  PART_PARTIAL_MCP: 6,
  FULL_FALLBACK: 3,
  SEARCH_HINT: 4,
  DESCRIPTION: 2,
} as const

/**
 * Keyword search over a list of tools (typically the deferred set).
 *
 * Special forms:
 *  - `select:Name1,Name2,...` → direct selection by exact (case-insensitive)
 *    tool name, ignoring the score system.
 *  - A bare tool name that matches a tool exactly → fast-path returning that
 *    single tool, identical to `select:` behavior. This is forgiving toward
 *    models that drop the prefix.
 *
 * Otherwise, each query term contributes to a per-tool score based on where
 * it hits (name parts, hint, description), and the top `maxResults` tools
 * with a non-zero score are returned, sorted descending.
 */
export function searchTools(
  query: string,
  tools: ToolMetadata[],
  maxResults: number = DEFAULT_SEARCH_MAX_RESULTS,
): string[] {
  const trimmed = query.trim()
  if (trimmed.length === 0) return []

  const queryLower = trimmed.toLowerCase()

  // ── select: direct selection ───────────────────────────────────────────
  const selectMatch = trimmed.match(/^select:(.+)$/i)
  if (selectMatch) {
    const requested = selectMatch[1]!
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)

    const found: string[] = []
    for (const wanted of requested) {
      const tool = tools.find(t => t.name.toLowerCase() === wanted)
      if (tool && !found.includes(tool.name)) {
        found.push(tool.name)
      }
    }
    return found.slice(0, maxResults)
  }

  // ── exact-name fast path (forgive missing `select:` prefix) ────────────
  const exact = tools.find(t => t.name.toLowerCase() === queryLower)
  if (exact) return [exact.name]

  // ── keyword scoring ────────────────────────────────────────────────────
  const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 0)
  if (queryTerms.length === 0) return []
  const termPatterns = compileTermPatterns(queryTerms)

  const scored = tools.map(tool => {
    const parsed = parseToolName(tool.name)
    const descNormalized = (tool.description ?? '').toLowerCase()
    const hintNormalized = tool.searchHint?.toLowerCase() ?? ''

    let score = 0
    for (const term of queryTerms) {
      const pattern = termPatterns.get(term)!

      if (parsed.parts.includes(term)) {
        score += parsed.isMcp ? SCORE.PART_EXACT_MCP : SCORE.PART_EXACT_REGULAR
      } else if (parsed.parts.some(part => part.includes(term))) {
        score += parsed.isMcp
          ? SCORE.PART_PARTIAL_MCP
          : SCORE.PART_PARTIAL_REGULAR
      } else if (parsed.full.includes(term)) {
        // Fallback only when no part-level hit fired for this term.
        score += SCORE.FULL_FALLBACK
      }

      if (hintNormalized && pattern.test(hintNormalized)) {
        score += SCORE.SEARCH_HINT
      }
      if (descNormalized && pattern.test(descNormalized)) {
        score += SCORE.DESCRIPTION
      }
    }

    return { name: tool.name, score }
  })

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(s => s.name)
}
