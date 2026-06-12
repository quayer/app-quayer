"use client"

/**
 * Builder Cards — agent_review (Jornada v2)
 *
 * Card final da fase Revisar: mostra o resumo do pacote do agente e permite
 * editar voz, escopo, equipe humana e transparência antes de confirmar. O submit
 * continua sendo um único POST `agent_review`, mas agora também autoriza a
 * criação do agente no backend (`agentApproved`).
 */

import * as React from "react"
import { AlertTriangle, Check, Pencil, Sparkles } from "lucide-react"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"
import {
  PersonaSection,
  usePersonaSection,
  type PersonaProposal,
} from "./review/persona-section"
import {
  ServicesSection,
  type ServicesProposal,
  type ServicesSectionValue,
} from "./review/services-section"
import { HoursSection, type BusinessHoursPayload } from "./review/hours-section"
import {
  DisclosureSection,
  type DisclosureValue,
} from "./review/disclosure-section"
import { SPEECH_MODES } from "./persona/speech-mode"
import {
  DEFAULT_TIMEZONE,
  build24x7,
  buildCommercial,
  coerceSchedule,
  normalizePreset,
  type HoursPreset,
  type WeeklySchedule,
} from "./business-hours/schedule-shape"
import {
  captureProposalSnapshot,
  detectLateProposals,
  readProposal,
} from "./prefill"

export interface AgentReviewSectionErrors {
  persona?: string
  services?: string
  hours?: string
}

/** EXACT submit payload for cardKey 'agent_review' (mirror of agentReviewPayloadSchema). */
export interface AgentReviewPayload {
  cardKey: "agent_review"
  persona: {
    name?: string
    tone?: string
    style?: string
    greeting?: string
    speechMode?: "assistant" | "first_person" | "secretary"
  }
  offered: string[]
  notOffered: string[]
  preset?: string
  schedule?: unknown
  timezone?: string
  outOfHours?: "reply_notice" | "silent"
  disclosure?: DisclosureValue
}

type AgentReviewCardProps = CardComponentProps<AgentReviewPayload> & {
  reviewErrors?: AgentReviewSectionErrors
}

type EditableSection = "voice" | "scope" | "team" | "presentation" | null

const EMPTY_SCOPE = "Ainda sem escopo definido"

function scheduleForPreset(
  preset: HoursPreset,
  custom: WeeklySchedule,
): WeeklySchedule {
  if (preset === "24_7") return build24x7()
  if (preset === "commercial") return buildCommercial()
  return custom
}

function buildInitialHoursPayload(
  value: CardComponentProps["value"],
): BusinessHoursPayload {
  const ownedPreset =
    typeof value.hours.preset === "string" && value.hours.preset.length > 0
      ? value.hours.preset
      : undefined
  const proposedPreset =
    typeof value.capturedProposals?.hours?.preset === "string" &&
    value.capturedProposals.hours.preset.length > 0
      ? value.capturedProposals.hours.preset
      : undefined
  const rawPreset =
    ownedPreset ??
    (value.confirmations.hours ? value.hours.preset : undefined) ??
    proposedPreset
  const preset = rawPreset ? normalizePreset(rawPreset) : "24_7"
  const persisted = coerceSchedule(value.hours.schedule)
  const custom = persisted ?? buildCommercial()

  return {
    preset,
    schedule: scheduleForPreset(preset, custom),
    timezone: value.hours.timezone?.trim() || DEFAULT_TIMEZONE,
    outOfHours: value.hours.outOfHours === "silent" ? "silent" : "reply_notice",
  }
}

function compactList(items: readonly string[], empty: string): string {
  const clean = items.map((item) => item.trim()).filter(Boolean)
  if (clean.length === 0) return empty
  const head = clean.slice(0, 3).join(" · ")
  return clean.length > 3 ? `${head} · +${clean.length - 3}` : head
}

function speechModeLabel(mode: AgentReviewPayload["persona"]["speechMode"]) {
  return (
    SPEECH_MODES.find((option) => option.key === mode)?.label ??
    "Assistente virtual"
  )
}

function hoursSummary(hours: BusinessHoursPayload): string[] {
  const preset =
    hours.preset === "24_7"
      ? "Equipe humana sempre disponível"
      : hours.preset === "commercial"
        ? "Equipe humana em horário comercial"
        : "Equipe humana com horário manual"
  const outOfHours =
    hours.outOfHours === "silent"
      ? "Fora do horário: IA responde sem prometer retorno humano imediato"
      : "Fora do horário: IA continua 24/7 e informa quando a equipe retorna"
  return ["IA atende 24/7", preset, outOfHours]
}

