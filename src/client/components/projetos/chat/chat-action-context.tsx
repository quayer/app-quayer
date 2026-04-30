"use client"

import * as React from "react"

/**
 * ChatActionContext — bridge from tool cards back to the chat stream.
 *
 * Tool-result cards (ChannelPicker, Approval, ToolPicker, ToneSlider, etc.)
 * need to post new user messages when the user clicks a CTA. Passing a
 * callback through every dispatcher level is fragile, so we expose the
 * needed actions via React context.
 *
 * Keep this minimal — only actions cards truly need. If a card needs
 * something else, add it here rather than creating another context.
 */
export interface ChatActions {
  /** Post a user message and stream the assistant reply. */
  sendMessage: (content: string) => void
  /** True while a message is being streamed. Cards should disable CTAs. */
  isStreaming: boolean
}

const ChatActionContext = React.createContext<ChatActions | null>(null)

export function ChatActionProvider({
  value,
  children,
}: {
  value: ChatActions
  children: React.ReactNode
}) {
  return (
    <ChatActionContext.Provider value={value}>
      {children}
    </ChatActionContext.Provider>
  )
}

/**
 * Hook for cards to read chat actions. Returns null if the card is
 * rendered outside a ChatActionProvider — cards must handle that case
 * gracefully (typically by hiding the interactive CTA).
 */
export function useChatActions(): ChatActions | null {
  return React.useContext(ChatActionContext)
}
