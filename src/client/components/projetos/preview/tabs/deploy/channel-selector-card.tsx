"use client"

/**
 * ChannelSelectorCard — lets the user pick HOW the agent connects to a channel.
 *
 * Three mutually-exclusive options:
 *   1. WhatsApp Business (UAZAPI) — QR / pairing flow + a button that generates
 *      a public share link the end client can open to scan the QR themselves.
 *      Uses POST /api/v1/instances/share/[token] (returns { data: { qrCode, expiresAt } }).
 *   2. WhatsApp Cloud API         — credential form → POST /api/v1/builder/channel/credentials.
 *   3. Instagram Direct           — credential form → same route, kind=INSTAGRAM.
 *
 * This card is presentational + self-contained. It does NOT own the wizard
 * step / channel polling — the deploy-tab orchestrator passes `projectId`, an
 * optional `shareToken` (so the WhatsApp Business share link can be built), and
 * an `onChannelConnected` callback fired after a successful credential save.
 *
 * Token styling follows the deploy-tab convention: DS v3 `--q-*` via AppTokens,
 * inline `style` for colors, Tailwind utilities for layout.
 *
 * Wiring is owned by the orchestrator (tab-registry / channel-picker-section);
 * this file only exports the component.
 */

import * as React from "react"
import {
  Check,
  Copy,
  ExternalLink,
  Instagram,
  Loader2,
  MessageSquare,
  Phone,
  QrCode,
} from "lucide-react"

import { Button } from "@/client/components/ui/button"
import { Card, CardContent } from "@/client/components/ui/card"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import {
  ChannelCredentialForm,
  type ChannelCredentialField,
} from "./channel-credential-form"

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

async function readShareError(response: Response, fallback: string): Promise<string> {
  const text = await response.text().catch(() => "")
  if (!text) return fallback
  try {
    const json = JSON.parse(text) as { error?: unknown; message?: unknown }
    const candidate = json.message ?? json.error
    if (typeof candidate === "string" && candidate.trim()) return candidate
  } catch {
    // fall through
  }
  return text.trim().slice(0, 240) || fallback
}

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

function ShareLinkRow({
  tokens,
  shareLink,
}: {
  tokens: AppTokens
  shareLink: string
}) {
  const [copied, setCopied] = React.useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable — link is still visible/selectable
    }
  }
  return (
    <div
      className="flex items-center gap-2 rounded-md border px-2 py-1.5"
      style={{ borderColor: tokens.border, backgroundColor: tokens.bgBase }}
    >
      <code
        className="flex-1 overflow-x-auto whitespace-nowrap text-[11px]"
        style={{ color: tokens.textPrimary }}
      >
        {shareLink}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors"
        style={{ borderColor: tokens.border, color: tokens.textSecondary, backgroundColor: tokens.bgSurface }}
        aria-label="Copiar link de compartilhamento"
      >
        {copied ? (
          <>
            <Check className="h-3 w-3" style={{ color: tokens.brand }} aria-hidden="true" />
            Copiado
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" aria-hidden="true" />
            Copiar
          </>
        )}
      </button>
      <a
        href={shareLink}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors"
        style={{ borderColor: tokens.border, color: tokens.textSecondary, backgroundColor: tokens.bgSurface }}
        aria-label="Abrir link de compartilhamento em nova aba"
      >
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
        Abrir
      </a>
    </div>
  )
}

