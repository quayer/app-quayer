"use client"

import * as React from "react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

import { useChatActions } from "../../chat/chat-action-context"
import { PlanPickerCard, type PlanSummary } from "../plan-picker-card"
import { safeGet } from "./index"

interface ProposePlanUpgradeResultProps {
  result: unknown
  tokens: AppTokens
}

/**
 * Adapter for `propose_plan_upgrade`. Renders PlanPickerCard and, on
 * "Escolher", opens /org/billing in a new tab with the chosen slug +
 * posts a chat message so the Builder knows the intent.
 */
export function ProposePlanUpgradeResult({
  result,
  tokens,
}: ProposePlanUpgradeResultProps) {
  const actions = useChatActions()
  const [chosen, setChosen] = React.useState<string | null>(null)

  const plans = safeGet<PlanSummary[]>(result, "plans") ?? []
  const highlight = safeGet<string | null>(result, "highlight") ?? null
  const reason = safeGet<string | null>(result, "reason") ?? null

  const handleChoose = React.useCallback(
    (slug: string) => {
      if (chosen || !actions || actions.isStreaming) return
      setChosen(slug)

      if (typeof window !== "undefined") {
        window.open(
          `/org/billing?plan=${encodeURIComponent(slug)}`,
          "_blank",
          "noopener,noreferrer",
        )
      }

      actions.sendMessage(
        `Abri o checkout do plano ${slug}. Me avise quando estiver pago para continuarmos.`,
      )
    },
    [actions, chosen],
  )

  return (
    <PlanPickerCard
      plans={plans}
      tokens={tokens}
      highlight={highlight}
      reason={reason}
      onChoose={handleChoose}
      disabled={chosen !== null}
    />
  )
}