function disclosureSummary(value: DisclosureValue | undefined): string {
  if (!value) return "Padrão: IA transparente no atendimento"
  if (value.mode === "human_passthrough") return "Apresentação humanizada"
  if (value.mode === "custom") {
    return value.customText?.trim() || "Texto próprio configurado"
  }
  return "IA transparente no atendimento"
}

export function AgentReviewCard({
  value,
  disabled = false,
  onSubmit,
  tokens,
  reviewErrors,
}: AgentReviewCardProps) {
  const mountSnapshot = React.useMemo(
    () => captureProposalSnapshot(value),
    // Mount-only: congela o snapshot do prefill inicial (regra FR-23).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const mountProposals = React.useMemo(
    () => ({
      persona: readProposal(value, "persona") as PersonaProposal | undefined,
      services: readProposal(value, "services") as ServicesProposal | undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const late = detectLateProposals(value, mountSnapshot)
  const lateOf = (domain: "persona" | "services" | "hours") =>
    late.find((p) => p.domain === domain)?.value
  const latePersona = lateOf("persona") as PersonaProposal | undefined
  const lateServices = lateOf("services") as ServicesProposal | undefined
  const lateHours = lateOf("hours") as { preset?: string } | undefined

  const persona = usePersonaSection({
    value,
    disabled,
    tokens,
    proposal: mountProposals.persona,
    lateProposal: latePersona,
  })

  const servicesOfferedFromProposal =
    value.services.offered.length === 0 &&
    (mountProposals.services?.offered?.length ?? 0) > 0
  const servicesInitialValue = React.useMemo<ServicesSectionValue>(
    () => ({
      offered: servicesOfferedFromProposal
        ? (mountProposals.services?.offered ?? [])
        : value.services.offered,
      notOffered: value.services.notOffered,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [servicesValue, setServicesValue] =
    React.useState<ServicesSectionValue>(servicesInitialValue)
  const servicesRef = React.useRef<ServicesSectionValue>(servicesInitialValue)
  const handleServicesChange = React.useCallback((v: ServicesSectionValue) => {
    servicesRef.current = v
    setServicesValue(v)
  }, [])

  const initialHoursValue = React.useMemo(
    () => buildInitialHoursPayload(value),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [hoursValue, setHoursValue] =
    React.useState<BusinessHoursPayload>(initialHoursValue)
  const hoursRef = React.useRef<BusinessHoursPayload>(initialHoursValue)
  const handleHoursChange = React.useCallback((p: BusinessHoursPayload) => {
    hoursRef.current = p
    setHoursValue(p)
  }, [])

  const [disclosureValue, setDisclosureValue] =
    React.useState<DisclosureValue | undefined>(undefined)
  const disclosureRef = React.useRef<DisclosureValue | undefined>(undefined)
  const handleDisclosureChange = React.useCallback((d?: DisclosureValue) => {
    disclosureRef.current = d
    setDisclosureValue(d)
  }, [])

  const [editingSection, setEditingSection] =
    React.useState<EditableSection>(null)

  React.useEffect(() => {
    if (reviewErrors?.persona) setEditingSection("voice")
    else if (reviewErrors?.services) setEditingSection("scope")
    else if (reviewErrors?.hours) setEditingSection("team")
  }, [reviewErrors?.hours, reviewErrors?.persona, reviewErrors?.services])

  const handleConfirm = React.useCallback(() => {
    if (disabled) return
    const hours = hoursRef.current
    onSubmit({
      cardKey: "agent_review",
      persona: persona.buildPayload().persona,
      offered: servicesRef.current.offered,
      notOffered: servicesRef.current.notOffered,
      preset: hours.preset,
      schedule: hours.schedule,
      timezone: hours.timezone,
      outOfHours: hours.outOfHours,
      disclosure: disclosureRef.current,
    })
  }, [disabled, onSubmit, persona])

  const voicePayload = persona.buildPayload().persona
  const voiceSummary = [
    voicePayload.name || value.project.name || "Nome do agente a definir",
    `${speechModeLabel(voicePayload.speechMode)} · ${voicePayload.tone || "tom consultivo"}`,
    voicePayload.style || "Sem regra extra de estilo",
  ]
  const scopeSummary = [
    compactList(servicesValue.offered, EMPTY_SCOPE),
    servicesValue.notOffered.length > 0
      ? `Não promete: ${compactList(servicesValue.notOffered, "nada")}`
      : "Sem limites negativos cadastrados",
  ]

  return (
    <CardShell
      tokens={tokens}
      icon={<Sparkles className="h-4 w-4" />}
      title="Revisar e criar agente"
      reason="Pacote final antes da criação. Confira o resumo; abra uma seção só se precisar ajustar."
      actions={[
        {
          label: "Criar agente",
          onClick: handleConfirm,
          variant: "primary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled,
        },
      ]}
    >
      <div className="flex flex-col gap-0">
        <ReviewBlock
          id="voice"
          title="Voz"
          summary={voiceSummary}
          error={reviewErrors?.persona}
          editing={editingSection === "voice"}
          tokens={tokens}
          disabled={disabled}
          onToggle={() =>
            setEditingSection((current) => (current === "voice" ? null : "voice"))
          }
        >
          <PersonaSection state={persona} />
        </ReviewBlock>

        <ReviewBlock
          id="scope"
          title="Escopo"
          summary={scopeSummary}
          error={reviewErrors?.services}
          editing={editingSection === "scope"}
          tokens={tokens}
          disabled={disabled}
          onToggle={() =>
            setEditingSection((current) => (current === "scope" ? null : "scope"))
          }
        >
          <ServicesSection
            initialValue={servicesInitialValue}
            disabled={disabled}
            onChange={handleServicesChange}
            tokens={tokens}
            offeredFromProposal={servicesOfferedFromProposal}
            lateProposal={lateServices}
          />
        </ReviewBlock>

        <ReviewBlock
          id="team"
          title="Equipe humana"
          summary={hoursSummary(hoursValue)}
          error={reviewErrors?.hours}
          editing={editingSection === "team"}
          tokens={tokens}
          disabled={disabled}
          onToggle={() =>
            setEditingSection((current) => (current === "team" ? null : "team"))
          }
        >
          <HoursSection
            value={value}
            disabled={disabled}
            tokens={tokens}
            onChange={handleHoursChange}
            lateProposal={lateHours}
          />
        </ReviewBlock>

        <ReviewBlock
          id="presentation"
          title="Transparência"
          summary={[disclosureSummary(disclosureValue)]}
          editing={editingSection === "presentation"}
          tokens={tokens}
          disabled={disabled}
          onToggle={() =>
            setEditingSection((current) =>
              current === "presentation" ? null : "presentation",
            )
          }
        >
          <DisclosureSection
            disabled={disabled}
            tokens={tokens}
            onChange={handleDisclosureChange}
          />
        </ReviewBlock>
      </div>
    </CardShell>
  )
}

function ReviewBlock({
  id,
  title,
  summary,
  error,
  editing,
  disabled,
  tokens,
  onToggle,
  children,
}: {
  id: Exclude<EditableSection, null>
  title: string
  summary: string[]
  error?: string
  editing: boolean
  disabled: boolean
  tokens: CardComponentProps["tokens"]
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section
      className="border-t py-3 first:border-t-0 first:pt-0 last:pb-0"
      style={{ borderColor: tokens.divider }}
      aria-labelledby={`agent-review-${id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            id={`agent-review-${id}`}
            className="text-[12px] font-semibold uppercase tracking-wide"
            style={{ color: tokens.textTertiary }}
          >
            {title}
          </h3>
          <div className="mt-1 flex flex-col gap-0.5">
            {summary.map((line) => (
              <p
                key={line}
                className="break-words text-[13px] leading-relaxed"
                style={{ color: tokens.textPrimary }}
              >
                {line}
              </p>
            ))}
          </div>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onToggle}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            borderColor: editing ? tokens.brand : tokens.divider,
            color: editing ? tokens.brandText : tokens.textSecondary,
            backgroundColor: editing ? tokens.brandSubtle : tokens.bgBase,
          }}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          {editing ? "Fechar" : "Editar"}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed"
          style={{ color: tokens.dangerText }}
        >
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          {error}
        </p>
      )}

      <div className={editing ? "mt-3" : "hidden"} aria-hidden={!editing}>
        {children}
      </div>
    </section>
  )
}

export default AgentReviewCard
