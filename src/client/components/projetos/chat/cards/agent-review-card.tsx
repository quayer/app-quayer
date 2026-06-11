"use client"

/**
 * Builder Cards — agent_review (Jornada v2 · T43, FR-05/FR-22/FR-23)
 *
 * Card COMPOSTO da fase "Revisar": orquestrador FINO que funde persona + serviços +
 * horários numa ÚNICA confirmação (NFR-07: 1 decisão/1 ACK em vez de 3), reusando as
 * MESMAS seções dos cards individuais (`review/{persona,services,hours}-section.tsx`)
 * — zero duplicação — + a seção avançada de DISCLOSURE (`review/disclosure-section.tsx`,
 * migrada da IdentityTab, FR-21). Dispara UM POST único (cardKey `agent_review`).
 *
 * PREFILL POR EXCEÇÃO (T39/FR-02): `owned > capturedProposals.<domínio> > default`;
 * valor vindo de `capturedProposals` ganha o badge "sugerido da conversa". PROPOSTA
 * TARDIA (T95/FR-23): prefill congelado no MOUNT (`captureProposalSnapshot`); proposta
 * que chega depois NÃO re-prefilla — `detectLateProposals` a expõe e a seção mostra o
 * chip "Usar sugestão" por campo (aplicar é sempre explícito). ERROS GRANULARES (FR-22):
 * em falha o handler retorna `{ errors: { persona?, services?, hours? } }` sem write
 * parcial; este card (prop opcional `reviewErrors`) destaca SÓ a seção que falhou e
 * preserva o estado local das válidas (as seções não remontam).
 *
 * Presentational only: lê seu slice de `props.value` e dispara o payload via
 * `props.onSubmit` (chat-panel owns POST + SSE). Token-driven, copy PT-BR.
 *   cardKey 'agent_review' · owns persona.*+services.*+hours.*(+identityCard) ·
 *   sentinel confirmations.{persona,services,hours}.
 */

import * as React from "react"
import { AlertTriangle, Check, Sparkles } from "lucide-react"

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
import {
  captureProposalSnapshot,
  detectLateProposals,
  readProposal,
} from "./prefill"

/**
 * FR-22 — per-section validation errors mirrored from the handler's
 * `AgentReviewSectionErrors` (apply-card-submit.ts). Declared locally so the client
 * bundle never reaches into a server module that imports `database`. A failed submit
 * returns these; the card highlights only the failing section(s) and keeps the rest.
 */
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

/**
 * Props the ActiveStepCard widens this card with (errors backflow). It is OPTIONAL
 * and additive — the base `CardComponentProps` contract (types.ts) stays untouched;
 * the gate wires `reviewErrors` through. Until then it's simply `undefined`.
 */
type AgentReviewCardProps = CardComponentProps<AgentReviewPayload> & {
  /** FR-22 — per-section errors from the last failed submit (no partial write). */
  reviewErrors?: AgentReviewSectionErrors
}

/**
 * AgentReviewCard — orquestrador fino. Compõe as 3 seções + disclosure avançado e
 * submete UM payload. Erro granular destaca só a seção que falhou e preserva o resto.
 */
