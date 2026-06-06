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
import { buildBuilderTool } from './build-tool'
import { searchTavily } from '@/server/ai-module/builder/sub-agents/niche-researcher/tavily-client'

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
  return buildBuilderTool({
    name: 'search_web',
    metadata: { isReadOnly: true, isConcurrencySafe: true },
    tool: tool({
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
      // Single shared Tavily caller — handles API-key check, 1h Redis cache,
      // per-attempt timeout, 429 distinction and 5xx/network retry. This tool
      // only maps the tagged result onto its own success/message shape.
      const result = await searchTavily(input.query, {
        maxResults: input.maxResults,
      })

      if (result.ok) {
        return { success: true, results: result.results }
      }
      // 429 distinto: mensagem clara para o meta-agente recuar e tentar mais
      // tarde, não tratar como erro de query.
      if (result.reason === 'RATE_LIMITED') {
        return {
          success: false,
          message: 'Tavily rate limit atingido (429) — tente novamente em instantes.',
        }
      }
      return { success: false, message: result.message }
    },
  }),
  })
}
