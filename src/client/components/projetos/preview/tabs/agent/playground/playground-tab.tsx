"use client"

/**
 * PlaygroundTab — chat de teste stateless do agente Builder IA.
 *
 * - Sem agent vinculado: exibe empty state "Aguardando o Builder".
 * - Com agent: chat simples com histórico local (nunca persiste no banco).
 *
 * O endpoint /api/v1/builder/projects/:id/playground/stream recebe
 * `{ message, history }` e retorna SSE com os eventos AgentStreamEvent.
 */

import * as React from "react"
import { Bot, Play, Send, Trash2, Wrench, Loader2 } from "lucide-react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import { Avatar, AvatarFallback } from "@/client/components/ui/avatar"
import { Button } from "@/client/components/ui/button"
import { UserBubble } from "@/client/components/projetos/chat/chat-message"
import { MarkdownContent } from "@/client/components/projetos/chat/markdown-content"
import { parseSseBuffer } from "@/client/components/projetos/chat/utils/parse-sse-buffer"
import type { WorkspaceProject } from "@/client/components/projetos/types"

// ── Types ────────────────────────────────────────────────────────────────────

export interface PlaygroundTabProps {
  project: WorkspaceProject
}

interface PlaygroundMessage {
  id: string
  role: "user" | "assistant"
  content: string
  toolCalls?: Array<{ toolName: string; args: unknown }>
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `pg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

// ── Sub-components ────────────────────────────────────────────────────────────

type Tokens = ReturnType<typeof useAppTokens>["tokens"]

function AssistantBubble({
  content,
  toolCalls,
  streaming,
  tokens,
}: {
  content: string
  toolCalls?: Array<{ toolName: string; args: unknown }>
  streaming?: boolean
  tokens: Tokens
}) {
  return (
    <div className="flex items-start gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback style={{ backgroundColor: tokens.brandSubtle, color: tokens.brand }}>
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {content && (
          <>
            <MarkdownContent
              content={content}
              tokens={tokens}
              className="max-w-[95%]"
            />
            {streaming && (
              <span
                className="ml-0.5 inline-block animate-pulse"
                style={{ color: tokens.brand }}
                aria-hidden
              >
                ▊
              </span>
            )}
          </>
        )}
        {toolCalls && toolCalls.length > 0 && (
          <div className="flex flex-col gap-1">
            {toolCalls.map((tc, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px]"
                style={{ backgroundColor: tokens.bgSurface, color: tokens.textSecondary, border: `1px solid ${tokens.divider}` }}
              >
                <Wrench className="h-3 w-3 shrink-0" style={{ color: tokens.brand }} />
                <span className="font-mono" style={{ color: tokens.textPrimary }}>
                  {tc.toolName}
                </span>
                {streaming ? (
                  <span className="flex items-center gap-1" style={{ color: tokens.textTertiary }}>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    executando
                  </span>
                ) : (
                  <span style={{ color: tokens.textTertiary }}>concluído</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ tokens }: { tokens: Tokens }) {
  return (
    <div className="mx-auto flex min-h-[320px] max-w-md flex-col items-center justify-center gap-4 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ backgroundColor: tokens.brandSubtle, color: tokens.brand }}
      >
        <Bot className="h-6 w-6" />
      </div>
      <div>
        <h3 className="text-base font-semibold" style={{ color: tokens.textPrimary }}>
          Aguardando o Builder
        </h3>
        <p className="mx-auto mt-1 max-w-sm text-[13px]" style={{ color: tokens.textSecondary }}>
          Continue a conversa no chat para o Builder criar seu agente.
        </p>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const MAX_HISTORY = 20

export function PlaygroundTab({ project }: PlaygroundTabProps) {
  const { tokens } = useAppTokens()

  const [messages, setMessages] = React.useState<PlaygroundMessage[]>([])
  const [input, setInput] = React.useState("")
  const [isStreaming, setIsStreaming] = React.useState(false)
  const [streamingText, setStreamingText] = React.useState("")
  const [streamingToolCalls, setStreamingToolCalls] = React.useState<
    Array<{ toolName: string; args: unknown }>
  >([])
  const [error, setError] = React.useState<string | null>(null)

  const scrollRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLTextAreaElement>(null)

  // Auto-scroll on new content
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingText, streamingToolCalls])

  const clearConversation = React.useCallback(() => {
    setMessages([])
    setStreamingText("")
    setStreamingToolCalls([])
    setError(null)
    inputRef.current?.focus()
  }, [])

  const sendMessage = React.useCallback(
    async (content: string) => {
      const trimmed = content.trim()
      if (!trimmed || isStreaming || !project.aiAgentId) return

      setError(null)
      setInput("")
      setIsStreaming(true)
      setStreamingText("")
      setStreamingToolCalls([])

      const userMsg: PlaygroundMessage = {
        id: createId(),
        role: "user",
        content: trimmed,
      }
      setMessages((prev) => [...prev, userMsg])

      // Build history for the request (last MAX_HISTORY messages, user + assistant only)
      const historySnapshot = [...messages, userMsg]
        .slice(-MAX_HISTORY)
        .map((m) => ({ role: m.role, content: m.content }))

      let accText = ""
      const toolCallsAcc: Array<{ toolName: string; args: unknown }> = []

      try {
        const res = await fetch(
          `/api/v1/builder/projects/${project.id}/playground/stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: trimmed, history: historySnapshot.slice(0, -1) }),
          }
        )

        if (!res.ok || !res.body) {
          throw new Error(`Falha na requisição (HTTP ${res.status})`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        let finished = false

        while (!finished) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const { events, rest } = parseSseBuffer(buffer)
          buffer = rest

          for (const ev of events) {
            if (ev.type === "text-delta") {
              accText += ev.text
              setStreamingText(accText)
            } else if (ev.type === "tool-call") {
              toolCallsAcc.push({ toolName: ev.toolName, args: ev.args })
              setStreamingToolCalls([...toolCallsAcc])
            } else if (ev.type === "finish" || ev.type === "error") {
              if (ev.type === "error") {
                setError(ev.message || "Erro ao processar mensagem")
              }
              const assistantMsg: PlaygroundMessage = {
                id: createId(),
                role: "assistant",
                content: accText,
                toolCalls: toolCallsAcc.length > 0 ? [...toolCallsAcc] : undefined,
              }
              setMessages((prev) => [...prev, assistantMsg])
              setStreamingText("")
              setStreamingToolCalls([])
              finished = true
            }
            if (finished) break
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro desconhecido")
      } finally {
        setIsStreaming(false)
        inputRef.current?.focus()
      }
    },
    [isStreaming, messages, project.id, project.aiAgentId]
  )

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        void sendMessage(input)
      }
    },
    [input, sendMessage]
  )

  if (!project.aiAgent) {
    return <EmptyState tokens={tokens} />
  }

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: tokens.bgBase }}>
      {/* Header badge + clear button */}
      <div
        className="flex shrink-0 items-center justify-between border-b px-4 py-2"
        style={{ borderColor: tokens.divider }}
      >
        <div
          className="flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
          style={{
            backgroundColor: "rgba(245,158,11,0.12)",
            color: "#f59e0b",
          }}
        >
          <Play className="h-3 w-3" />
          Modo Teste — mensagens não são salvas
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearConversation}
          disabled={isStreaming || messages.length === 0}
          className="h-7 gap-1.5 text-[12px]"
          style={{ color: tokens.textSecondary }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Limpar
        </Button>
      </div>

      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex h-full items-center justify-center text-[13px]" style={{ color: tokens.textTertiary }}>
            Envie uma mensagem para testar o agente
          </div>
        )}
        <div className="flex flex-col gap-4">
          {messages.map((msg) =>
            msg.role === "user" ? (
              <UserBubble key={msg.id} content={msg.content} tokens={tokens} />
            ) : (
              <AssistantBubble
                key={msg.id}
                content={msg.content}
                toolCalls={msg.toolCalls}
                tokens={tokens}
              />
            )
          )}
          {isStreaming && (
            <AssistantBubble
              content={streamingText}
              toolCalls={streamingToolCalls}
              streaming
              tokens={tokens}
            />
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="mx-4 mb-2 rounded-lg px-3 py-2 text-[13px]"
          style={{
            backgroundColor: "rgba(239,68,68,0.12)",
            color: "#ef4444",
          }}
        >
          {error}
        </div>
      )}

      {/* Input area */}
      <div
        className="shrink-0 border-t px-4 py-3"
        style={{ borderColor: tokens.divider }}
      >
        <div
          className="flex items-end gap-2 rounded-xl border px-3 py-2"
          style={{ borderColor: tokens.divider, backgroundColor: tokens.bgSurface }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Mensagem de teste..."
            rows={1}
            disabled={isStreaming}
            className="flex-1 resize-none bg-transparent text-[14px] outline-none placeholder:text-[14px]"
            style={{
              color: tokens.textPrimary,
              maxHeight: "120px",
            }}
          />
          <Button
            size="sm"
            disabled={!input.trim() || isStreaming}
            onClick={() => void sendMessage(input)}
            className="h-8 w-8 shrink-0 p-0"
            style={{ backgroundColor: tokens.brand, color: tokens.textInverse }}
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="mt-1.5 text-[11px]" style={{ color: tokens.textTertiary }}>
          Enter para enviar · Shift+Enter para nova linha
        </p>
      </div>
    </div>
  )
}
