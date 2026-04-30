"use client"

import * as React from "react"

import type { ToolCallView } from "./use-chat-stream"

export interface UseChatScrollArgs {
  messagesLength: number
  streamingText: string
  streamingToolCalls: ToolCallView[]
}

export interface UseChatScrollResult {
  scrollRef: React.RefObject<HTMLDivElement | null>
  handleScroll: () => void
  /** Force re-enable auto-scroll (call when user sends a message). */
  forceAutoScroll: () => void
}

/**
 * useChatScroll — stick-to-bottom com respeito a rolagem manual.
 *
 * - Scrolla para o fim quando mensagens/streaming mudam
 * - Desabilita auto-scroll se o usuário rola > 100px do fim
 * - Re-habilita quando o usuário volta ao fim ou via forceAutoScroll()
 */
export function useChatScroll({
  messagesLength,
  streamingText,
  streamingToolCalls,
}: UseChatScrollArgs): UseChatScrollResult {
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const autoScrollRef = React.useRef(true)

  const handleScroll = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    autoScrollRef.current =
      el.scrollHeight - (el.scrollTop + el.clientHeight) < 100
  }, [])

  const scrollToBottom = React.useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  const forceAutoScroll = React.useCallback(() => {
    autoScrollRef.current = true
  }, [])

  React.useEffect(() => {
    if (autoScrollRef.current) scrollToBottom()
  }, [messagesLength, streamingText, streamingToolCalls, scrollToBottom])

  // Initial scroll-to-bottom on mount
  React.useEffect(() => {
    scrollToBottom()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { scrollRef, handleScroll, forceAutoScroll }
}
