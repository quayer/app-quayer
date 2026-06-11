"use client"

/**
 * PendingChannel — view do canal vinculado ao projeto que ainda NÃO conectou
 * (aguardando scan do QR / validação de credenciais).
 *
 * Antes, qualquer Connection vinculada — mesmo DISCONNECTED — caía na view
 * ConnectedChannel, desmontando o QR ~200ms depois de aparecer e sem oferecer
 * caminho de volta. Esta view mantém o QR visível com countdown/refresh
 * enquanto o poll de status do deploy-tab continua rodando; ao conectar, o
 * picker troca para ConnectedChannel ("Conectado").
 */

import { Loader2, Unplug } from "lucide-react"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { QrPanel } from "./qr-panel"
import type { ProjectChannel } from "./channel-picker-section"
import type { WhatsAppProvisionState } from "./use-whatsapp-provision"

interface PendingChannelProps {
  tokens: AppTokens
  channel: ProjectChannel
  whatsapp: WhatsAppProvisionState
  detaching: boolean
  onDetach: () => void
}

export function PendingChannel({
  tokens,
  channel,
  whatsapp,
  detaching,
  onDetach,
}: PendingChannelProps) {
  // QR/share só fazem sentido no fluxo UAZAPI; canais Cloud/Instagram pendentes
  // aguardam a validação do webhook do lado da Meta.
  const isQrProvider =
    channel.provider === undefined || channel.provider === "WHATSAPP_WEB"

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: tokens.warningSubtle, color: tokens.warning }}
          aria-hidden="true"
        >
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span
            className="truncate text-[14px] font-semibold"
            style={{ color: tokens.textPrimary }}
          >
            {channel.name}
          </span>
          <span className="text-[12px]" style={{ color: tokens.textSecondary }}>
            {isQrProvider
              ? "Aguardando o scan do QR Code para conectar."
              : "Aguardando validação das credenciais do canal."}
          </span>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
          style={{ backgroundColor: tokens.warningSubtle, color: tokens.warningText }}
        >
          Aguardando conexão
        </span>
      </div>

      {isQrProvider && (
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

      <p className="text-[11px]" style={{ color: tokens.textTertiary }}>
        Verificamos a conexão automaticamente — assim que o número parear, o
        status muda para Conectado.
      </p>

      <button
        type="button"
        onClick={onDetach}
        disabled={detaching}
        className="inline-flex min-h-10 items-center justify-center gap-1.5 self-start rounded-md border px-3 text-[12px] font-medium transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          borderColor: tokens.divider,
          color: tokens.textSecondary,
          backgroundColor: tokens.bgElevated,
        }}
      >
        <Unplug className="h-3 w-3" />
        {detaching ? "Desvinculando..." : "Desvincular canal"}
      </button>
    </div>
  )
}
