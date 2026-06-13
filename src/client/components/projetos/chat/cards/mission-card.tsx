"use client"

/**
 * Builder Cards — mission (Jornada v3 · mission-first, FR-37/FR-48/FR-49)
 *
 * ACTIVE-STEP card da fase "Conhecer" (depois de business_identity), gateado por
 * `state.missionFirst === true`. É UMA decisão: o usuário escolhe a MISSÃO do
 * agente — o que ele existe para fazer — em linguagem de negócio (FR-49), sem
 * jargão de IA. A escolha resolve internamente um `role`/`objective`/`addons`
 * que alimentam o Playbook Engine (Onda 3); o refino por nicho/Playbook é da
 * Onda 3 — aqui entregamos um set DEFAULT de 5 missões contextualizadas.
 *
 * Seleção ÚNICA (radio) entre os presets + uma opção "Montar do zero" (custom)
 * que revela um campo para o usuário nomear a própria missão. Confirmar só
 * habilita com um preset selecionado OU custom com nome preenchido.
 *
 * Presentational only: lê seu slice de `props.value` (value.mission) e dispara o
 * payload tipado via `props.onSubmit` (chat-panel owns POST + SSE — o card NUNCA
 * faz fetch). Token-driven via `tokens` (zero cor hard-coded). Copy PT-BR.
 *
 * Contract (CARD CONTRACTS): cardKey 'mission'
 *   payload  → { cardKey: 'mission', key, label?, role?, objective?, addons?, custom? }
 *   owns     → mission.* (key/label/role/objective/addons/custom)
 *   sentinel → confirmations.mission
 */

import * as React from "react"
import { Check, Target } from "lucide-react"

import { Input } from "@/client/components/ui/input"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"

/** Server-side clamps (espelha missionPayloadSchema no card-submit.schemas.ts). */
const KEY_MAX = 120
const LABEL_MAX = 160
const ROLE_MAX = 60
const OBJECTIVE_MAX = 60
const ADDON_MAX = 60
const ADDONS_CAP = 12

/** EXACT submit payload for cardKey 'mission' (espelha o contrato do brief). */
export interface MissionPayload {
  cardKey: "mission"
  key: string
  label?: string
  role?: string
  objective?: string
  addons?: string[]
  custom?: boolean
}

/**
 * Sentinela do caminho "montar do zero". NÃO é uma missão preset: selecioná-la
 * revela um campo de texto e o submit vai com `custom: true` (sem role/objective).
 */
const CUSTOM_KEY = "__custom__"

/**
 * Uma missão preset. `key` é o bundle resolvido (vocabulário aberto); `label` é
 * o rótulo humano em linguagem de negócio; `description` explica o que o agente
 * faz com aquela missão. `role`/`objective`/`addons` são a resolução INTERNA que
 * alimenta o Playbook Engine — invisíveis ao usuário.
 */
interface MissionPreset {
  key: string
  label: string
  description: string
  role: string
  objective: string
  addons: string[]
}

/**
 * Set DEFAULT — 5 missões contextualizadas para imobiliário (exemplo do brief).
 * O refino por nicho/Playbook é da Onda 3; por ora estes presets cobrem o caso
 * de uso mais comum. Labels/descrições = linguagem de negócio (FR-49); os campos
 * role/objective/addons resolvem internamente para o engine.
 */
const MISSION_PRESETS: readonly MissionPreset[] = [
  {
    key: "sdr_qualificar",
    label: "Captar e qualificar (SDR)",
    description:
      "Recebe quem chega, entende o que a pessoa procura e separa os contatos prontos para a equipe.",
    role: "sdr",
    objective: "qualificar",
    addons: [],
  },
  {
    key: "lista_interesse",
    label: "Lista de interesse",
    description:
      "Capta o contato e o que a pessoa busca para montar uma lista de interessados.",
    role: "sdr",
    objective: "qualificar",
    addons: [],
  },
  {
    key: "agendar_visita",
    label: "Agendar visita",
    description:
      "Conversa com o interessado e marca a visita direto na agenda da equipe.",
    role: "secretaria",
    objective: "agendar",
    addons: ["agenda"],
  },
  {
    key: "tirar_duvidas",
    label: "Tirar dúvidas",
    description:
      "Responde perguntas sobre imóveis, condições e processo, com a base do negócio.",
    role: "suporte",
    objective: "suportar",
    addons: [],
  },
  {
    key: "pre_venda_completa",
    label: "Pré-venda completa",
    description:
      "Qualifica, tira dúvidas e já agenda a visita — leva o contato até a equipe pronto para fechar.",
    role: "vendas",
    objective: "agendar",
    addons: ["agenda"],
  },
]

