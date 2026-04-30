"use client"

import * as React from "react"
import { Bot, Check, MessageCircle, Pencil, Sparkles, User } from "lucide-react"

import { Button } from "@/client/components/ui/button"
import { Card, CardContent } from "@/client/components/ui/card"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

export interface PreviewExample {
  label?: string
  userMessage: string
  agentResponse: string
}

interface ExamplePreviewCardProps {
  agentName: string
  examples: PreviewExample[]
  tokens: AppTokens
  onApprove?: () => void
  onAdjust?: () => void
  decided?: boolean
}

/**
 * ExamplePreviewCard — renders a sequence of (user → agent) example turns
 * produced by run_prompt_preview, followed by an "Approve / Adjust" CTA
 * pair so the user can validate the tone BEFORE publishing.
 */
export function ExamplePreviewCard({
  agentName,
  examples,
  tokens,
  onApprove,
  onAdjust,
  decided = false,
}: ExamplePreviewCardProps) {
  return (
    <Card
      className="overflow-hidden border shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.border,
        borderRadius: "16px",
      }}
    >
      <CardContent className="p-0">
        {/* Header */}
        <div
          className="flex items-center gap-2.5 px-4 py-3"
          style={{ backgroundColor: tokens.hoverBg }}
        >
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: tokens.brandSubtle,
              color: tokens.brand,
            }}
          >
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-[13px] font-semibold"
              style={{ color: tokens.textPrimary }}
            >
              Preview de conversa
            </p>
            <p
              className="truncate text-[11px]"
              style={{ color: tokens.textTertiary }}
            >
              {agentName} · como seu agente vai responder
            </p>
          </div>
        </div>

        {/* Examples */}
        <div className="flex flex-col divide-y px-4 py-3" style={{}}>
          {examples.map((ex, i) => (
            <ExampleTurn
              key={`${i}-${ex.userMessage.slice(0, 8)}`}
              example={ex}
              tokens={tokens}
              isFirst={i === 0}
            />
          ))}
        </div>

        {/* Actions */}
        {(onApprove || onAdjust) && (
          <div
            className="flex items-center gap-2 border-t px-4 py-3"
            style={{ borderColor: tokens.divider }}
          >
            {onApprove && (
              <Button
                size="sm"
                className="h-8 gap-1.5 rounded-lg text-[13px] font-medium"
                style={{
                  backgroundColor: tokens.brand,
                  color: tokens.textInverse,
                }}
                onClick={onApprove}
                disabled={decided}
              >
                <Check className="h-3.5 w-3.5" />
                Aprovar prompt
              </Button>
            )}
            {onAdjust && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 rounded-lg text-[13px] font-medium"
                style={{
                  borderColor: tokens.border,
                  color: tokens.textSecondary,
                }}
                onClick={onAdjust}
                disabled={decided}
              >
                <Pencil className="h-3.5 w-3.5" />
                Ajustar tom
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ExampleTurn({
  example,
  tokens,
  isFirst,
}: {
  example: PreviewExample
  tokens: AppTokens
  isFirst: boolean
}) {
  return (
    <div
      className={isFirst ? "pb-3" : "py-3"}
      style={{ borderColor: tokens.divider }}
    >
      {example.label && (
        <p
          className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: tokens.textTertiary }}
        >
          <MessageCircle className="h-3 w-3" />
          {example.label}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Bubble
          icon={User}
          role="Cliente"
          text={example.userMessage}
          tone="user"
          tokens={tokens}
        />
        <Bubble
          icon={Bot}
          role="Seu agente"
          text={example.agentResponse}
          tone="assistant"
          tokens={tokens}
        />
      </div>
    </div>
  )
}

function Bubble({
  icon: Icon,
  role,
  text,
  tone,
  tokens,
}: {
  icon: React.ElementType
  role: string
  text: string
  tone: "user" | "assistant"
  tokens: AppTokens
}) {
  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{
        backgroundColor:
          tone === "user" ? tokens.hoverBg : tokens.brandSubtle,
      }}
    >
      <p
        className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider"
        style={{
          color: tone === "user" ? tokens.textTertiary : tokens.brand,
        }}
      >
        <Icon className="h-2.5 w-2.5" />
        {role}
      </p>
      <p
        className="whitespace-pre-wrap text-[13px] leading-relaxed"
        style={{ color: tokens.textPrimary }}
      >
        {text}
      </p>
    </div>
  )
}
