"use client"

import * as React from "react"

import type { ChatMessage } from "../../types"
import { parseSseBuffer } from "../utils/parse-sse-buffer"
import type { SseEvent } from "../utils/parse-sse-buffer"

/**
 * SSE event protocol emitted by /api/v1/builder/projects/:id/chat/message.
 * Backend is not AI-SDK compatible — we have a custom parser.
 */
export type ServerEvent = SseEvent

export interface ToolCallView {
  toolName: string
  args: unknown
  result?: unknown
}

export interface UseChatStreamArgs {
  projectId: string
  initialMessages: ChatMessage[]
  onMessagesChange?: (messages: ChatMessage[]) => void
}

export interface UseChatStreamResult {
  messages: ChatMessage[]
  input: string
  setInput: React.Dispatch<React.SetStateAction<string>>
  isStreaming: boolean
  streamingText: string
  streamingToolCalls: ToolCallView[]
  error: string | null
  lastUserMessage: string | null
  sendMessage: (content: string) => Promise<void>
  triggerAiResponse: (content: string) => Promise<void>
  retry: () => void
  clearError: () => void
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * useChatStream — encapsula SSE fetch, parse e estado da conversa.
 *
 * Mantém paridade 1:1 com o ChatPanel monolítico anterior:
 * - mesmo endpoint POST /api/v1/builder/projects/:id/chat/message
 * - mesmos eventos (text-delta, tool-call, tool-result, finish, error)
 * - mesma lógica de acumulação e commit em finish
 */
export function useChatStream({
  projectId,
  initialMessages,
  onMessagesChange,
}: UseChatStreamArgs): UseChatStreamResult {
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages)
  const [input, setInput] = React.useState("")
  const [isStreaming, setIsStreaming] = React.useState(false)
  const [streamingText, setStreamingText] = React.useState("")
  const [streamingToolCalls, setStreamingToolCalls] = React.useState<
    ToolCallView[]
  >([])
  const [error, setError] = React.useState<string | null>(null)
  const [lastUserMessage, setLastUserMessage] = React.useState<string | null>(
    null,
  )

  // Propagate messages to parent (for dynamic progress tracking)
  React.useEffect(() => {
    onMessagesChange?.(messages)
  }, [messages, onMessagesChange])

  const runStream = React.useCallback(
    async (content: string, skipUserPersist = false) => {
      let accText = ""
      const toolCalls: ToolCallView[] = []

      try {
        const response = await fetch(
          `/api/v1/builder/projects/${projectId}/chat/message`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, skipUserPersist }),
          },
        )
        if (!response.ok || !response.body) {
          throw new Error(`Falha ao enviar mensagem (HTTP ${response.status})`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        let finished = false

        while (!finished) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const { events, rest } = parseSseBuffer(buffer)
          buffer = rest

          for (const event of events) {
            if (event.type === "text-delta") {
              accText += event.text
              setStreamingText(accText)
            } else if (event.type === "tool-call") {
              toolCalls.push({ toolName: event.toolName, args: event.args })
              setStreamingToolCalls([...toolCalls])
            } else if (event.type === "tool-result") {
              for (let i = toolCalls.length - 1; i >= 0; i--) {
                if (
                  toolCalls[i]!.toolName === event.toolName &&
                  toolCalls[i]!.result === undefined
                ) {
                  toolCalls[i] = { ...toolCalls[i]!, result: event.result }
                  break
                }
              }
              setStreamingToolCalls([...toolCalls])
            } else if (event.type === "finish") {
              const finalToolCalls =
                event.toolCalls && event.toolCalls.length > 0
                  ? event.toolCalls
                  : toolCalls
              const assistantMessage: ChatMessage = {
                id: createId(),
                role: "assistant",
                content: accText,
                toolCalls:
                  finalToolCalls.length > 0 ? finalToolCalls : undefined,
                createdAt: new Date().toISOString(),
              }
              setMessages((prev) => [...prev, assistantMessage])
              setStreamingText("")
              setStreamingToolCalls([])
              finished = true
            } else if (event.type === "error") {
              setError(event.message || "Erro ao processar mensagem")
              finished = true
            }
            if (finished) break
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro desconhecido")
      } finally {
        setIsStreaming(false)
      }
    },
    [projectId],
  )

  const triggerAiResponse = React.useCallback(
    async (content: string) => {
      if (isStreaming) return
      setError(null)
      setLastUserMessage(content)
      setIsStreaming(true)
      setStreamingText("")
      setStreamingToolCalls([])
      // Message already persisted by createWithInitialMessage — skip duplicate write.
      await runStream(content, true)
    },
    [isStreaming, runStream],
  )

  const sendMessage = React.useCallback(
    async (content: string) => {
      const trimmed = content.trim()
      if (!trimmed || isStreaming) return

      setError(null)
      setLastUserMessage(trimmed)

      const userMessage: ChatMessage = {
        id: createId(),
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMessage])
      setInput("")
      setIsStreaming(true)
      setStreamingText("")
      setStreamingToolCalls([])

      await runStream(trimmed)
    },
    [isStreaming, runStream],
  )

  const retry = React.useCallback(() => {
    if (!lastUserMessage) return
    setMessages((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i]!.role === "user" && prev[i]!.content === lastUserMessage) {
          return prev.slice(0, i)
        }
      }
      return prev
    })
    void sendMessage(lastUserMessage)
  }, [lastUserMessage, sendMessage])

  const clearError = React.useCallback(() => setError(null), [])

  return {
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
    clearError,
  }
}
