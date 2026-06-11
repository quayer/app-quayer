"use client"

/**
 * PlaygroundTab — chat de teste stateless do agente Builder IA.
 *
 * - Sem agent vinculado: exibe empty state "Aguardando o Builder".
 * - Com agent: chat simples com histórico local (nunca persiste no banco).
 *
 * O endpoint /api/v1/builder/projects/:id/playground/stream recebe
 * `{ message, history }` e retorna SSE com os eventos AgentStreamEvent.
 * O estado do stream vive em `use-playground-stream.ts` (parser SSE local,
 * AbortController no unmount, erros traduzidos para PT-BR); as bolhas em
 * `playground-bubbles.tsx`.
 */

import * as React from "react"
import { Play, Send, Trash2, Loader2 } from "lucide-react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import { Button } from "@/client/components/ui/button"
import { UserBubble } from "@/client/components/projetos/chat/chat-message"
import type { WorkspaceProject } from "@/client/components/projetos/types"

import { AssistantBubble, EmptyState } from "./playground-bubbles"
import { usePlaygroundStream } from "./use-playground-stream"

export interface PlaygroundTabProps {
  project: WorkspaceProject
}

export function PlaygroundTab({ project }: PlaygroundTabProps) {
  const { tokens } = useAppTokens()

  const {
    messages,
    input,
    setInput,
    isStreaming,
    streamingText,
    streamingToolCalls,
    error,
    inputRef,
    sendMessage,
    clearConversation,
  } = usePlaygroundStream(project.id, project.aiAgentId)

  const scrollRef = React.useRef<HTMLDivElement>(null)

  // Auto-scroll on new content
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingText, streamingToolCalls])

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
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      {/* Header badge + clear button */}
      <div
        className="flex shrink-0 flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: tokens.divider, backgroundColor: tokens.bgSurface }}
      >
        <div
          className="flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
          style={{
            backgroundColor: tokens.warningSubtle,
            color: tokens.warningText,
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
          className="min-h-10 gap-1.5 text-[12px]"
          style={{ color: tokens.textSecondary }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Limpar
        </Button>
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        className="min-h-[320px] overflow-y-auto rounded-xl border px-4 py-4"
        style={{ borderColor: tokens.divider, backgroundColor: tokens.bgSurface }}
      >
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
            backgroundColor: tokens.dangerSubtle,
            color: tokens.dangerText,
          }}
        >
          {error}
        </div>
      )}

      {/* Input area */}
      <div
        className="shrink-0"
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
            disabled={!input.trim() || isStreaming}
            onClick={() => void sendMessage(input)}
            className="min-h-11 w-11 shrink-0 p-0"
            style={{ backgroundColor: tokens.brand, color: tokens.textInverse }}
            aria-label="Enviar mensagem de teste"
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
