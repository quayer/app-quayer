"use client"

import * as React from "react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

import { useChatActions } from "../../chat/chat-action-context"
import { ToolPickerCard, type ToolOption } from "../tool-picker-card"
import { safeGet } from "./index"

interface ProposeToolSelectionResultProps {
  result: unknown
  tokens: AppTokens
}

/**
 * Adapter for `propose_tool_selection`. Renders ToolPickerCard and, on
 * Aplicar, posts a user message listing chosen tool keys + the agentId
 * so the Builder LLM calls `attach_tool_to_agent` for each.
 */
export function ProposeToolSelectionResult({
  result,
  tokens,
}: ProposeToolSelectionResultProps) {
  const actions = useChatActions()
  const [applied, setApplied] = React.useState(false)

  const tools = safeGet<ToolOption[]>(result, "tools") ?? []
  const agentId = safeGet<string>(result, "agentId")
  const reason = safeGet<string | null>(result, "reason") ?? null

  const handleApply = React.useCallback(
    (selectedKeys: string[]) => {
      if (applied || !actions || actions.isStreaming || !agentId) return
      if (selectedKeys.length === 0) return
      setApplied(true)

      const keyList = selectedKeys.join(", ")
      actions.sendMessage(
        `Ativar no agente ${agentId} as ferramentas: ${keyList}. Chame attach_tool_to_agent para cada uma.`,
      )
    },
    [actions, applied, agentId],
  )

  return (
    <ToolPickerCard
      tools={tools}
      tokens={tokens}
      onApply={handleApply}
      disabled={applied}
      reason={reason}
    />
  )
}