/** Trim a field to undefined when empty so we never submit blank optionals. */
function clean(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** Clamp a string to a max length (espelha os clamps server-side). */
function clamp(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value
}

/** Re-sanitiza addons client-side: trim, drop vazios, clamp por item, cap total. */
function sanitizeAddons(addons: readonly string[]): string[] {
  const out: string[] = []
  for (const raw of addons) {
    const trimmed = clamp(raw.trim(), ADDON_MAX)
    if (trimmed.length === 0) continue
    out.push(trimmed)
    if (out.length >= ADDONS_CAP) break
  }
  return out
}

/**
 * MissionCard — escolha da missão do agente (seleção única entre 5 presets +
 * "montar do zero"). Pré-seleciona pela `value.mission`: se há `mission.key` e ele
 * casa um preset, abre nele; se `mission.custom` é true (ou a key não casa nenhum
 * preset), abre no caminho custom com o label preenchido. Confirmar só habilita
 * com um preset selecionado OU custom com nome preenchido. Desabilitado enquanto
 * o chat está streamando.
 */
export function MissionCard({
  value,
  disabled = false,
  onSubmit,
  tokens,
}: CardComponentProps<MissionPayload>) {
  const persisted = value.mission

  // Pré-seleção por exceção (idiom da jornada): casa a key persistida com um
  // preset; senão, se há mission.custom (ou key sem preset), abre no custom.
  const initialSelected = React.useMemo<string | null>(() => {
    if (!persisted) return null
    if (persisted.custom) return CUSTOM_KEY
    const matched = MISSION_PRESETS.find((preset) => preset.key === persisted.key)
    if (matched) return matched.key
    return persisted.key ? CUSTOM_KEY : null
  }, [persisted])

  const [selected, setSelected] = React.useState<string | null>(initialSelected)
  const [customLabel, setCustomLabel] = React.useState(
    persisted?.custom || (persisted?.key && !MISSION_PRESETS.some((p) => p.key === persisted.key))
      ? persisted?.label ?? ""
      : "",
  )

  const isCustom = selected === CUSTOM_KEY

  // Confirmar habilita com um preset selecionado OU custom com nome preenchido.
  const canConfirm =
    selected !== null &&
    (!isCustom || clean(customLabel) !== undefined)

  const handleConfirm = React.useCallback(() => {
    if (disabled || selected === null) return

    if (selected === CUSTOM_KEY) {
      const label = clean(customLabel)
      if (label === undefined) return
      const clampedLabel = clamp(label, LABEL_MAX)
      // "Montar do zero": key = nome dado (clamp p/ KEY_MAX); role/objective/addons
      // ficam para o engine resolver (Onda 3). custom: true.
      onSubmit({
        cardKey: "mission",
        key: clamp(label, KEY_MAX),
        label: clampedLabel,
        custom: true,
      })
      return
    }

    const preset = MISSION_PRESETS.find((item) => item.key === selected)
    if (!preset) return
    const addons = sanitizeAddons(preset.addons)
    onSubmit({
      cardKey: "mission",
      key: clamp(preset.key, KEY_MAX),
      label: clamp(preset.label, LABEL_MAX),
      role: clamp(preset.role, ROLE_MAX),
      objective: clamp(preset.objective, OBJECTIVE_MAX),
      addons: addons.length > 0 ? addons : undefined,
      custom: false,
    })
  }, [customLabel, disabled, onSubmit, selected])

  // Render de uma opção (radio) — visual/comportamento copiados de
  // activation-mode-card.tsx para manter o catálogo consistente.
  const renderOption = (option: {
    key: string
    label: string
    description: string
  }) => {
    const checked = selected === option.key
    return (
      <button
        key={option.key}
        type="button"
        role="radio"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => setSelected(option.key)}
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
      icon={<Target className="h-4 w-4" />}
      title="Qual a missão do agente?"
      reason="Escolha o que o agente existe para fazer. Você refina os detalhes depois."
      actions={[
        {
          label: "Confirmar missão",
          onClick: handleConfirm,
          variant: "primary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled: disabled || !canConfirm,
        },
      ]}
    >
      <div className="flex flex-col gap-2">
        {MISSION_PRESETS.map(renderOption)}

        {renderOption({
          key: CUSTOM_KEY,
          label: "Montar do zero",
          description:
            "Descreva a missão na sua palavra — o agente é montado em cima dela.",
        })}

        {isCustom && (
          <div className="mt-1 flex flex-col gap-1.5">
            <Input
              id="mission-custom-label"
              value={customLabel}
              disabled={disabled}
              maxLength={LABEL_MAX}
              placeholder="Ex.: Receber pedidos e tirar dúvidas do cardápio"
              onChange={(event) => setCustomLabel(event.target.value)}
              className="text-[13px]"
              style={{
                backgroundColor: tokens.bgBase,
                borderColor: tokens.divider,
                color: tokens.textPrimary,
              }}
            />
          </div>
        )}
      </div>
    </CardShell>
  )
}

export default MissionCard
