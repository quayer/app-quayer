/**
 * Builder Tool — research_niche
 *
 * Wrapper tool exposed to the Quayer Builder meta-agent. Delegates to the
 * `nicheResearcherSubAgent`, which performs a Tavily-grounded web search
 * (when TAVILY_API_KEY is configured) and an LLM JSON synthesis step to
 * return structured insights about a Brazilian business niche/vertical.
 *
 * The Builder LLM should call this BEFORE `generate_prompt_anatomy` so the
 * generated prompt is tailored to the niche (regulations, vocabulary,
 * typical attendance flows, and warnings about forbidden terms).
 *
 * Pattern mirrors `search-web.tool.ts`:
 *   - Vercel AI SDK `tool()` helper with Zod inputSchema.
 *   - Factory function binding the runtime context.
 *   - `buildBuilderTool` for fail-closed metadata + orchestrator hints.
 *
 * Graceful degradation: when Tavily is unavailable the sub-agent still
 * runs and returns `fromLLMKnowledgeOnly: true`, signalling reduced
 * confidence to downstream consumers (and the LLM itself).
 */

import { tool } from 'ai'
import { z } from 'zod'
import { buildBuilderTool } from './build-tool'
import type { BuilderToolExecutionContext } from './create-agent.tool'
import {
  nicheResearcherSubAgent,
  type NicheInsights,
  type NicheInsightsSource,
} from '../sub-agents'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ResearchNicheResult =
  | {
      success: true
      regulations: NicheInsights['regulations']
      vocabulary: NicheInsights['vocabulary']
      typicalFlows: NicheInsights['typicalFlows']
      warnings: NicheInsights['warnings']
      sources: NicheInsightsSource[]
      fromLLMKnowledgeOnly: boolean
    }
  | { success: false; message: string; code?: string }

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates the `research_niche` tool bound to a Builder chat context.
 *
 * Metadata mirrors the underlying sub-agent (`isReadOnly: true`,
 * `isConcurrencySafe: true`), so the orchestrator may parallelize this
 * call with other read-only research tools (e.g. `search_web`).
 */
export function researchNicheTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'research_niche',
    metadata: { isReadOnly: true, isConcurrencySafe: true },
    tool: tool({
      description:
        'Pesquisa um nicho/vertical de negócio brasileiro e retorna insights estruturados: regulamentações relevantes, vocabulário do setor, fluxos típicos de atendimento, e alertas (ex: termos proibidos por regulador). Faz web search real quando TAVILY_API_KEY está configurada e sintetiza com LLM; caso contrário, usa apenas conhecimento do LLM (flag fromLLMKnowledgeOnly indica confiança reduzida). Use ANTES de generate_prompt_anatomy para que o prompt gerado seja mais aderente ao nicho.',
      inputSchema: z.object({
        nicho: z
          .string()
          .min(2)
          .max(200)
          .describe(
            'Nicho/vertical do negócio (ex: "clínica veterinária", "barbearia", "loja de roupas"). Quayer é canal specialist, não nicho specialist — qualquer nicho é válido.',
          ),
        businessDescription: z
          .string()
          .max(1000)
          .optional()
          .describe(
            'Descrição opcional adicional do negócio para refinar a pesquisa (ex: "barbearia premium no centro de SP focada em homens 30-45").',
          ),
      }),
      execute: async (input): Promise<ResearchNicheResult> => {
        const result = await nicheResearcherSubAgent.run(
          {
            nicho: input.nicho,
            businessDescription: input.businessDescription,
          },
          {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            projectId: ctx.projectId,
          },
        )

        if (result.success) {
          return {
            success: true as const,
            regulations: result.data.regulations,
            vocabulary: result.data.vocabulary,
            typicalFlows: result.data.typicalFlows,
            warnings: result.data.warnings,
            sources: result.data.sources,
            fromLLMKnowledgeOnly: result.data.fromLLMKnowledgeOnly,
          }
        }

        return {
          success: false as const,
          message: result.error,
          code: result.code,
        }
      },
    }),
  })
}
