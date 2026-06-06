"use client"

/**
 * Builder Cards — preview_summary ("Tudo certo?") (Orayon Uplift, W3)
 *
 * Read-only recap of every confirmed BuilderState section (persona, services,
 * hours, pricing, qualification, team/calendar, activation) shown right before
 * publish. Each section carries an "Ajustar" link that reopens that step (via
 * `onDismiss`, the single reopen affordance the framework hands every card), and
 * a single "Tudo certo, publicar" button confirms the whole build.
 *
 * Contract (CARD CONTRACTS):
 *   cardKey      = 'preview_summary'
 *   submit       = {}                 (confirm-only — no owned fields)
 *   sentinel     = confirmations.summary  (gates deploy)
 *
 * Presentational only: reads `value` and calls `props.onSubmit({})` /
 * `props.onDismiss()`. The chat-panel owns POST + SSE. Styling matches the
 * existing chat-panel cards via `CardShell` + design tokens (no raw colors).
 */

import type { ReactNode } from "react"

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ListChecks,
  MessageSquare,
  Sparkles,
  Tag,
  Target,
  Users,
} from "lucide-react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

import { CardShell } from "./card-shell"
import {
  computeSummaryWarnings,
  SUMMARY_AREA,
  summarizeActivation,
  summarizeHours,
  summarizePersona,
  summarizePricing,
  summarizeQualification,
  summarizeServices,
  summarizeTeam,
  type SummaryArea,
} from "./preview-summary-helpers"
import type { CardComponentProps } from "./types"

/** Confirm-only payload — no owned fields, just flips `confirmations.summary`. */
export type PreviewSummaryPayload = Record<string, never>

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
 * PreviewSummaryCard — the "Tudo certo?" recap. Renders one row per build area
 * (each with an Ajustar reopen link) and a single confirm button that submits
 * `{}` to flip `confirmations.summary` (the deploy gate).
 */
export function PreviewSummaryCard({
  value,
  disabled = false,
  onSubmit,
  onDismiss,
  tokens,
}: CardComponentProps<PreviewSummaryPayload>) {
  const { confirmations } = value

  // Config genérica → warnings amber (puramente informativos, ver helpers).
  const warnings = computeSummaryWarnings(value)
  // Áreas com warning aberto — usadas para tingir a seção certa de amber.
  const warnAreas = new Set<SummaryArea>(warnings.map((w) => w.area))

  // Uma seção fica "genérica" se QUALQUER warning de uma de suas áreas estiver
  // aberto. Persona agrega nome + saudação; Serviços e Preços têm seções
  // próprias. Equipe/agenda não tem regra de warning (sempre opcional).
  const personaWarn =
    warnAreas.has(SUMMARY_AREA.persona) || warnAreas.has(SUMMARY_AREA.greeting)

  const sections: SummarySectionProps[] = [
    {
      icon: <Sparkles className="h-4 w-4" />,
      title: "Personalidade",
      detail: summarizePersona(value.persona),
      confirmed: confirmations.persona,
      warn: personaWarn,
      onAdjust: onDismiss,
      disabled,
      tokens,
    },
    {
      icon: <ListChecks className="h-4 w-4" />,
      title: "Serviços",
      detail: summarizeServices(value.services),
      confirmed: confirmations.services,
      warn: warnAreas.has(SUMMARY_AREA.services),
      onAdjust: onDismiss,
      disabled,
      tokens,
    },
    {
      icon: <Clock className="h-4 w-4" />,
      title: "Horários",
      detail: summarizeHours(value.hours),
      confirmed: confirmations.hours,
      warn: warnAreas.has(SUMMARY_AREA.hours),
      onAdjust: onDismiss,
      disabled,
      tokens,
    },
    {
      icon: <Tag className="h-4 w-4" />,
      title: "Preços",
      detail: summarizePricing(value.pricing),
      confirmed: confirmations.pricing,
      warn: warnAreas.has(SUMMARY_AREA.pricing),
      onAdjust: onDismiss,
      disabled,
      tokens,
    },
    {
      icon: <Target className="h-4 w-4" />,
      title: "Qualificação",
      detail: summarizeQualification(value.qualification),
      confirmed:
        confirmations.qualificationAction || confirmations.qualificationSteps,
      warn: warnAreas.has(SUMMARY_AREA.qualification),
      onAdjust: onDismiss,
      disabled,
      tokens,
    },
    {
      icon: <Users className="h-4 w-4" />,
      title: "Equipe e agenda",
      detail: summarizeTeam(value.team, value.calendar),
      confirmed: confirmations.team || confirmations.calendar,
      onAdjust: onDismiss,
      disabled,
      tokens,
    },
    {
      icon: <MessageSquare className="h-4 w-4" />,
      title: "Ativação",
      detail: summarizeActivation(value.activation),
      confirmed: confirmations.activation,
      onAdjust: onDismiss,
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
