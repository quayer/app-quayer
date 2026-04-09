"use client"

import * as React from "react"
import {
  AlertCircle,
  ArrowUp,
  Bot,
  ChevronDown,
  Loader2,
  Mic,
  RefreshCw,
  Square,
  User,
  Wrench,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/client/components/ui/avatar"
import { Button } from "@/client/components/ui/button"
import { Card } from "@/client/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/client/components/ui/collapsible"
import { Textarea } from "@/client/components/ui/textarea"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import { useSpeechToText } from "@/client/hooks/use-speech-to-text"

import type { ChatMessage } from "./types"

interface ChatPanelProps {
  projectId: string
  initialMessages: ChatMessage[]
}

type ServerEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; toolName: string; args: Record<string, unknown> }
  | { type: "tool-result"; toolName: string; result: unknown }
  | {
      type: "finish"
      toolCalls?: Array<{
        toolName: string
        args: Record<string, unknown>
        result: unknown
      }>
    }
  | { type: "error"; message: string }

interface ToolCallView {
  toolName: string
  args: unknown
  result?: unknown
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/**
 * ChatPanel — workspace chat com Builder AI.
 *
 * Visual: shadcn Avatar / Card / Collapsible + tokens reativos via
 * useAppTokens (mesma paleta da home + sidebar). Composer no rodapé
 * espelha o input da home (textarea + mic + send circular amber).
 *
 * Streaming: SSE parser custom mantido (backend não emite AI SDK
 * data stream protocol — usar useChat exigiria custom transport ou
 * refactor do backend; trade-off documentado).
 */
export function ChatPanel({ projectId, initialMessages }: ChatPanelProps) {
  const { tokens } = useAppTokens()

  // ── State ──────────────────────────────────────────────────────
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

  // ── Refs / scroll ──────────────────────────────────────────────
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

  React.useEffect(() => {
    if (autoScrollRef.current) scrollToBottom()
  }, [messages, streamingText, streamingToolCalls, scrollToBottom])

  React.useEffect(() => {
    scrollToBottom()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Speech-to-text (reuse home's hook) ─────────────────────────
  const appendTranscript = React.useCallback((text: string) => {
    setInput((prev) => (prev ? `${prev} ${text}`.trim() : text.trim()))
  }, [])
  const {
    isSupported: speechSupported,
    isListening,
    start: startRecording,
    stop: stopRecording,
  } = useSpeechToText({ lang: "pt-BR", onFinalTranscript: appendTranscript })
  const toggleRecording = () => (isListening ? stopRecording() : startRecording())

  // ── SSE parser (preserved) ─────────────────────────────────────
  const parseSseBuffer = React.useCallback(
    (buffer: string): { events: ServerEvent[]; rest: string } => {
      const events: ServerEvent[] = []
      const parts = buffer.split("\n\n")
      const rest = parts.pop() ?? ""
      for (const raw of parts) {
        if (!raw.trim()) continue
        const dataLines: string[] = []
        for (const line of raw.split("\n")) {
          if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart())
        }
        if (dataLines.length === 0) continue
        const payload = dataLines.join("\n")
        try {
          events.push(JSON.parse(payload) as ServerEvent)
        } catch (err) {
          console.error("[chat-panel] SSE parse failed", err, payload)
        }
      }
      return { events, rest }
    },
    [],
  )

  // ── Send ───────────────────────────────────────────────────────
  const sendMessage = React.useCallback(
    async (content: string) => {
      const trimmed = content.trim()
      if (!trimmed || isStreaming) return

      setError(null)
      setLastUserMessage(trimmed)
      autoScrollRef.current = true

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

      let accText = ""
      const toolCalls: ToolCallView[] = []

      try {
        const response = await fetch(
          `/api/v1/builder/projects/${projectId}/chat/message`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: trimmed }),
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
    [isStreaming, parseSseBuffer, projectId],
  )

  const handleSubmit = React.useCallback(
    () => void sendMessage(input),
    [input, sendMessage],
  )

  const handleRetry = React.useCallback(() => {
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

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  const canSubmit = input.trim().length > 0 && !isStreaming
  const isEmpty = messages.length === 0 && !streamingText && !error

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Messages scrollable area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-6 md:px-6"
      >
        {isEmpty ? (
          <EmptyState tokens={tokens} />
        ) : (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} tokens={tokens} />
            ))}

            {/* Streaming assistant bubble */}
            {(streamingText || streamingToolCalls.length > 0) && (
              <StreamingBubble
                text={streamingText}
                toolCalls={streamingToolCalls}
                tokens={tokens}
              />
            )}

            {/* Inline error */}
            {error && (
              <div
                className="flex items-start gap-3 rounded-lg border p-3"
                style={{
                  borderColor: "rgba(239,68,68,0.30)",
                  backgroundColor: "rgba(239,68,68,0.06)",
                }}
                role="alert"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div className="flex-1 text-[13px]" style={{ color: tokens.textPrimary }}>
                  <p className="font-medium">{error}</p>
                  {lastUserMessage && (
                    <Button
                      type="button"
                      onClick={handleRetry}
                      variant="outline"
                      size="sm"
                      className="mt-2 h-7 gap-1.5 text-[11px]"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Tentar novamente
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ───── Composer (mesmo pattern da home) ───── */}
      <div className="px-4 pb-4 pt-2 md:px-6">
        <div
          className="mx-auto w-full max-w-2xl rounded-2xl border transition-all focus-within:shadow-[0_0_0_3px_rgba(255,214,10,0.15)]"
          style={{
            backgroundColor: tokens.bgSurface,
            borderColor: tokens.borderStrong,
            boxShadow: tokens.shadow,
          }}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Continue a conversa com o Builder…"
            rows={2}
            disabled={isStreaming}
            className="min-h-[48px] resize-none border-0 bg-transparent text-[15px] leading-relaxed shadow-none focus-visible:ring-0"
            style={{ color: tokens.textPrimary }}
          />

          <div className="flex items-center justify-between gap-2 px-3 pb-3">
            <span
              className="px-2 text-[11px]"
              style={{ color: tokens.textTertiary }}
            >
              <kbd
                className="rounded px-1.5 py-0.5 font-mono text-[10px]"
                style={{
                  backgroundColor: tokens.hoverBg,
                  color: tokens.textSecondary,
                }}
              >
                ⌘
              </kbd>{" "}
              +{" "}
              <kbd
                className="rounded px-1.5 py-0.5 font-mono text-[10px]"
                style={{
                  backgroundColor: tokens.hoverBg,
                  color: tokens.textSecondary,
                }}
              >
                Enter
              </kbd>{" "}
              para enviar
            </span>

            <div className="flex items-center gap-1.5">
              {speechSupported && (
                <button
                  type="button"
                  onClick={toggleRecording}
                  disabled={isStreaming}
                  className="flex h-9 w-9 items-center justify-center rounded-full border transition-colors disabled:opacity-50"
                  style={{
                    borderColor: isListening
                      ? "rgba(239,68,68,0.45)"
                      : tokens.border,
                    backgroundColor: isListening
                      ? "rgba(239,68,68,0.12)"
                      : "transparent",
                    color: isListening ? "#ef4444" : tokens.textPrimary,
                  }}
                  aria-label={isListening ? "Parar gravação" : "Gravar áudio"}
                  aria-pressed={isListening}
                >
                  {isListening ? (
                    <Square
                      className="h-3.5 w-3.5 animate-pulse"
                      fill="currentColor"
                    />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex h-9 w-9 items-center justify-center rounded-full transition-all disabled:opacity-30"
                style={{
                  backgroundColor: canSubmit
                    ? tokens.brand
                    : tokens.hoverBg,
                  color: canSubmit
                    ? tokens.textInverse
                    : tokens.textTertiary,
                  boxShadow: canSubmit
                    ? "0 4px 12px -2px rgba(255,214,10,0.35)"
                    : "none",
                }}
                aria-label="Enviar mensagem"
              >
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function EmptyState({
  tokens,
}: {
  tokens: ReturnType<typeof useAppTokens>["tokens"]
}) {
  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-3 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{
          backgroundColor: tokens.brandSubtle,
          color: tokens.brand,
        }}
      >
        <Bot className="h-6 w-6" />
      </div>
      <h3
        className="text-base font-semibold"
        style={{ color: tokens.textPrimary }}
      >
        Pronto para construir
      </h3>
      <p
        className="max-w-sm text-[13px]"
        style={{ color: tokens.textSecondary }}
      >
        Converse com o Builder pra criar, editar e publicar seu agente de
        WhatsApp.
      </p>
    </div>
  )
}

function MessageBubble({
  message,
  tokens,
}: {
  message: ChatMessage
  tokens: ReturnType<typeof useAppTokens>["tokens"]
}) {
  if (message.role === "user") {
    return (
      <div className="flex flex-row-reverse items-start gap-3">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback
            style={{
              backgroundColor: tokens.brand,
              color: tokens.textInverse,
            }}
          >
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <Card
          className="max-w-[85%] border-0 px-4 py-2.5 text-[14px] leading-relaxed shadow-none"
          style={{
            backgroundColor: tokens.brand,
            color: tokens.textInverse,
            borderRadius: "16px 16px 4px 16px",
          }}
        >
          {message.content}
        </Card>
      </div>
    )
  }

  if (message.role === "system_banner") {
    return (
      <div
        className="mx-auto rounded-full px-3 py-1 text-center text-[11px]"
        style={{
          backgroundColor: tokens.hoverBg,
          color: tokens.textTertiary,
        }}
      >
        {message.content}
      </div>
    )
  }

  // assistant
  return (
    <div className="flex items-start gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback
          style={{
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {message.content && (
          <div
            className="max-w-[95%] whitespace-pre-wrap text-[14px] leading-relaxed"
            style={{ color: tokens.textPrimary }}
          >
            {message.content}
          </div>
        )}
        {message.toolCalls?.map((tc, i) => (
          <ToolCallCard
            key={`${message.id}-tc-${i}`}
            toolName={tc.toolName}
            args={tc.args}
            result={tc.result}
            tokens={tokens}
          />
        ))}
      </div>
    </div>
  )
}

function StreamingBubble({
  text,
  toolCalls,
  tokens,
}: {
  text: string
  toolCalls: ToolCallView[]
  tokens: ReturnType<typeof useAppTokens>["tokens"]
}) {
  return (
    <div className="flex items-start gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback
          style={{
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {text && (
          <div
            className="max-w-[95%] whitespace-pre-wrap text-[14px] leading-relaxed"
            style={{ color: tokens.textPrimary }}
          >
            {text}
            <span
              className="ml-0.5 inline-block animate-pulse"
              style={{ color: tokens.brand }}
              aria-hidden
            >
              ▊
            </span>
          </div>
        )}
        {toolCalls.map((tc, i) => (
          <ToolCallCard
            key={`stream-tc-${i}`}
            toolName={tc.toolName}
            args={tc.args}
            result={tc.result}
            tokens={tokens}
            streaming={tc.result === undefined}
          />
        ))}
      </div>
    </div>
  )
}

function ToolCallCard({
  toolName,
  args,
  result,
  tokens,
  streaming = false,
}: {
  toolName: string
  args: unknown
  result?: unknown
  tokens: ReturnType<typeof useAppTokens>["tokens"]
  streaming?: boolean
}) {
  return (
    <Collapsible>
      <Card
        className="border p-0 shadow-none"
        style={{
          backgroundColor: tokens.bgSurface,
          borderColor: tokens.divider,
        }}
      >
        <CollapsibleTrigger
          className="group flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors"
          style={{ color: tokens.textSecondary }}
        >
          <Wrench
            className="h-3 w-3 shrink-0"
            style={{ color: tokens.brand }}
          />
          <span
            className="font-mono"
            style={{ color: tokens.textPrimary }}
          >
            {toolName}
          </span>
          {streaming ? (
            <span className="flex items-center gap-1" style={{ color: tokens.textTertiary }}>
              <Loader2 className="h-3 w-3 animate-spin" />
              executando
            </span>
          ) : (
            <span style={{ color: tokens.textTertiary }}>concluído</span>
          )}
          <ChevronDown
            className="ml-auto h-3 w-3 transition-transform group-data-[state=open]:rotate-180"
            style={{ color: tokens.textTertiary }}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div
            className="border-t px-3 py-2"
            style={{ borderColor: tokens.divider }}
          >
            <div
              className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: tokens.textTertiary }}
            >
              Argumentos
            </div>
            <pre
              className="overflow-x-auto rounded p-2 text-[11px]"
              style={{
                backgroundColor: tokens.bgBase,
                color: tokens.textSecondary,
              }}
            >
              {prettyJson(args)}
            </pre>
            {result !== undefined && (
              <>
                <div
                  className="mb-1 mt-2 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: tokens.textTertiary }}
                >
                  Resultado
                </div>
                <pre
                  className="overflow-x-auto rounded p-2 text-[11px]"
                  style={{
                    backgroundColor: tokens.bgBase,
                    color: tokens.textSecondary,
                  }}
                >
                  {prettyJson(result)}
                </pre>
              </>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