function WhatsAppBusinessPanel({
  tokens,
  projectId,
  shareToken: initialShareToken,
  onConnected,
}: {
  tokens: AppTokens
  projectId: string
  shareToken: string | null
  onConnected: () => void | Promise<void>
}) {
  const [provisioning, setProvisioning] = React.useState(false)
  const [generating, setGenerating] = React.useState(false)
  const [shareToken, setShareToken] = React.useState<string | null>(initialShareToken)
  const [qrCode, setQrCode] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const shareLink = React.useMemo(() => {
    if (!shareToken) return null
    if (typeof window === "undefined") return `/compartilhar/${shareToken}`
    return `${window.location.origin}/compartilhar/${shareToken}`
  }, [shareToken])

  // Provisiona a instância UAZAPI (cria instância + webhook + Connection + QR e
  // anexa ao agente) — é o "Conectar" de ponta a ponta do WhatsApp Business.
  const handleProvision = React.useCallback(async () => {
    if (provisioning) return
    setProvisioning(true)
    setError(null)
    try {
      const response = await fetch("/api/v1/builder/channel/provision-whatsapp", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      })
      if (!response.ok) {
        throw new Error(
          await readShareError(response, `Erro ${response.status} ao conectar WhatsApp Business`),
        )
      }
      const json = (await response.json()) as {
        data?: { shareToken?: string | null; qrCode?: string | null }
      }
      setShareToken(json.data?.shareToken ?? null)
      setQrCode(json.data?.qrCode ?? null)
      await onConnected()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao conectar WhatsApp Business")
    } finally {
      setProvisioning(false)
    }
  }, [provisioning, projectId, onConnected])

  const handleGenerate = React.useCallback(async () => {
    if (!shareToken || generating) return
    setGenerating(true)
    setError(null)
    try {
      const response = await fetch(`/api/v1/instances/share/${shareToken}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!response.ok) {
        throw new Error(
          await readShareError(response, `Erro ${response.status} ao gerar novo QR`),
        )
      }
      const json = (await response.json()) as { data?: { qrCode?: string | null } }
      setQrCode(json.data?.qrCode ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar novo QR")
    } finally {
      setGenerating(false)
    }
  }, [generating, shareToken])

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] leading-relaxed" style={{ color: tokens.textSecondary }}>
        Conecte um número do WhatsApp via QR Code (UAZAPI). Gere o link para você
        ou seu cliente escanear e parear o número.
      </p>

      {!shareToken ? (
        <Button
          type="button"
          size="sm"
          className="h-9 w-fit gap-1.5 rounded-lg text-[12px] font-medium"
          style={{ backgroundColor: tokens.brand, color: tokens.textInverse }}
          onClick={handleProvision}
          disabled={provisioning}
        >
          {provisioning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {provisioning ? "Conectando..." : "Conectar WhatsApp Business"}
        </Button>
      ) : (
        <>
          {shareLink && <ShareLinkRow tokens={tokens} shareLink={shareLink} />}

          {qrCode && (
            <div className="flex flex-col items-center gap-2 rounded-lg border p-3" style={{ borderColor: tokens.divider }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrCode}
                alt="QR Code para parear o WhatsApp"
                width={200}
                height={200}
                className="rounded-md bg-white p-2"
              />
              <p className="text-[11px]" style={{ color: tokens.textTertiary }}>
                Escaneie em WhatsApp {"›"} Dispositivos conectados {"›"} Conectar dispositivo.
              </p>
            </div>
          )}

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-fit gap-1.5 rounded-lg text-[11px]"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <QrCode className="h-3 w-3" aria-hidden="true" />
            )}
            {generating ? "Gerando..." : "Gerar novo QR"}
          </Button>
        </>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md border px-2.5 py-1.5 text-[11px]"
          style={{
            borderColor: tokens.danger,
            backgroundColor: tokens.dangerSubtle,
            color: tokens.dangerText,
          }}
        >
          {error}
        </p>
      )}
    </div>
  )
}

export interface ChannelSelectorCardProps {
  tokens: AppTokens
  projectId: string
  /**
   * Existing share token of the project's WhatsApp instance, when one was
   * provisioned. Required to build the /compartilhar/<token> link and to call
   * POST /api/v1/instances/share/[token]. Pass null when no instance exists yet.
   */
  shareToken?: string | null
  /** Which option is open initially. Defaults to "whatsapp_business". */
  defaultChoice?: ChannelChoice
  /** Fires after a successful credential save so the wizard can refetch state. */
  onChannelConnected: () => void | Promise<void>
}

export function ChannelSelectorCard({
  tokens,
  projectId,
  shareToken = null,
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
            <WhatsAppBusinessPanel
              tokens={tokens}
              projectId={projectId}
              shareToken={shareToken}
              onConnected={onChannelConnected}
            />
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
