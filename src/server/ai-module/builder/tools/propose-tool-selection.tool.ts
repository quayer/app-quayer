/**
 * propose_tool_selection — Builder tool (Wave 2.2)
 *
 * Presents the catalog of real builtin tools so the user can multi-select
 * which capabilities to attach to the freshly-built agent. Purely
 * presentational: the card's "Aplicar" button posts a follow-up user
 * message listing the chosen tool keys, which the LLM then translates
 * into sequential `attach_tool_to_agent` calls.
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

export interface BuilderToolExecutionContext {
  projectId: string
  organizationId: string
  userId: string
}

interface ToolCatalogEntry {
  /** Matches BUILTIN_TOOL_NAMES — must stay in sync */
  key: string
  title: string
  description: string
  /** Icon hint for the card — lucide-react icon name */
  icon: 'calendar' | 'tag' | 'user-plus' | 'headphones' | 'bell'
  /** Recommended by default (pre-checked in the UI) */
  recommended: boolean
}

/**
 * Curated catalog. Every `key` MUST exist in BUILTIN_TOOL_NAMES; we
 * filter at build time so a renamed/removed tool drops from the picker
 * instead of shipping a dead checkbox.
 */
const RAW_CATALOG: ToolCatalogEntry[] = [
  {
    key: 'schedule_appointment',
    title: 'Agendar',
    description: 'Captura horários e serviços combinados com o cliente.',
    icon: 'calendar',
    recommended: true,
  },
  {
    key: 'send_pricing',
    title: 'Enviar preços',
    description: 'Registra cotações enviadas para rastreio no CRM.',
    icon: 'tag',
    recommended: true,
  },
  {
    key: 'create_lead',
    title: 'Qualificar lead',
    description: 'Marca contatos quentes e notifica o time de vendas.',
    icon: 'user-plus',
    recommended: true,
  },
  {
    key: 'transfer_to_human',
    title: 'Escalar para humano',
    description: 'Pausa a IA e transfere conversas difíceis para um atendente.',
    icon: 'headphones',
    recommended: true,
  },
  {
    key: 'notify_team',
    title: 'Notificar equipe',
    description: 'Avisa a equipe sobre situações importantes sem pausar a IA.',
    icon: 'bell',
    recommended: false,
  },
]

const CATALOG: ToolCatalogEntry[] = RAW_CATALOG.filter((entry) =>
  (BUILTIN_TOOL_NAMES as readonly string[]).includes(entry.key),
)

export function proposeToolSelectionTool(_ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'propose_tool_selection',
    metadata: { isReadOnly: true, isConcurrencySafe: true },
    tool: tool({
      description:
        'Presents the user with a multi-select picker of available capabilities (schedule, pricing, lead qualification, human handoff, team notifications) so they can choose which tools to attach to the agent. Use at the "tools" stage after the prompt is approved, before testing. Does NOT mutate — the user picks and the card triggers follow-up attach_tool_to_agent calls.',
      inputSchema: z.object({
        agentId: z
          .string()
          .uuid()
          .describe('AIAgentConfig.id the selection will be applied to'),
        reason: z
          .string()
          .max(200)
          .optional()
          .describe(
            'Optional short context shown above the picker (ex: "Vamos ativar o que seu agente precisa saber fazer")',
          ),
      }),
      execute: async (input) => {
        return {
          success: true as const,
          agentId: input.agentId,
          reason: input.reason ?? null,
          tools: CATALOG,
          message: `Exibindo ${CATALOG.length} ferramentas para o usuário escolher.`,
        }
      },
    }),
  })
}
