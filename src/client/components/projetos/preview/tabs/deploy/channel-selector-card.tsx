"use client"

/**
 * ChannelSelectorCard — lets the user pick HOW the agent connects to a channel.
 *
 * Three mutually-exclusive options:
 *   1. WhatsApp Business (UAZAPI) — QR / pairing flow + share link. O estado do
 *      provisionamento (useWhatsAppProvision) é DONO do orquestrador
 *      (channel-picker-section) e chega via prop `whatsapp` — assim o QR
 *      sobrevive quando este card é substituído pela view de canal pendente.
 *   2. WhatsApp Cloud API         — credential form → POST /api/v1/builder/channel/credentials.
 *   3. Instagram Direct           — credential form → same route, kind=INSTAGRAM.
 *
 * Token styling follows the deploy-tab convention: DS v3 `--q-*` via AppTokens,
 * inline `style` for colors, Tailwind utilities for layout.
 */

import * as React from "react"
import { Check, Instagram, Loader2, MessageSquare, Phone, QrCode } from "lucide-react"

import { Button } from "@/client/components/ui/button"
import { Card, CardContent } from "@/client/components/ui/card"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import {
  ChannelCredentialForm,
  type ChannelCredentialField,
} from "./channel-credential-form"
import { QrPanel } from "./qr-panel"
import type { WhatsAppProvisionState } from "./use-whatsapp-provision"

type ChannelChoice = "whatsapp_business" | "whatsapp_cloud" | "instagram"

interface ChannelOptionMeta {
  key: ChannelChoice
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

const OPTIONS: readonly ChannelOptionMeta[] = [
  {
    key: "whatsapp_business",
    title: "WhatsApp Business",
    description: "Conexão direta via QR Code (UAZAPI). Ideal para começar rápido.",
    icon: MessageSquare,
  },
  {
    key: "whatsapp_cloud",
    title: "WhatsApp Cloud API",
    description: "API oficial da Meta. Requer número verificado e tokens da WABA.",
    icon: Phone,
  },
  {
    key: "instagram",
    title: "Instagram Direct",
    description: "Responde DMs do Instagram via API oficial da Meta.",
    icon: Instagram,
  },
] as const

const WHATSAPP_CLOUD_FIELDS: readonly ChannelCredentialField[] = [
  {
    name: "accessToken",
    label: "Access Token",
    placeholder: "EAAB...",
    secret: true,
    minLength: 20,
    hint: "Token permanente da System User da Meta.",
  },
  {
    name: "phoneNumberId",
    label: "Phone Number ID",
    placeholder: "1099...",
    hint: "ID do número no WhatsApp Manager.",
  },
  { name: "wabaId", label: "WABA ID", placeholder: "1023..." },
  {
    name: "verifyToken",
    label: "Verify Token",
    placeholder: "string-secreta-do-webhook",
    hint: "O mesmo valor configurado no webhook da Meta.",
  },
] as const

const INSTAGRAM_FIELDS: readonly ChannelCredentialField[] = [
  { name: "igAccountId", label: "Instagram Account ID", placeholder: "17841..." },
  {
    name: "pageAccessToken",
    label: "Page Access Token",
    placeholder: "EAAB...",
    secret: true,
    minLength: 20,
  },
  { name: "appSecret", label: "App Secret", placeholder: "32 caracteres", secret: true },
  {
    name: "verifyToken",
    label: "Verify Token",
    placeholder: "string-secreta-do-webhook",
    hint: "O mesmo valor configurado no webhook da Meta.",
  },
] as const

function OptionButton({
  tokens,
  meta,
  selected,
  onSelect,
}: {
  tokens: AppTokens
  meta: ChannelOptionMeta
  selected: boolean
  onSelect: () => void
}) {
  const Icon = meta.icon
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
      style={{
        borderColor: selected ? tokens.brand : tokens.border,
        backgroundColor: selected ? tokens.brandSubtle : tokens.bgSurface,
      }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{
          backgroundColor: selected ? tokens.brand : tokens.bgElevated,
          color: selected ? tokens.textInverse : tokens.textSecondary,
        }}
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold" style={{ color: tokens.textPrimary }}>
            {meta.title}
          </span>
          {selected && <Check className="h-3.5 w-3.5" style={{ color: tokens.brand }} aria-hidden="true" />}
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: tokens.textTertiary }}>
          {meta.description}
        </p>
      </div>
    </button>
  )
}

