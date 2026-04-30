"use client"

import * as React from "react"
import { Cloud, Smartphone, Instagram } from "lucide-react"

import { Card, CardContent } from "@/client/components/ui/card"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

type ChannelOption = "cloudapi" | "uazapi" | "instagram"

interface ChannelPickerCardProps {
  tokens: AppTokens
  selected?: ChannelOption
  onSelect?: (channel: ChannelOption) => void
}

const CHANNELS: Array<{
  key: ChannelOption
  icon: React.ElementType
  title: string
  description: string
  disabled?: boolean
}> = [
  {
    key: "cloudapi",
    icon: Cloud,
    title: "WhatsApp Cloud API",
    description: "API oficial da Meta. Mais estavel, requer aprovacao.",
  },
  {
    key: "uazapi",
    icon: Smartphone,
    title: "WhatsApp Business",
    description: "Pareamento por QR Code. Rapido e sem aprovacao.",
  },
  {
    key: "instagram",
    icon: Instagram,
    title: "Instagram Direct",
    description: "Receba DMs e responda com IA via Meta Graph API.",
  },
]

/**
 * ChannelPickerCard — visual channel selection for WhatsApp instance creation.
 */
export function ChannelPickerCard({
  tokens,
  selected,
  onSelect,
}: ChannelPickerCardProps) {
  return (
    <Card
      className="overflow-hidden border shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.border,
        borderRadius: "16px",
      }}
    >
      <CardContent className="p-3">
        <p
          className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: tokens.textTertiary }}
        >
          Escolha o canal
        </p>
        <div className="flex flex-col gap-2">
          {CHANNELS.map((ch) => {
            const isSelected = selected === ch.key
            const Icon = ch.icon
            return (
              <button
                key={ch.key}
                type="button"
                disabled={ch.disabled}
                onClick={() => !ch.disabled && onSelect?.(ch.key)}
                className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  borderColor: isSelected
                    ? tokens.brandBorder
                    : tokens.border,
                  backgroundColor: isSelected
                    ? tokens.brandSubtle
                    : "transparent",
                }}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: isSelected
                      ? tokens.brand
                      : tokens.hoverBg,
                    color: isSelected
                      ? tokens.textInverse
                      : tokens.textSecondary,
                  }}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[13px] font-medium"
                    style={{
                      color: isSelected
                        ? tokens.brandText
                        : tokens.textPrimary,
                    }}
                  >
                    {ch.title}
                    {ch.disabled && (
                      <span
                        className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: tokens.hoverBg,
                          color: tokens.textTertiary,
                        }}
                      >
                        em breve
                      </span>
                    )}
                  </p>
                  <p
                    className="text-[11px]"
                    style={{ color: tokens.textTertiary }}
                  >
                    {ch.description}
                  </p>
                </div>
                {isSelected && (
                  <div
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: tokens.brand,
                      color: tokens.textInverse,
                    }}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                    >
                      <path
                        d="M2 5l2.5 2.5L8 3"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
