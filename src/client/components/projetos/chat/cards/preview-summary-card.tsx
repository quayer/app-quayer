"use client"

/**
 * Builder Cards — preview_summary ("Tudo certo?") (Orayon Uplift, W3)
 *
 * Read-only recap of every confirmed BuilderState section (persona, services,
 * hours, pricing, handoff/calendar, activation) shown right before
 * publish. Each section carries an "Ajustar" link that REOPENS the matching
 * card pre-filled with the current value via `onAdjust(cardKey)` (FR-17,
 * jornada-builder-v2 — never a generic "pular" turn), and a single
 * "Tudo certo, publicar" button confirms the whole build.
 *
 * Contract (CARD CONTRACTS):
 *   cardKey      = 'preview_summary'
 *   submit       = {}                 (confirm-only — no owned fields)
 *   sentinel     = confirmations.summary  (gates deploy)
 *
 * Presentational only: reads `value` and calls `props.onSubmit({})` /
 * `props.onAdjust(cardKey)`. The chat-panel owns POST + SSE and the reopen
 * state (use-chat-stream `reopenedCardKey`). Styling matches the existing
 * chat-panel cards via `CardShell` + design tokens (no raw colors).
 *
 * Jornada v2 (T98, FR-31): para projetos `journeyVersion: 2` o componente
 * DELEGA para {@link SummaryV2} — um resumo por FASES + capacidades ATIVAS, sem
 * as seções fixas v1 que assumem preços/transferência obrigatórios. O caminho v1
 * abaixo fica byte-intocado (NFR-03): o branch acontece no topo do render.
 */

import type { ReactNode } from "react"

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Headset,
  ListChecks,
  MessageSquare,
  Sparkles,
  Tag,
} from "lucide-react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

import { CardShell } from "./card-shell"
import {
  computeSummaryWarnings,
  deriveActiveCapabilities,
  JOURNEY_V2_PHASE_TITLES,
  SUMMARY_AREA,
  summarizeActivation,
  summarizeHandoff,
  summarizeHours,
  summarizePersona,
  summarizePricing,
  summarizeServices,
  type SummaryArea,
} from "./preview-summary-helpers"
import type { BuilderState, CardComponentProps, CardKey } from "./types"

/** Confirm-only payload — no owned fields, just flips `confirmations.summary`. */
export type PreviewSummaryPayload = Record<string, never>

/**
 * FR-17: beyond the base contract, the summary card receives `onAdjust` from
 * ActiveStepCard — each section's "Ajustar" calls it with the `cardKey` of the
 * card that owns that section, and chat-panel reopens that card in the pinned
 * slot pre-filled with the current builderState. Optional so a render without
 * the affordance (e.g. legacy paths) simply hides the links.
 */
interface PreviewSummaryCardProps
  extends CardComponentProps<PreviewSummaryPayload> {
  onAdjust?: (cardKey: CardKey) => void
}

/** A single recap row: an area icon + title, its summarized value, and Ajustar. */
interface SummarySectionProps {
  icon: ReactNode
  title: string
  /** The recap body (already humanized). Falsy → renders an "a definir" hint. */
  detail: ReactNode
  /** Whether the underlying section was confirmed (drives the status pill). */
  confirmed: boolean
  /**
   * Whether this section is "genérica" (an open warning targets it). Independent
   * of `confirmed` — a section can be BOTH confirmed AND generic. When true the
   * card/icon/title are tinted amber (informativo, nunca bloqueia).
   */
  warn?: boolean
  /** Reopen this step; omit to hide the Ajustar link. */
  onAdjust?: () => void
  disabled?: boolean
  tokens: AppTokens
}

