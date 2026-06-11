"use client"

/**
 * Message list pieces — EmptyState, MessageBubble (user / system_banner /
 * assistant) and StreamingBubble. Structural extraction from chat-panel.tsx
 * (no behavior change).
 */

import * as React from "react"
import { Bot, User } from "lucide-react"

import { Avatar, AvatarFallback } from "@/client/components/ui/avatar"
import { Card } from "@/client/components/ui/card"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import { MarkdownContent } from "./markdown-content"

import type { BuilderState, CardKey } from "./cards/types"
import { ToolCallCard } from "./tool-call-card"
import type { ToolCallView } from "./use-chat-stream"

import type { ChatMessage } from "../types"

export function EmptyState({
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

export function MessageBubble({
  message,
  tokens,
  onDraft,
  onSubmitCard,
  isStreaming = false,
  toolSelectionPrefill,
  projectId,
  builderState,
}: {
  message: ChatMessage
  tokens: ReturnType<typeof useAppTokens>["tokens"]
  /** Pre-fill the composer (the "Ajustar" free-form draft path). */
  onDraft: (content: string) => void
  /** Card-action protocol submit — legacy inline cards (agent_approval /
   *  tool_selection / channel) flip their deterministic sentinel through this
   *  instead of posting free text. */
  onSubmitCard: (cardKey: CardKey, payload: Record<string, unknown>) => void
  /** Global chat streaming state — disables interactive cards mid-send. */
  isStreaming?: boolean
  /** Seleção persistida no builderState — prefill do ToolSelectionCard. */
  toolSelectionPrefill?: {
    selectedCapabilityKeys: string[]
    selectedToolKeys: string[]
  }
  /** BuilderProject id — threaded to ToolCallCard for integration cards. */
  projectId: string
  /** Canonical BuilderState — threaded to ToolCallCard for integration cards. */
  builderState: BuilderState
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
          <MarkdownContent content={message.content} className="max-w-[95%]" tokens={tokens} />
        )}
        {message.toolCalls?.map((tc, i) => (
          <ToolCallCard
            key={`${message.id}-tc-${i}`}
            toolName={tc.toolName}
            args={tc.args}
            result={tc.result}
            tokens={tokens}
            isStreaming={isStreaming}
            onDraft={onDraft}
            onSubmitCard={onSubmitCard}
            toolSelectionPrefill={toolSelectionPrefill}
            projectId={projectId}
            builderState={builderState}
          />
        ))}
      </div>
    </div>
  )
}

export function StreamingBubble({
  text,
  toolCalls,
  tokens,
  onDraft,
  onSubmitCard,
  toolSelectionPrefill,
  projectId,
  builderState,
}: {
  text: string
  toolCalls: ToolCallView[]
  tokens: ReturnType<typeof useAppTokens>["tokens"]
  /** Pre-fill the composer (the "Ajustar" free-form draft path). */
  onDraft: (content: string) => void
  /** Card-action protocol submit — see MessageBubble. */
  onSubmitCard: (cardKey: CardKey, payload: Record<string, unknown>) => void
  /** Seleção persistida no builderState — prefill do ToolSelectionCard. */
  toolSelectionPrefill?: {
    selectedCapabilityKeys: string[]
    selectedToolKeys: string[]
  }
  /** BuilderProject id — threaded to ToolCallCard for integration cards. */
  projectId: string
  /** Canonical BuilderState — threaded to ToolCallCard for integration cards. */
  builderState: BuilderState
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
          <div className="relative max-w-[95%]">
            <MarkdownContent content={text} tokens={tokens} />
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
            isStreaming
            onDraft={onDraft}
            onSubmitCard={onSubmitCard}
            toolSelectionPrefill={toolSelectionPrefill}
            projectId={projectId}
            builderState={builderState}
          />
        ))}
      </div>
    </div>
  )
}
