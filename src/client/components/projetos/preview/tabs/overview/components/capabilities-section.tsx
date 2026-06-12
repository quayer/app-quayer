"use client"

/**
 * CapabilitiesSection — resumo "O que o agente faz" na Overview (FR-06/07).
 *
 * Decisão de UX: a Overview orienta, não configura. Linhas:
 *   - Conhecimento — SEMPRE ativo, sem toggle, link p/ a tab Conhecimento (FR-07).
 *   - Transferir   — `builderState.handoff.mode`; proposta de nicho regulado
 *                    (`capturedProposals.handoff`) = badge + reason.
 *   - Preços       — `pricing.items` + `disclosureStyle`.
 *   - Agenda       — `handoff.alsoSchedule` + `calendarConnected`.
 *   - Fotos        — `mediaImagesCount` + `sourceImagesCount` (Mídias/fontes).
 *   - Integrações  — `customTools` (empty state).
 *
 * Estados derivam do builderState do readiness + getCapabilities. A seção não
 * abre formulários inline: ações reabrem o card no chat ou levam para a tab dona
 * do detalhe. Assim a Overview permanece painel de decisão, não cockpit.
 */

import * as React from "react"
import {
  BookOpenText,
  CalendarClock,
  Headset,
  Image as ImageIcon,
  Plug,
  Tag,
} from "lucide-react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type {
  BuilderState,
  HandoffMode,
} from "@/server/ai-module/builder/cards/builder-state"
import {
  deriveCalendarToolChanges,
  deriveHandoffToolChanges,
  derivePricingToolChanges,
} from "@/server/ai-module/builder/deploy/enabled-tools-derivation.pure"
import type { PreviewTab } from "@/client/components/projetos/types"
import type { CardKey } from "@/client/components/projetos/chat/cards/types"

import {
  CapabilityRow,
  useCapabilities,
} from "./capabilities-helpers"

// ── "O que o agente vai saber fazer" (pure-fn driven, T27) ──────────────────

function handoffSummary(mode: HandoffMode | undefined): string {
  const change = deriveHandoffToolChanges({ mode, steps: [] })
  return change.ensure.includes("transfer_to_human")
    ? "O agente transfere o atendimento para uma pessoa quando precisar."
    : "O agente responde sozinho — não passa o atendimento para humano."
}

function pricingSummary(pricing: BuilderState["pricing"]): string {
  const change = derivePricingToolChanges({
    activeItemCount: pricing.items.length,
    disclosureStyle: pricing.disclosureStyle,
  })
  return change.ensure.includes("get_pricing")
    ? "O agente informa os preços da sua tabela durante a conversa."
    : "O agente NÃO fala preços (sem tabela ou divulgação desligada)."
}

