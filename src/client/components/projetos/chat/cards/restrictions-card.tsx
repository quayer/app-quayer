"use client"

/**
 * Builder Cards — restrictions (FR-44 · restrições comerciais, backlog #3)
 *
 * ACTIVE-STEP card da fase "Revisar" (DEPOIS de qualification e ANTES de
 * conversation_blueprint), gateado pelo engine v2 via
 * `applies:(s)=>s.missionFirst===true && hasSoldOutSourceSignal(s)` (a fonte
 * sinaliza 100% vendido/esgotado). É UMA decisão: o usuário escolhe COMO o agente
 * deve tratar essa restrição — em linguagem de negócio (FR-49), sem jargão de IA.
 *
 * Move a decisão de "esgotado" que a v2 fazia inline no `conversation_blueprint`
 * (contextDecision) para um passo dedicado ANTES do plano de atendimento, para que
 * o plano não re-pergunte. As 3 opções REUSAM a copy do antigo
 * SOLD_OUT_DECISION_OPTIONS (conversation-blueprint-card.tsx) + uma nota opcional.
 *
 * Seleção ÚNICA (radio) entre as 3 estratégias. Confirmar só habilita com uma
 * estratégia selecionada.
 *
 * Presentational only: lê seu slice de `props.value` (value.restrictions) e dispara
 * o payload tipado via `props.onSubmit` (chat-panel owns POST + SSE — o card NUNCA
 * faz fetch). Token-driven via `tokens` (zero cor hard-coded). Copy PT-BR.
 *
 * Contract (CARD CONTRACTS): cardKey 'restrictions'
 *   payload  → { cardKey: 'restrictions', soldOutStrategy, note? }
 *   owns     → restrictions.{soldOutStrategy,note}
 *   sentinel → confirmations.restrictions
 */

import * as React from "react"
import { Check, Ban } from "lucide-react"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"

/** Server-side clamp (espelha restrictionsPayloadSchema no card-submit.schemas.ts). */
const NOTE_MAX = 300

/** As 3 estratégias de esgotado (espelha o enum SoldOutConversationStrategy). */
type SoldOutStrategy = "interest_list" | "human_confirm" | "available_confirmed"

/** EXACT submit payload for cardKey 'restrictions' (espelha o contrato do brief). */
export interface RestrictionsPayload {
  cardKey: "restrictions"
  soldOutStrategy: SoldOutStrategy
  note?: string
}

/**
 * As 3 opções REUSAM a copy do antigo SOLD_OUT_DECISION_OPTIONS que vivia em
 * conversation-blueprint-card.tsx (mesmos rótulos/descrições): "Lista de
 * interesse"/"Confirmar com consultor"/"Tenho disponibilidade".
 */
const SOLD_OUT_DECISION_OPTIONS: {
  value: SoldOutStrategy
  label: string
  description: string
}[] = [
  {
    value: "interest_list",
    label: "Lista de interesse",
    description: "Captar interessados sem prometer unidade disponível.",
  },
  {
    value: "human_confirm",
    label: "Confirmar com consultor",
    description: "Qualificar e passar para humano validar disponibilidade.",
  },
  {
    value: "available_confirmed",
    label: "Tenho disponibilidade",
    description: "Gerar plano usando uma confirmação fora do site.",
  },
]

/** Trim a field to undefined when empty so we never submit a blank note. */
function clean(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** Clamp a string to a max length (espelha o clamp server-side). */
function clamp(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value
}

/**
 * RestrictionsCard — escolha de como o agente trata uma fonte 100% vendida/esgotada
 * (seleção única entre as 3 estratégias + nota opcional). Pré-seleciona pela
 * `value.restrictions` (idiom "configure por exceção"). Confirmar só habilita com
 * uma estratégia escolhida. Desabilitado enquanto o chat está streamando.
 */
export function RestrictionsCard({
  value,
  disabled = false,
  onSubmit,
  tokens,
}: CardComponentProps<RestrictionsPayload>) {
  const persisted = value.restrictions

  const initialSelected = React.useMemo<SoldOutStrategy | null>(
    () => persisted?.soldOutStrategy ?? null,
    [persisted],
  )

  const [selected, setSelected] = React.useState<SoldOutStrategy | null>(
    initialSelected,
  )
  const [note, setNote] = React.useState(persisted?.note ?? "")

  const canConfirm = selected !== null

  const handleConfirm = React.useCallback(() => {
    if (disabled || selected === null) return
    const trimmedNote = clean(note)
    onSubmit({
      cardKey: "restrictions",
      soldOutStrategy: selected,
      ...(trimmedNote ? { note: clamp(trimmedNote, NOTE_MAX) } : {}),
    })
  }, [disabled, note, onSubmit, selected])

  // Render de uma opção (radio) — visual/comportamento copiados de
  // mission-card.tsx para manter o catálogo consistente.
  const renderOption = (option: {
    value: SoldOutStrategy
    label: string
    description: string
  }) => {
    const checked = selected === option.value
    return (
      <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => setSelected(option.value)}
        className="group rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          backgroundColor: checked ? tokens.brandSubtle : tokens.bgBase,
          borderColor: checked ? tokens.brand : tokens.divider,
        }}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <span
              className="text-[13px] font-medium"
              style={{ color: tokens.textPrimary }}
            >
              {option.label}
            </span>
            <p
              className="mt-1 text-[12px] leading-relaxed"
              style={{ color: tokens.textSecondary }}
            >
              {option.description}
            </p>
          </div>
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
            style={{
              backgroundColor: checked ? tokens.brand : "transparent",
              borderColor: checked ? tokens.brand : tokens.divider,
              color: checked ? tokens.textInverse : "transparent",
            }}
          >
            {checked && <Check className="h-3 w-3" strokeWidth={3} />}
          </span>
        </div>
      </button>
    )
  }

  return (
    <CardShell
      tokens={tokens}
      icon={<Ban className="h-4 w-4" />}
      title="Restrições comerciais"
      reason="A fonte indica que pode estar 100% vendido/esgotado. Escolha como o agente deve tratar essa restrição."
      actions={[
        {
          label: "Confirmar restrição",
          onClick: handleConfirm,
          variant: "primary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled: disabled || !canConfirm,
        },
      ]}
    >
      <div className="flex flex-col gap-2">
        {SOLD_OUT_DECISION_OPTIONS.map(renderOption)}

        <div className="mt-1 flex flex-col gap-1.5">
          <label
            htmlFor="restrictions-note"
            className="text-[12px] font-medium"
            style={{ color: tokens.textTertiary }}
          >
            Observação (opcional)
          </label>
          <textarea
            id="restrictions-note"
            value={note}
            disabled={disabled}
            maxLength={NOTE_MAX}
            rows={2}
            placeholder="Ex.: temos uma fase nova em pré-lançamento."
            onChange={(event) => setNote(event.target.value)}
            className="w-full resize-none rounded-md border px-2.5 py-2 text-[13px] leading-relaxed outline-none transition-colors disabled:opacity-60"
            style={{
              backgroundColor: tokens.bgBase,
              borderColor: tokens.divider,
              color: tokens.textPrimary,
            }}
          />
        </div>
      </div>
    </CardShell>
  )
}

export default RestrictionsCard
