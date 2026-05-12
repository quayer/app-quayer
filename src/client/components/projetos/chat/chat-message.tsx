"use client"

import { User } from "lucide-react"
import { useAppTokens, type AppTokens } from "@/client/hooks/use-app-tokens"
import { MarkdownContent } from "./markdown-content"

export interface UserBubbleProps {
  content: string
  timestamp?: string
  tokens?: AppTokens
}

export function UserBubble({ content, timestamp, tokens: tokensProp }: UserBubbleProps) {
  const { tokens: tokensHook } = useAppTokens()
  const tokens = tokensProp ?? tokensHook

  return (
    <div className="flex items-start gap-3 justify-end">
      <div
        className="max-w-[80%] rounded-2xl px-4 py-2.5"
        style={{
          background: tokens.brandSubtle,
          border: `1px solid ${tokens.brandBorder}`,
        }}
      >
        <MarkdownContent content={content} />
        {timestamp && (
          <p
            className="mt-1 text-[10px]"
            style={{ color: tokens.textTertiary }}
          >
            {timestamp}
          </p>
        )}
      </div>
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{
          background: tokens.bgElevated,
          color: tokens.textSecondary,
        }}
        aria-hidden
      >
        <User className="h-4 w-4" />
      </div>
    </div>
  )
}
