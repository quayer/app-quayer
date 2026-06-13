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
import { Prisma } from '@prisma/client'
import { database } from '@/server/services/database'
import { buildBuilderTool } from './build-tool'
import type { BuilderToolExecutionContext } from './create-agent.tool'
import {
  nicheResearcherSubAgent,
  type NicheInsights,
  type NicheInsightsSource,
} from '../sub-agents'
import {
  invalidateRefinement,
  parseBuilderState,
  patchBuilderState,
  type BuilderState,
  type DeepPartial,
} from '../cards/builder-state'

// ---------------------------------------------------------------------------
// Regulated-niche handoff proposal (T26, FR-02, plan §2.2 item 2)
// ---------------------------------------------------------------------------

/**
 * Spec §9 decisão 1: "Transferir para humano" tem default DESLIGADO em todos os
 * nichos, MENOS em nichos regulados (advocacia, saúde), onde a IA **propõe ligado**
 * na fase de revisão (proposta confirmável — coerente com "configure por exceção").
 *
 * Esta detecção é DETERMINÍSTICA sobre o termo do nicho (não depende da síntese
 * do LLM, que pode degradar para `fromLLMKnowledgeOnly` com `regulations` vazias):
 * basta o usuário declarar o nicho para a proposta aparecer. Cada entrada mapeia
 * para a justificativa humana (`reason`) que o card de revisão exibe ao lado do
 * toggle pré-marcado.
 */
const REGULATED_NICHE_PATTERNS: ReadonlyArray<{
  test: RegExp
  reason: string
}> = [
  {
    // Advocacia — OAB veda captação/oferta direta; resposta jurídica exige humano.
    test: /\b(advoca\w*|advogad\w*|jurídic\w*|juridic\w*|escritório de advocacia|escritorio de advocacia)\b/i,
    reason:
      'Nicho regulado (advocacia): a OAB restringe captação e orientação jurídica automatizada — recomendamos transferir para um humano. Você pode desligar.',
  },
  {
    // Saúde — CFM/conselhos vedam diagnóstico/conduta por IA; encaminhar a humano.
    test: /\b(saúde|saude|clínic\w*|clinic\w*|médic\w*|medic\w*|consultório médico|consultorio medico|odontológic\w*|odontologic\w*|dentist\w*|psicólog\w*|psicolog\w*|nutricionist\w*|fisioterap\w*)\b/i,
    reason:
      'Nicho regulado (saúde): conselhos profissionais vedam diagnóstico/conduta automatizada — recomendamos transferir para um humano. Você pode desligar.',
  },
]

/**
 * Termos que parecem regulados mas NÃO são saúde humana — evita falso-positivo no
 * exemplo canônico de nicho comum da própria tool ("clínica veterinária").
 */
const HEALTH_FALSE_POSITIVE = /\b(veterinári\w*|veterinari\w*|pet\b|animal\w*)/i

/** Retorna a justificativa do 1º padrão regulado que casa, ou null para nicho comum. */
function regulatedHandoffReason(nicho: string): string | null {
  if (HEALTH_FALSE_POSITIVE.test(nicho)) return null
  for (const { test, reason } of REGULATED_NICHE_PATTERNS) {
    if (test.test(nicho)) return reason
  }
  return null
}

/**
 * Grava `capturedProposals.handoff = { mode: 'solo', reason }` de forma FAIL-OPEN:
 * read-modify-write org-scoped atômico (mesmo padrão de `set_project_basics`),
 * dentro de try/catch que NUNCA lança — uma falha de DB jamais quebra o resultado
 * da pesquisa de nicho. NUNCA flipa o sentinel `handoff` (a proposta é só prefill
 * confirmável). No-op quando o nicho é comum (`reason === null`).
 */
async function proposeRegulatedHandoff(
  ctx: BuilderToolExecutionContext,
  reason: string,
): Promise<void> {
  try {
    const conversation = await database.builderProjectConversation.findFirst({
      where: { projectId: ctx.projectId, organizationId: ctx.organizationId },
      select: { id: true },
    })
    if (!conversation) return

    await database.$transaction(async (tx) => {
      const row = await tx.builderProjectConversation.findFirst({
        where: { id: conversation.id, organizationId: ctx.organizationId },
        select: { builderState: true },
      })
      const current = parseBuilderState(row?.builderState ?? null)

      const patch: DeepPartial<BuilderState> = {
        capturedProposals: { handoff: { mode: 'solo', reason } },
      }
      const next = invalidateRefinement(
        patchBuilderState(current, patch),
        'research_niche alterou proposta regulatória depois do refinamento.',
      )

      await tx.builderProjectConversation.updateMany({
        where: { id: conversation.id, organizationId: ctx.organizationId },
        data: { builderState: next as unknown as Prisma.InputJsonValue },
      })
    })
  } catch {
    // Fail-open: proposta é best-effort; pesquisa de nicho nunca falha por isso.
  }
}

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
          // T26 — nicho regulado (advocacia/saúde) propõe handoff ligado para o
          // card de revisão (FR-02). Best-effort: a escrita é fail-open e NUNCA
          // flipa o sentinel; nicho comum não grava nada.
          const reason = regulatedHandoffReason(input.nicho)
          if (reason) {
            await proposeRegulatedHandoff(ctx, reason)
          }

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
