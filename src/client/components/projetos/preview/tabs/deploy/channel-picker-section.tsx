"use client"

/**
 * ChannelPickerSection — seleciona ou cria um canal WhatsApp para o projeto.
 *
 * Reutiliza exatamente os mesmos hooks e modais da página /canais:
 *   - useInstances()         → lista de canais da org
 *   - CreateInstanceModal    → criar novo canal
 *   - ConnectionModal        → conectar via QR
 *
 * A mutação attachChannel (POST /projects/:id/channel) vincula o canal
 * escolhido ao agente via AgentDeployment, ativando hasWhatsAppConnection.
 *
 * onChannelAttached é chamado após attach bem-sucedido para que o pai
 * (DeployTab) possa forçar um reload do projeto e atualizar o checklist.
 */

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Plus, QrCode, Wifi, WifiOff, CheckCircle2, ChevronRight, Loader2,
  Phone, Unplug,
} from "lucide-react"
import { api } from "@/igniter.client"
import { useInstances } from "@/client/hooks/useInstance"
import { INSTANCE_STATUS_COLOR } from "@/client/lib/instance-status"
import { CreateInstanceModal } from "@/client/components/whatsapp/create-instance-modal"
import { ConnectionModal } from "@/client/components/whatsapp/connection-modal"
import type { ModalInstance } from "@/types/instance"
import type { Tokens } from "./deploy-status-card"

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChannelItem {
  id: string
  name: string
  phoneNumber: string | null
  status: string
  brokerType: string
  provider: string
  uazapiToken?: string | null
  brokerId?: string | null
  createdAt: string
  updatedAt?: string
}

interface ProjectChannel {
  id: string
  name: string
  phoneNumber: string | null
  status: string
}

interface ChannelPickerSectionProps {
  tokens: Tokens
  projectId: string
  projectChannel: ProjectChannel | null
  channelLoading: boolean
  onChannelAttached: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────


function isUazapi(ch: ChannelItem): boolean {
  return !ch.provider || ch.provider === "WHATSAPP_WEB" || ch.brokerType === "UAZAPI" || (!ch.brokerType && !ch.provider)
}

function resolveBrokerLabel(ch: ChannelItem): string {
  if (ch.provider === "INSTAGRAM_META" || ch.brokerType === "INSTAGRAM") return "Instagram"
  if (ch.provider === "WHATSAPP_CLOUD_API" || ch.provider === "WHATSAPP_BUSINESS_API" || ch.brokerType === "CLOUDAPI") return "Cloud API"
  return "WhatsApp Business"
}

function isConnected(status: string): boolean {
  return status === "CONNECTED" || status === "connected"
}

function toModalInstance(ch: ChannelItem): ModalInstance {
  return {
    id: ch.id,
    name: ch.name,
    phoneNumber: ch.phoneNumber,
    status: ch.status,
    brokerType: ch.brokerType || ch.provider || "UAZAPI",
    createdAt: ch.createdAt,
    updatedAt: ch.updatedAt,
    uazapiToken: ch.uazapiToken,
    brokerId: ch.brokerId,
  }
}

// ─── ChannelRow ───────────────────────────────────────────────────────────────

function ChannelRow({
  ch,
  tokens,
  isActive,
  attaching,
  onAttach,
  onOpenQr,
}: {
  ch: ChannelItem
  tokens: Tokens
  isActive: boolean
  attaching: boolean
  onAttach: () => void
  onOpenQr: () => void
}) {
  const dot = INSTANCE_STATUS_COLOR[ch.status] ?? INSTANCE_STATUS_COLOR.CREATED
  const connected = isConnected(ch.status)
  const isConnecting = ch.status === "CONNECTING" || ch.status === "connecting"
  const canQr = isUazapi(ch) && !connected && !isConnecting

  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
      style={{
        backgroundColor: isActive ? `${tokens.brand}12` : "transparent",
        border: isActive ? `1px solid ${tokens.brand}30` : `1px solid transparent`,
      }}
    >
      {/* Status dot */}
      <span
        style={{
          display: "inline-block",
          width: 7,
          height: 7,
          borderRadius: "50%",
          backgroundColor: dot,
          flexShrink: 0,
        }}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div
            className="text-[13px] font-medium leading-tight truncate"
            style={{ color: tokens.textPrimary }}
          >
            {ch.name}
          </div>
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
            style={{
              backgroundColor: tokens.bgElevated ?? tokens.bgSurface,
              color: tokens.textTertiary,
              border: `1px solid ${tokens.divider}`,
            }}
          >
            {resolveBrokerLabel(ch)}
          </span>
        </div>
        {ch.phoneNumber && (
          <div
            className="text-[11px] font-mono mt-0.5"
            style={{ color: tokens.textTertiary }}
          >
            {ch.phoneNumber}
          </div>
        )}
      </div>

      {/* Active badge */}
      {isActive && (
        <div className="flex items-center gap-1 shrink-0">
          <CheckCircle2 className="h-3.5 w-3.5" style={{ color: tokens.brand }} />
          <span className="text-[11px] font-semibold" style={{ color: tokens.brand }}>
            Ativo
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {canQr && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenQr() }}
            aria-label={`Conectar ${ch.name} via QR Code`}
            title="Conectar via QR"
            className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors hover:opacity-80"
            style={{
              borderColor: tokens.divider,
              color: tokens.textSecondary,
              backgroundColor: tokens.bgSurface,
            }}
          >
            <QrCode className="h-3 w-3" />
            QR
          </button>
        )}

