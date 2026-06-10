"use client"

/**
 * WhatsAppQrCard — inline card for the `create_whatsapp_instance` tool result
 * (QR code + pairing share link). Structural extraction from chat-panel.tsx
 * (no behavior change).
 */

import * as React from "react"
import Image from "next/image"
import { Check, QrCode } from "lucide-react"

import { Button } from "@/client/components/ui/button"
import { useAppTokens } from "@/client/hooks/use-app-tokens"

import { getQrResult } from "./tool-call-helpers"

export function WhatsAppQrCard({
  data,
  tokens,
}: {
  data: NonNullable<ReturnType<typeof getQrResult>>
  tokens: ReturnType<typeof useAppTokens>["tokens"]
}) {
  const [copied, setCopied] = React.useState(false)
  const handleCopyLink = React.useCallback(async () => {
    if (!data.shareLink) return
    try {
      await navigator.clipboard?.writeText(data.shareLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard indisponível — link continua visível/selecionável
    }
  }, [data.shareLink])

  const qrSrc = data.qrCodeBase64
    ? data.qrCodeBase64.startsWith("data:")
      ? data.qrCodeBase64
      : `data:image/png;base64,${data.qrCodeBase64}`
    : null

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
          <QrCode className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold" style={{ color: tokens.textPrimary }}>
            Conectar WhatsApp
          </p>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: tokens.textSecondary }}>
            Escaneie o QR Code no celular ou envie o link de pareamento para quem tem acesso ao número.
          </p>
        </div>
      </div>

      {qrSrc && (
        <div className="mt-4 flex justify-center">
          <Image
            src={qrSrc}
            alt="QR Code para conectar WhatsApp"
            width={176}
            height={176}
            unoptimized
            className="h-44 w-44 rounded-md border bg-white p-2"
            style={{ borderColor: tokens.divider }}
          />
        </div>
      )}

      {data.shareLink && (
        <div
          className="mt-4 rounded-md border px-3 py-2 text-[12px]"
          style={{
            borderColor: tokens.divider,
            backgroundColor: tokens.bgBase,
            color: tokens.textSecondary,
          }}
        >
          <p className="truncate" title={data.shareLink}>{data.shareLink}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2 h-7 gap-1.5 text-[11px]"
            onClick={() => void handleCopyLink()}
            aria-live="polite"
          >
            {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
            {copied ? "Copiado" : "Copiar link"}
          </Button>
        </div>
      )}

      {data.expiresIn && (
        <p className="mt-2 text-[11px]" style={{ color: tokens.textTertiary }}>
          Link expira em aproximadamente {Math.round(data.expiresIn / 60)} minutos.
        </p>
      )}
    </div>
  )
}