function calendarSummary(alsoSchedule: boolean, connected: boolean): string {
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

// ── Section ──────────────────────────────────────────────────────────────

export interface CapabilitiesSectionProps {
  projectId: string
  builderState: BuilderState
  tokens: AppTokens
  onTabChange?: (tab: PreviewTab) => void
}

export function CapabilitiesSection({
  projectId,
  builderState,
  tokens,
  onTabChange,
}: CapabilitiesSectionProps) {
  const caps = useCapabilities(projectId)

  const handoff = builderState.handoff
  const pricing = builderState.pricing
  const proposedHandoff = builderState.capturedProposals?.handoff

  const handoffActive = handoff.mode !== undefined && handoff.mode !== "nenhum"
  const pricingActive =
    pricing.items.length > 0 && pricing.disclosureStyle !== "none"
  const calendarConnected = caps.data?.calendarConnected === true
  const calendarActive = handoff.alsoSchedule || calendarConnected
  const mediaCount = caps.data?.mediaImagesCount ?? 0
  const sourceImagesCount = caps.data?.sourceImagesCount ?? 0
  const sourceImagesPendingCount = caps.data?.sourceImagesPendingCount ?? 0
  const customTools = caps.data?.customTools ?? []
  const hasExtractedImages = sourceImagesCount > 0
  const photosActive = mediaCount > 0 || hasExtractedImages
  const photosStatusLabel =
    mediaCount > 0
      ? "Ativo"
      : hasExtractedImages
        ? sourceImagesPendingCount > 0
          ? "Para revisar"
          : "Aprovadas"
        : "Vazio"
  const photosSummary =
    mediaCount > 0
      ? `O agente pode enviar ${mediaCount} ${mediaCount === 1 ? "foto confirmada" : "fotos confirmadas"} do catálogo.`
      : hasExtractedImages
        ? sourceImagesPendingCount > 0
          ? `Encontrei ${sourceImagesCount} ${sourceImagesCount === 1 ? "foto" : "fotos"} nas fontes. Revise no card de Fontes para liberar o envio.`
          : `${sourceImagesCount} ${sourceImagesCount === 1 ? "foto aprovada" : "fotos aprovadas"} nas fontes. Elas entram no catálogo do agente na publicação.`
        : "Nenhuma foto encontrada ainda. Adicione fotos manualmente na aba Mídias."

  const reopenCard = React.useCallback((cardKey: CardKey) => {
    if (typeof window === "undefined") return
    window.dispatchEvent(
      new CustomEvent("builder:reopen-card", {
        detail: { cardKey },
      }),
    )
    window.dispatchEvent(new CustomEvent("builder:focus-chat"))
  }, [])

  return (
    <section aria-label="O que o agente faz" className="flex flex-col gap-3">
      <h2
        className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: tokens.textSecondary }}
      >
        O que o agente faz
      </h2>

      {/* Conhecimento — SEMPRE ativo, sem toggle (FR-07). */}
      <CapabilityRow
        tokens={tokens}
        icon={<BookOpenText className="h-4 w-4" />}
        title="Conhecimento"
        summary="O agente sempre responde com base no que sabe do seu negócio. Sempre ativo."
        status={{ label: "Sempre ativo", active: true }}
        action={{ label: "Abrir", onClick: () => onTabChange?.("knowledge") }}
      />

      {/* Transferir para humano. */}
      <CapabilityRow
        tokens={tokens}
        icon={<Headset className="h-4 w-4" />}
        title="Transferir para humano"
        summary={handoffSummary(handoff.mode)}
        status={{ label: handoffActive ? "Ativo" : "Desligado", active: handoffActive }}
        badge={
          !handoffActive && proposedHandoff?.mode ? "Sugerido para seu nicho" : undefined
        }
        action={{
          label: handoffActive ? "Ajustar" : "Ativar",
          onClick: () => reopenCard("handoff"),
        }}
      />

      {/* Preços. */}
      <CapabilityRow
        tokens={tokens}
        icon={<Tag className="h-4 w-4" />}
        title="Preços"
        summary={pricingSummary(pricing)}
        status={{ label: pricingActive ? "Ativo" : "Desligado", active: pricingActive }}
        action={{
          label: pricingActive ? "Ajustar" : "Configurar",
          onClick: () => reopenCard("pricing"),
        }}
      />

      {/* Agenda. */}
      <CapabilityRow
        tokens={tokens}
        icon={<CalendarClock className="h-4 w-4" />}
        title="Agenda"
        summary={calendarSummary(handoff.alsoSchedule, calendarConnected)}
        status={{
          label: calendarConnected ? "Conectada" : calendarActive ? "Ativa" : "Desligada",
          active: calendarActive,
        }}
        action={{
          label: calendarActive ? "Ajustar" : "Ativar",
          onClick: () => reopenCard("calendar_connect"),
        }}
      />

      {/* Fotos. */}
      <CapabilityRow
        tokens={tokens}
        icon={<ImageIcon className="h-4 w-4" />}
        title="Fotos"
        summary={photosSummary}
        status={{ label: photosStatusLabel, active: photosActive }}
        action={{
          label: sourceImagesPendingCount > 0 ? "Revisar" : "Abrir",
          onClick: () => onTabChange?.("media"),
        }}
      />

      {/* Integrações (custom tools). */}
      <CapabilityRow
        tokens={tokens}
        icon={<Plug className="h-4 w-4" />}
        title="Integrações"
        summary={
          customTools.length > 0
            ? `${customTools.length} ${customTools.length === 1 ? "integração conectada" : "integrações conectadas"}.`
            : "Nenhuma integração. Peça ao assistente para conectar uma ferramenta externa."
        }
        status={{ label: customTools.length > 0 ? "Ativo" : "Vazio", active: customTools.length > 0 }}
        action={{
          label: customTools.length > 0 ? "Abrir" : "Conectar",
          onClick: () => onTabChange?.("advanced"),
        }}
      />
    </section>
  )
}
