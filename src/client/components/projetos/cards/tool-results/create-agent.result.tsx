"use client"

import * as React from "react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { AgentCreatedCard } from "../approval-card"
import { useChatActions } from "../../chat/chat-action-context"
import { safeGet } from "./index"

interface CreateAgentResultProps {
  args: unknown
  result: unknown
  tokens: AppTokens
}

/**
 * Adapter for the `create_agent` tool result. Wraps AgentCreatedCard with
 * the shape extraction logic to keep the dispatcher thin.
 *
 * Tier 3.2 — also wires 3 contextual CTAs (Testar / Editar prompt / Publicar)
 * via chat sendMessage intents so the LLM knows what the user wants next.
 */
export function CreateAgentResult({
  args,
  result,
  tokens,
}: CreateAgentResultProps) {
  const actions = useChatActions()
  const [clicked, setClicked] = React.useState(false)

  const name =
    safeGet<string>(result, "agentName") ??
    safeGet<string>(args, "name") ??
    "Agente"
  const agentId = safeGet<string>(result, "agentId") ?? ""

  const postIntent = React.useCallback(
    (message: string) => {
      if (clicked || !actions || actions.isStreaming) return
      setClicked(true)
      actions.sendMessage(message)
    },
    [actions, clicked],
  )

  return (
    <AgentCreatedCard
      agentName={name}
      agentId={agentId}
      versionNumber={safeGet<number>(result, "versionNumber")}
      tokens={tokens}
      onTest={() => postIntent(`Rode um teste com o agente ${agentId}.`)}
      onEditPrompt={() =>
        postIntent(
          `Quero ajustar o prompt do agente ${agentId}. Me mostre o resumo do prompt atual.`,
        )
      }
      onPublish={() => postIntent(`Publicar o agente ${agentId}.`)}
    />
  )
}
