"use client"

import * as React from "react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

import { useChatActions } from "../../chat/chat-action-context"
import { ApprovalCard } from "../approval-card"
import { safeGet } from "./index"

interface ProposeAgentCreationResultProps {
  result: unknown
  tokens: AppTokens
}

/**
 * Adapter for `propose_agent_creation` tool result. Renders ApprovalCard
 * with "Criar Agente" / "Ajustar" CTAs wired to sendMessage.
 *
 * Once a CTA is clicked, the card locks so the transcript stays
 * immutable (clicking the same proposal twice would be a footgun).
 */
export function ProposeAgentCreationResult({
  result,
  tokens,
}: ProposeAgentCreationResultProps) {
  const actions = useChatActions()
  const [decided, setDecided] = React.useState(false)

  const agentName =
    safeGet<string>(result, "proposedName") ?? "Agente sem nome"
  const description = safeGet<string>(result, "proposedDescription") ?? undefined

  const handleApprove = React.useCallback(() => {
    if (decided || !actions || actions.isStreaming) return
    setDecided(true)
    actions.sendMessage("Pode criar, tá bom assim. 👍")
  }, [actions, decided])

  const handleAdjust = React.useCallback(() => {
    if (decided || !actions || actions.isStreaming) return
    setDecided(true)
    actions.sendMessage("Quero ajustar antes — ")
  }, [actions, decided])

  return (
    <ApprovalCard
      agentName={agentName}
      description={description}
      tokens={tokens}
      onApprove={handleApprove}
      onAdjust={handleAdjust}
    />
  )
}
