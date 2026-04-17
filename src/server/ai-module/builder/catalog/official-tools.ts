export interface OfficialTool {
  name: string
  description: string
  phase: 'v1' | 'v1.5' | 'v2'
  type: 'builtin' | 'official' | 'custom'
  status: 'available' | 'backlog'
}

export const OFFICIAL_TOOLS: OfficialTool[] = [
  // v1 — available
  {
    name: 'transfer_to_human',
    description: 'Bloqueia IA e transfere conversa para atendente humano',
    phase: 'v1',
    type: 'builtin',
    status: 'available',
  },
  {
    name: 'create_followup',
    description: 'Agenda follow-up proativo via BullMQ',
    phase: 'v1',
    type: 'builtin',
    status: 'available',
  },
  {
    name: 'notify_team',
    description: 'Notifica equipe sem pausar IA',
    phase: 'v1',
    type: 'builtin',
    status: 'available',
  },
  {
    name: 'detect_talking_to_ai',
    description: 'Detecta se contato percebeu IA ou se e bot/spam',
    phase: 'v1',
    type: 'builtin',
    status: 'available',
  },
  {
    name: 'create_lead',
    description: 'Registra lead no CRM',
    phase: 'v1',
    type: 'builtin',
    status: 'available',
  },
  {
    name: 'search_contacts',
    description: 'Busca contatos da organizacao',
    phase: 'v1',
    type: 'builtin',
    status: 'available',
  },
  {
    name: 'get_session_history',
    description: 'Historico da sessao atual',
    phase: 'v1',
    type: 'builtin',
    status: 'available',
  },
  // v1.5 — backlog
  {
    name: 'check_availability',
    description: 'Consulta slots livres Google Calendar',
    phase: 'v1.5',
    type: 'official',
    status: 'backlog',
  },
  {
    name: 'create_event',
    description: 'Cria evento Google Calendar + Meet',
    phase: 'v1.5',
    type: 'official',
    status: 'backlog',
  },
  {
    name: 'cancel_event',
    description: 'Cancela agendamento Google Calendar',
    phase: 'v1.5',
    type: 'official',
    status: 'backlog',
  },
  {
    name: 'create_funnel_tabulation',
    description: 'Registra etapa do funil de vendas',
    phase: 'v1.5',
    type: 'builtin',
    status: 'backlog',
  },
  {
    name: 'dispatch_to_agent',
    description: 'Distribui conversa para atendente via roleta',
    phase: 'v1.5',
    type: 'builtin',
    status: 'backlog',
  },
]

/**
 * Returns only tools with status 'available'.
 */
export function getAvailableTools(): OfficialTool[] {
  return OFFICIAL_TOOLS.filter((tool) => tool.status === 'available')
}

/**
 * Returns the description of a tool by name, or null if not found.
 */
export function getToolDescription(name: string): string | null {
  const tool = OFFICIAL_TOOLS.find((t) => t.name === name)
  return tool?.description ?? null
}
