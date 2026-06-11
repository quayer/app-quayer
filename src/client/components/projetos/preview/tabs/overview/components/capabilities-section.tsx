"use client"

/**
 * CapabilitiesSection — superfície de Capacidades na Overview (FR-06/07, T44/T45/T107).
 *
 * Decisão (plan §4.3): SEÇÃO da Overview, NÃO tab nova. Linhas:
 *   - Conhecimento — SEMPRE ativo, sem toggle, link p/ a tab Conhecimento (FR-07).
 *   - Transferir   — `builderState.handoff.mode`; proposta de nicho regulado
 *                    (`capturedProposals.handoff`) = badge + reason.
 *   - Preços       — `pricing.items` + `disclosureStyle`.
 *   - Agenda       — `handoff.alsoSchedule` + `calendarConnected` + share delegável (FR-34).
 *   - Fotos        — `mediaImagesCount` + `sourceImagesCount` (Mídias/fontes).
 *   - Integrações  — `customTools` (empty state).
 *
 * Estados derivam do builderState do readiness — ZERO fetch extra além do
 * getCapabilities (NFR-05). Ligar um toggle (T45/FR-29) EXPANDE inline o card e
 * submete pelo MESMO card-submit com `ackMode:'silent'` (flip sem turno LLM/SSE;
 * linha de sistema local no chat via `builder:capability-toggled`). As funções
 * PURAS de T27 dizem "o que o agente vai saber fazer" — sem 2ª fonte de verdade.
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

import { CalendarShareRow } from "./calendar-share-row"
import {
  CapabilityRow,
  InlineCard,
  useCapabilities,
  useSilentCardSubmit,
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
  const submitSilent = useSilentCardSubmit(projectId)
  const [openKey, setOpenKey] = React.useState<CardKey | null>(null)

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

  const toggle = React.useCallback((key: CardKey) => {
    setOpenKey((prev) => (prev === key ? null : key))
  }, [])

  return (
    <section aria-label="Capacidades do agente" className="flex flex-col gap-3">
      <h2
        className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: tokens.textSecondary }}
      >
        Capacidades
      </h2>

      {/* Conhecimento — SEMPRE ativo, sem toggle (FR-07). */}
      <CapabilityRow
        tokens={tokens}
        icon={<BookOpenText className="h-4 w-4" />}
        title="Conhecimento"
        summary="O agente sempre responde com base no que sabe do seu negócio. Sempre ativo."
        status={{ label: "Sempre ativo", active: true }}
        action={{ label: "Abrir Conhecimento", onClick: () => onTabChange?.("knowledge") }}
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
        expandable
        expanded={openKey === "handoff"}
        onToggle={() => toggle("handoff")}
      >
        {proposedHandoff?.reason && !handoffActive && (
          <p className="mb-3 text-[12px] leading-relaxed" style={{ color: tokens.textSecondary }}>
            {proposedHandoff.reason}
          </p>
        )}
        <InlineCard
          cardKey="handoff"
          builderState={builderState}
          projectId={projectId}
          tokens={tokens}
          onSilentSubmit={submitSilent}
        />
      </CapabilityRow>

      {/* Preços. */}
      <CapabilityRow
        tokens={tokens}
        icon={<Tag className="h-4 w-4" />}
        title="Preços"
        summary={pricingSummary(pricing)}
        status={{ label: pricingActive ? "Ativo" : "Desligado", active: pricingActive }}
        expandable
        expanded={openKey === "pricing"}
        onToggle={() => toggle("pricing")}
      >
        <InlineCard
          cardKey="pricing"
          builderState={builderState}
          projectId={projectId}
          tokens={tokens}
          onSilentSubmit={submitSilent}
        />
      </CapabilityRow>

      {/* Agenda — share delegável (FR-34) acima do card de conexão. */}
      <CapabilityRow
        tokens={tokens}
        icon={<CalendarClock className="h-4 w-4" />}
        title="Agenda"
        summary={calendarSummary(handoff.alsoSchedule, calendarConnected)}
        status={{
          label: calendarConnected ? "Conectada" : calendarActive ? "Ativa" : "Desligada",
          active: calendarActive,
        }}
        expandable
        expanded={openKey === "calendar_connect"}
        onToggle={() => toggle("calendar_connect")}
      >
        <div className="flex flex-col gap-4">
          <CalendarShareRow
            projectId={projectId}
            tokens={tokens}
            onConnected={() => caps.refetch()}
          />
          <InlineCard
            cardKey="calendar_connect"
            builderState={builderState}
            projectId={projectId}
            tokens={tokens}
            onSilentSubmit={submitSilent}
          />
        </div>
      </CapabilityRow>

      {/* Fotos. */}
      <CapabilityRow
        tokens={tokens}
        icon={<ImageIcon className="h-4 w-4" />}
        title="Fotos"
        summary={photosSummary}
        status={{ label: photosStatusLabel, active: photosActive }}
        action={{ label: "Abrir Mídias", onClick: () => onTabChange?.("media") }}
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
      />
    </section>
  )
}
