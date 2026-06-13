"use client"

import * as React from "react"
import { Check, ClipboardList, RotateCcw, Trash2 } from "lucide-react"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"
import type {
  ConversationBlueprint,
  ConversationBlueprintEditable,
} from "@/server/ai-module/builder/playbook/blueprint.schema"

export type ConversationBlueprintPayload =
  | { action: "generate"; contextDecision?: ConversationBlueprintContextDecision }
  | {
      action: "approve"
      blueprint: ConversationBlueprintEditable
      contextDecision?: ConversationBlueprintContextDecision
    }

type SoldOutStrategy =
  | "interest_list"
  | "human_confirm"
  | "available_confirmed"

type ConversationBlueprintContextDecision = {
  kind: "sold_out"
  strategy: SoldOutStrategy
}

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

function cloneEditable(
  blueprint: ConversationBlueprint | undefined,
): ConversationBlueprintEditable | null {
  if (!blueprint) return null
  return {
    objective: blueprint.objective,
    niche: blueprint.niche,
    stages: blueprint.stages,
    questions: blueprint.questions,
    variables: blueprint.variables,
    skipRules: blueprint.skipRules,
    successCriteria: blueprint.successCriteria,
    handoffTriggers: blueprint.handoffTriggers,
    toolTriggers: blueprint.toolTriggers,
    objectionRules: blueprint.objectionRules,
    doRules: blueprint.doRules,
    dontRules: blueprint.dontRules,
    sourceRefs: blueprint.sourceRefs,
  }
}

function compact(items: readonly string[], empty: string): string {
  if (items.length === 0) return empty
  const head = items.slice(0, 3).join(" · ")
  return items.length > 3 ? `${head} · +${items.length - 3}` : head
}

