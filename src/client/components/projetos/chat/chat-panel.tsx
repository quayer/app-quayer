"use client"

import * as React from "react"

import { useAppTokens } from "@/client/hooks/use-app-tokens"

import type { ChatMessage } from "../types"
import { ChatActionProvider } from "./chat-action-context"
import { ChatInput } from "./chat-input"
import { ChatMessageList } from "./chat-message-list"
import { useChatScroll } from "./hooks/use-chat-scroll"
import { useChatStream } from "./hooks/use-chat-stream"

interface ChatPanelProps {
  projectId: string
  initialMessages: ChatMessage[]
  onMessagesChange?: (messages: ChatMessage[]) => void
}

/**
 * ChatPanel — workspace chat com Builder AI.
 *
 * Orquestrador fino: delega estado/SSE para useChatStream, scroll para
 * useChatScroll, e render para ChatMessageList + ChatInput.
 *
 * Visual: shadcn Avatar / Card / Collapsible + tokens reativos via
 * useAppTokens (mesma paleta da home + sidebar). Composer no rodapé
 * espelha o input da home (textarea + mic + send circular amber).
 *
 * Streaming: SSE parser custom mantido no hook (backend não emite AI SDK
 * data stream protocol — usar useChat exigiria custom transport ou
 * refactor do backend).
 */
export function ChatPanel({
  projectId,
  initialMessages,
  onMessagesChange,
}: ChatPanelProps) {
  const { tokens } = useAppTokens()

  const {
    messages,
    input,
    setInput,
    isStreaming,
    streamingText,
    streamingToolCalls,
    error,
    lastUserMessage,
    sendMessage,
    triggerAiResponse,
    retry,
  } = useChatStream({ projectId, initialMessages, onMessagesChange })

  const { scrollRef, handleScroll, forceAutoScroll } = useChatScroll({
    messagesLength: messages.length,
    streamingText,
    streamingToolCalls,
  })

  // ── Auto-trigger: when arriving from home with a user message that has
  //    no assistant reply yet, send it to the AI automatically.
  const didAutoTrigger = React.useRef(false)
  React.useEffect(() => {
    if (didAutoTrigger.current) return
    if (initialMessages.length === 0) return
    const last = initialMessages[initialMessages.length - 1]
    if (!last || last.role !== "user") return
    // Check there's no assistant reply after the last user message
    const lastIdx = initialMessages.indexOf(last)
    const hasReply = initialMessages.some(
      (m, i) => i > lastIdx && m.role === "assistant",
    )
    if (hasReply) return
    didAutoTrigger.current = true
    forceAutoScroll()
    void triggerAiResponse(last.content)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSend = React.useCallback(() => {
    forceAutoScroll()
    void sendMessage(input)
  }, [forceAutoScroll, input, sendMessage])

  const handleRetry = React.useCallback(() => {
    forceAutoScroll()
    retry()
  }, [forceAutoScroll, retry])

  const chatActions = React.useMemo(
    () => ({
      sendMessage: (content: string) => {
        forceAutoScroll()
        void sendMessage(content)
      },
      isStreaming,
    }),
    [forceAutoScroll, isStreaming, sendMessage],
  )

  return (
    <ChatActionProvider value={chatActions}>
      <div className="flex h-full min-h-0 flex-col">
        <ChatMessageList
          messages={messages}
          streamingText={streamingText}
          streamingToolCalls={streamingToolCalls}
          error={error}
          lastUserMessage={lastUserMessage}
          onRetry={handleRetry}
          tokens={tokens}
          scrollRef={scrollRef}
          onScroll={handleScroll}
        />
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={handleSend}
          disabled={isStreaming}
          tokens={tokens}
        />
      </div>
    </ChatActionProvider>
  )
}
