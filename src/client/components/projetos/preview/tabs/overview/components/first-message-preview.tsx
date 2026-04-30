"use client"

/**
 * FirstMessagePreviewCard — mission-control card that shows the WhatsApp
 * greeting the agent will send to new contacts.
 *
 * Visual: mimics a WhatsApp bubble (green-olive tint, rounded corners with
 * a sharper bottom-left tail) over a surface card. When no greeting exists
 * yet, the card collapses into an empty state with an embedded
 * <AskBuilderButton /> that hands the task off to the Builder chat.
 */

import { MessageCircle, Pencil } from "lucide-react"
import { Card } from "@/client/components/ui/card"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { AskBuilderButton } from "../../../shared/ask-builder-button"

export interface FirstMessagePreviewProps {
  tokens: AppTokens
  /** The greeting text the agent will send; null when not yet defined. */
  firstMessage: string | null
  /** Where the greeting came from — drives the source badge. */
  source?: "tool_result" | "manual" | null
  /** Optional edit hook — when omitted the edit button is hidden. */
  onEdit?: () => void
}

/** WhatsApp-ish bubble color that stays readable on both themes. */
const BUBBLE_BG = "rgba(37, 211, 102, 0.12)" // WhatsApp green tint
const BUBBLE_BORDER = "rgba(37, 211, 102, 0.28)"
const BUBBLE_TEXT_DARK = "#1A0800"
const BUBBLE_TEXT_LIGHT = "#E8FFE0"

export function FirstMessagePreviewCard({
  tokens,
  firstMessage,
  source = null,
  onEdit,
}: FirstMessagePreviewProps) {
  const isEmpty = firstMessage === null || firstMessage.trim().length === 0
  // Pick bubble text color based on contrast against BUBBLE_BG. On dark mode
  // the token background is near-black, so the green tint is dark too and
  // light text reads better; on light mode the tint is pale and dark text wins.
  const bubbleTextColor =
    tokens.textPrimary === "#FFFFFF" ? BUBBLE_TEXT_LIGHT : BUBBLE_TEXT_DARK

  return (
    <Card
      className="border p-0 shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.divider,
      }}
    >
      <div
        className="flex items-center justify-between gap-3 border-b px-4 py-3"
        style={{ borderColor: tokens.divider }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <MessageCircle
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: tokens.textTertiary }}
            aria-hidden="true"
          />
          <span
            className="truncate text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: tokens.textTertiary }}
          >
            Primeira mensagem que seus clientes vao ver
          </span>
        </div>
        {!isEmpty && source && <SourceBadge tokens={tokens} source={source} />}
      </div>

      <div className="px-4 pb-4 pt-3">
        {isEmpty ? (
          <div
            className="flex flex-col items-start gap-3 rounded-md border border-dashed px-4 py-4"
            style={{
              borderColor: tokens.divider,
              backgroundColor: tokens.bgBase,
            }}
          >
            <p
              className="text-[13px] leading-snug"
              style={{ color: tokens.textSecondary }}
            >
              Ainda nao definida. Peca ao Builder para criar a saudacao
              inicial.
            </p>
            <AskBuilderButton
              tokens={tokens}
              variant="small"
              label="Criar saudacao"
              message="Crie uma primeira mensagem amigavel para meus clientes no WhatsApp"
            />
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div
              className="relative max-w-[85%] rounded-2xl rounded-bl-sm px-3.5 py-2.5"
              style={{
                backgroundColor: BUBBLE_BG,
                border: `1px solid ${BUBBLE_BORDER}`,
                color: bubbleTextColor,
                fontFamily:
                  '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
              }}
            >
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
                {firstMessage}
              </p>
            </div>
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors"
                style={{
                  borderColor: tokens.divider,
                  color: tokens.textSecondary,
                  backgroundColor: "transparent",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = tokens.hoverBg
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent"
                }}
              >
                <Pencil className="h-3 w-3" aria-hidden="true" />
                Editar
              </button>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

function SourceBadge({
  tokens,
  source,
}: {
  tokens: AppTokens
  source: "tool_result" | "manual"
}) {
  const label = source === "tool_result" ? "Gerado pelo Builder" : "Manual"
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{
        backgroundColor: tokens.brandSubtle,
        color: tokens.brandText,
        border: `1px solid ${tokens.brandBorder}`,
      }}
    >
      {label}
    </span>
  )
}
