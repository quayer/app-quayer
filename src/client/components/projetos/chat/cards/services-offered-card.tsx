"use client"

/**
 * Builder Cards — Escopo do atendimento: pode / não deve (Orayon Uplift, W3)
 *
 * cardKey `services`. Defines the agent's SCOPE — what it can answer/conduct and
 * what it must not promise — useful for any agent type, not only services.
 * The two editable chip lists live in the reusable `review/services-section.tsx`
 * (extracted in T41, jornada-builder-v2): this card is the SHELL + confirm flow
 * and the composite `agent_review` card reuses the same section (zero
 * duplication; this card stays for the reopen FR-17).
 *
 * PRESENTATIONAL: the section pre-fills from `props.value.services`; this card
 * tracks the section's live value and on confirm calls
 * `props.onSubmit({ offered, notOffered })`. It does NOT fetch — chat-panel owns
 * POST + SSE.
 *
 * Styling idiom matches ToolSelectionCard / ChannelSelectionCard via CardShell
 * + useAppTokens tokens (passed down as `props.tokens`).
 *
 * Contract: docs/builder/ORAYON_UPLIFT_SPEC.md (services_oferece_nao).
 */

import * as React from "react"
import { Check, Wrench } from "lucide-react"

import { CardShell } from "./card-shell"
import {
  ServicesSection,
  type ServicesSectionValue,
} from "./review/services-section"
import type { CardComponentProps } from "./types"

/** The exact submit payload for cardKey `services`. */
export type ServicesCardPayload = ServicesSectionValue

/**
 * ServicesOfferedCard — cardKey `services`. Renders the reusable
 * {@link ServicesSection} inside a CardShell and submits
 * `{ offered, notOffered }`.
 */
export function ServicesOfferedCard({
  value,
  disabled = false,
  onSubmit,
  tokens,
}: CardComponentProps<ServicesCardPayload>) {
  const [current, setCurrent] = React.useState<ServicesSectionValue>(
    () => value.services,
  )
  // Alerta NÃO-bloqueante (jornada-builder-v2): confirmar com as duas listas
  // vazias mostra o aviso uma vez; o 2º clique confirma mesmo assim.
  const [emptyWarned, setEmptyWarned] = React.useState(false)

  const bothEmpty =
    current.offered.length === 0 && current.notOffered.length === 0
  const showEmptyWarning = emptyWarned && bothEmpty

  const handleConfirm = React.useCallback(() => {
    // Alerta (não bloqueia): 1º clique com tudo vazio só exibe o aviso; o
    // clique seguinte confirma de verdade ("Confirmar mesmo assim").
    if (bothEmpty && !emptyWarned) {
      setEmptyWarned(true)
      return
    }
    onSubmit({ offered: current.offered, notOffered: current.notOffered })
  }, [bothEmpty, emptyWarned, current, onSubmit])

  return (
    <CardShell
      icon={<Wrench className="h-4 w-4" />}
      title="Escopo do atendimento"
      reason="Defina o contrato da IA: sobre o que ela pode conduzir a conversa e quais promessas ficam proibidas."
      tokens={tokens}
      // FR-20 (jornada-builder-v2) — passo OBRIGATÓRIO: sem "Agora não"/dismiss.
      actions={[
        {
          label: showEmptyWarning ? "Confirmar vazio" : "Confirmar escopo",
          onClick: handleConfirm,
          variant: "primary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled,
        },
      ]}
    >
      <ServicesSection
        initialValue={value.services}
        disabled={disabled}
        showEmptyWarning={showEmptyWarning}
        onChange={setCurrent}
        tokens={tokens}
      />
    </CardShell>
  )
}

export default ServicesOfferedCard
