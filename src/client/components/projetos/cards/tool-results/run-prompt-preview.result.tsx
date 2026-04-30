"use client"

import * as React from "react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

import { useChatActions } from "../../chat/chat-action-context"
import { ExamplePreviewCard, type PreviewExample } from "../example-preview-card"
import { safeGet } from "./index"

interface RunPromptPreviewResultProps {
  result: unknown
  tokens: AppTokens
}

/**
 * Adapter for `run_prompt_preview` — renders the ExamplePreviewCard with
 * Approve/Adjust CTAs wired to sendMessage.
 */
export function RunPromptPreviewResult({
  result,
  tokens,
}: RunPromptPreviewResultProps) {
  const actions = useChatActions()
  const [decided, setDecided] = React.useState(false)

  const agentName = safeGet<string>(result, "agentName") ?? "Agente"
  const examples =
    safeGet<PreviewExample[]>(result, "examples") ??
    ([] as PreviewExample[])

  if (examples.length === 0) return null

  const handleApprove = React.useCallback(() => {
    if (decided || !actions || actions.isStreaming) return
    setDecided(true)
    actions.sendMessage("Ficou ótimo, pode seguir com esse prompt.")
  }, [actions, decided])

  const handleAdjust = React.useCallback(() => {
    if (decided || !actions || actions.isStreaming) return
    setDecided(true)
    actions.sendMessage("Quero ajustar o tom — ")
  }, [actions, decided])

  return (
    <ExamplePreviewCard
      agentName={agentName}
      examples={examples}
      tokens={tokens}
      onApprove={handleApprove}
      onAdjust={handleAdjust}
      decided={decided}
    />
  )
}
