"use client"

/**
 * Builder Cards — agent_persona (Onda C, G7 — wizard de 2 passos)
 *
 * Card INDIVIDUAL da persona. A lógica de formulário (wizard de 2 passos,
 * campos, saudação + live preview, "Sugerir nova" determinístico) vive na
 * seção reutilizável `review/persona-section.tsx` (Jornada Builder v2, T40):
 * este card é uma casca FINA que monta o `CardShell` + footer e delega o corpo.
 * A MESMA seção alimenta o card composto `agent_review` (T43) — zero duplicação.
 * Mantido para o reopen a partir do summary (FR-17).
 *
 *   Passo A ("voice"):  chips role=radio de "jeito de falar" + identidade.
 *   Passo B ("greeting"): textarea da saudação + a LIVE WhatsAppPreview.
 *
 * "Voltar"/"Avançar" navegam; "Confirmar personalidade" só no Passo B. O
 * payload mantém a FORMA `{ persona: { name?, tone?, style?, greeting? } }` e
 * o campo OPCIONAL `persona.speechMode?` (o chip escolhido).
 *
 * Presentational only: lê seu slice de `props.value` e dispara o payload tipado
 * via `props.onSubmit`. Token-driven (zero cor hard-coded). Copy PT-BR.
 *
 * Contract:
 *   cardKey  : "agent_persona"
 *   payload  : { persona: { name?; tone?; style?; greeting?; speechMode? } }
 *   state    : persona.*            (confirmation key: persona)
 */

import * as React from "react"
import { UserRound } from "lucide-react"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"
import {
  PersonaSection,
  personaCardActions,
  usePersonaSection,
  type AgentPersonaPayload,
} from "./review/persona-section"

export type { AgentPersonaPayload }

/**
 * AgentPersonaCard — casca do card individual de persona. Toda a lógica de
 * formulário (prefill FR-02/FR-05, wizard, saudação determinística) vem de
 * `usePersonaSection`/`PersonaSection`; aqui só monta o CardShell e o footer
 * (Avançar/Voltar/Confirmar). Passo obrigatório — sem dismiss (FR-20).
 * Desabilitado enquanto o chat está streamando (`disabled`).
 */
export function AgentPersonaCard({
  value,
  disabled = false,
  onSubmit,
  tokens,
}: CardComponentProps<AgentPersonaPayload>) {
  const section = usePersonaSection({ value, disabled, tokens })

  const submit = React.useCallback(() => {
    if (section.disabled) return
    onSubmit(section.buildPayload())
  }, [onSubmit, section])

  return (
    <CardShell
      icon={<UserRound className="h-4 w-4" />}
      title="Personalidade do agente"
      reason={
        section.step === "voice"
          ? "Passo 1 de 2 — escolha o jeito de falar e a identidade do agente."
          : "Passo 2 de 2 — ajuste a saudação. Ela aparece em tempo real como o cliente vai ver no WhatsApp."
      }
      tokens={tokens}
      actions={personaCardActions(section, submit)}
    >
      <PersonaSection state={section} />
    </CardShell>
  )
}

export default AgentPersonaCard