function foldText(values: readonly (string | undefined)[]): string {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

function hasSoldOutSignal(value: CardComponentProps["value"]): boolean {
  const proposed = value.sourceIngestion.proposed
  const text = foldText([
    value.identity.description,
    proposed?.description,
    ...(proposed?.services ?? []),
    ...(proposed?.differentiators ?? []),
  ])
  return /(100%\s*vendido|cem por cento vendido|esgotad[oa]|vendid[oa])/.test(text)
}

function hasRedundantPhoneQuestion(
  draft: ConversationBlueprintEditable | null,
): boolean {
  if (!draft) return false
  return draft.questions.some((question) =>
    /\b(telefone|whatsapp|numero de contato|n[uú]mero de contato|melhor numero|melhor n[uú]mero)\b/.test(
      foldText([question.text, question.purpose]),
    ),
  )
}

function SoldOutDecisionBox({
  tokens,
  value,
  disabled = false,
  onChange,
}: {
  tokens: CardComponentProps["tokens"]
  value: SoldOutStrategy | undefined
  disabled?: boolean
  onChange: (next: SoldOutStrategy) => void
}) {
  return (
    <div
      className="rounded-md border px-3 py-2 text-[12px] leading-relaxed"
      style={{
        borderColor: tokens.warning,
        backgroundColor: tokens.warningSubtle,
        color: tokens.warningText,
      }}
    >
      <p className="font-medium">
        A fonte indica que o empreendimento pode estar 100% vendido ou esgotado.
      </p>
      <p className="mt-1">
        Antes de gerar o plano, defina como o SDR deve tratar essa restrição.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {SOLD_OUT_DECISION_OPTIONS.map((option) => {
          const selected = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className="rounded-md border px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                borderColor: selected ? tokens.warning : tokens.divider,
                backgroundColor: selected ? tokens.bgSurface : tokens.bgBase,
                color: tokens.textPrimary,
              }}
            >
              <span className="block text-[12px] font-semibold">
                {option.label}
              </span>
              <span
                className="mt-0.5 block text-[11px] leading-snug"
                style={{ color: tokens.textSecondary }}
              >
                {option.description}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function ConversationBlueprintCard({
  value,
  disabled = false,
  onSubmit,
  tokens,
}: CardComponentProps<ConversationBlueprintPayload>) {
  const initial = React.useMemo(
    () => cloneEditable(value.conversationBlueprint),
    // Mount-only: late regenerated blueprints should not overwrite local edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [draft, setDraft] =
    React.useState<ConversationBlueprintEditable | null>(initial)
  const [ignoredBlueprint, setIgnoredBlueprint] =
    React.useState<ConversationBlueprint | undefined>()
  const [soldOutDecision, setSoldOutDecision] =
    React.useState<SoldOutStrategy | undefined>()

  React.useEffect(() => {
    if (draft !== null) return
    if (
      value.conversationBlueprint &&
      value.conversationBlueprint === ignoredBlueprint
    ) {
      return
    }
    const next = cloneEditable(value.conversationBlueprint)
    if (!next) return
    // Seed a blueprint that arrives after the card first mounted, without
    // overwriting edits once the user has a draft on screen.
    setDraft(next)
    setIgnoredBlueprint(undefined)
  }, [draft, ignoredBlueprint, value.conversationBlueprint])

  const hasBlueprint = draft !== null && draft.questions.length > 0
  const approved = value.conversationBlueprint?.status === "approved"
  // FR-44 (backlog #3) — quando o passo `restrictions` (fase Revisar, ANTES do plano)
  // já decidiu a estratégia de esgotado, a decisão vive no state e o gate do plano a
  // usa server-side. NÃO re-perguntamos aqui: esconde o bloco de sold-out.
  const restrictionsDecided =
    value.restrictions?.soldOutStrategy !== undefined
  const soldOutWarning = hasSoldOutSignal(value) && !restrictionsDecided
  const needsSoldOutDecision = soldOutWarning && !soldOutDecision && !approved
  const redundantPhoneWarning = hasRedundantPhoneQuestion(draft)
  const primaryLabel = approved
    ? "Plano aprovado"
    : hasBlueprint
      ? "Aprovar plano"
      : "Gerar plano"

  const updateQuestion = React.useCallback((id: string, text: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            questions: current.questions.map((question) =>
              question.id === id ? { ...question, text } : question,
            ),
          }
        : current,
    )
  }, [])

  const removeQuestion = React.useCallback((id: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            questions: current.questions.filter((question) => question.id !== id),
          }
        : current,
    )
  }, [])

  const handleApprove = React.useCallback(() => {
    if (!draft || disabled || draft.questions.length === 0) return
    if (soldOutWarning && !soldOutDecision) return
    onSubmit({
      action: "approve",
      blueprint: draft,
      ...(soldOutWarning && soldOutDecision
        ? {
            contextDecision: {
              kind: "sold_out",
              strategy: soldOutDecision,
            },
          }
        : {}),
    })
  }, [disabled, draft, onSubmit, soldOutDecision, soldOutWarning])

  const handleGenerate = React.useCallback(() => {
    if (disabled || approved) return
    if (soldOutWarning && !soldOutDecision) return
    setIgnoredBlueprint(value.conversationBlueprint)
    setDraft(null)
    onSubmit({
      action: "generate",
      ...(soldOutWarning && soldOutDecision
        ? {
            contextDecision: {
              kind: "sold_out",
              strategy: soldOutDecision,
            },
          }
        : {}),
    })
  }, [
    approved,
    disabled,
    onSubmit,
    soldOutDecision,
    soldOutWarning,
    value.conversationBlueprint,
  ])

  const handlePrimaryAction = hasBlueprint ? handleApprove : handleGenerate
  const actions = [
    {
      label: primaryLabel,
      onClick: handlePrimaryAction,
      variant: "primary" as const,
      icon: hasBlueprint ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <ClipboardList className="h-3.5 w-3.5" />
      ),
      disabled: disabled || approved || needsSoldOutDecision,
    },
    ...(hasBlueprint && !approved
      ? [
          {
            label: "Gerar de novo",
            onClick: handleGenerate,
            variant: "secondary" as const,
            icon: <RotateCcw className="h-3.5 w-3.5" />,
            disabled: disabled || needsSoldOutDecision,
          },
        ]
      : []),
  ]

  return (
    <CardShell
      tokens={tokens}
      icon={<ClipboardList className="h-4 w-4" />}
      title="Plano de atendimento"
      reason={
        hasBlueprint
          ? "Revise as perguntas que o agente vai conduzir. Ajuste só o que discordar."
          : "Gere uma sugestão de plano de atendimento a partir do objetivo e do negócio."
      }
      actions={actions}
    >
      {!hasBlueprint ? (
        <div className="flex flex-col gap-3">
          {soldOutWarning && (
            <SoldOutDecisionBox
              tokens={tokens}
              value={soldOutDecision}
              disabled={disabled}
              onChange={setSoldOutDecision}
            />
          )}
          <p
            className="text-[13px] leading-relaxed"
            style={{ color: tokens.textSecondary }}
          >
            {needsSoldOutDecision
              ? "Escolha como tratar a restrição da fonte antes de gerar o plano."
              : "O plano de atendimento ainda não foi criado. Use o botão para gerar a proposta e revisar as perguntas antes de montar o agente."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {soldOutWarning && (
            <SoldOutDecisionBox
              tokens={tokens}
              value={soldOutDecision}
              disabled={disabled || approved}
              onChange={setSoldOutDecision}
            />
          )}

          {redundantPhoneWarning && (
            <div
              className="rounded-md border px-3 py-2 text-[12px] leading-relaxed"
              style={{
                borderColor: tokens.warning,
                backgroundColor: tokens.warningSubtle,
                color: tokens.warningText,
              }}
            >
              O plano de atendimento pergunta telefone, mas no WhatsApp esse dado já vem do
              próprio canal. Remova essa pergunta ou troque por um próximo passo
              mais útil antes de aprovar.
            </div>
          )}

          <div
            className="rounded-md border px-3 py-2"
            style={{ borderColor: tokens.divider, backgroundColor: tokens.bgBase }}
          >
            <p
              className="text-[12px] font-semibold uppercase"
              style={{ color: tokens.textTertiary }}
            >
              Resumo
            </p>
            <p
              className="mt-1 text-[13px] leading-relaxed"
              style={{ color: tokens.textPrimary }}
            >
              {draft.objective ?? "Objetivo a revisar"}
            </p>
            <p
              className="mt-1 text-[12px] leading-relaxed"
              style={{ color: tokens.textSecondary }}
            >
              {draft.stages.length} etapa(s) · {draft.questions.length} pergunta(s)
              {draft.toolTriggers.length > 0
                ? ` · ${draft.toolTriggers.length} capacidade(s)`
                : ""}
            </p>
          </div>

          <section>
            <h3
              className="text-[12px] font-semibold uppercase"
              style={{ color: tokens.textTertiary }}
            >
              Etapas
            </h3>
            <div className="mt-2 flex flex-col gap-2">
              {draft.stages.map((stage) => (
                <div
                  key={stage.id}
                  className="border-t pt-2 first:border-t-0 first:pt-0"
                  style={{ borderColor: tokens.divider }}
                >
                  <p
                    className="text-[13px] font-medium"
                    style={{ color: tokens.textPrimary }}
                  >
                    {stage.title}
                  </p>
                  <p
                    className="text-[12px] leading-relaxed"
                    style={{ color: tokens.textSecondary }}
                  >
                    {stage.goal}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3
              className="text-[12px] font-semibold uppercase"
              style={{ color: tokens.textTertiary }}
            >
              Perguntas
            </h3>
            <div className="mt-2 flex flex-col gap-3">
              {draft.questions.map((question, index) => (
                <div
                  key={question.id}
                  className="border-t pt-3 first:border-t-0 first:pt-0"
                  style={{ borderColor: tokens.divider }}
                >
                  <div className="flex items-start gap-2">
                    <label className="min-w-0 flex-1">
                      <span
                        className="mb-1 block text-[11px] font-medium"
                        style={{ color: tokens.textTertiary }}
                      >
                        Pergunta {index + 1}
                      </span>
                      <textarea
                        value={question.text}
                        disabled={disabled || approved}
                        onChange={(event) =>
                          updateQuestion(question.id, event.target.value)
                        }
                        rows={2}
                        className="w-full resize-none rounded-md border px-2.5 py-2 text-[13px] leading-relaxed outline-none transition-colors disabled:opacity-60"
                        style={{
                          borderColor: tokens.divider,
                          backgroundColor: tokens.bgBase,
                          color: tokens.textPrimary,
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      aria-label="Remover pergunta"
                      disabled={disabled || approved || draft.questions.length <= 1}
                      onClick={() => removeQuestion(question.id)}
                      className="mt-6 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                      style={{
                        borderColor: tokens.divider,
                        color: tokens.textSecondary,
                        backgroundColor: tokens.bgSurface,
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <p
                    className="mt-1 text-[12px] leading-relaxed"
                    style={{ color: tokens.textSecondary }}
                  >
                    Descobre: {question.purpose}
                  </p>
                  <p
                    className="text-[12px] leading-relaxed"
                    style={{ color: tokens.textTertiary }}
                  >
                    Pular quando: {question.skipWhenKnown}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {(draft.handoffTriggers.length > 0 || draft.toolTriggers.length > 0) && (
            <section>
              <h3
                className="text-[12px] font-semibold uppercase"
                style={{ color: tokens.textTertiary }}
              >
                Gatilhos
              </h3>
              <p
                className="mt-1 text-[12px] leading-relaxed"
                style={{ color: tokens.textSecondary }}
              >
                Humano: {compact(draft.handoffTriggers, "nenhum")}
              </p>
              <p
                className="text-[12px] leading-relaxed"
                style={{ color: tokens.textSecondary }}
              >
                Ferramentas:{" "}
                {compact(
                  draft.toolTriggers.map((trigger) => trigger.capability),
                  "nenhuma",
                )}
              </p>
            </section>
          )}
        </div>
      )}
    </CardShell>
  )
}

export default ConversationBlueprintCard
