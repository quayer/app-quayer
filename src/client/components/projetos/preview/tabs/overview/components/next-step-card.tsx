"use client"

import {
  ArrowRight,
  BookOpenText,
  Image as ImageIcon,
  MessageCircle,
  Play,
  Rocket,
} from "lucide-react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type { PreviewTab } from "@/client/components/projetos/types"
import type {
  PhaseId,
  Readiness,
  StepId,
} from "@/server/ai-module/builder/state/readiness.types"
import type { DeployGate } from "../../../deploy-gate"

interface NextStepCardProps {
  readiness: Readiness
  deployGate: DeployGate
  onTabChange?: (tab: PreviewTab) => void
  tokens: AppTokens
}

type LucideIcon = typeof MessageCircle

interface NextStepAction {
  label: string
  icon: LucideIcon
  tab?: PreviewTab
  focusChat?: boolean
  disabled?: boolean
  title?: string
}

const PHASE_LABEL: Record<PhaseId, string> = {
  conhecer: "Conhecer",
  revisar: "Revisar",
  testar: "Testar",
  lancar: "Lançar",
}

function phaseLabel(readiness: Readiness): string | null {
  const phase = readiness.journey?.activePhaseId
  if (!phase) return null
  return PHASE_LABEL[phase]
}

function actionForStep(
  stepId: StepId,
  readiness: Readiness,
  deployGate: DeployGate,
): NextStepAction {
  if (readiness.isDeployReady) {
    return {
      label: "Publicar agora",
      icon: Rocket,
      tab: "deploy",
      disabled: !deployGate.allowed,
      title: deployGate.reason ?? undefined,
    }
  }

  switch (stepId) {
    case "knowledge":
      return { label: "Abrir Conhecimento", icon: BookOpenText, tab: "knowledge" }
    case "media":
      return { label: "Abrir Mídias", icon: ImageIcon, tab: "media" }
    case "test_drive":
      return { label: "Testar agente", icon: Play, tab: "playground" }
    case "summary":
      return {
        label: "Abrir publicação",
        icon: Rocket,
        tab: "deploy",
        disabled: !deployGate.allowed,
        title: deployGate.reason ?? undefined,
      }
    default:
      return { label: "Continuar no chat", icon: MessageCircle, focusChat: true }
  }
}

function focusChat(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent("builder:focus-chat"))
}

export function NextStepCard({
  readiness,
  deployGate,
  onTabChange,
  tokens,
}: NextStepCardProps) {
  const action = actionForStep(readiness.step.id, readiness, deployGate)
  const Icon = action.icon
  const phase = phaseLabel(readiness)

  const handleClick = () => {
    if (action.disabled) return
    if (action.tab) {
      onTabChange?.(action.tab)
      return
    }
    if (action.focusChat) focusChat()
  }

  return (
    <section
      aria-label="Próximo passo"
      className="rounded-xl border p-4"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.brandBorder,
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: tokens.brand }}
            >
              Próximo passo
            </span>
            {phase && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: tokens.brandSubtle,
                  color: tokens.brandText,
                }}
              >
                {phase}
              </span>
            )}
          </div>
          <h2
            className="text-base font-semibold leading-snug"
            style={{ color: tokens.textPrimary }}
          >
            {readiness.step.title}
          </h2>
          <p
            className="max-w-xl text-[13px] leading-relaxed"
            style={{ color: tokens.textSecondary }}
          >
            {readiness.step.ask}
          </p>
        </div>

        <button
          type="button"
          onClick={handleClick}
          disabled={action.disabled}
          title={action.title}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-[12px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundColor: tokens.brand,
            color: tokens.textInverse,
          }}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {action.label}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}

