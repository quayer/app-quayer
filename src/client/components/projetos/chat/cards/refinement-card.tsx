"use client"

import * as React from "react"
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"
import type {
  RefinementBlocker,
  RefinementCheckSummary,
  RefinementState,
} from "@/server/ai-module/builder/cards/builder-state"
import type { RefinementRunToolSummary } from "../tool-call-helpers"

type CheckDisplayStatus =
  | RefinementCheckSummary["status"]
  | "running"
  | "pending"

interface DisplayCheck {
  id: string
  label: string
  status: CheckDisplayStatus
  severity?: RefinementCheckSummary["severity"]
  evidence?: string
  recommendation?: string
}

const DEFAULT_CHECKS: readonly DisplayCheck[] = [
  { id: "route", label: "Plano de atendimento", status: "pending" },
  { id: "questions", label: "Perguntas", status: "pending" },
  { id: "knowledge", label: "Conhecimento", status: "pending" },
  { id: "tools", label: "Ferramentas", status: "pending" },
  { id: "safety", label: "Segurança", status: "pending" },
  { id: "ux", label: "UX", status: "pending" },
]

const CHECK_LABELS: Record<string, string> = {
  route: "Plano de atendimento",
  roteiro: "Plano de atendimento",
  "plano de atendimento": "Plano de atendimento",
  question: "Perguntas",
  questions: "Perguntas",
  perguntas: "Perguntas",
  safety: "Segurança",
  seguranca: "Segurança",
  security: "Segurança",
  tool: "Ferramentas",
  tools: "Ferramentas",
  ferramenta: "Ferramentas",
  ferramentas: "Ferramentas",
  knowledge: "Conhecimento",
  conhecimento: "Conhecimento",
  ux: "UX",
  copy: "UX",
  auditor: "Auditor",
}

export interface RefinementCardProps
  extends CardComponentProps<never> {
  /** Summary returned by the current `run_agent_refinement` tool call. */
  toolSummary?: RefinementRunToolSummary | null
  /** Optional free-form trigger used by inline tool cards to ask the agent to run it. */
  onRun?: () => void
}

function scoreLabel(score: number | undefined): string {
  return typeof score === "number" && Number.isFinite(score)
    ? `${Math.round(score)}/100`
    : "—"
}

function normalizeLabel(check: RefinementCheckSummary): string {
  if (check.label?.trim()) {
    const lower = check.label.trim().toLowerCase()
    return CHECK_LABELS[lower] ?? check.label.trim()
  }

  const prefix = check.checkId.split(/[.:_-]/)[0]?.toLowerCase() ?? check.checkId
  return CHECK_LABELS[prefix] ?? check.checkId
}

function checksForDisplay(
  refinement: RefinementState | undefined,
  status: RefinementState["status"],
): DisplayCheck[] {
  if (refinement?.checks.length) {
    return refinement.checks.map((check) => ({
      id: check.checkId,
      label: normalizeLabel(check),
      status: check.status,
      severity: check.severity,
      evidence: check.evidence,
      recommendation: check.recommendation,
    }))
  }

  if (status === "running") {
    return DEFAULT_CHECKS.map((check) => ({ ...check, status: "running" }))
  }

  return DEFAULT_CHECKS.map((check) => ({ ...check }))
}

function statusCopy(status: RefinementState["status"]) {
  switch (status) {
    case "running":
      return {
        title: "Refinando em andamento",
        reason:
          "Estou testando o plano de atendimento, as perguntas e os limites do agente antes da publicação.",
      }
    case "passed":
      return {
        title: "Refinamento concluído",
        reason:
          "Os checks principais passaram. Revise o resumo e siga para publicar quando estiver pronto.",
      }
    case "failed":
      return {
        title: "Corrigir antes de publicar",
        reason:
          "Há falhas críticas no refinamento. Resolva os bloqueios antes de colocar o agente no ar.",
      }
    case "needs_user_decision":
      return {
        title: "Precisa decidir ajustes",
        reason:
          "O refinamento encontrou pontos que dependem de decisão de negócio antes da publicação.",
      }
    case "idle":
    default:
      return {
        title: "Refinando",
        reason:
          "Rode uma validação rápida antes de publicar para checar plano de atendimento, perguntas, segurança e experiência.",
      }
  }
}

function statusBadge(status: RefinementState["status"]) {
  switch (status) {
    case "running":
      return "Rodando"
    case "passed":
      return "Pronto"
    case "failed":
      return "Bloqueado"
    case "needs_user_decision":
      return "Decisão"
    case "idle":
    default:
      return "Não rodado"
  }
}

