"use client"

/**
 * Builder Cards — channel_platform (Jornada v2 · T96, FR-24/25, plan §4.1)
 *
 * Primeiro card da fase "Lançar": "Onde seu agente vai atender?". Carrega os
 * DOIS níveis de decisão no MESMO componente:
 *
 *   Nível 1 — multi-select de PLATAFORMA (💬 WhatsApp / 📸 Instagram). Copy SEM
 *   jargão técnico (sem "QR"/"API"/"Cloud" neste nível — NFR-07): o usuário
 *   escolhe ONDE atende, não COMO conecta.
 *
 *   Nível 2 — só expande inline quando WhatsApp está marcado: modo de conexão
 *   "Conectar meu WhatsApp" (⭐ Recomendado, PRÉ-SELECIONADO — QR pareado) vs.
 *   "WhatsApp oficial da Meta" (badge avançado — Cloud API). Instagram NÃO tem
 *   nível 2 (FR-25).
 *
 * **A partir da Onda 5b (T94)** a seleção DUPLA está HABILITADA: marcar/desmarcar
 * é um toggle independente por plataforma (o mesmo agente atende ambos os canais).
 * O handler server-side (`applyChannelPlatform`) aceita 1 ou 2 plataformas.
 *
 * Presentational only: lê seu slice de `props.value.channel`, dispara o payload
 * tipado via `props.onSubmit` (chat-panel owns POST + SSE — o card NUNCA faz
 * fetch). Token-driven via `tokens` (zero cor hard-coded). Copy PT-BR.
 *
 * Contract (CARD CONTRACTS): cardKey 'channel_platform'
 *   payload  → { cardKey: 'channel_platform', platforms, whatsappMode? }
 *   owns     → channel.platforms + channel.whatsappMode
 *   sentinel → confirmations.channelPlatform
 */

import * as React from "react"
import { Check } from "lucide-react"

import type { ChannelPlatformPayload } from "@/server/ai-module/builder/cards/card-submit.schemas"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"

/** EXACT submit payload for cardKey 'channel_platform' (mirrors the backend). */
export type ChannelPlatformCardPayload = ChannelPlatformPayload

type Platform = "whatsapp" | "instagram"
type WhatsAppMode = "qr" | "cloud"

/** Recomendado, pré-selecionado ao marcar WhatsApp (a pré-seleção vive na UI). */
const DEFAULT_WHATSAPP_MODE: WhatsAppMode = "qr"

interface PlatformOption {
  value: Platform
  emoji: string
  title: string
  description: string
}

/** Nível 1 — copy SEM jargão (sem QR/API/Cloud): só ONDE o agente atende. */
const PLATFORM_OPTIONS: readonly PlatformOption[] = [
  {
    value: "whatsapp",
    emoji: "💬",
    title: "WhatsApp",
    description: "Onde seus clientes já falam com você.",
  },
  {
    value: "instagram",
    emoji: "📸",
    title: "Instagram",
    description: "Responde DMs do seu perfil automaticamente.",
  },
]

interface WhatsAppModeOption {
  value: WhatsAppMode
  title: string
  description: string
  recommended?: boolean
  advanced?: boolean
}

/** Nível 2 — só do WhatsApp (Instagram não tem nível 2, FR-25). */
const WHATSAPP_MODE_OPTIONS: readonly WhatsAppModeOption[] = [
  {
    value: "qr",
    title: "Conectar meu WhatsApp",
    description:
      "Escaneie um QR code com o WhatsApp do seu negócio — pronto em 2 minutos, sem burocracia.",
    recommended: true,
  },
  {
    value: "cloud",
    title: "WhatsApp oficial da Meta",
    description:
      "Para empresas com número verificado na Meta. Mais robusto para alto volume — exige conta WhatsApp Business API.",
    advanced: true,
  },
]

/**
 * ChannelPlatformCard — multi-select de plataforma (nível 1) + modo de conexão
 * do WhatsApp inline (nível 2). Pré-preenche por exceção de `value.channel`.
 *
 * Onda 5b: multi-select REAL (marcar/desmarcar cada plataforma de forma
 * independente); o QR fica pré-selecionado assim que WhatsApp entra.
 */
