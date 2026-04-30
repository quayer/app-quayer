"use client"

import * as React from "react"
import { Bot, User } from "lucide-react"

import { Avatar, AvatarFallback } from "@/client/components/ui/avatar"
import { Card } from "@/client/components/ui/card"
import type { useAppTokens } from "@/client/hooks/use-app-tokens"

import type { ChatMessage as ChatMessageType } from "../types"
import { MarkdownContent } from "./markdown-content"
import { QuickReplyBar } from "./quick-reply-bar"
import { ToolCallCard } from "./tool-call-card"
import type { ToolCallView } from "./hooks/use-chat-stream"
import { parseQuickReply } from "./utils/parse-quick-reply"
import { stripCardText } from "./utils/strip-card-text"

type Tokens = ReturnType<typeof useAppTokens>["tokens"]

// ── User bubble ──────────────────────────────────────────────────────────────

export function UserBubble({ content, tokens }: { content: string; tokens: Tokens }) {
  return (
    <div className="flex flex-row-reverse items-start gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback
          style={{ backgroundColor: tokens.brand, color: tokens.textInverse }}
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
        {content}
      </Card>
    </div>
  )
}

// ── System banner ────────────────────────────────────────────────────────────

function SystemBanner({
  content,
  tokens,
}: {
  content: string
  tokens: Tokens
}) {
  return (
    <div
      className="mx-auto rounded-full px-3 py-1 text-center text-[11px]"
      style={{ backgroundColor: tokens.hoverBg, color: tokens.textTertiary }}
    >
      {content}
    </div>
  )
}

// ── Assistant bubble ─────────────────────────────────────────────────────────

interface AssistantBubbleProps {
  message: ChatMessageType
  tokens: Tokens
  isHistorical?: boolean
}

function AssistantBubble({ message, tokens, isHistorical }: AssistantBubbleProps) {
  const { cleanText, chips } = React.useMemo(() => {
    // 1. Strip text that a rich card already shows (select_channel, etc.)
    let text = stripCardText(message.content ?? "", message.toolCalls ?? [])

    // 2. Strip verbatim prompt returned by generate_prompt_anatomy
    for (const tc of message.toolCalls ?? []) {
      if (tc.toolName !== "generate_prompt_anatomy") continue
      if (!tc.result || typeof tc.result !== "object") continue
      const res = tc.result as Record<string, unknown>
      if (res.success !== true) continue
      const prompt = typeof res.prompt === "string" ? res.prompt : null
      if (!prompt || prompt.length < 40) continue
      const idx = text.indexOf(prompt)
      if (idx >= 0) {
        text = (text.slice(0, idx) + text.slice(idx + prompt.length)).trim()
      }
    }

    // 3. Extract quick-reply chips from numbered lists at end of text
    return parseQuickReply(text)
  }, [message.content, message.toolCalls])

  return (
    <div className="flex items-start gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback
          style={{ backgroundColor: tokens.brandSubtle, color: tokens.brand }}
        >
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {cleanText && (
          <MarkdownContent
            content={cleanText}
            tokens={tokens}
            className="w-full min-w-0"
          />
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
        {chips.length > 0 && <QuickReplyBar chips={chips} tokens={tokens} allDisabled={isHistorical} />}
      </div>
    </div>
  )
}

// ── Streaming bubble ─────────────────────────────────────────────────────────

interface StreamingBubbleProps {
  text: string
  toolCalls: ToolCallView[]
  tokens: Tokens
}

export function StreamingBubble({
  text,
  toolCalls,
  tokens,
}: StreamingBubbleProps) {
  return (
    <div className="flex items-start gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback
          style={{ backgroundColor: tokens.brandSubtle, color: tokens.brand }}
        >
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {text && (
          <div className="relative w-full min-w-0">
            {/* Use MarkdownContent so style matches the committed AssistantBubble
                exactly — eliminates the layout flash when streaming ends. */}
            <MarkdownContent content={text} tokens={tokens} className="w-full min-w-0" />
            <span
              className="ml-0.5 inline-block animate-pulse"
              style={{ color: tokens.brand, lineHeight: 1 }}
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

// ── Public dispatcher ────────────────────────────────────────────────────────

export interface ChatMessageProps {
  message: ChatMessageType
  tokens: Tokens
  isHistorical?: boolean
}

/** Dispatches a message to the correct bubble by role. */
export function ChatMessage({ message, tokens, isHistorical }: ChatMessageProps) {
  if (message.role === "user") {
    return <UserBubble content={message.content} tokens={tokens} />
  }
  if (message.role === "system_banner") {
    return <SystemBanner content={message.content} tokens={tokens} />
  }
  return <AssistantBubble message={message} tokens={tokens} isHistorical={isHistorical} />
}
