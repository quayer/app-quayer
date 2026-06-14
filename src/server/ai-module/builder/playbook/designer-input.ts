import type { BuilderState } from '../cards/builder-state'
import { getToolDescription } from '../catalog/official-tools'
import type { PlaybookDesignerInput } from '../sub-agents/playbook-designer'
import { resolveAgentStrategy } from './agent-strategy'
// FR-51/NFR-13 — inferência de nicho/risco extraída para o módulo puro
// compartilhado; este arquivo re-usa SEM duplicar a lógica.
import { compact, inferNiche, soldOutLimit } from './niche-inference.pure'

export { compact }

export interface BuildDesignerInputOptions {
  objective?: string
  niche?: string
  extraKnownLimits?: readonly string[]
}

export type SoldOutConversationStrategy =
  | 'interest_list'
  | 'human_confirm'
  | 'available_confirmed'

function unique(values: readonly (string | undefined)[]): string[] {
  return Array.from(
    new Set(values.map((v) => compact(v)).filter((v): v is string => Boolean(v))),
  )
}

export function hasSoldOutSourceSignal(state: BuilderState): boolean {
  const proposed = state.sourceIngestion.proposed
  return (
    soldOutLimit([
      state.identity.description,
      proposed?.description,
      ...(proposed?.services ?? []),
      ...(proposed?.differentiators ?? []),
    ]) !== undefined
  )
}

export function soldOutStrategyKnownLimit(
  strategy: SoldOutConversationStrategy,
  note?: string,
): string {
  const trimmedNote = compact(note, 300)
  const suffix = trimmedNote ? ` Observação do usuário: ${trimmedNote}` : ''

  switch (strategy) {
    case 'interest_list':
      return (
        'Direção definida pelo usuário para a fonte 100% vendida/esgotada: tratar o SDR como captação de lista de interesse, repescagem ou alternativas. Não oferecer compra imediata, visita ou unidade disponível como promessa.' +
        suffix
      )
    case 'human_confirm':
      return (
        'Direção definida pelo usuário para a fonte 100% vendida/esgotada: o agente deve qualificar o interesse e encaminhar para consultor confirmar disponibilidade antes de falar de visita, preço final ou unidade.' +
        suffix
      )
    case 'available_confirmed':
      return (
        'Direção definida pelo usuário: existe disponibilidade ou uma estratégia comercial confirmada fora da fonte pública. Ainda assim, não invente unidade, preço final ou visita específica sem dado cadastrado; qualifique e encaminhe quando necessário.' +
        suffix
      )
  }
}

export function buildDesignerInput(
  state: BuilderState,
  input: BuildDesignerInputOptions = {},
): PlaybookDesignerInput | null {
  const objective = compact(input.objective, 500) ?? compact(state.project.objective, 500)
  if (!objective) return null

  const niche = inferNiche(state, input.niche)
  const strategy = resolveAgentStrategy({
    role: state.mission?.role,
    objective: state.mission?.objective ?? objective,
    niche,
  })
  const proposed = state.sourceIngestion.proposed
  const differentiators = proposed?.differentiators ?? []
  const businessContext = unique([
    state.project.name ? `Negócio: ${state.project.name}` : undefined,
    state.identity.description || proposed?.description
      ? `Descrição: ${state.identity.description ?? proposed?.description}`
      : undefined,
    state.identity.address || proposed?.address
      ? `Endereço: ${state.identity.address ?? proposed?.address}`
      : undefined,
    proposed?.businessName ? `Nome detectado: ${proposed.businessName}` : undefined,
    proposed?.audience ? `Público-alvo: ${proposed.audience}` : undefined,
    differentiators.length > 0
      ? `Diferenciais detectados: ${differentiators.slice(0, 10).join('; ')}`
      : undefined,
    state.persona.tone ? `Tom desejado: ${state.persona.tone}` : undefined,
    state.hours.preset ? `Horário: ${state.hours.preset}` : undefined,
  ])

  const knownServices = unique([
    ...state.services.offered,
    ...(state.capturedProposals?.services?.offered ?? []),
    ...(proposed?.services ?? []),
  ])

  const knownLimits = unique([
    'O atendimento acontece pelo WhatsApp; o número do lead já é conhecido pelo canal. Não pergunte telefone como etapa de qualificação, salvo se o usuário pedir explicitamente outro número de contato.',
    ...(input.extraKnownLimits ?? []),
    ...state.services.notOffered,
    state.pricing.disclosureStyle === 'none'
      ? 'Não informar preços diretamente.'
      : undefined,
    state.handoff.mode === 'nenhum'
      ? 'Resolver sem transferir para humano por padrão.'
      : undefined,
    soldOutLimit([
      state.identity.description,
      proposed?.description,
      ...(proposed?.services ?? []),
      ...(proposed?.differentiators ?? []),
    ]),
  ])

  const capabilities = unique([
    ...state.selectedCapabilityKeys,
    ...state.selectedToolKeys,
    ...strategy.recommendedTools.map((toolKey) => {
      const description = getToolDescription(toolKey)
      return description
        ? `Ferramenta recomendada pelo playbook: ${toolKey} — ${description}`
        : `Ferramenta recomendada pelo playbook: ${toolKey}`
    }),
    state.handoff.mode && state.handoff.mode !== 'nenhum'
      ? `Transferir para humano: ${state.handoff.mode}`
      : undefined,
    state.pricing.items.length > 0 ? 'Responder sobre preços cadastrados' : undefined,
    state.calendar.connectionId ? 'Consultar agenda conectada' : undefined,
  ])

  return {
    objective,
    niche,
    businessContext,
    capabilities,
    knownServices,
    knownLimits,
  }
}
