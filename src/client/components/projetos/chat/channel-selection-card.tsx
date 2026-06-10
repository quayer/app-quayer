"use client"

/**
 * ChannelSelectionCard — inline card for the `select_channel` tool call.
 * Structural extraction from chat-panel.tsx (no behavior change).
 */

import * as React from "react"
import { Instagram, MessageCircle, QrCode } from "lucide-react"

import { useAppTokens } from "@/client/hooks/use-app-tokens"

import type { CardKey } from "./cards/types"
import {
  getChannelSelection,
  type ChannelEntry,
} from "./tool-call-helpers"

function ChannelIcon({ channel }: { channel: string }) {
  const className = "h-4 w-4"
  if (channel === "instagram") return <Instagram className={className} />
  if (channel === "uazapi") return <QrCode className={className} />
  return <MessageCircle className={className} />
}

export function ChannelSelectionCard({
  selection,
  tokens,
  onSubmitCard,
  disabled = false,
}: {
  selection: NonNullable<ReturnType<typeof getChannelSelection>>
  tokens: ReturnType<typeof useAppTokens>["tokens"]
  /** Card-action protocol submit — flips the `channel` sentinel. The server
   *  re-validates `channelKey` against the channel catalog (cloudapi | uazapi |
   *  instagram). */
  onSubmitCard: (cardKey: CardKey, payload: Record<string, unknown>) => void
  /** True while streaming — prevents queuing conflicting channel choices. */
  disabled?: boolean
}) {
  // Nível 1 = plataforma (WhatsApp / Instagram); nível 2 = sabores do WhatsApp.
  // O cabeçalho "WhatsApp" é só visual: NUNCA submete — só os botões-folha
  // chamam onSubmitCard (a chave 'whatsapp' não existe no enum). QR primeiro.
  const whatsapp = selection.channels
    .filter((c) => c.platform === "whatsapp")
    .sort((a, b) => Number(a.requiresApproval) - Number(b.requiresApproval))
  const others = selection.channels.filter((c) => c.platform !== "whatsapp")
  const showWhatsappHeader = whatsapp.length > 0 && others.length > 0

  const renderLeaf = (channel: ChannelEntry) => (
    <button
      key={channel.key}
      type="button"
      disabled={disabled}
      className="rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
      style={{
        backgroundColor: tokens.bgBase,
        borderColor: tokens.divider,
      }}
      onClick={() =>
        onSubmitCard("channel", {
          action: "select",
          channelKey: channel.key,
        })
      }
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          style={{
            backgroundColor: tokens.hoverBg,
            color: tokens.textSecondary,
          }}
        >
          <ChannelIcon channel={channel.key} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium" style={{ color: tokens.textPrimary }}>
              {channel.title}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: tokens.hoverBg,
                color: tokens.textTertiary,
              }}
            >
              {channel.requiresApproval ? "requer aprovação" : "QR rápido"}
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: tokens.textSecondary }}>
            {channel.description}
          </p>
        </div>
      </div>
    </button>
  )

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
          <MessageCircle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold" style={{ color: tokens.textPrimary }}>
            Escolher canal
          </p>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: tokens.textSecondary }}>
            {selection.reason ?? "Escolha onde este agente vai atender os clientes."}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {whatsapp.length > 0 &&
          (showWhatsappHeader ? (
            <div
              className="rounded-md border"
              style={{ borderColor: tokens.divider, backgroundColor: tokens.bgBase }}
            >
              <div
                className="flex flex-wrap items-center gap-2 px-3 py-2"
                style={{ color: tokens.textPrimary }}
              >
                <MessageCircle className="h-4 w-4" />
                <span className="text-[13px] font-medium">WhatsApp</span>
                <span className="text-[11px]" style={{ color: tokens.textTertiary }}>
                  — escolha como conectar
                </span>
              </div>
              <div className="grid gap-2 p-2 pt-0">{whatsapp.map(renderLeaf)}</div>
            </div>
          ) : (
            whatsapp.map(renderLeaf)
          ))}
        {others.map(renderLeaf)}
      </div>
    </div>
  )
}