function statusTone(
  status: RefinementState["status"],
  tokens: CardComponentProps["tokens"],
) {
  if (status === "passed") {
    return {
      bg: tokens.successSubtle,
      border: tokens.success,
      text: tokens.successText,
      icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />,
    }
  }
  if (status === "failed") {
    return {
      bg: tokens.dangerSubtle,
      border: tokens.danger,
      text: tokens.dangerText,
      icon: <XCircle className="h-3.5 w-3.5" aria-hidden="true" />,
    }
  }
  if (status === "needs_user_decision") {
    return {
      bg: tokens.warningSubtle,
      border: tokens.warning,
      text: tokens.warningText,
      icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />,
    }
  }
  return {
    bg: tokens.brandSubtle,
    border: tokens.brandBorder,
    text: tokens.brandText,
    icon:
      status === "running" ? (
        <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />
      ),
  }
}

function checkTone(
  status: CheckDisplayStatus,
  tokens: CardComponentProps["tokens"],
) {
  if (status === "pass") {
    return {
      bg: tokens.successSubtle,
      text: tokens.successText,
      icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />,
      label: "ok",
    }
  }
  if (status === "fail") {
    return {
      bg: tokens.dangerSubtle,
      text: tokens.dangerText,
      icon: <XCircle className="h-3.5 w-3.5" aria-hidden="true" />,
      label: "falhou",
    }
  }
  if (status === "warning") {
    return {
      bg: tokens.warningSubtle,
      text: tokens.warningText,
      icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />,
      label: "aviso",
    }
  }
  if (status === "running") {
    return {
      bg: tokens.brandSubtle,
      text: tokens.brandText,
      icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />,
      label: "rodando",
    }
  }
  return {
    bg: tokens.hoverBg,
    text: tokens.textTertiary,
    icon: <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />,
    label: "pendente",
  }
}

function getStatus(
  refinement: RefinementState | undefined,
  toolSummary: RefinementRunToolSummary | null | undefined,
): RefinementState["status"] {
  if (refinement?.status) return refinement.status
  if (toolSummary?.status) return toolSummary.status
  if (toolSummary?.success === false) return "failed"
  return "idle"
}

function getScore(
  refinement: RefinementState | undefined,
  toolSummary: RefinementRunToolSummary | null | undefined,
): number | undefined {
  return refinement?.score ?? toolSummary?.score
}

function blockerCount(
  blockers: readonly RefinementBlocker[],
  toolSummary: RefinementRunToolSummary | null | undefined,
): number {
  return blockers.length || toolSummary?.blockerCount || 0
}

function compactCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function RefinementCard({
  value,
  disabled = false,
  tokens,
  toolSummary,
  onRun,
}: RefinementCardProps) {
  const refinement = value.refinement
  const status = getStatus(refinement, toolSummary)
  const score = getScore(refinement, toolSummary)
  const checks = checksForDisplay(refinement, status)
  const checksToShow = checks.slice(0, 6)
  const hiddenChecks = Math.max(0, checks.length - checksToShow.length)
  const blockers = refinement?.blockers ?? []
  const totalBlockers = blockerCount(blockers, toolSummary)
  const failedCount =
    refinement?.checks.filter((check) => check.status === "fail").length ??
    toolSummary?.failedCount ??
    0
  const warningCount =
    refinement?.checks.filter((check) => check.status === "warning").length ??
    toolSummary?.warningCount ??
    0
  const checkCount = refinement?.checks.length ?? toolSummary?.checkCount ?? 0
  const scenarioCount = toolSummary?.scenarioCount
  const copy = statusCopy(status)
  const badgeTone = statusTone(status, tokens)
  const canRun =
    typeof onRun === "function" &&
    value.conversationBlueprint?.status === "approved" &&
    status !== "running"
  const runDisabled = disabled || !canRun
  const runLabel =
    status === "idle" || toolSummary?.success === false
      ? "Rodar refinamento"
      : "Rodar de novo"

  const handleRun = React.useCallback(() => {
    if (runDisabled) return
    onRun?.()
  }, [onRun, runDisabled])

  return (
    <CardShell
      icon={<ShieldCheck className="h-4 w-4" />}
      title={copy.title}
      reason={copy.reason}
      tokens={tokens}
      actions={
        onRun
          ? [
              {
                label: runLabel,
                onClick: handleRun,
                variant: status === "idle" ? "primary" : "secondary",
                icon: <PlayCircle className="h-3.5 w-3.5" />,
                disabled: runDisabled,
              },
            ]
          : undefined
      }
    >
      <div className="flex flex-col gap-3">
        <div
          className="grid gap-3 rounded-md border p-3 sm:grid-cols-[auto_1fr]"
          style={{ borderColor: tokens.divider, backgroundColor: tokens.bgBase }}
        >
          <div
            className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-md border text-center"
            style={{
              borderColor: tokens.divider,
              backgroundColor: tokens.bgSurface,
            }}
          >
            <span
              className="text-[18px] font-semibold leading-none"
              style={{ color: tokens.textPrimary }}
            >
              {scoreLabel(score)}
            </span>
            <span
              className="mt-1 text-[10px] font-medium uppercase"
              style={{ color: tokens.textTertiary }}
            >
              score
            </span>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium"
                style={{
                  backgroundColor: badgeTone.bg,
                  borderColor: badgeTone.border,
                  color: badgeTone.text,
                }}
              >
                {badgeTone.icon}
                {statusBadge(status)}
              </span>
              {checkCount > 0 && (
                <span
                  className="text-[12px]"
                  style={{ color: tokens.textSecondary }}
                >
                  {compactCount(checkCount, "check", "checks")}
                </span>
              )}
              {scenarioCount != null && (
                <span
                  className="text-[12px]"
                  style={{ color: tokens.textSecondary }}
                >
                  {compactCount(scenarioCount, "cenário", "cenários")}
                </span>
              )}
            </div>

            <p
              className="mt-2 text-[12px] leading-relaxed"
              style={{ color: tokens.textSecondary }}
            >
              {totalBlockers > 0
                ? `${compactCount(totalBlockers, "bloqueio crítico", "bloqueios críticos")} encontrado(s).`
                : "Nenhum bloqueio crítico registrado."}
              {failedCount > 0
                ? ` ${compactCount(failedCount, "falha", "falhas")}.`
                : ""}
              {warningCount > 0
                ? ` ${compactCount(warningCount, "aviso", "avisos")}.`
                : ""}
            </p>

            {toolSummary?.message && (
              <p
                className="mt-1 text-[12px] leading-relaxed"
                style={{
                  color:
                    toolSummary.success === false
                      ? tokens.dangerText
                      : tokens.textTertiary,
                }}
              >
                {toolSummary.message}
              </p>
            )}

            {onRun && value.conversationBlueprint?.status !== "approved" && (
              <p
                className="mt-2 text-[12px] leading-relaxed"
                style={{ color: tokens.textTertiary }}
              >
                Aprove o plano de atendimento antes de rodar o refinamento.
              </p>
            )}
          </div>
        </div>

        <section>
          <h3
            className="text-[12px] font-semibold uppercase"
            style={{ color: tokens.textTertiary }}
          >
            Checks
          </h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {checksToShow.map((check) => {
              const tone = checkTone(check.status, tokens)
              return (
                <div
                  key={check.id}
                  className="rounded-md border px-3 py-2"
                  style={{
                    borderColor: tokens.divider,
                    backgroundColor: tokens.bgBase,
                  }}
                >
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span
                      className="truncate text-[13px] font-medium"
                      style={{ color: tokens.textPrimary }}
                    >
                      {check.label}
                    </span>
                    <span
                      className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ backgroundColor: tone.bg, color: tone.text }}
                    >
                      {tone.icon}
                      {tone.label}
                    </span>
                  </div>
                  {(check.evidence || check.recommendation) && (
                    <p
                      className="mt-1 line-clamp-2 text-[12px] leading-relaxed"
                      style={{ color: tokens.textSecondary }}
                    >
                      {check.recommendation ?? check.evidence}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          {hiddenChecks > 0 && (
            <p
              className="mt-2 text-[12px]"
              style={{ color: tokens.textTertiary }}
            >
              +{hiddenChecks} checks adicionais no resumo do refinamento.
            </p>
          )}
        </section>

        {(blockers.length > 0 || totalBlockers > 0) && (
          <section>
            <h3
              className="text-[12px] font-semibold uppercase"
              style={{ color: tokens.textTertiary }}
            >
              Bloqueios
            </h3>
            <div className="mt-2 flex flex-col gap-2">
              {blockers.length > 0 ? (
                blockers.slice(0, 3).map((blocker) => (
                  <div
                    key={blocker.checkId}
                    className="rounded-md border px-3 py-2"
                    style={{
                      borderColor: tokens.danger,
                      backgroundColor: tokens.dangerSubtle,
                    }}
                  >
                    <p
                      className="text-[13px] font-medium"
                      style={{ color: tokens.dangerText }}
                    >
                      {blocker.message}
                    </p>
                    {blocker.recommendation && (
                      <p
                        className="mt-1 text-[12px] leading-relaxed"
                        style={{ color: tokens.textSecondary }}
                      >
                        {blocker.recommendation}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p
                  className="rounded-md border px-3 py-2 text-[12px] leading-relaxed"
                  style={{
                    borderColor: tokens.warning,
                    backgroundColor: tokens.warningSubtle,
                    color: tokens.warningText,
                  }}
                >
                  O refinamento retornou bloqueios, mas os detalhes ainda não
                  chegaram no estado do Builder.
                </p>
              )}
            </div>
          </section>
        )}
      </div>
    </CardShell>
  )
}

export default RefinementCard
