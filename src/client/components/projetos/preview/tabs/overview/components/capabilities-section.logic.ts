"use client"

import type {
  BuilderState,
  HandoffMode,
} from "@/server/ai-module/builder/cards/builder-state"
import {
  deriveCalendarToolChanges,
  deriveHandoffToolChanges,
  derivePricingToolChanges,
} from "@/server/ai-module/builder/deploy/enabled-tools-derivation.pure"
import type { CardKey } from "@/client/components/projetos/chat/cards/types"
import { fetchWithAuthRetry } from "@/lib/auth/client-refresh"

export type ToggleSlot =
  | "handoff"
  | "pricing"
  | "agenda"
  | "calendar_connect"
  | "proactive"
export type SilentCardKey = Extract<
  CardKey,
  "handoff" | "pricing" | "calendar_connect" | "proactive"
>

export function handoffSummary(mode: HandoffMode | undefined): string {
  const change = deriveHandoffToolChanges({ mode, steps: [] })
  return change.ensure.includes("transfer_to_human")
    ? "O agente transfere o atendimento para uma pessoa quando precisar."
    : "O agente responde sozinho — não passa o atendimento para humano."
}

export function pricingSummary(pricing: BuilderState["pricing"]): string {
  const change = derivePricingToolChanges({
    activeItemCount: pricing.items.length,
    disclosureStyle: pricing.disclosureStyle,
  })
  return change.ensure.includes("get_pricing")
    ? "O agente informa os preços da sua tabela durante a conversa."
    : "O agente NÃO fala preços (sem tabela ou divulgação desligada)."
}

export function calendarSummary(
  alsoSchedule: boolean,
  connected: boolean,
): string {
  const change = deriveCalendarToolChanges({
    alsoSchedule,
    hasActiveConnection: connected,
  })
  if (change.ensure.includes("check_availability")) {
    return "O agente marca horários direto na sua agenda conectada."
  }
  if (change.ensure.includes("schedule_appointment")) {
    return "O agente registra o interesse e te avisa (agenda ainda não conectada)."
  }
  return "O agente não agenda compromissos."
}

/**
 * FR-PRO-01 (F1) — resumo em linguagem de negócio (FR-49) da capacidade
 * "Mensagens proativas" a partir dos 3 presets. Sem envio em F1 (design-time).
 */
export function proactiveSummary(proactive: BuilderState["proactive"]): string {
  const on: string[] = []
  if (proactive?.followUp) on.push("retoma leads parados")
  if (proactive?.reminders) on.push("lembra de compromissos")
  if (proactive?.importantDates) on.push("age em datas importantes")
  if (on.length === 0) {
    return "O agente é reativo — só responde a quem escreve. Ligue para o agente tomar a iniciativa."
  }
  return `O agente toma a iniciativa: ${on.join(", ")}.`
}

export function photosCapabilityState(args: {
  mediaCount: number
  sourceImagesCount: number
  sourceImagesPendingCount: number
}) {
  const { mediaCount, sourceImagesCount, sourceImagesPendingCount } = args
  const hasExtractedImages = sourceImagesCount > 0
  const active = mediaCount > 0 || hasExtractedImages
  const statusLabel =
    mediaCount > 0
      ? "Ativo"
      : hasExtractedImages
        ? sourceImagesPendingCount > 0
          ? "Para revisar"
          : "Aprovadas"
        : "Vazio"
  const summary =
    mediaCount > 0
      ? `O agente pode enviar ${mediaCount} ${mediaCount === 1 ? "foto confirmada" : "fotos confirmadas"} do catálogo.`
      : hasExtractedImages
        ? sourceImagesPendingCount > 0
          ? `Encontrei ${sourceImagesCount} ${sourceImagesCount === 1 ? "foto" : "fotos"} nas fontes. Revise no card de Fontes para liberar o envio.`
          : `${sourceImagesCount} ${sourceImagesCount === 1 ? "foto aprovada" : "fotos aprovadas"} nas fontes. Elas entram no catálogo do agente na publicação.`
        : "Nenhuma foto encontrada ainda. Adicione fotos manualmente na aba Mídias."
  return { active, statusLabel, summary }
}