function SummarySection({
  icon,
  title,
  detail,
  confirmed,
  warn = false,
  onAdjust,
  disabled,
  tokens,
}: SummarySectionProps) {
  return (
    <div
      className="rounded-md border p-3"
      style={{
        backgroundColor: warn ? tokens.warningSubtle : tokens.bgBase,
        borderColor: warn ? tokens.warning : tokens.divider,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          style={{
            backgroundColor: warn
              ? tokens.warningSubtle
              : confirmed
                ? tokens.brandSubtle
                : tokens.hoverBg,
            color: warn
              ? tokens.warningText
              : confirmed
                ? tokens.brand
                : tokens.textSecondary,
          }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-[13px] font-medium"
              style={{ color: warn ? tokens.warningText : tokens.textPrimary }}
            >
              {title}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: confirmed
                  ? tokens.successSubtle
                  : tokens.hoverBg,
                color: confirmed ? tokens.successText : tokens.textTertiary,
              }}
            >
              {confirmed ? "confirmado" : "pendente"}
            </span>
          </div>
          <div
            className="mt-1 whitespace-pre-line text-[12px] leading-relaxed"
            style={{
              color: detail ? tokens.textSecondary : tokens.textTertiary,
            }}
          >
            {detail || "a definir"}
          </div>
        </div>
        {onAdjust && (
          <button
            type="button"
            disabled={disabled}
            onClick={onAdjust}
            className="shrink-0 rounded text-[12px] font-medium transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            style={{ color: tokens.brand }}
          >
            Ajustar
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * SummaryV2 — branch da Jornada v2 (T98, FR-31). Em vez das seções FIXAS da v1,
 * lista as 4 FASES da jornada (trilha "Fase N de M — Título", igual ao PhaseList)
 * + um recap do agente + SÓ as capacidades ATIVAS (helper `deriveActiveCapabilities`
 * — mesma fonte de verdade das Capacidades). Capacidade desligada (ex.: handoff
 * `nenhum`) não aparece: nada de transferência/preços como seção obrigatória.
 * Mesmo contrato de submit que a v1 (`onSubmit({})` flipa `confirmations.summary`).
 */
function SummaryV2({
  value,
  disabled,
  onSubmit,
  tokens,
}: {
  value: BuilderState
  disabled: boolean
  onSubmit: (payload: PreviewSummaryPayload) => void
  tokens: AppTokens
}) {
  const capabilities = deriveActiveCapabilities(value)
  const persona = summarizePersona(value.persona)
  const services = summarizeServices(value.services)
  const recap = [persona, services].filter(Boolean).join("\n")
  const total = JOURNEY_V2_PHASE_TITLES.length

  return (
    <CardShell
      icon={<CheckCircle2 className="h-4 w-4" />}
      title="Tudo certo?"
      reason="Veja o que combinamos: as fases da jornada e o que seu agente sabe fazer."
      tokens={tokens}
      actions={[
        {
          label: "Tudo certo, publicar",
          icon: <CheckCircle2 className="h-3.5 w-3.5" />,
          onClick: () => onSubmit({}),
          disabled,
        },
      ]}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-1.5">
          {JOURNEY_V2_PHASE_TITLES.map((title, index) => (
            <span
              key={title}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{ backgroundColor: tokens.hoverBg, color: tokens.textSecondary }}
            >
              Fase {index + 1} de {total} — {title}
            </span>
          ))}
        </div>

        <div
          className="rounded-md border p-3"
          style={{ backgroundColor: tokens.bgBase, borderColor: tokens.divider }}
        >
          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
              style={{ backgroundColor: tokens.brandSubtle, color: tokens.brand }}
            >
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span
                className="text-[13px] font-medium"
                style={{ color: tokens.textPrimary }}
              >
                Seu agente
              </span>
              <div
                className="mt-1 whitespace-pre-line text-[12px] leading-relaxed"
                style={{ color: recap ? tokens.textSecondary : tokens.textTertiary }}
              >
                {recap || "a definir"}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span
            className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: tokens.textSecondary }}
          >
            O que seu agente sabe fazer
          </span>
          {capabilities.map((cap) => (
            <div
              key={cap.key}
              className="rounded-md border p-3"
              style={{ backgroundColor: tokens.bgBase, borderColor: tokens.divider }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="text-[13px] font-medium"
                  style={{ color: tokens.textPrimary }}
                >
                  {cap.title}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: tokens.successSubtle,
                    color: tokens.successText,
                  }}
                >
                  ativo
                </span>
              </div>
              <p
                className="mt-1 text-[12px] leading-relaxed"
                style={{ color: tokens.textSecondary }}
              >
                {cap.summary}
              </p>
            </div>
          ))}
        </div>
      </div>
    </CardShell>
  )
}

/**
 * PreviewSummaryCard — the "Tudo certo?" recap. Renders one row per build area
 * (each with an Ajustar link that reopens that area's card via `onAdjust`) and
 * a single confirm button that submits `{}` to flip `confirmations.summary`
 * (the deploy gate).
 */
export function PreviewSummaryCard({
  value,
  disabled = false,
  onSubmit,
  onAdjust,
  tokens,
}: PreviewSummaryCardProps) {
  // Jornada v2 (T98, FR-31): delega ao resumo por fases + capacidades ATIVAS. O
  // branch fica no TOPO para o caminho v1 abaixo permanecer byte-intocado (NFR-03).
  if (value.journeyVersion === 2) {
    return (
      <SummaryV2
        value={value}
        disabled={disabled}
        onSubmit={onSubmit}
        tokens={tokens}
      />
    )
  }

  const { confirmations } = value

  // FR-17 — section → owning card. Returns undefined without `onAdjust` so the
  // SummarySection hides the link instead of promising an action it can't do.
  const adjust = (cardKey: CardKey): (() => void) | undefined =>
    onAdjust ? () => onAdjust(cardKey) : undefined

  // Config genérica → warnings amber (puramente informativos, ver helpers).
  const warnings = computeSummaryWarnings(value)
  // Áreas com warning aberto — usadas para tingir a seção certa de amber.
  const warnAreas = new Set<SummaryArea>(warnings.map((w) => w.area))

  // Uma seção fica "genérica" se QUALQUER warning de uma de suas áreas estiver
  // aberto. Persona agrega nome + saudação; Serviços e Preços têm seções
  // próprias. "Passagem para humano" fica amber quando o modo não foi definido.
  const personaWarn =
    warnAreas.has(SUMMARY_AREA.persona) || warnAreas.has(SUMMARY_AREA.greeting)

  const sections: SummarySectionProps[] = [
    {
      icon: <Sparkles className="h-4 w-4" />,
      title: "Personalidade",
      detail: summarizePersona(value.persona),
      confirmed: confirmations.persona,
      warn: personaWarn,
      onAdjust: adjust("agent_persona"),
      disabled,
      tokens,
    },
    {
      icon: <ListChecks className="h-4 w-4" />,
      title: "Serviços",
      detail: summarizeServices(value.services),
      confirmed: confirmations.services,
      warn: warnAreas.has(SUMMARY_AREA.services),
      onAdjust: adjust("services"),
      disabled,
      tokens,
    },
    {
      icon: <Clock className="h-4 w-4" />,
      title: "Horários",
      detail: summarizeHours(value.hours),
      confirmed: confirmations.hours,
      warn: warnAreas.has(SUMMARY_AREA.hours),
      onAdjust: adjust("business_hours"),
      disabled,
      tokens,
    },
    {
      icon: <Tag className="h-4 w-4" />,
      title: "Preços",
      detail: summarizePricing(value.pricing),
      confirmed: confirmations.pricing,
      warn: warnAreas.has(SUMMARY_AREA.pricing),
      onAdjust: adjust("pricing"),
      disabled,
      tokens,
    },
    {
      // Onda 2 — seção única que consolida a antiga "Qualificação" + "Equipe e
      // agenda" (cards qualification_action/qualification_steps/team_structure/
      // handoff_pairing fundidos no card `handoff`).
      icon: <Headset className="h-4 w-4" />,
      title: "Passagem para humano",
      detail: summarizeHandoff(value.handoff, value.calendar),
      confirmed: confirmations.handoff || confirmations.calendar,
      warn: warnAreas.has(SUMMARY_AREA.handoff),
      onAdjust: adjust("handoff"),
      disabled,
      tokens,
    },
    {
      icon: <MessageSquare className="h-4 w-4" />,
      title: "Ativação",
      detail: summarizeActivation(value.activation),
      confirmed: confirmations.activation,
      onAdjust: adjust("activation_mode"),
      disabled,
      tokens,
    },
  ]

  return (
    <CardShell
      icon={<CheckCircle2 className="h-4 w-4" />}
      title="Tudo certo?"
      reason="Revise tudo que combinamos antes de publicar. Toque em Ajustar para mudar qualquer parte."
      tokens={tokens}
      actions={[
        {
          label: "Tudo certo, publicar",
          icon: <CheckCircle2 className="h-3.5 w-3.5" />,
          // Warnings NÃO bloqueiam o deploy — o botão segue habilitado mesmo
          // com config genérica. Só `disabled` (streaming) trava o submit.
          onClick: () => onSubmit({}),
          disabled,
        },
      ]}
    >
      <div className="flex flex-col gap-2">
        {sections.map((section) => (
          <SummarySection key={section.title} {...section} />
        ))}
      </div>

      {warnings.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 flex items-start gap-2 rounded-md border p-3"
          style={{
            backgroundColor: tokens.warningSubtle,
            borderColor: tokens.warning,
            color: tokens.warningText,
          }}
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span className="text-[12px] leading-relaxed">
            Alguns itens estão genéricos. Dá pra publicar assim e ajustar depois,
            ou tocar em Ajustar agora.
          </span>
        </div>
      )}
    </CardShell>
  )
}

export default PreviewSummaryCard
