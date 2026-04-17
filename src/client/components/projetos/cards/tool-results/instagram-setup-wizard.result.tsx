"use client"

import * as React from "react"

import { api } from "@/igniter.client"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { BrokerType } from "@/server/communication/instances/instances.interfaces"

import { useChatActions } from "../../chat/chat-action-context"
import {
  InstagramSetupCard,
  type InstagramSetupSubmit,
  type InstagramWizardStep,
} from "../instagram-setup-card"
import { safeGet } from "./index"

interface InstagramSetupWizardResultProps {
  result: unknown
  tokens: AppTokens
}

/**
 * Adapter for `instagram_setup_wizard`. Renders the 4-step wizard and on
 * submit POSTs credentials directly to /api/v1/instances (brokerType=instagram).
 * A safe follow-up message (no tokens) is posted to chat so the Builder LLM
 * knows to advance — credentials themselves NEVER flow through chat history.
 */
export function InstagramSetupWizardResult({
  result,
  tokens,
}: InstagramSetupWizardResultProps) {
  const actions = useChatActions()

  const name = safeGet<string>(result, "name") ?? "Instagram"
  const webhookUrl = safeGet<string>(result, "webhookUrl") ?? ""
  const verifyToken = safeGet<string>(result, "verifyToken") ?? ""
  const steps = safeGet<InstagramWizardStep[]>(result, "steps") ?? []

  const handleSubmit = React.useCallback(
    async (payload: InstagramSetupSubmit) => {
      const response = await api.instances.create.mutate({
        body: {
          brokerType: BrokerType.INSTAGRAM,
          name: payload.name,
          accessToken: payload.accessToken,
          instagramAccountId: payload.instagramAccountId,
          pageId: payload.pageId || undefined,
        },
      })

      const created = response?.data as { id?: string } | undefined
      const instanceId = created?.id ?? "unknown"

      if (actions && !actions.isStreaming) {
        actions.sendMessage(
          `Instagram "${payload.name}" conectado com sucesso (instanceId=${instanceId}). Próximo passo?`,
        )
      }
    },
    [actions],
  )

  return (
    <InstagramSetupCard
      name={name}
      webhookUrl={webhookUrl}
      verifyToken={verifyToken}
      steps={steps}
      tokens={tokens}
      onSubmit={handleSubmit}
    />
  )
}