export function ChannelPlatformCard({
  value,
  disabled = false,
  onSubmit,
  tokens,
}: CardComponentProps<ChannelPlatformCardPayload>) {
  // Prefill por exceção: lê o que já foi escolhido (reopen) — vazio = sem seleção.
  const [platforms, setPlatforms] = React.useState<Platform[]>(
    () => value.channel?.platforms ?? [],
  )
  const [whatsappMode, setWhatsappMode] = React.useState<WhatsAppMode>(
    () => value.channel?.whatsappMode ?? DEFAULT_WHATSAPP_MODE,
  )

  const whatsappSelected = platforms.includes("whatsapp")

  // Onda 5b (T94): multi-select REAL. O mesmo agente atende ambos os canais
  // (T92 já permite N deployments), então marcar/desmarcar é um toggle independente
  // por plataforma — sem mais a substituição de seleção única.
  const togglePlatform = React.useCallback((platform: Platform) => {
    setPlatforms((current) =>
      current.includes(platform)
        ? current.filter((p) => p !== platform)
        : [...current, platform],
    )
  }, [])

  const canConfirm = platforms.length > 0

  const handleConfirm = React.useCallback(() => {
    if (disabled || platforms.length === 0) return
    // `whatsappMode` só faz sentido com WhatsApp na lista (refine do schema).
    onSubmit({
      cardKey: "channel_platform",
      platforms,
      whatsappMode: platforms.includes("whatsapp") ? whatsappMode : undefined,
    })
  }, [disabled, onSubmit, platforms, whatsappMode])

  return (
    <CardShell
      tokens={tokens}
      icon={<span className="text-base leading-none">📍</span>}
      title="Onde seu agente vai atender?"
      reason="Escolha o canal onde seus clientes conversam com o agente."
      actions={[
        {
          label: "Confirmar canal",
          onClick: handleConfirm,
          variant: "primary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled: disabled || !canConfirm,
        },
      ]}
    >
      <div className="flex flex-col gap-2">
        {PLATFORM_OPTIONS.map((option) => {
          const checked = platforms.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              role="checkbox"
              aria-checked={checked}
              disabled={disabled}
              onClick={() => togglePlatform(option.value)}
              className="group rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                backgroundColor: checked ? tokens.brandSubtle : tokens.bgBase,
                borderColor: checked ? tokens.brand : tokens.divider,
              }}
            >
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="text-lg leading-none">
                  {option.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <span
                    className="text-[13px] font-medium"
                    style={{ color: tokens.textPrimary }}
                  >
                    {option.title}
                  </span>
                  <p
                    className="mt-1 text-[12px] leading-relaxed"
                    style={{ color: tokens.textSecondary }}
                  >
                    {option.description}
                  </p>
                </div>
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                  style={{
                    backgroundColor: checked ? tokens.brand : "transparent",
                    borderColor: checked ? tokens.brand : tokens.divider,
                    color: checked ? tokens.textInverse : "transparent",
                  }}
                >
                  {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Onda 5b (T94): seleção dupla habilitada — o mesmo agente atende ambos. */}
      <p className="mt-2 text-[11px]" style={{ color: tokens.textTertiary }}>
        Pode marcar os dois — o mesmo agente atende ambos.
      </p>

      {/* Nível 2 — expande inline SÓ se WhatsApp está marcado (IG não tem). */}
      {whatsappSelected && (
        <div className="mt-4 flex flex-col gap-2">
          <p
            className="text-[12px] font-medium"
            style={{ color: tokens.textPrimary }}
          >
            Como conectar o WhatsApp?
          </p>
          {WHATSAPP_MODE_OPTIONS.map((option) => {
            const selected = whatsappMode === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => setWhatsappMode(option.value)}
                className="group rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  backgroundColor: selected ? tokens.brandSubtle : tokens.bgBase,
                  borderColor: selected ? tokens.brand : tokens.divider,
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span
                        className="text-[13px] font-medium"
                        style={{ color: tokens.textPrimary }}
                      >
                        {option.title}
                      </span>
                      {option.recommended && (
                        <span
                          className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{
                            backgroundColor: tokens.brandSubtle,
                            color: tokens.brandText,
                          }}
                        >
                          ⭐ Recomendado
                        </span>
                      )}
                      {option.advanced && (
                        <span
                          className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                          style={{
                            borderColor: tokens.divider,
                            color: tokens.textTertiary,
                          }}
                        >
                          Avançado
                        </span>
                      )}
                    </span>
                    <p
                      className="mt-1 text-[12px] leading-relaxed"
                      style={{ color: tokens.textSecondary }}
                    >
                      {option.description}
                    </p>
                  </div>
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                    style={{
                      backgroundColor: selected ? tokens.brand : "transparent",
                      borderColor: selected ? tokens.brand : tokens.divider,
                      color: selected ? tokens.textInverse : "transparent",
                    }}
                  >
                    {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </CardShell>
  )
}

export default ChannelPlatformCard
