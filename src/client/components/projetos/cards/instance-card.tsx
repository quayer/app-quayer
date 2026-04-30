"use client"

import * as React from "react"
import { Copy, Check, ExternalLink, QrCode, Smartphone } from "lucide-react"

import { Button } from "@/client/components/ui/button"
import { Card, CardContent } from "@/client/components/ui/card"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

type InstanceStatus = "connected" | "connecting" | "disconnected" | "error"

interface InstanceCardProps {
  instanceId: string
  name: string
  status: InstanceStatus
  phoneNumber?: string | null
  shareLink?: string
  qrCodeBase64?: string
  tokens: AppTokens
}

const STATUS_MAP: Record<
  InstanceStatus,
  { label: string; color: string; bgColor: string }
> = {
  connected: {
    label: "Conectado",
    color: "#22c55e",
    bgColor: "rgba(34,197,94,0.12)",
  },
  connecting: {
    label: "Conectando",
    color: "#eab308",
    bgColor: "rgba(234,179,8,0.12)",
  },
  disconnected: {
    label: "Desconectado",
    color: "#ef4444",
    bgColor: "rgba(239,68,68,0.12)",
  },
  error: {
    label: "Erro",
    color: "#ef4444",
    bgColor: "rgba(239,68,68,0.12)",
  },
}

/**
 * InstanceCard — shows a WhatsApp instance with status, QR area, and share link.
 */
export function InstanceCard({
  name,
  status,
  phoneNumber,
  shareLink,
  qrCodeBase64,
  tokens,
}: InstanceCardProps) {
  const [copied, setCopied] = React.useState(false)
  const statusInfo = STATUS_MAP[status] ?? STATUS_MAP.disconnected

  const handleCopy = React.useCallback(() => {
    if (!shareLink) return
    void navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [shareLink])

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
        {/* Header with name + status */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: tokens.brandSubtle,
              color: tokens.brand,
            }}
          >
            <Smartphone className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-[14px] font-semibold"
              style={{ color: tokens.textPrimary }}
            >
              {name}
            </p>
            {phoneNumber && (
              <p
                className="font-mono text-[11px]"
                style={{ color: tokens.textTertiary }}
              >
                {phoneNumber}
              </p>
            )}
          </div>
          <div
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{ backgroundColor: statusInfo.bgColor }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: statusInfo.color }}
            />
            <span
              className="text-[11px] font-medium"
              style={{ color: statusInfo.color }}
            >
              {statusInfo.label}
            </span>
          </div>
        </div>

        {/* QR Code area (shown when disconnected or connecting) */}
        {status !== "connected" && (
          <div
            className="mx-4 mb-3 flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-5"
            style={{ borderColor: tokens.border }}
          >
            {qrCodeBase64 ? (
              <img
                src={
                  qrCodeBase64.startsWith("data:")
                    ? qrCodeBase64
                    : `data:image/png;base64,${qrCodeBase64}`
                }
                alt="QR Code para parear WhatsApp"
                className="h-36 w-36 rounded-lg"
              />
            ) : (
              <div
                className="flex h-24 w-24 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: tokens.hoverBg,
                  color: tokens.textTertiary,
                }}
              >
                <QrCode className="h-10 w-10" />
              </div>
            )}
            <p
              className="text-center text-[12px]"
              style={{ color: tokens.textTertiary }}
            >
              {qrCodeBase64
                ? "Escaneie o QR Code com o WhatsApp do celular"
                : "QR Code sera gerado em instantes..."}
            </p>
          </div>
        )}

        {/* Share link */}
        {shareLink && (
          <div
            className="flex items-center gap-2 border-t px-4 py-2.5"
            style={{ borderColor: tokens.divider }}
          >
            <ExternalLink
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: tokens.textTertiary }}
            />
            <span
              className="min-w-0 flex-1 truncate font-mono text-[11px]"
              style={{ color: tokens.textSecondary }}
            >
              {shareLink}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 shrink-0 p-0"
              onClick={handleCopy}
              aria-label="Copiar link"
            >
              {copied ? (
                <Check
                  className="h-3.5 w-3.5"
                  style={{ color: "#22c55e" }}
                />
              ) : (
                <Copy
                  className="h-3.5 w-3.5"
                  style={{ color: tokens.textTertiary }}
                />
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * InstanceListCard — rendered for list_whatsapp_instances results.
 */
export function InstanceListCard({
  instances,
  tokens,
}: {
  instances: Array<{
    id: string
    name: string
    phoneNumber?: string | null
    status: string
  }>
  tokens: AppTokens
}) {
  if (instances.length === 0) {
    return (
      <Card
        className="border shadow-none"
        style={{
          backgroundColor: tokens.bgSurface,
          borderColor: tokens.border,
          borderRadius: "16px",
        }}
      >
        <CardContent className="px-4 py-5 text-center">
          <Smartphone
            className="mx-auto mb-2 h-8 w-8"
            style={{ color: tokens.textTertiary }}
          />
          <p
            className="text-[13px]"
            style={{ color: tokens.textSecondary }}
          >
            Nenhuma instancia WhatsApp encontrada
          </p>
          <p
            className="mt-0.5 text-[11px]"
            style={{ color: tokens.textTertiary }}
          >
            Crie uma nova instancia para conectar seu WhatsApp
          </p>
        </CardContent>
      </Card>
    )
  }

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
        <div
          className="px-4 py-2.5"
          style={{ backgroundColor: tokens.hoverBg }}
        >
          <p
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: tokens.textTertiary }}
          >
            Instancias WhatsApp ({instances.length})
          </p>
        </div>
        <div className="divide-y" style={{ borderColor: tokens.divider }}>
          {instances.map((inst) => {
            const s =
              STATUS_MAP[inst.status as InstanceStatus] ??
              STATUS_MAP.disconnected
            return (
              <div
                key={inst.id}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <Smartphone
                  className="h-4 w-4 shrink-0"
                  style={{ color: tokens.textTertiary }}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-[13px] font-medium"
                    style={{ color: tokens.textPrimary }}
                  >
                    {inst.name}
                  </p>
                  {inst.phoneNumber && (
                    <p
                      className="font-mono text-[11px]"
                      style={{ color: tokens.textTertiary }}
                    >
                      {inst.phoneNumber}
                    </p>
                  )}
                </div>
                <div
                  className="flex items-center gap-1.5 rounded-full px-2 py-0.5"
                  style={{ backgroundColor: s.bgColor }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span
                    className="text-[10px] font-medium"
                    style={{ color: s.color }}
                  >
                    {s.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