export async function submitSilentCard(
  projectId: string,
  cardKey: SilentCardKey,
  payload: Record<string, unknown>,
): Promise<void> {
  const res = await fetchWithAuthRetry(
    `/api/v1/builder/projects/${projectId}/cards/${cardKey}/submit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardKey, ...payload, ackMode: "silent" }),
    },
    { notifyOnAuthFailure: true },
  )

  if (res.ok) return
  throw new Error(`Não foi possível salvar a capacidade (${res.status}).`)
}

export function emitCapabilityToggled(message: string): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent("builder:capability-toggled", {
      detail: { message },
    }),
  )
}

// ── Conectar ferramenta externa (#11/#13, FR-50) ────────────────────────────

/**
 * Flag client-side do Integration Builder (espelha `integrations-section.tsx`).
 * Lida como liga/desliga: a resolução percentual NÃO é possível neste contexto
 * (o wire da WorkspaceProject não carrega `organizationId`), então `percentage:N`
 * conta como ON aqui — o gate autoritativo por org continua nas rotas do servidor.
 * Com a flag OFF, a entrada de ferramentas externas fica escura (dark).
 */
export function isIntegrationBuilderFlagOn(): boolean {
  const raw = (process.env.NEXT_PUBLIC_INTEGRATION_BUILDER ?? "off").trim()
  return raw !== "off"
}

/**
 * Atalho de negócio (FR-49) que ENTRA no Integration Builder existente. Cada um
 * só ROTEIA o usuário (FR-09: é pedido, não decisão): preenche o chat com uma
 * mensagem pronta para o usuário enviar, e o meta-agente chama `propose_integration`.
 * NUNCA grava tool aqui.
 */
export interface ExternalToolShortcut {
  /** Id estável (telemetria/`key` de render). */
  id: "crm_lead" | "webhook_api" | "other"
  /** Rótulo curto em linguagem de negócio. */
  label: string
  /** Mensagem pré-pronta despachada para o chat (o usuário envia). */
  message: string
}

/**
 * Os 2-3 atalhos de entrada da seção Capacidades → Integration Builder.
 * Pura (testável): a row apenas mapeia isto para botões.
 */
export const EXTERNAL_TOOL_SHORTCUTS: readonly ExternalToolShortcut[] = [
  {
    id: "crm_lead",
    label: "Enviar lead pro CRM",
    message:
      "Quero conectar minha ferramenta externa: enviar os leads do atendimento para o meu CRM.",
  },
  {
    id: "webhook_api",
    label: "Chamar API/webhook",
    message:
      "Quero conectar minha ferramenta externa: chamar uma API/webhook do meu sistema durante o atendimento.",
  },
  {
    id: "other",
    label: "Outra ferramenta",
    message: "Quero conectar minha ferramenta externa: ",
  },
]

/**
 * Roteia um pedido de ferramenta externa para o Integration Builder via o MESMO
 * canal `builder:focus-chat` que o `IntegrationTemplatePicker` já usa: preenche
 * o input do chat com a mensagem pronta e foca a conversa. NÃO auto-envia — o
 * usuário revisa/edita antes de mandar (especialmente o atalho "Outra", que
 * deixa o alvo em aberto). FR-09: entrada/pedido, nunca decisão.
 */
export function emitExternalToolRequest(message: string): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent("builder:focus-chat", { detail: { message } }),
  )
}

export function reopenBuilderCard(cardKey: CardKey): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent("builder:reopen-card", { detail: { cardKey } }),
  )
  window.dispatchEvent(new CustomEvent("builder:focus-chat"))
}

/**
 * Mapeia uma tool recomendada (FR-51) para o card de DOMÍNIO que decide aquela
 * capacidade. É o trilho do FR-52/FR-09: aceitar uma sugestão NUNCA grava a tool —
 * só reabre o card existente (mesmo `reopenBuilderCard` dos toggles). Tools sem
 * card próprio (create_lead/create_followup/calculator) retornam `null` e a
 * sugestão fica INFORMATIVA, sem CTA acionável (não inventamos segunda decisão).
 */
export function recommendationTargetCard(toolId: string): CardKey | null {
  switch (toolId) {
    case "transfer_to_human":
      return "handoff"
    case "check_availability":
    case "create_event":
      return "calendar_connect"
    default:
      return null
  }
}

export function handoffPayload(
  handoff: BuilderState["handoff"],
  mode: HandoffMode,
  alsoSchedule: boolean,
): Record<string, unknown> {
  return {
    mode,
    alsoSchedule,
    steps: handoff.steps,
    members: handoff.members,
    ...(handoff.departmentName ? { departmentName: handoff.departmentName } : {}),
    ...(handoff.departmentType ? { departmentType: handoff.departmentType } : {}),
    ...(handoff.openingMessage ? { openingMessage: handoff.openingMessage } : {}),
  }
}
