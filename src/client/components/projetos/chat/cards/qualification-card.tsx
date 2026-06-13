"use client"

/**
 * Builder Cards — qualification (FR-44 · critérios de qualificação, backlog #10)
 *
 * ACTIVE-STEP card da fase "Revisar" (ANTES de conversation_blueprint), gateado
 * pelo engine v2 via `applies:(s)=>s.missionFirst===true && missionQualifies(s)`
 * (missão SDR/closer/vendas/cobrança ou objetivo 'qualificar'). É UMA decisão: o
 * usuário escolhe QUAIS dados o agente coleta de cada contato para considerar o
 * atendimento bom — em linguagem de negócio (FR-49), sem jargão de IA.
 *
 * MULTI-seleção (checkbox) de um set DEFAULT de campos. Confirmar sempre habilita
 * (a lista pode vir vazia — o usuário confirma sem marcar nada).
 *
 * Presentational only: lê seu slice de `props.value` (value.qualification) e
 * dispara o payload tipado via `props.onSubmit` (chat-panel owns POST + SSE — o
 * card NUNCA faz fetch). Token-driven via `tokens` (zero cor hard-coded). Copy PT-BR.
 *
 * Contract (CARD CONTRACTS): cardKey 'qualification'
 *   payload  → { cardKey: 'qualification', fields: string[] }
 *   owns     → qualification.fields
 *   sentinel → confirmations.qualification
 */

import * as React from "react"
import { Check, ListChecks } from "lucide-react"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"

/** Server-side clamps (espelha qualificationPayloadSchema no card-submit.schemas.ts). */
const FIELD_MAX = 120
const FIELDS_CAP = 24

/** EXACT submit payload for cardKey 'qualification' (espelha o contrato do brief). */
export interface QualificationPayload {
  cardKey: "qualification"
  fields: string[]
}

/**
 * Uma opção do set DEFAULT. `value` é o texto persistido (linguagem de negócio,
 * FR-49 — é o próprio rótulo que vai para `qualification.fields`); `description`
 * explica o critério. Mantemos o valor = rótulo para que o estado leia em
 * linguagem natural no roteiro/contexto, sem mapa de chaves opaco.
 */
interface QualificationOption {
  value: string
  description: string
}

/**
 * Set DEFAULT — 7 critérios contextualizados (exemplo imobiliário do brief). O
 * refino por nicho é da Onda 3; por ora estes cobrem o caso de uso mais comum.
 * Rótulos = linguagem de negócio (FR-49).
 */
const QUALIFICATION_OPTIONS: readonly QualificationOption[] = [
  {
    value: "Nome do contato",
    description: "Como a pessoa quer ser chamada.",
  },
  {
    value: "Interesse: morar ou investir",
    description: "Se a pessoa procura o imóvel para morar ou para investir.",
  },
  {
    value: "Prazo de compra",
    description: "Em quanto tempo a pessoa pretende decidir/comprar.",
  },
  {
    value: "Faixa de orçamento",
    description: "Quanto a pessoa pretende investir.",
  },
  {
    value: "Forma de pagamento",
    description: "À vista, financiamento, FGTS, etc.",
  },
  {
    value: "Região de interesse",
    description: "Em que bairro/cidade a pessoa procura.",
  },
  {
    value: "Interesse em falar com consultor",
    description: "Se a pessoa quer ser atendida por um consultor humano.",
  },
]

/** Clamp a string to a max length (espelha os clamps server-side). */
function clamp(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value
}

/** Re-sanitiza a seleção client-side: trim, drop vazios, dedupe, clamp, cap total. */
function sanitizeFields(fields: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of fields) {
    const trimmed = clamp(raw.trim(), FIELD_MAX)
    if (trimmed.length === 0 || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
    if (out.length >= FIELDS_CAP) break
  }
  return out
}

/**
 * QualificationCard — escolha dos critérios de qualificação (multi-seleção de 7
 * campos do set DEFAULT). Pré-seleciona pela `value.qualification.fields`
 * (idiom "configure por exceção"): cada campo já persistido reabre marcado.
 * Confirmar sempre habilita (a lista pode ser vazia). Desabilitado enquanto o
 * chat está streamando.
 */
export function QualificationCard({
  value,
  disabled = false,
  onSubmit,
  tokens,
}: CardComponentProps<QualificationPayload>) {
  const persistedFields = value.qualification?.fields

  const initialSelected = React.useMemo<ReadonlySet<string>>(() => {
    return new Set(persistedFields ?? [])
  }, [persistedFields])

  const [selected, setSelected] =
    React.useState<ReadonlySet<string>>(initialSelected)

  const toggle = React.useCallback(
    (optionValue: string) => {
      if (disabled) return
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(optionValue)) next.delete(optionValue)
        else next.add(optionValue)
        return next
      })
    },
    [disabled],
  )

  const handleConfirm = React.useCallback(() => {
    if (disabled) return
    // Preserva a ordem do set DEFAULT para os campos marcados.
    const ordered = QUALIFICATION_OPTIONS.filter((opt) =>
      selected.has(opt.value),
    ).map((opt) => opt.value)
    onSubmit({ cardKey: "qualification", fields: sanitizeFields(ordered) })
  }, [disabled, onSubmit, selected])

  // Render de uma opção (checkbox) — visual copiado de mission/build-mode-card,
  // mas com semântica de multi-seleção (role="checkbox", quadrado em vez de pílula).
  const renderOption = (option: QualificationOption) => {
    const checked = selected.has(option.value)
    return (
      <button
        key={option.value}
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => toggle(option.value)}
        className="group rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          backgroundColor: checked ? tokens.brandSubtle : tokens.bgBase,
          borderColor: checked ? tokens.brand : tokens.divider,
        }}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border"
            style={{
              backgroundColor: checked ? tokens.brand : "transparent",
              borderColor: checked ? tokens.brand : tokens.divider,
              color: checked ? tokens.textInverse : "transparent",
            }}
          >
            {checked && <Check className="h-3 w-3" strokeWidth={3} />}
          </span>
          <div className="min-w-0 flex-1">
            <span
              className="text-[13px] font-medium"
              style={{ color: tokens.textPrimary }}
            >
              {option.value}
            </span>
            <p
              className="mt-1 text-[12px] leading-relaxed"
              style={{ color: tokens.textSecondary }}
            >
              {option.description}
            </p>
          </div>
        </div>
      </button>
    )
  }

  return (
    <CardShell
      tokens={tokens}
      icon={<ListChecks className="h-4 w-4" />}
      title="O que torna um atendimento bom?"
      reason="Marque os dados que o agente deve coletar de cada contato antes de qualificá-lo. Você pode ajustar depois."
      actions={[
        {
          label: "Confirmar critérios",
          onClick: handleConfirm,
          variant: "primary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled,
        },
      ]}
    >
      <div className="flex flex-col gap-2">
        {QUALIFICATION_OPTIONS.map(renderOption)}
      </div>
    </CardShell>
  )
}

export default QualificationCard
