"use client"

/** Overview: capacidades derivadas do readiness + getCapabilities. */

import * as React from "react"
import {
  AlertTriangle,
  BookOpenText,
  CalendarClock,
  Headset,
  Image as ImageIcon,
  Plug,
  Send,
  Tag,
} from "lucide-react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type {
  BuilderState,
  HandoffMode,
} from "@/server/ai-module/builder/cards/builder-state"
import type { PreviewTab } from "@/client/components/projetos/types"

import {
  CapabilityRow,
  useCapabilities,
} from "./capabilities-helpers"
import { CapabilitiesErrorAlert } from "./capabilities-error-alert"
import { CapabilityToggleRow } from "./capability-toggle-row"
import { RecommendationRow } from "./recommendation-row"
import { AgendaInlineConfig } from "./agenda-inline-config"
import {
  calendarSummary,
  emitCapabilityToggled,
  emitExternalToolRequest,
  EXTERNAL_TOOL_SHORTCUTS,
  handoffPayload,
  handoffSummary,
  isIntegrationBuilderFlagOn,
  photosCapabilityState,
  pricingSummary,
  proactiveSummary,
  recommendationTargetCard,
  reopenBuilderCard,
  submitSilentCard,
  type SilentCardKey,
  type ToggleSlot,
} from "./capabilities-section.logic"

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
  const { data: capabilities, refetch: refetchCapabilities } =
    useCapabilities(projectId)
  const [pending, setPending] = React.useState<ToggleSlot | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [agendaExpanded, setAgendaExpanded] = React.useState(false)

  const handoff = builderState.handoff
  const pricing = builderState.pricing
  const proposedHandoff = builderState.capturedProposals?.handoff
  const proactive = builderState.proactive
  const [proactiveExpanded, setProactiveExpanded] = React.useState(false)

  // FR-PRO-01 (F1) — a capacidade está ativa quando QUALQUER um dos 3 presets liga.
  const proactiveActive =
    proactive?.followUp === true ||
    proactive?.reminders === true ||
    proactive?.importantDates === true

  const handoffActive = handoff.mode !== undefined && handoff.mode !== "nenhum"
  const pricingActive =
    pricing.items.length > 0 && pricing.disclosureStyle !== "none"
  const calendarConnected = capabilities?.calendarConnected === true
  const calendarActive = handoff.alsoSchedule
  const mediaCount = capabilities?.mediaImagesCount ?? 0
  const sourceImagesCount = capabilities?.sourceImagesCount ?? 0
  const sourceImagesPendingCount = capabilities?.sourceImagesPendingCount ?? 0
  const customTools = capabilities?.customTools ?? []
  // FR-50 (#11/#13) — entrada de ferramentas externas só aparece com a flag ON
  // (dark caso contrário). Resolvida uma vez; não muda em runtime.
  const integrationBuilderOn = isIntegrationBuilderFlagOn()
  const recommendations = capabilities?.recommendations ?? []
  // FR-09: esconde uma sugestão cuja capacidade JÁ está ativa (o toggle abaixo já
  // decide o mesmo) — sugestão e toggle nunca coexistem para a mesma capacidade.
  const visibleRecommendations = recommendations.filter((rec) => {
    const target = recommendationTargetCard(rec.id)
    if (target === "handoff") return !handoffActive
    if (target === "calendar_connect") return !calendarActive
    if (target === "pricing") return !pricingActive
    return true
  })
  const photos = photosCapabilityState({
    mediaCount,
    sourceImagesCount,
    sourceImagesPendingCount,
  })

  const persist = React.useCallback(
    async (
      slot: ToggleSlot,
      cardKey: SilentCardKey,
      payload: Record<string, unknown>,
      message: string,
    ) => {
      setPending(slot)
      setError(null)
      try {
        await submitSilentCard(projectId, cardKey, payload)
        emitCapabilityToggled(message)
        refetchCapabilities()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro desconhecido.")
        throw err
      } finally {
        setPending(null)
      }
    },
    [projectId, refetchCapabilities],
  )

  const toggleHandoff = React.useCallback(
    (checked: boolean) => {
      const nextMode: HandoffMode = checked
        ? handoffActive
          ? (handoff.mode as HandoffMode)
          : (proposedHandoff?.mode ?? "solo")
        : "nenhum"
      void persist(
        "handoff",
        "handoff",
        handoffPayload(handoff, nextMode, handoff.alsoSchedule),
        checked
          ? "✓ Transferência para humano ativada"
          : "✓ Transferência para humano desativada",
      )
    },
    [handoff, handoffActive, persist, proposedHandoff?.mode],
  )

  const togglePricing = React.useCallback(
    (checked: boolean) => {
      if (checked && pricing.items.length === 0) {
        reopenBuilderCard("pricing")
        return
      }

      const disclosureStyle = checked
        ? pricing.disclosureStyle === "none"
          ? "exact"
          : pricing.disclosureStyle
        : "none"

      void persist(
        "pricing",
        "pricing",
        {
          items: pricing.items,
          currency: pricing.currency,
          disclosureStyle,
          ...(pricing.minTicketCents !== undefined
            ? { minTicketCents: pricing.minTicketCents }
            : {}),
        },
        checked ? "✓ Preços ativados" : "✓ Preços desativados",
      )
    },
    [persist, pricing],
  )

  const toggleAgenda = React.useCallback(
    (checked: boolean) => {
      setAgendaExpanded(checked)
      void persist(
        "agenda",
        "handoff",
        handoffPayload(handoff, handoff.mode ?? "nenhum", checked),
        checked ? "✓ Agenda ativada" : "✓ Agenda desativada",
      )
    },
    [handoff, persist],
  )

  const handleAgendaVerified = React.useCallback(
    async (connectionId: string | undefined) => {
      await persist(
        "calendar_connect",
        "calendar_connect",
        {
          ...(connectionId ? { connectionId } : {}),
          status: "connected",
        },
        "✓ Agenda conectada",
      )
    },
    [persist],
  )

  // FR-PRO-01 (F1) — persiste os 3 presets da capacidade "Mensagens proativas"
  // (toggle silencioso, FR-29). Os 3 booleans sempre viajam juntos (last-write-wins
  // do subtree no handler `applyProactive`).
  const persistProactive = React.useCallback(
    (next: { followUp: boolean; reminders: boolean; importantDates: boolean }) => {
      const anyOn = next.followUp || next.reminders || next.importantDates
      void persist(
        "proactive",
        "proactive",
        next,
        anyOn
          ? "✓ Mensagens proativas ativadas"
          : "✓ Mensagens proativas desativadas",
      )
    },
    [persist],
  )

  const toggleProactive = React.useCallback(
    (checked: boolean) => {
      setProactiveExpanded(checked)
      // Ligar com tudo OFF não faz sentido — liga o preset principal (follow-up).
      // Desligar zera os 3.
      persistProactive(
        checked
          ? {
              followUp: proactiveActive ? proactive?.followUp === true : true,
              reminders: proactiveActive ? proactive?.reminders === true : false,
              importantDates: proactiveActive
                ? proactive?.importantDates === true
                : false,
            }
          : { followUp: false, reminders: false, importantDates: false },
      )
    },
    [persistProactive, proactive, proactiveActive],
  )

  const toggleProactivePreset = React.useCallback(
    (preset: "followUp" | "reminders" | "importantDates", checked: boolean) => {
      persistProactive({
        followUp: proactive?.followUp === true,
        reminders: proactive?.reminders === true,
        importantDates: proactive?.importantDates === true,
        [preset]: checked,
      })
    },
    [persistProactive, proactive],
  )

  return (
    <section aria-label="O que o agente faz" className="flex flex-col gap-3">
      <h2
        className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: tokens.textSecondary }}
      >
        O que o agente faz
      </h2>

      {error ? <CapabilitiesErrorAlert message={error} tokens={tokens} /> : null}

      {visibleRecommendations.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p
            className="px-1 text-[11px] leading-relaxed"
            style={{ color: tokens.textTertiary }}
          >
            Com base na missão e no nicho, sugerimos estas capacidades. Aceitar
            abre o ajuste — nada é ligado sozinho.
          </p>
          {visibleRecommendations.map((rec) => {
            const targetCard = recommendationTargetCard(rec.id)
            return (
              <RecommendationRow
                key={rec.id}
                recommendation={rec}
                tokens={tokens}
                onConfigure={
                  targetCard
                    ? () => reopenBuilderCard(targetCard)
                    : undefined
                }
              />
            )
          })}
        </div>
      ) : null}

      <CapabilityRow
        tokens={tokens}
        icon={<BookOpenText className="h-4 w-4" />}
        title="Conhecimento"
        summary="O agente sempre responde com base no que sabe do seu negócio. Sempre ativo."
        status={{ label: "Sempre ativo", active: true }}
        action={{ label: "Abrir", onClick: () => onTabChange?.("knowledge") }}
      />

      <CapabilityToggleRow
        tokens={tokens}
        icon={<Headset className="h-4 w-4" />}
        title="Transferir para humano"
        summary={handoffSummary(handoff.mode)}
        status={{ label: handoffActive ? "Ativo" : "Desligado", active: handoffActive }}
        checked={handoffActive}
        onCheckedChange={toggleHandoff}
        busy={pending === "handoff"}
        badge={
          !handoffActive && proposedHandoff?.mode ? "Sugerido para seu nicho" : undefined
        }
        action={{
          label: handoffActive ? "Ajustar" : "Ativar",
          onClick: () => reopenBuilderCard("handoff"),
        }}
      />

      <CapabilityToggleRow
        tokens={tokens}
        icon={<Tag className="h-4 w-4" />}
        title="Preços"
        summary={pricingSummary(pricing)}
        status={{ label: pricingActive ? "Ativo" : "Desligado", active: pricingActive }}
        checked={pricingActive}
        onCheckedChange={togglePricing}
        busy={pending === "pricing"}
        action={{
          label: pricingActive ? "Ajustar" : "Configurar",
          onClick: () => reopenBuilderCard("pricing"),
        }}
      />

      <CapabilityToggleRow
        tokens={tokens}
        icon={<CalendarClock className="h-4 w-4" />}
        title="Agenda"
        summary={calendarSummary(handoff.alsoSchedule, calendarConnected)}
        status={{
          label: calendarActive
            ? calendarConnected
              ? "Conectada"
              : "Ativa"
            : "Desligada",
          active: calendarActive,
        }}
        checked={calendarActive}
        onCheckedChange={toggleAgenda}
        busy={pending === "agenda" || pending === "calendar_connect"}
        action={{
          label: calendarActive ? "Configurar" : "Ativar",
          onClick: () => {
            if (calendarActive) {
              setAgendaExpanded((value) => !value)
              return
            }
            toggleAgenda(true)
          },
        }}
      >
        {agendaExpanded || calendarActive ? (
          <AgendaInlineConfig
            projectId={projectId}
            tokens={tokens}
            disabled={pending !== null}
            calendarConnected={calendarConnected}
            onVerifiedConnected={handleAgendaVerified}
          />
        ) : null}
      </CapabilityToggleRow>

      <CapabilityRow
        tokens={tokens}
        icon={<ImageIcon className="h-4 w-4" />}
        title="Fotos"
        summary={photos.summary}
        status={{ label: photos.statusLabel, active: photos.active }}
        action={{
          label: sourceImagesPendingCount > 0 ? "Revisar" : "Abrir",
          onClick: () => onTabChange?.("media"),
        }}
      />

      <CapabilityToggleRow
        tokens={tokens}
        icon={<Send className="h-4 w-4" />}
        title="Mensagens proativas"
        summary={proactiveSummary(proactive)}
        status={{
          label: proactiveActive ? "Ativo" : "Desligado",
          active: proactiveActive,
        }}
        checked={proactiveActive}
        onCheckedChange={toggleProactive}
        busy={pending === "proactive"}
        action={{
          label: proactiveActive ? "Ajustar" : "Ativar",
          onClick: () => {
            if (proactiveActive) {
              setProactiveExpanded((value) => !value)
              return
            }
            toggleProactive(true)
          },
        }}
      >
        {proactiveExpanded || proactiveActive ? (
          <div className="flex flex-col gap-3">
            <ProactivePresetCheckbox
              tokens={tokens}
              label="Follow-up de lead parado"
              description="Retoma contato com quem parou de responder."
              checked={proactive?.followUp === true}
              disabled={pending !== null}
              onChange={(v) => toggleProactivePreset("followUp", v)}
            />
            <ProactivePresetCheckbox
              tokens={tokens}
              label="Lembretes de agenda"
              description="Lembra o cliente de visita, consulta ou reunião marcada."
              checked={proactive?.reminders === true}
              disabled={pending !== null}
              onChange={(v) => toggleProactivePreset("reminders", v)}
            />
            <ProactivePresetCheckbox
              tokens={tokens}
              label="Datas importantes"
              description="Age em datas como aniversário ou renovação."
              checked={proactive?.importantDates === true}
              disabled={pending !== null}
              onChange={(v) => toggleProactivePreset("importantDates", v)}
            />
            {proactiveActive ? (
              <div
                className="flex items-start gap-2 rounded-md border px-3 py-2 text-[11px] leading-relaxed"
                style={{
                  borderColor: tokens.warning,
                  backgroundColor: tokens.warningSubtle,
                  color: tokens.warningText,
                }}
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Envios fora da janela de 24h do WhatsApp exigirão um template
                  aprovado.
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </CapabilityToggleRow>

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

      {integrationBuilderOn ? (
        <ConnectExternalToolCta tokens={tokens} onOpenAdvanced={() => onTabChange?.("advanced")} />
      ) : null}
    </section>
  )
}

/**
 * FR-50 (#11/#13) — ponto de ENTRADA para o usuário pedir uma ferramenta/integração
 * externa. Reusa o Integration Builder existente: cada atalho de negócio (FR-49)
 * preenche o chat com uma mensagem pronta via `builder:focus-chat` (o mesmo canal
 * do `IntegrationTemplatePicker`) para o usuário enviar e o meta-agente chamar
 * `propose_integration`. NÃO grava tool (FR-09). Também oferece abrir a aba
 * 'advanced' (IntegrationsSection). Renderiza só com a flag ON (gate no pai).
 */
function ConnectExternalToolCta({
  tokens,
  onOpenAdvanced,
}: {
  tokens: AppTokens
  onOpenAdvanced: () => void
}) {
  return (
    <div
      className="rounded-lg border border-dashed p-3"
      style={{ borderColor: tokens.divider, backgroundColor: tokens.bgSurface }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: tokens.hoverBg, color: tokens.textTertiary }}
          aria-hidden="true"
        >
          <Plug className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold" style={{ color: tokens.textPrimary }}>
            Conectar ferramenta externa
          </p>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: tokens.textSecondary }}>
            Diga o que você quer conectar e o assistente monta a integração com você.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {EXTERNAL_TOOL_SHORTCUTS.map((shortcut) => (
              <button
                key={shortcut.id}
                type="button"
                onClick={() => emitExternalToolRequest(shortcut.message)}
                className="inline-flex min-h-7 items-center rounded-full border px-2.5 text-[12px] font-medium transition-colors"
                style={{
                  borderColor: tokens.divider,
                  color: tokens.textSecondary,
                  backgroundColor: tokens.bgBase,
                }}
              >
                {shortcut.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onOpenAdvanced}
            className="mt-2.5 inline-flex items-center text-[12px] font-medium transition-colors"
            style={{ color: tokens.brandText }}
          >
            Ver conectores prontos
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * FR-PRO-01 (F1) — um preset (sub-checkbox) da capacidade "Mensagens proativas".
 * Persiste via o mesmo toggle silencioso da row pai (FR-29).
 */
function ProactivePresetCheckbox({
  tokens,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  tokens: AppTokens
  label: string
  description: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label
      className="flex cursor-pointer items-start gap-2.5"
      style={{ opacity: disabled ? 0.6 : 1 }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded"
        style={{ accentColor: tokens.brand }}
      />
      <span className="min-w-0 flex-1">
        <span
          className="block text-[12px] font-medium"
          style={{ color: tokens.textPrimary }}
        >
          {label}
        </span>
        <span
          className="block text-[11px] leading-relaxed"
          style={{ color: tokens.textTertiary }}
        >
          {description}
        </span>
      </span>
    </label>
  )
}
