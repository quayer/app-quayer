"use client"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

import type { BuilderState } from "./types"
import { RefinementCard } from "./refinement-card"
import { requestRefinementRun } from "./refinement-run-request"
import {
  getRefinementRunSummary,
  type RefinementRunToolSummary,
} from "../tool-call-helpers"

interface RenderRefinementToolCardInput {
  toolName: string
  result?: unknown
  streaming?: boolean
  projectId: string
  value: BuilderState
  disabled?: boolean
  tokens: AppTokens
  onDraft: (content: string) => void
}

function runningSummary(): RefinementRunToolSummary {
  return {
    success: true,
    status: "running",
    message: "Validando plano de atendimento, perguntas, segurança e experiência.",
  }
}

export function renderRefinementToolCard({
  toolName,
  result,
  streaming = false,
  projectId,
  value,
  disabled = false,
  tokens,
  onDraft,
}: RenderRefinementToolCardInput) {
  if (toolName !== "run_agent_refinement") return null

  return (
    <RefinementCard
      projectId={projectId}
      cardKey="refinement"
      value={value}
      disabled={disabled || streaming}
      tokens={tokens}
      toolSummary={streaming ? runningSummary() : getRefinementRunSummary(result)}
      onRun={() => requestRefinementRun(onDraft)}
      onSubmit={() => {}}
    />
  )
}
