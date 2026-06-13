"use client"

/**
 * Builder Cards — diagnosis (Jornada v3 · Modo Pesquisa, FR-46/FR-47 · backlog #9)
 *
 * ACTIVE-STEP card da fase "Conhecer" (DEPOIS de build_mode/source e ANTES de
 * mission), gateado pelo engine v2 via
 * applies:(s)=>s.missionFirst===true && s.buildMode==='pesquisa'. É um card
 * READ-MOSTLY de ACK: o Modo Pesquisa montou um diagnóstico do negócio e o usuário
 * só CONFIRMA o que entendemos antes de seguir para a missão.
 *
 * O que exibe (derivado do builderState, SEM fetch):
 *   - Negócio        : project.name OU sourceIngestion.proposed.businessName.
 *   - Objetivo       : project.objective.
 *   - Serviços/      : sourceIngestion.proposed.services / .differentiators
 *     diferenciais     (detectados na pesquisa/fonte).
 *   - Endereço       : identity.address OU sourceIngestion.proposed.address.
 *
 * DEGRADAÇÃO GRACIOSA (FR-47): quando NÃO há nenhum sinal de pesquisa externa
 * (serviços/diferenciais/endereço da fonte ausentes), o card mostra só o que há +
 * uma linha honesta "Pesquisa de mercado externa indisponível no momento —
 * seguindo com o que entendi do seu negócio." Nunca quebra: se literalmente nada
 * estiver preenchido, ainda mostra o aviso e o botão Continuar (o ack segue válido).
 *
 * Presentational only: lê seu slice de `props.value` e dispara o payload tipado via
 * `props.onSubmit` (chat-panel owns POST + SSE — o card NUNCA faz fetch).
 * Token-driven via `tokens` (zero cor hard-coded). Copy PT-BR (FR-49).
 *
 * Contract (CARD CONTRACTS): cardKey 'diagnosis'
 *   payload  → { cardKey: 'diagnosis', action: 'ack' }
 *   sentinel → confirmations.diagnosis
 */

import * as React from "react"
import { Check, Info, Search } from "lucide-react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"

/** EXACT submit payload for cardKey 'diagnosis' (mirror of diagnosisPayloadSchema). */
export interface DiagnosisPayload {
  cardKey: "diagnosis"
  action: "ack"
}

/** Trim a value to undefined when blank so we never render an empty row. */
function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

/** Re-trim + drop empties from a list (read-only display helper). */
function cleanList(values: readonly string[] | undefined): string[] {
  if (!values) return []
  const out: string[] = []
  for (const raw of values) {
    const trimmed = raw.trim()
    if (trimmed.length > 0) out.push(trimmed)
  }
  return out
}

/** Uma linha de fato detectado: rótulo + valor (texto ou chips). */
interface FactRowProps {
  label: string
  tokens: AppTokens
  children: React.ReactNode
}

function FactRow({ label, tokens, children }: FactRowProps) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-[11px] font-medium uppercase tracking-wide"
        style={{ color: tokens.textTertiary }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

/**
 * DiagnosisCard — mostra o que JÁ sabemos do negócio (derivado do builderState) e
 * pede um ACK ("Continuar") para seguir. Degradação graciosa quando não há dados de
 * pesquisa externa. Desabilitado enquanto o chat está streamando.
 */
export function DiagnosisCard({
  value,
  disabled = false,
  onSubmit,
  tokens,
}: CardComponentProps<DiagnosisPayload>) {
  // Negócio: nome do projeto OU o businessName proposto pela fonte/pesquisa.
  const businessName =
    clean(value.project.name) ??
    clean(value.sourceIngestion.proposed?.businessName)
  const objective = clean(value.project.objective)
  // Serviços/diferenciais detectados na pesquisa/fonte (PROPOSED).
  const services = cleanList(value.sourceIngestion.proposed?.services)
  const differentiators = cleanList(
    value.sourceIngestion.proposed?.differentiators,
  )
  // Endereço: owned (identity) tem precedência; senão o proposto pela fonte.
  const address =
    clean(value.identity.address) ??
    clean(value.sourceIngestion.proposed?.address)

  // FR-47 — "pesquisa externa indisponível" quando NENHUM sinal de pesquisa de
  // mercado (serviços/diferenciais/endereço da fonte) chegou. Nome/objetivo são
  // entrada do próprio usuário, então não contam como "pesquisa externa".
  const hasExternalResearch =
    services.length > 0 || differentiators.length > 0 || address !== undefined

  const handleAck = React.useCallback(() => {
    if (disabled) return
    onSubmit({ cardKey: "diagnosis", action: "ack" })
  }, [disabled, onSubmit])

  const renderChips = (items: readonly string[]) => (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border px-2.5 py-0.5 text-[12px]"
          style={{
            backgroundColor: tokens.bgBase,
            borderColor: tokens.divider,
            color: tokens.textSecondary,
          }}
        >
          {item}
        </span>
      ))}
    </div>
  )

  return (
    <CardShell
      tokens={tokens}
      icon={<Search className="h-4 w-4" />}
      title="O que entendi do seu negócio"
      reason="Montei este diagnóstico a partir do que você contou e da pesquisa que fiz. Confira e siga em frente — você pode ajustar detalhes nos próximos passos."
      actions={[
        {
          label: "Continuar",
          onClick: handleAck,
          variant: "primary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled,
        },
      ]}
    >
      <div className="flex flex-col gap-3.5">
        {businessName !== undefined && (
          <FactRow label="Negócio" tokens={tokens}>
            <span
              className="text-[13px] font-medium"
              style={{ color: tokens.textPrimary }}
            >
              {businessName}
            </span>
          </FactRow>
        )}

        {objective !== undefined && (
          <FactRow label="Objetivo" tokens={tokens}>
            <p
              className="text-[13px] leading-relaxed"
              style={{ color: tokens.textPrimary }}
            >
              {objective}
            </p>
          </FactRow>
        )}

        {services.length > 0 && (
          <FactRow label="Serviços detectados" tokens={tokens}>
            {renderChips(services)}
          </FactRow>
        )}

        {differentiators.length > 0 && (
          <FactRow label="Diferenciais detectados" tokens={tokens}>
            {renderChips(differentiators)}
          </FactRow>
        )}

        {address !== undefined && (
          <FactRow label="Endereço" tokens={tokens}>
            <span
              className="text-[13px] leading-relaxed"
              style={{ color: tokens.textPrimary }}
            >
              {address}
            </span>
          </FactRow>
        )}

        {/* FR-47 — degradação graciosa: sem sinal de pesquisa externa, avisa de
            forma honesta e segue com o que há (nunca quebra). */}
        {!hasExternalResearch && (
          <div
            className="flex items-start gap-2 rounded-md border p-2.5"
            style={{ backgroundColor: tokens.bgBase, borderColor: tokens.divider }}
          >
            <Info
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              style={{ color: tokens.textTertiary }}
              aria-hidden="true"
            />
            <p
              className="text-[12px] leading-relaxed"
              style={{ color: tokens.textTertiary }}
            >
              Pesquisa de mercado externa indisponível no momento — seguindo com o
              que entendi do seu negócio.
            </p>
          </div>
        )}
      </div>
    </CardShell>
  )
}

export default DiagnosisCard
