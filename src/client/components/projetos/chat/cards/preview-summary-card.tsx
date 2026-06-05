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
import type { BuilderState, CardComponentProps } from "./types"

/** Confirm-only payload — no owned fields, just flips `confirmations.summary`. */
export type PreviewSummaryPayload = Record<string, never>

const QUALIFICATION_ACTION_LABELS: Record<string, string> = {
  notify_team: "Avisar a equipe",
  book_appointment: "Agendar atendimento",
  lead_only: "Apenas captar o lead",
}

/** A single recap row: an area icon + title, its summarized value, and Ajustar. */
interface SummarySectionProps {
  icon: ReactNode
  title: string
  /** The recap body (already humanized). Falsy → renders an "a definir" hint. */
  detail: ReactNode
  /** Whether the underlying section was confirmed (drives the status pill). */
  confirmed: boolean
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
  onAdjust,
  disabled,
  tokens,
}: SummarySectionProps) {
  return (
    <div
      className="rounded-md border p-3"
      style={{
        backgroundColor: tokens.bgBase,
        borderColor: tokens.divider,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          style={{
            backgroundColor: confirmed ? tokens.brandSubtle : tokens.hoverBg,
            color: confirmed ? tokens.brand : tokens.textSecondary,
          }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-[13px] font-medium"
              style={{ color: tokens.textPrimary }}
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
            className="mt-1 text-[12px] leading-relaxed"
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

/** Join a list into a short human phrase, or "" when nothing to show. */
function joinList(items: readonly string[] | undefined): string {
  if (!items || items.length === 0) return ""
  return items.filter((item) => item.trim().length > 0).join(", ")
}

function summarizePersona(persona: BuilderState["persona"]): ReactNode {
  const parts: string[] = []
  if (persona.name) parts.push(persona.name)
  if (persona.tone) parts.push(`tom ${persona.tone}`)
  if (persona.style) parts.push(`estilo ${persona.style}`)
  return joinList(parts)
}

function summarizeServices(services: BuilderState["services"]): ReactNode {
  const offered = joinList(services.offered)
  const notOffered = joinList(services.notOffered)
  if (!offered && !notOffered) return ""
  return (
    <>
      {offered && (
        <span>
          <span style={{ fontWeight: 500 }}>Oferece:</span> {offered}
        </span>
      )}
      {offered && notOffered && <br />}
      {notOffered && (
        <span>
          <span style={{ fontWeight: 500 }}>Não oferece:</span> {notOffered}
        </span>
      )}
    </>
  )
}

function summarizeHours(hours: BuilderState["hours"]): ReactNode {
  const parts: string[] = []
  if (hours.preset) parts.push(hours.preset)
  else if (hours.schedule != null) parts.push("horário personalizado")
  if (hours.timezone) parts.push(`(${hours.timezone})`)
  return joinList(parts)
}

function formatPrice(priceCents: number, currency: string): string {
  const amount = priceCents / 100
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
    }).format(amount)
  } catch {
    // Unknown currency code → fall back to a plain decimal + raw code.
    return `${currency} ${amount.toFixed(2)}`
  }
}

function summarizePricing(pricing: BuilderState["pricing"]): ReactNode {
  if (pricing.items.length === 0) return ""
  const preview = pricing.items
    .slice(0, 3)
    .map((item) => `${item.name} — ${formatPrice(item.priceCents, pricing.currency)}`)
    .join(", ")
  const extra = pricing.items.length - 3
  const count = pricing.items.length
  const noun = count === 1 ? "item" : "itens"
  return (
    <>
      <span>{`${count} ${noun}`}</span>
      {preview && <span>{` · ${preview}`}</span>}
      {extra > 0 && <span>{` e mais ${extra}`}</span>}
    </>
  )
}

function summarizeQualification(
  qualification: BuilderState["qualification"],
): ReactNode {
  const parts: string[] = []
  if (qualification.action) {
    parts.push(
      QUALIFICATION_ACTION_LABELS[qualification.action] ?? qualification.action,
    )
  }
  if (qualification.steps.length > 0) {
    const noun = qualification.steps.length === 1 ? "pergunta" : "perguntas"
    parts.push(`${qualification.steps.length} ${noun}`)
  }
  return joinList(parts)
}

function summarizeTeam(
  team: BuilderState["team"],
  calendar: BuilderState["calendar"],
): ReactNode {
  const parts: string[] = []
  if (team.departmentName) parts.push(team.departmentName)
  if (team.members.length > 0) {
    const noun = team.members.length === 1 ? "pessoa" : "pessoas"
    parts.push(`${team.members.length} ${noun} na roleta`)
  }
  if (calendar.connectionId || calendar.status === "connected") {
    parts.push("agenda conectada")
  }
  return joinList(parts)
}

function summarizeActivation(
  activation: BuilderState["activation"],
): ReactNode {
  const parts: string[] = []
  if (activation.mode) parts.push(activation.mode)
  if (activation.keywords.length > 0) {
    parts.push(`palavras-chave: ${joinList(activation.keywords)}`)
  }
  return joinList(parts)
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

  const sections: SummarySectionProps[] = [
    {
      icon: <Sparkles className="h-4 w-4" />,
      title: "Personalidade",
      detail: summarizePersona(value.persona),
      confirmed: confirmations.persona,
      onAdjust: onDismiss,
      disabled,
      tokens,
    },
    {
      icon: <ListChecks className="h-4 w-4" />,
      title: "Serviços",
      detail: summarizeServices(value.services),
      confirmed: confirmations.services,
      onAdjust: onDismiss,
      disabled,
      tokens,
    },
    {
      icon: <Clock className="h-4 w-4" />,
      title: "Horários",
      detail: summarizeHours(value.hours),
      confirmed: confirmations.hours,
      onAdjust: onDismiss,
      disabled,
      tokens,
    },
    {
      icon: <Tag className="h-4 w-4" />,
      title: "Preços",
      detail: summarizePricing(value.pricing),
      confirmed: confirmations.pricing,
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
    </CardShell>
  )
}

export default PreviewSummaryCard
