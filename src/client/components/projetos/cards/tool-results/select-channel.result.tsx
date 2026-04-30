"use client"

import * as React from "react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

import { useChatActions } from "../../chat/chat-action-context"
import { ChannelPickerCard } from "../channel-picker-card"
import { safeGet } from "./index"

type ChannelKey = "cloudapi" | "uazapi" | "instagram"

interface SelectChannelResultProps {
  result: unknown
  tokens: AppTokens
}

/**
 * Maps a channel key to the follow-up user message the Builder LLM should
 * receive. Kept Portuguese + natural so it reads well in the transcript.
 */
const CHANNEL_FOLLOWUP: Record<ChannelKey, string> = {
  cloudapi: "Quero conectar via WhatsApp Cloud API (Meta oficial).",
  uazapi: "Quero conectar via WhatsApp Business com QR Code.",
  instagram: "Quero conectar um Instagram Direct (via Meta Graph API).",
}

/**
 * Adapter for `select_channel` tool result. Renders ChannelPickerCard
 * with click → sendMessage wiring. Once the user has already picked, we
 * swap to a locked read-only view so the transcript stays honest.
 */
export function SelectChannelResult({
  result,
  tokens,
}: SelectChannelResultProps) {
  const actions = useChatActions()
  const [picked, setPicked] = React.useState<ChannelKey | null>(null)
  const reason = safeGet<string>(result, "reason")

  const handleSelect = React.useCallback(
    (channel: ChannelKey) => {
      if (picked || !actions || actions.isStreaming) return
      setPicked(channel)
      actions.sendMessage(CHANNEL_FOLLOWUP[channel])
    },
    [actions, picked],
  )

  return (
    <div className="flex flex-col gap-2">
      {reason && (
        <p
          className="px-1 text-[12px] leading-relaxed"
          style={{ color: tokens.textSecondary }}
        >
          {reason}
        </p>
      )}
      <ChannelPickerCard
        tokens={tokens}
        selected={picked ?? undefined}
        onSelect={handleSelect}
      />
    </div>
  )
}