        {!isActive && (
          <button
            type="button"
            onClick={onAttach}
            disabled={attaching}
            aria-label={`Usar ${ch.name} como canal deste projeto`}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors hover:opacity-80 disabled:opacity-40"
            style={{
              backgroundColor: tokens.brandSubtle,
              color: tokens.brandText,
              border: `1px solid ${tokens.brandBorder}`,
            }}
          >
            {attaching ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Usar
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ChannelPickerSection({
  tokens,
  projectId,
  projectChannel,
  channelLoading,
  onChannelAttached,
}: ChannelPickerSectionProps) {
  const queryClient = useQueryClient()
  const { data: instancesData, isLoading: instancesLoading, refetch } = useInstances({ enablePolling: false })
  const channels: ChannelItem[] = (instancesData?.data ?? []) as ChannelItem[]

  const [attachingId, setAttachingId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [qrModal, setQrModal] = useState<{ open: boolean; instance: ModalInstance | null }>({ open: false, instance: null })

  async function handleAttach(connectionId: string) {
    setAttachingId(connectionId)
    try {
      await (api.builder.attachChannel as any).mutate({
        params: { id: projectId },
        body: { connectionId },
      })
      toast.success("Canal vinculado ao projeto")
      void refetch()
      queryClient.invalidateQueries({ queryKey: ["project-channel", projectId] })
      onChannelAttached()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao vincular canal"
      toast.error(msg)
    } finally {
      setAttachingId(null)
    }
  }

  async function handleDetach() {
    try {
      await (api.builder.detachChannel as any).mutate({
        params: { id: projectId },
        body: {},
      })
      toast.success("Canal desvinculado")
      queryClient.invalidateQueries({ queryKey: ["project-channel", projectId] })
      onChannelAttached()
    } catch {
      toast.error("Erro ao desvincular canal")
    }
  }

  const isLoading = instancesLoading || channelLoading

  return (
    <div
      className="rounded-lg border"
      style={{ borderColor: tokens.divider, backgroundColor: tokens.bgSurface }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: tokens.divider }}
      >
        <div className="flex items-center gap-2">
          <Phone className="h-3.5 w-3.5" style={{ color: tokens.textTertiary }} />
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: tokens.textTertiary }}
          >
            Canal WhatsApp
          </span>
        </div>

        <div className="flex items-center gap-2">
          {projectChannel && (
            <button
              type="button"
              onClick={handleDetach}
              title="Desvincular canal"
              className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors hover:opacity-70"
              style={{
                borderColor: tokens.divider,
                color: tokens.textTertiary,
                backgroundColor: "transparent",
              }}
            >
              <Unplug className="h-3 w-3" />
              Desvincular
            </button>
          )}
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors hover:opacity-80"
            style={{
              borderColor: tokens.brandBorder,
              color: tokens.brandText,
              backgroundColor: tokens.brandSubtle,
            }}
          >
            <Plus className="h-3 w-3" />
            Novo canal
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-2">
        {isLoading ? (
          <div
            className="flex items-center justify-center gap-2 py-6 text-[13px]"
            style={{ color: tokens.textTertiary }}
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando canais…
          </div>
        ) : channels.length === 0 ? (
          <div className="py-6 text-center">
            <WifiOff className="mx-auto mb-2 h-5 w-5" style={{ color: tokens.textTertiary }} />
            <p className="text-[13px]" style={{ color: tokens.textSecondary }}>
              Nenhum canal encontrado.
            </p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-3 text-[12px] font-medium underline underline-offset-2"
              style={{ color: tokens.brand }}
            >
              Criar primeiro canal →
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {channels.map((ch) => (
              <ChannelRow
                key={ch.id}
                ch={ch}
                tokens={tokens}
                isActive={projectChannel?.id === ch.id}
                attaching={attachingId === ch.id}
                onAttach={() => void handleAttach(ch.id)}
                onOpenQr={() => setQrModal({ open: true, instance: toModalInstance(ch) })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Connected channel summary */}
      {projectChannel && (
        <div
          className="flex items-center gap-2 border-t px-4 py-2.5"
          style={{ borderColor: tokens.divider }}
        >
          <Wifi className="h-3.5 w-3.5 shrink-0" style={{ color: "#22c55e" }} />
          <span className="text-[12px] font-medium" style={{ color: "#22c55e" }}>
            {projectChannel.name}
            {projectChannel.phoneNumber && (
              <span className="font-normal" style={{ color: tokens.textTertiary }}>
                {" "}· {projectChannel.phoneNumber}
              </span>
            )}
          </span>
        </div>
      )}

      {/* Modals */}
      <CreateInstanceModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => void refetch()}
      />

      <ConnectionModal
        instance={qrModal.instance}
        isOpen={qrModal.open}
        onClose={() => {
          setQrModal({ open: false, instance: null })
          void refetch()
        }}
      />
    </div>
  )
}