function WhatsAppBusinessPanel({
  tokens,
  whatsapp,
}: {
  tokens: AppTokens
  whatsapp: WhatsAppProvisionState
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] leading-relaxed" style={{ color: tokens.textSecondary }}>
        Conecte um número do WhatsApp via QR Code (UAZAPI). Gere o link para você
        ou seu cliente escanear e parear o número.
      </p>

      {!whatsapp.shareToken ? (
        <>
          <Button
            type="button"
            size="sm"
            className="h-9 w-fit gap-1.5 rounded-lg text-[12px] font-medium"
            style={{ backgroundColor: tokens.brand, color: tokens.textInverse }}
            onClick={whatsapp.provision}
            disabled={whatsapp.provisioning}
          >
            {whatsapp.provisioning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {whatsapp.provisioning ? "Conectando..." : "Conectar WhatsApp Business"}
          </Button>

          {whatsapp.error && (
            <p
              role="alert"
              className="rounded-md border px-2.5 py-1.5 text-[11px]"
              style={{
                borderColor: tokens.danger,
                backgroundColor: tokens.dangerSubtle,
                color: tokens.dangerText,
              }}
            >
              {whatsapp.error}
            </p>
          )}
        </>
      ) : (
        <QrPanel
          tokens={tokens}
          shareLink={whatsapp.shareLink}
          qrCode={whatsapp.qrCode}
          expiresAt={whatsapp.expiresAt}
          refreshing={whatsapp.refreshing}
          error={whatsapp.error}
          onRefreshQr={whatsapp.refreshQr}
        />
      )}
    </div>
  )
}

export interface ChannelSelectorCardProps {
  tokens: AppTokens
  projectId: string
  /**
   * Estado do provisionamento WhatsApp Business (UAZAPI), dono do orquestrador
   * (channel-picker-section via useWhatsAppProvision). Mantido fora do card
   * para o QR sobreviver à troca selector → canal pendente.
   */
  whatsapp: WhatsAppProvisionState
  /** Which option is open initially. Defaults to "whatsapp_business". */
  defaultChoice?: ChannelChoice
  /** Fires after a successful credential save so the wizard can refetch state. */
  onChannelConnected: () => void | Promise<void>
}

export function ChannelSelectorCard({
  tokens,
  projectId,
  whatsapp,
  defaultChoice = "whatsapp_business",
  onChannelConnected,
}: ChannelSelectorCardProps) {
  const [choice, setChoice] = React.useState<ChannelChoice>(defaultChoice)

  return (
    <Card
      className="border p-0 shadow-none"
      style={{ backgroundColor: tokens.bgSurface, borderColor: tokens.divider }}
    >
      <CardContent className="p-0">
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: tokens.divider }}
        >
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: tokens.textTertiary }}
          >
            Escolha o canal
          </span>
        </div>

        <div
          className="flex flex-col gap-2 px-4 py-4"
          role="radiogroup"
          aria-label="Tipo de canal para conectar o agente"
        >
          {OPTIONS.map((meta) => (
            <OptionButton
              key={meta.key}
              tokens={tokens}
              meta={meta}
              selected={choice === meta.key}
              onSelect={() => setChoice(meta.key)}
            />
          ))}
        </div>

        <div className="border-t px-4 py-4" style={{ borderColor: tokens.divider }}>
          {choice === "whatsapp_business" && (
            <WhatsAppBusinessPanel tokens={tokens} whatsapp={whatsapp} />
          )}

          {choice === "whatsapp_cloud" && (
            <ChannelCredentialForm
              tokens={tokens}
              projectId={projectId}
              kind="WHATSAPP_CLOUD"
              fields={WHATSAPP_CLOUD_FIELDS}
              submitLabel="Conectar WhatsApp Cloud"
              onConnected={onChannelConnected}
            />
          )}

          {choice === "instagram" && (
            <ChannelCredentialForm
              tokens={tokens}
              projectId={projectId}
              kind="INSTAGRAM"
              fields={INSTAGRAM_FIELDS}
              submitLabel="Conectar Instagram"
              onConnected={onChannelConnected}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
