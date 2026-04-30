"use client"

import * as React from "react"
import { AlertCircle, Bot, RefreshCw } from "lucide-react"

import { Button } from "@/client/components/ui/button"
import type { useAppTokens } from "@/client/hooks/use-app-tokens"

import type { ChatMessage as ChatMessageType } from "../types"
import { ChatMessage, StreamingBubble } from "./chat-message"
import type { ToolCallView } from "./hooks/use-chat-stream"

type Tokens = ReturnType<typeof useAppTokens>["tokens"]

function EmptyState({ tokens }: { tokens: Tokens }) {
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

export interface ChatMessageListProps {
  messages: ChatMessageType[]
  streamingText: string
  streamingToolCalls: ToolCallView[]
  error: string | null
  lastUserMessage: string | null
  onRetry: () => void
  tokens: Tokens
  scrollRef: React.RefObject<HTMLDivElement | null>
  onScroll: () => void
}

export function ChatMessageList({
  messages,
  streamingText,
  streamingToolCalls,
  error,
  lastUserMessage,
  onRetry,
  tokens,
  scrollRef,
  onScroll,
}: ChatMessageListProps) {
  const isEmpty = messages.length === 0 && !streamingText && !error

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex-1 overflow-y-auto px-4 py-8 md:px-6"
    >
      {isEmpty ? (
        <EmptyState tokens={tokens} />
      ) : (
        <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6">
          {messages.map((m, i) => (
            <ChatMessage
              key={m.id}
              message={m}
              tokens={tokens}
              isHistorical={i < messages.length - 1}
            />
          ))}

          {(streamingText || streamingToolCalls.length > 0) && (
            <StreamingBubble
              text={streamingText}
              toolCalls={streamingToolCalls}
              tokens={tokens}
            />
          )}

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
              <div
                className="flex-1 text-[13px]"
                style={{ color: tokens.textPrimary }}
              >
                <p className="font-medium">{error}</p>
                {lastUserMessage && (
                  <Button
                    type="button"
                    onClick={onRetry}
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
  )
}
