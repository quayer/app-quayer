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
  {
    key: 'qualified_handoff',
    title: 'Qualificar e encaminhar',
    description:
      'Coleta dados mínimos, registra o lead e pausa a IA para humano continuar.',
    toolKeys: ['create_lead', 'transfer_to_human'],
    icon: 'headphones',
    recommended: true,
    note:
      'Ideal para SDR: depois da qualificação, a conversa fica pronta para advogado, vendedor ou secretária assumir no painel.',
  },
  {
    key: 'department_dispatch',
    title: 'Encaminhar para departamento (roleta)',
    description:
      'Coloca a conversa na fila de um departamento e distribui automaticamente para o próximo atendente disponível (rodízio justo).',
    // Capacidade servida pela tool unificada transfer_to_human (routing:'department').
    toolKeys: ['transfer_to_human'],
    icon: 'headphones',
    recommended: false,
    note:
      'Diferente de "Qualificar e encaminhar": aqui o sistema escolhe QUAL pessoa do departamento recebe (round-robin) e atribui a conversa a ela. Requer departamentos cadastrados com membros.',
  },
  {
    key: 'team_alert',
    title: 'Avisar responsável',
    description:
      'Cria um alerta interno com resumo do lead sem necessariamente pausar a IA.',
    // Capacidade servida pela tool unificada transfer_to_human (pauseAI:false).
    toolKeys: ['transfer_to_human'],
    icon: 'bell',
    recommended: false,
    note:
      'Hoje a notificação aparece no sistema. Enviar esse resumo para outro WhatsApp exige uma ferramenta custom via webhook.',
  },
  {
    key: 'appointment_intent',
    title: 'Coletar pedido de agenda',
    description:
      'Registra data, horário e motivo quando o cliente pede consulta ou reunião.',
    toolKeys: ['schedule_appointment'],
    icon: 'calendar',
    recommended: false,
    note:
      'Registro simples de intenção (sem checar agenda). Para checar/criar/cancelar no Google Calendar, use "Agenda Google" abaixo.',
  },
  {
    key: 'google_calendar',
    title: 'Agenda Google (consultar e marcar)',
    description:
      'Consulta horários livres, cria eventos (com Google Meet) e cancela direto no Google Calendar conectado.',
    toolKeys: ['check_availability', 'create_event', 'cancel_event'],
    icon: 'calendar',
    recommended: false,
    note:
      'Requer conectar a agenda do profissional pelo link de conexão (aba Publicar → canais). Sem conexão, o agente avisa que a agenda não está conectada.',
  },
  {
    key: 'pricing_log',
    title: 'Registrar preços enviados',
    description:
      'Registra propostas ou valores mencionados pelo agente para rastreio.',
    toolKeys: ['send_pricing'],
    icon: 'tag',
    recommended: false,
    note:
      'Não recomendado por padrão para advocacia. Use só quando preço automático fizer sentido para o negócio.',
  },
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
          .optional()
          .describe(
            'Optional AIAgentConfig.id. Omit before agent creation; provide it when applying tools after create_agent.',
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
        return {
          success: true as const,
          agentId: input.agentId ?? null,
          reason: input.reason ?? null,
          tools: CATALOG,
          message: `Exibindo ${CATALOG.length} ferramentas para o usuário escolher.`,
        }
      },
    }),
  })
}
