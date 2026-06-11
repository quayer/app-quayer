"use client"

/**
 * QrPanel — bloco compartilhado de QR Code + link de compartilhamento +
 * countdown de expiração + "Gerar novo QR".
 *
 * Usado pelo WhatsAppBusinessPanel (primeira conexão, channel-selector-card) e
 * pelo PendingChannel (canal vinculado aguardando scan). O refresh chama a rota
 * idempotente de provision (autenticada, org-scoped), que renova o TTL e
 * regenera o QR mesmo após o shareToken expirar.
 */

import { Loader2, QrCode } from "lucide-react"
import { Button } from "@/client/components/ui/button"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { ShareLinkRow } from "./share-link-row"
import { formatCountdown, useQrCountdown } from "./use-whatsapp-provision"

export interface QrPanelProps {
  tokens: AppTokens
  shareLink: string | null
  qrCode: string | null
  /** ISO date de expiração do shareToken/QR — alimenta o countdown. */
  expiresAt: string | null
  refreshing: boolean
  error: string | null
  onRefreshQr: () => void
}

export function QrPanel({
  tokens,
  shareLink,
  qrCode,
  expiresAt,
  refreshing,
  error,
  onRefreshQr,
}: QrPanelProps) {
  const remaining = useQrCountdown(expiresAt)
  const expired = remaining !== null && remaining <= 0

  return (
    <div className="flex flex-col gap-3">
      {shareLink && <ShareLinkRow tokens={tokens} shareLink={shareLink} />}

      {qrCode && !expired && (
        <div
          className="flex flex-col items-center gap-2 rounded-lg border p-3"
          style={{ borderColor: tokens.divider }}
        >
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
          {remaining !== null && (
            <p
              className="text-[11px] font-medium tabular-nums"
              style={{
                color: remaining <= 60 ? tokens.warningText : tokens.textTertiary,
              }}
              aria-live="polite"
            >
              QR expira em {formatCountdown(remaining)}
            </p>
          )}
        </div>
      )}

      {qrCode && expired && (
        <p
          role="status"
          className="rounded-md border px-2.5 py-1.5 text-[11px]"
          style={{
            borderColor: tokens.warning,
            backgroundColor: tokens.warningSubtle,
            color: tokens.warningText,
          }}
        >
          O QR Code expirou. Gere um novo para continuar a conexão.
        </p>
      )}

      {!qrCode && (
        <p className="text-[11px]" style={{ color: tokens.textTertiary }}>
          Gere um QR Code para parear o número do WhatsApp.
        </p>
      )}

      <Button
        type="button"
        size="sm"
        variant={expired || !qrCode ? "default" : "outline"}
        className="h-8 w-fit gap-1.5 rounded-lg text-[11px]"
        onClick={onRefreshQr}
        disabled={refreshing}
      >
        {refreshing ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        ) : (
          <QrCode className="h-3 w-3" aria-hidden="true" />
        )}
        {refreshing ? "Gerando..." : "Gerar novo QR"}
      </Button>

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
