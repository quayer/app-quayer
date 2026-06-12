"use client"

/**
 * ToolCallCard — renders an inline tool-call entry in the conversation: the
 * legacy interactive cards (agent proposal / tool selection / channel / QR) or
 * the compact status chip fallback. Structural extraction from chat-panel.tsx
 * (no behavior change).
 */

import * as React from "react"
import { Check, Loader2, Pencil, Sparkles } from "lucide-react"

import { Button } from "@/client/components/ui/button"
import { useAppTokens } from "@/client/hooks/use-app-tokens"

import type { BuilderState, CardKey } from "./cards/types"
import {
  AGENT_PROPOSAL_CAPABILITIES,
  getAgentProposal,
  getChannelSelection,
  getQuickReplyChips,
  getQrResult,
  getToolSelection,
  isSuccessfulToolResult,
  toolLabel,
  toolResultSummary,
} from "./tool-call-helpers"
import { ToolSelectionCard } from "./tool-selection-card"
import { ChannelSelectionCard } from "./channel-selection-card"
import { WhatsAppQrCard } from "./whatsapp-qr-card"
import { renderIntegrationToolCard } from "./cards/integration/integration-tool-cards"
import { QuickReplyChipsCard } from "./cards/quick-reply-chips-card"

export function ToolCallCard({
  toolName,
  args,
  result,
  tokens,
  streaming = false,
  isStreaming = false,
  onDraft,
  onSubmitCard,
  toolSelectionPrefill,
  projectId,
  builderState,
}: {
  toolName: string
  args: unknown
  result?: unknown
  tokens: ReturnType<typeof useAppTokens>["tokens"]
  /** BuilderProject id + canonical BuilderState — fed to the W2 integration cards. */
  projectId: string
  builderState: BuilderState
  /** This specific tool call is still streaming (no result yet). */
  streaming?: boolean
  /** The chat as a whole is streaming — disables interactive card actions. */
  isStreaming?: boolean
  /** Pre-fill the composer (the "Ajustar" free-form draft path). */
  onDraft: (content: string) => void
  /** Card-action protocol submit — the 3 legacy inline cards
   *  (agent_approval / tool_selection / channel) post their typed payload here
   *  so the deterministic confirmation sentinel flips (instead of posting free
   *  text, which never advanced the journey). */
  onSubmitCard: (cardKey: CardKey, payload: Record<string, unknown>) => void
  /** Seleção persistida no builderState — reabre o picker com a decisão atual
   *  em vez dos recommended. */
  toolSelectionPrefill?: {
    selectedCapabilityKeys: string[]
    selectedToolKeys: string[]
  }
}) {
  if (toolName === "set_project_basics" && !streaming && isSuccessfulToolResult(result)) {
    return null
  }

  if (toolName === "propose_agent_creation" && !streaming) {
    const proposal = getAgentProposal(args, result)

    return (
      <div
        className="max-w-[95%] rounded-lg border p-4"
        style={{
          backgroundColor: tokens.bgSurface,
          borderColor: tokens.divider,
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
            style={{
              backgroundColor: tokens.brandSubtle,
              color: tokens.brand,
            }}
          >
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-[13px] font-semibold"
              style={{ color: tokens.textPrimary }}
            >
              {proposal.name}
            </p>
            <p
              className="mt-1 text-[13px] leading-relaxed"
              style={{ color: tokens.textSecondary }}
            >
              {proposal.description}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {AGENT_PROPOSAL_CAPABILITIES.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.title}
                className="flex min-w-0 items-start gap-2 rounded-md border px-3 py-2"
                style={{
                  borderColor: tokens.divider,
                  backgroundColor: tokens.bgBase,
                }}
              >
                <Icon
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  style={{ color: tokens.brand }}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[12px] font-medium"
                      style={{ color: tokens.textPrimary }}
                    >
                      {item.title}
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px]"
                      style={{
                        backgroundColor: tokens.brandSubtle,
                        color: tokens.brandText,
                      }}
                    >
                      {item.state}
                    </span>
                  </div>
                  <p
                    className="mt-0.5 text-[11px] leading-snug"
                    style={{ color: tokens.textTertiary }}
                  >
                    {item.detail}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5 text-[12px]"
            // Card-action protocol: flips the `agent_approval` sentinel so the
            // meta-agent may proceed with create_agent. (Was: free-text onSend,
            // which never advanced the deterministic journey.)
            onClick={() =>
              onSubmitCard("agent_approval", {
                action: "confirm",
                name: proposal.name,
                description: proposal.description,
              })
            }
            disabled={isStreaming}
          >
            <Check className="h-3.5 w-3.5" />
            Criar agente
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-[12px]"
            // Free-form draft path kept as-is: the user tweaks before confirming.
            onClick={() => onDraft("Quero ajustar antes: ")}
            disabled={isStreaming}
          >
            <Pencil className="h-3.5 w-3.5" />
            Ajustar
          </Button>
        </div>
      </div>
    )
  }

  if (toolName === "quick_reply_chips" && !streaming) {
    const quickReplies = getQuickReplyChips(args, result)
    if (quickReplies) {
      return (
        <QuickReplyChipsCard
          projectId={projectId}
          cardKey="quick_reply_chips"
          value={builderState}
          disabled={isStreaming}
          tokens={tokens}
          chips={quickReplies.chips}
          prompt={quickReplies.prompt}
          onSubmit={(payload) =>
            onSubmitCard("quick_reply_chips", { value: payload.value })
          }
        />
      )
    }
  }

  // Integration Builder (W2, T41) — mode-4 inline cards (NOT in CARD_REGISTRY).
  // Returns null for non-integration tools (falls through to the branches below).
  const integrationCard = streaming
    ? null
    : renderIntegrationToolCard({
        toolName, result, projectId, value: builderState,
        disabled: isStreaming, tokens, onSubmitCard,
      })
  if (integrationCard) return integrationCard

  if (toolName === "propose_tool_selection" && !streaming) {
    const selection = getToolSelection(result)
    if (selection) {
      return (
        <ToolSelectionCard
          selection={selection}
          tokens={tokens}
          onSubmitCard={onSubmitCard}
          disabled={isStreaming}
          selectedCapabilityKeys={toolSelectionPrefill?.selectedCapabilityKeys}
          selectedToolKeys={toolSelectionPrefill?.selectedToolKeys}
        />
      )
    }
  }

  if (toolName === "select_channel" && !streaming) {
    const selection = getChannelSelection(result)
    if (selection) {
      return (
        <ChannelSelectionCard
          selection={selection}
          tokens={tokens}
          onSubmitCard={onSubmitCard}
          disabled={isStreaming}
        />
      )
    }
  }

  if (toolName === "create_whatsapp_instance" && !streaming) {
    const qr = getQrResult(result)
    if (qr) {
      return <WhatsAppQrCard data={qr} tokens={tokens} />
    }
  }

  const label = toolLabel(toolName)
  const summary = result !== undefined ? toolResultSummary(result) : null
  const hasError =
    result !== null &&
    typeof result === "object" &&
    ((result as Record<string, unknown>).success === false ||
      typeof (result as Record<string, unknown>).error === "string")

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px]"
      style={{
        backgroundColor: tokens.bgSurface,
        border: `1px solid ${tokens.divider}`,
        color: tokens.textSecondary,
      }}
    >
      {streaming ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin" style={{ color: tokens.brand }} />
      ) : hasError ? (
        <span className="h-3 w-3 shrink-0 text-[10px]">✗</span>
      ) : (
        <span className="h-3 w-3 shrink-0 text-[10px]" style={{ color: tokens.brand }}>✓</span>
      )}
      <span style={{ color: tokens.textPrimary }}>{label}</span>
      {summary && (
        <span className="ml-1 truncate" style={{ color: hasError ? tokens.dangerText : tokens.textTertiary }}>
          — {summary}
        </span>
      )}
    </div>
  )
}
