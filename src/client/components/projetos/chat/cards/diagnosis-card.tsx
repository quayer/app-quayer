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

/** Rótulos amigáveis para as chaves de campo excluído ("não vou perguntar"). */
const EXCLUDED_FIELD_LABELS: Record<string, string> = {
  regiao: "região",
  regiao_desejada: "região",
  telefone: "telefone",
  preco_final: "preço final",
  diagnostico: "diagnóstico/sintomas",
}

function humanizeFieldKey(key: string): string {
  return EXCLUDED_FIELD_LABELS[key] ?? key.replace(/_/g, " ")
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

  // F5 (FR-46) — diagnóstico ESTRUTURADO da pesquisa de nicho (Modo Pesquisa).
  // Persistido pelo serviço determinístico no submit do build_mode; aqui só RENDER.
  const insights = value.diagnosisInsights
  const risks = cleanList(insights?.risks)
  const bestPractices = cleanList(insights?.bestPractices)
  const recommendedCapabilities = cleanList(insights?.recommendedCapabilities)
  const sources = (insights?.sources ?? []).filter(
    (s) => clean(s.url) !== undefined,
  )
  // `lite` = pesquisa rodou sem Tavily (só LLM) — confiança reduzida, aviso honesto.
  const isLite = insights?.lite === true

  // F5+ (Motor de Estratégia) — decisão estratégica auditável: o que vou priorizar
  // e o que NÃO vou perguntar (e por quê). Determinística, persistida no submit.
  const strategy = value.strategyDiagnosis
  const strategyReason = clean(strategy?.strategyReason)
  const suggestedFields = (strategy?.suggestedFields ?? []).filter(
    (f) => clean(f.label) !== undefined,
  )
  const excludedFields = (strategy?.excludedFields ?? []).filter(
    (e) => clean(e.reason) !== undefined,
  )
  const hasStrategy = suggestedFields.length > 0 || excludedFields.length > 0

  // FR-47 — degradação honesta. Há EVIDÊNCIA quando a pesquisa de nicho produziu
  // riscos/boas práticas/capacidades/fontes OU a fonte capturou serviços/diferenciais/
  // endereço. Nome/objetivo são entrada do próprio usuário, então não contam.
  const hasResearchEvidence =
    risks.length > 0 ||
    bestPractices.length > 0 ||
    recommendedCapabilities.length > 0 ||
    sources.length > 0 ||
    services.length > 0 ||
    differentiators.length > 0 ||
    address !== undefined
  // O aviso "lite/indisponível" aparece quando a pesquisa rodou só com o LLM OU
  // quando não há nenhum sinal de pesquisa externa (nem fontes nem dados da fonte).
  const showDegradationNote = isLite || !hasResearchEvidence

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

        {/* F5+ (Motor de Estratégia) — o que vou priorizar e o que NÃO vou
            perguntar (e por quê). É a decisão estratégica auditável. */}
        {hasStrategy && (
          <div
            className="flex flex-col gap-2.5 rounded-md border p-3"
            style={{ backgroundColor: tokens.bgBase, borderColor: tokens.divider }}
          >
            {strategyReason !== undefined && (
              <p
                className="text-[13px] leading-relaxed"
                style={{ color: tokens.textPrimary }}
              >
                {strategyReason}
              </p>
            )}

            {suggestedFields.length > 0 && (
              <div className="flex flex-col gap-1">
                <span
                  className="text-[11px] font-medium uppercase tracking-wide"
                  style={{ color: tokens.textTertiary }}
                >
                  Por isso vou priorizar
                </span>
                <ul className="flex flex-col gap-1">
                  {suggestedFields.map((f) => (
                    <li
                      key={f.key}
                      className="flex items-start gap-1.5 text-[13px] leading-relaxed"
                      style={{ color: tokens.textPrimary }}
                    >
                      <span aria-hidden="true" style={{ color: tokens.textTertiary }}>
                        •
                      </span>
                      <span>
                        <span className="font-medium">{f.label}</span>
                        {clean(f.reason) !== undefined ? ` — ${f.reason}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {excludedFields.length > 0 && (
              <div className="flex flex-col gap-1">
                <span
                  className="text-[11px] font-medium uppercase tracking-wide"
                  style={{ color: tokens.textTertiary }}
                >
                  Não vou perguntar
                </span>
                <ul className="flex flex-col gap-1">
                  {excludedFields.map((e) => (
                    <li
                      key={e.key}
                      className="flex items-start gap-1.5 text-[12px] leading-relaxed"
                      style={{ color: tokens.textSecondary }}
                    >
                      <span aria-hidden="true" style={{ color: tokens.textTertiary }}>
                        •
                      </span>
                      <span>
                        <span className="font-medium">{humanizeFieldKey(e.key)}</span>
                        {` — ${e.reason}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* F5 (FR-46) — riscos/boas práticas/capacidades da pesquisa de nicho. */}
        {risks.length > 0 && (
          <FactRow label="Pontos de atenção" tokens={tokens}>
            <ul className="flex flex-col gap-1">
              {risks.map((risk) => (
                <li
                  key={risk}
                  className="flex items-start gap-1.5 text-[13px] leading-relaxed"
                  style={{ color: tokens.textPrimary }}
                >
                  <span aria-hidden="true" style={{ color: tokens.textTertiary }}>
                    •
                  </span>
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          </FactRow>
        )}

        {bestPractices.length > 0 && (
          <FactRow label="Boas práticas do setor" tokens={tokens}>
            <ul className="flex flex-col gap-1">
              {bestPractices.map((bp) => (
                <li
                  key={bp}
                  className="flex items-start gap-1.5 text-[13px] leading-relaxed"
                  style={{ color: tokens.textPrimary }}
                >
                  <span aria-hidden="true" style={{ color: tokens.textTertiary }}>
                    •
                  </span>
                  <span>{bp}</span>
                </li>
              ))}
            </ul>
          </FactRow>
        )}

        {recommendedCapabilities.length > 0 && (
          <FactRow label="Capacidades recomendadas" tokens={tokens}>
            {renderChips(recommendedCapabilities)}
          </FactRow>
        )}

        {sources.length > 0 && (
          <FactRow label="Fontes" tokens={tokens}>
            <ul className="flex flex-col gap-1">
              {sources.map((s) => (
                <li key={s.url} className="text-[12px] leading-relaxed">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                    style={{ color: tokens.textSecondary }}
                  >
                    {clean(s.title) ?? s.url}
                  </a>
                </li>
              ))}
            </ul>
          </FactRow>
        )}

        {/* FR-47 — degradação honesta: pesquisa lite (só LLM) OU sem nenhum sinal
            de pesquisa externa. Nunca quebra: segue com o que há + aviso claro. */}
        {showDegradationNote && (
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
              {isLite
                ? "Pesquisa externa indisponível agora — este diagnóstico vem do conhecimento do assistente. Você pode ajustar tudo nos próximos passos."
                : "Pesquisa de mercado externa indisponível no momento — seguindo com o que entendi do seu negócio."}
            </p>
          </div>
        )}
      </div>
    </CardShell>
  )
}

export default DiagnosisCard
