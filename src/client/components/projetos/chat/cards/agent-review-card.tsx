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
import { Check, Sparkles } from "lucide-react"

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
import { ReviewBlock, type ReviewBlockId } from "./review/review-block"
import { ReadOnlySummary } from "./review/read-only-summary"
import {
  EMPTY_SCOPE,
  buildInitialHoursPayload,
  compactList,
  disclosureSummary,
  hoursSummary,
  speechModeLabel,
} from "./review/agent-review-utils"
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

type EditableSection = ReviewBlockId | null

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
        <ReadOnlySummary value={value} tokens={tokens} />

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

export default AgentReviewCard
