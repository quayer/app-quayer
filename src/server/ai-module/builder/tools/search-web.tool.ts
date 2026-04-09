/**
 * Builder Tool — search_web (US-014)
 *
 * Wrapper tool exposed to the Quayer Builder meta-agent. Allows the Builder AI
 * to perform a lightweight web search using the Tavily Search API so it can
 * ground its answers with up-to-date information (e.g. looking up a company,
 * product, or current best practice before drafting an agent prompt).
 *
 * Pattern mirrors `create-agent.tool.ts` / `list-instances.tool.ts`:
 *   - Vercel AI SDK `tool()` helper with Zod inputSchema.
 *   - Factory function binding the runtime context (even though this specific
 *     tool has no tenant-scoped side effects, we keep the signature uniform
 *     for easier registration in the Builder tool registry).
 *   - No extra deps — uses the built-in `fetch`.
 *
 * Provider: Tavily (https://api.tavily.com/search). Requires TAVILY_API_KEY.
 * If the env var is missing the tool returns a soft failure instead of
 * throwing, so the Builder LLM can recover gracefully and explain to the user.
 */

import { tool } from 'ai'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Context (shared shape with the other Builder tools in this directory)
// ---------------------------------------------------------------------------

export interface BuilderToolExecutionContext {
  /** BuilderProject.id that owns the conversation */
  projectId: string
  /** Organization.id (tenant boundary) */
  organizationId: string
  /** User.id of the Builder chat author */
  userId: string
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResultItem {
  title: string
  url: string
  snippet: string
}

type SearchWebResult =
  | { success: true; results: SearchResultItem[] }
  | { success: false; message: string; results?: SearchResultItem[] }

interface TavilyApiResult {
  title?: string
  url?: string
  content?: string
}

interface TavilyApiResponse {
  results?: TavilyApiResult[]
}

const SNIPPET_MAX_LENGTH = 300
const REQUEST_TIMEOUT_MS = 15_000
const TAVILY_ENDPOINT = 'https://api.tavily.com/search'

function truncateSnippet(text: string | undefined): string {
  if (!text) return ''
  const trimmed = text.trim()
  if (trimmed.length <= SNIPPET_MAX_LENGTH) return trimmed
  return `${trimmed.slice(0, SNIPPET_MAX_LENGTH - 1).trimEnd()}…`
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates the `search_web` tool bound to a Builder chat context.
 *
 * The LLM should use this when it needs current external information to
 * better draft an agent prompt (e.g. a company's tone of voice, business
 * category, common customer questions).
 */
export function searchWebTool(_ctx: BuilderToolExecutionContext) {
  return tool({
    description:
      'Searches the public web using the Tavily search API and returns a short list of results (title, url, snippet). Use this when you need current information about a business, product, or topic to better draft the agent prompt. Keep queries concise and in the same language as the user.',
    inputSchema: z.object({
      query: z
        .string()
        .min(3)
        .describe('The search query (at least 3 chars). Be concise and specific.'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(10)
        .default(3)
        .describe('Maximum number of results to return (1-10, default 3).'),
    }),
    execute: async (input): Promise<SearchWebResult> => {
      const apiKey = process.env.TAVILY_API_KEY
      if (!apiKey) {
        return {
          success: false,
          message: 'TAVILY_API_KEY not configured',
        }
      }

      try {
        const response = await fetch(TAVILY_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            query: input.query,
            max_results: input.maxResults,
            search_depth: 'basic',
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })

        if (!response.ok) {
          const text = await response.text().catch(() => '')
          return {
            success: false,
            message: `Tavily search failed (${response.status}): ${text.slice(0, 200)}`,
          }
        }

        const data = (await response.json()) as TavilyApiResponse
        const results: SearchResultItem[] = (data.results ?? [])
          .slice(0, input.maxResults)
          .map((r) => ({
            title: (r.title ?? '').trim() || r.url || 'Untitled',
            url: r.url ?? '',
            snippet: truncateSnippet(r.content),
          }))
          .filter((r) => r.url)

        return { success: true, results }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to execute web search'
        return { success: false, message }
      }
    },
  })
}
