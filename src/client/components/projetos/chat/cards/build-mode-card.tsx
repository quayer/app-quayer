"use client"

/**
 * Builder Cards — build_mode (Jornada v3 · mission-first, FR-39/FR-49)
 *
 * ACTIVE-STEP card da fase "Conhecer" (DEPOIS de `objective`, ANTES de
 * `business_identity`/`mission`), gateado por `state.missionFirst === true`. É UMA
 * decisão leve: o usuário escolhe COMO quer construir o agente — em linguagem de
 * negócio (FR-49), sem jargão de IA. A escolha não muda os passos da jornada; ela
 * orienta o tom/abordagem do meta-agente nos próximos passos.
 *
 * Seleção ÚNICA (radio) entre 3 modos, com `recomendado` PRÉ-SELECIONADO:
 *   - recomendado : "Montar agora com boas práticas" (default).
 *   - pesquisa    : "Pesquisar referências antes".
 *   - livre       : "Eu digo como quero".
 *
 * Presentational only: lê seu slice de `props.value` (value.buildMode) e dispara o
 * payload tipado via `props.onSubmit` (chat-panel owns POST + SSE — o card NUNCA
 * faz fetch). Token-driven via `tokens` (zero cor hard-coded). Copy PT-BR.
 *
 * Contract (CARD CONTRACTS): cardKey 'build_mode'
 *   payload  → { cardKey: 'build_mode', mode: 'recomendado' | 'pesquisa' | 'livre' }
 *   owns     → buildMode (top-level enum)
 *   sentinel → confirmations.buildMode
 */

import * as React from "react"
import { Check, Hammer } from "lucide-react"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"

/** Os 3 modos de construção (espelha buildModePayloadSchema no card-submit.schemas.ts). */
const BUILD_MODES = ["recomendado", "pesquisa", "livre"] as const

type BuildModeValue = (typeof BUILD_MODES)[number]

/** EXACT submit payload for cardKey 'build_mode' (espelha o contrato do brief). */
export interface BuildModePayload {
  cardKey: "build_mode"
  mode: BuildModeValue
}

/** Modo PRÉ-SELECIONADO quando o state não traz (ou traz um valor desconhecido). */
const DEFAULT_MODE: BuildModeValue = "recomendado"

interface BuildModeOption {
  value: BuildModeValue
  label: string
  description: string
}

/**
 * Os 3 modos em linguagem de negócio (FR-49). `recomendado` é o caminho padrão
 * (montar com boas práticas); `pesquisa` pede referências antes; `livre` deixa o
 * usuário ditar a abordagem.
 */
const BUILD_MODE_OPTIONS: readonly BuildModeOption[] = [
  {
    value: "recomendado",
    label: "Montar agora com boas práticas",
    description:
      "Sigo um caminho pronto e comprovado — o agente fica de pé rápido, do jeito que costuma funcionar melhor.",
  },
  {
    value: "pesquisa",
    label: "Pesquisar referências antes",
    description:
      "Antes de montar, eu pesquiso referências do seu mercado para deixar o agente mais alinhado ao seu nicho.",
  },
  {
    value: "livre",
    label: "Eu digo como quero",
    description:
      "Você conduz: descreve do seu jeito como o agente deve trabalhar e eu monto em cima disso.",
  },
]

function isBuildMode(value: string): value is BuildModeValue {
  return (BUILD_MODES as readonly string[]).includes(value)
}

/**
 * BuildModeCard — escolha do modo de construção (seleção única entre 3 modos,
 * `recomendado` pré-selecionado). Pré-seleciona pela `value.buildMode` quando já
 * persistido; senão abre no default `recomendado`. Confirmar sempre habilita (há
 * sempre um modo selecionado). Desabilitado enquanto o chat está streamando.
 */
export function BuildModeCard({
  value,
  disabled = false,
  onSubmit,
  tokens,
}: CardComponentProps<BuildModePayload>) {
  const initialMode = React.useMemo<BuildModeValue>(() => {
    const persisted = value.buildMode
    return persisted && isBuildMode(persisted) ? persisted : DEFAULT_MODE
  }, [value.buildMode])

  const [mode, setMode] = React.useState<BuildModeValue>(initialMode)

  const handleConfirm = React.useCallback(() => {
    if (disabled) return
    onSubmit({ cardKey: "build_mode", mode })
  }, [disabled, mode, onSubmit])

  // Render de um modo (radio) — visual/comportamento copiados de mission-card.tsx
  // / activation-mode-card.tsx para manter o catálogo consistente.
  const renderOption = (option: BuildModeOption) => {
    const checked = mode === option.value
    return (
      <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => setMode(option.value)}
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
      icon={<Hammer className="h-4 w-4" />}
      title="Como você quer construir?"
      reason="Escolha o ritmo da montagem. Você pode mudar de ideia a qualquer momento."
      actions={[
        {
          label: "Confirmar",
          onClick: handleConfirm,
          variant: "primary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled,
        },
      ]}
    >
      <div className="flex flex-col gap-2">
        {BUILD_MODE_OPTIONS.map(renderOption)}
      </div>
    </CardShell>
  )
}

export default BuildModeCard
