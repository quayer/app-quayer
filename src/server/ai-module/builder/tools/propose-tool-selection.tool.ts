/**
 * propose_tool_selection — Builder tool (Wave 2.2; enxugado em FR-09/FR-10)
 *
 * Presents the catalog of real builtin tools so the user can multi-select
 * which capabilities to attach to the freshly-built agent. Purely
 * presentational: the card's "Aplicar" button posts a follow-up user
 * message listing the chosen tool keys, which the LLM then translates
 * into sequential `attach_tool_to_agent` calls.
 *
 * DERIVAÇÃO DETERMINÍSTICA (FR-09/FR-10 da spec jornada-builder-v2): as
 * capacidades que DERIVAM de decisões já tomadas pelo usuário foram REMOVIDAS
 * deste catálogo — re-decidi-las aqui produzia agentes publicados em estado
 * contraditório (roleta sem transfer_to_human; catálogo de preços órfão;
 * "Agenda Google" sem conexão). Hoje elas são anexadas/removidas pela saga de
 * deploy (`deploy/enabled-tools-derivation.ts`):
 *   - qualified_handoff / department_dispatch / team_alert → derivadas de
 *     `handoff.mode` (materialize_team);
 *   - pricing_log (send_pricing) → derivada do card de preços + disclosureStyle
 *     (materialize_pricing anexa get_pricing, a tool que lê o catálogo REAL);
 *   - appointment_intent / google_calendar → derivadas de `handoff.alsoSchedule`
 *     + conexão real de agenda (materialize_team).
 * Permanece apenas o ORTOGONAL `lead_only` (qualificar lead sem passar o
 * bastão), que nenhuma decisão de card implica por si só.
 *
 * The catalog is curated (friendly Portuguese labels + 1-line reasons)
 * rather than derived directly from BUILTIN_TOOL_NAMES so that we
 * control what gets surfaced to the user — not every internal tool
 * (e.g. get_session_history) makes sense to expose as a user-facing
 * capability choice.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { BUILTIN_TOOL_NAMES } from '@/server/ai-module/ai-agents/tools/builtin-tools'
import { buildBuilderTool } from './build-tool'
import { resolveProjectAgent } from './resolve-project-agent'

export interface BuilderToolExecutionContext {
  projectId: string
  organizationId: string
  userId: string
}

interface ToolCatalogEntry {
  /** Stable UI id for the capability card */
  key: string
  title: string
  description: string
  /** Built-in tool keys enabled when this capability is selected */
  toolKeys: string[]
  /** Icon hint for the card — lucide-react icon name */
  icon: 'calendar' | 'tag' | 'user-plus' | 'headphones' | 'bell'
  /** Recommended by default (pre-checked in the UI) */
  recommended: boolean
  note?: string
}

/**
 * Curated catalog. Every `key` MUST exist in BUILTIN_TOOL_NAMES; we
 * filter at build time so a renamed/removed tool drops from the picker
 * instead of shipping a dead checkbox.
 */
const RAW_CATALOG: ToolCatalogEntry[] = [
  // NOTA: handoff (qualified_handoff/department_dispatch/team_alert), agenda
  // (appointment_intent/google_calendar) e preços (pricing_log) saíram do
  // catálogo — são DERIVADAS deterministicamente das decisões dos cards na
  // saga de deploy (ver header + deploy/enabled-tools-derivation.ts).
  {
    key: 'lead_only',
    title: 'Só qualificar lead',
    description:
      'Marca o contato como lead qualificado, mas mantém a IA ativa na conversa.',
    toolKeys: ['create_lead'],
    icon: 'user-plus',
    recommended: false,
    note:
      'Útil quando a IA deve continuar nutrindo o contato após marcar o lead.',
  },
]

const CATALOG: ToolCatalogEntry[] = RAW_CATALOG.filter((entry) =>
  entry.toolKeys.every((key) =>
    (BUILTIN_TOOL_NAMES as readonly string[]).includes(key),
  ),
)

export function proposeToolSelectionTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'propose_tool_selection',
    metadata: { isReadOnly: true, isConcurrencySafe: true },
    tool: tool({
      description:
        'Presents the user with a multi-select picker of the few OPTIONAL capabilities that are not derived from other decisions (today: lead qualification only). Handoff, calendar and pricing capabilities are NOT offered here — they are attached/removed deterministically at deploy time from the handoff card, the real calendar connection and the pricing card. Use at the "tools" stage after the prompt is approved, before testing. The agent is resolved automatically from the active project — do NOT provide agentId. Does NOT mutate — the user picks and the card triggers follow-up attach_tool_to_agent calls.',
      inputSchema: z.object({
        agentId: z
          .string()
          .uuid()
          .optional()
          .describe(
            'Opcional; resolvido automaticamente do projeto ativo. Omita este campo.',
          ),
        reason: z
          .string()
          .max(200)
          .optional()
          .describe(
            'Optional short context shown above the picker (ex: "Vamos ativar o que seu agente precisa saber fazer")',
          ),
      }),
      execute: async (input) => {
        // Resolve the REAL agent from the active project. Purely cosmetic here
        // (the card's follow-up attach_tool_to_agent calls resolve again), but
        // it prevents echoing a hallucinated LLM id back into the chat. The
        // picker is also valid BEFORE agent creation, so failure → null.
        const resolved = await resolveProjectAgent(ctx, input.agentId)
        return {
          success: true as const,
          agentId: resolved.ok ? resolved.agentId : null,
          reason: input.reason ?? null,
          tools: CATALOG,
          message: `Exibindo ${CATALOG.length} ferramentas para o usuário escolher.`,
        }
      },
    }),
  })
}