export function AgentReviewCard({
  value,
  disabled = false,
  onSubmit,
  tokens,
  reviewErrors,
}: AgentReviewCardProps) {
  // ── Prefill por exceção (T39): proposta de cada domínio lida UMA vez no mount. ──
  // Snapshot congela o que entrou no prefill inicial; o vivo (`value`) compara a cada
  // refetch para achar propostas TARDIAS (FR-23) — sem re-prefillar.
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

  // Propostas TARDIAS (vivas, mudadas desde o mount) → chips "Usar sugestão".
  const late = detectLateProposals(value, mountSnapshot)
  const lateOf = (domain: "persona" | "services" | "hours") =>
    late.find((p) => p.domain === domain)?.value
  const latePersona = lateOf("persona") as PersonaProposal | undefined
  const lateServices = lateOf("services") as ServicesProposal | undefined
  const lateHours = lateOf("hours") as { preset?: string } | undefined

  // ── Persona (o card é dono do hook, igual ao card individual). ──
  const persona = usePersonaSection({
    value,
    disabled,
    tokens,
    proposal: mountProposals.persona,
    lateProposal: latePersona,
  })

  // ── Serviços + horários + disclosure: estado vive nas seções; espelhamos via ref
  //    para submeter exatamente o que o editor mostra sem re-render por tecla. ──
  const servicesRef = React.useRef<ServicesSectionValue>(value.services)
  const handleServicesChange = React.useCallback((v: ServicesSectionValue) => {
    servicesRef.current = v
  }, [])
  const hoursRef = React.useRef<BusinessHoursPayload | null>(null)
  const handleHoursChange = React.useCallback((p: BusinessHoursPayload) => {
    hoursRef.current = p
  }, [])
  const disclosureRef = React.useRef<DisclosureValue | undefined>(undefined)
  const handleDisclosureChange = React.useCallback((d?: DisclosureValue) => {
    disclosureRef.current = d
  }, [])

  const handleConfirm = React.useCallback(() => {
    if (disabled) return
    const hours = hoursRef.current
    onSubmit({
      cardKey: "agent_review",
      persona: persona.buildPayload().persona,
      offered: servicesRef.current.offered,
      notOffered: servicesRef.current.notOffered,
      preset: hours?.preset,
      schedule: hours?.schedule,
      timezone: hours?.timezone,
      outOfHours: hours?.outOfHours,
      disclosure: disclosureRef.current,
    })
  }, [disabled, onSubmit, persona])

  // Prefill por exceção do domínio services (T39): owned > proposta > vazio,
  // congelado no mount (proposta tardia vira chip, não re-seed).
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

  return (
    <CardShell
      tokens={tokens}
      icon={<Sparkles className="h-4 w-4" />}
      title="Revisar o agente"
      reason="Confira personalidade, serviços e horário de uma vez. Ajuste o que precisar — uma confirmação só monta o agente."
      actions={[
        {
          label: "Confirmar e montar agente",
          onClick: handleConfirm,
          variant: "primary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled,
        },
      ]}
    >
      <div className="flex flex-col gap-5">
        <ReviewSection
          title="Personalidade"
          error={reviewErrors?.persona}
          tokens={tokens}
        >
          <PersonaSection state={persona} />
        </ReviewSection>

        <ReviewSection
          title="O que o agente faz"
          error={reviewErrors?.services}
          tokens={tokens}
        >
          <ServicesSection
            initialValue={servicesInitialValue}
            disabled={disabled}
            onChange={handleServicesChange}
            tokens={tokens}
            offeredFromProposal={servicesOfferedFromProposal}
            lateProposal={lateServices}
          />
        </ReviewSection>

        <ReviewSection
          title="Horário de atendimento"
          error={reviewErrors?.hours}
          tokens={tokens}
        >
          <HoursSection
            value={value}
            disabled={disabled}
            tokens={tokens}
            onChange={handleHoursChange}
            lateProposal={lateHours}
          />
        </ReviewSection>

        <DisclosureSection
          disabled={disabled}
          tokens={tokens}
          onChange={handleDisclosureChange}
        />
      </div>
    </CardShell>
  )
}

/**
 * One titled review section + the FR-22 granular error banner. Wraps a section
 * body; when `error` is set it highlights the section (danger border) and shows the
 * message — the section's OWN state is preserved (no remount), so a re-submit fixes
 * only the failing section.
 */
function ReviewSection({
  title,
  error,
  tokens,
  children,
}: {
  title: string
  error?: string
  tokens: CardComponentProps["tokens"]
  children: React.ReactNode
}) {
  return (
    <section
      className="flex flex-col gap-3 rounded-lg border p-3"
      style={{
        borderColor: error ? tokens.danger : tokens.divider,
        backgroundColor: tokens.bgBase,
      }}
    >
      <h3
        className="text-[12px] font-semibold uppercase tracking-wide"
        style={{ color: tokens.textTertiary }}
      >
        {title}
      </h3>
      {error && (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-[12px] leading-relaxed"
          style={{ color: tokens.dangerText }}
        >
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          {error}
        </p>
      )}
      {children}
    </section>
  )
}

export default AgentReviewCard
