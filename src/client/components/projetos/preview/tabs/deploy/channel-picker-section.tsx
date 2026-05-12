"use client"

/**
 * ChannelPickerSection — step 1 of the deploy wizard.
 *
 * Renders the WhatsApp channel attached to the project (when present)
 * and a detach action. When no channel is attached we show an empty
 * state with an "Em breve" CTA — there's no client-exposed endpoint
 * yet to list/create connections directly from the builder UI.
 */

import * as React from "react"
import { toast } from "sonner"
import { CheckCircle2, MessageSquare, Phone, Plug, Unplug } from "lucide-react"
import { api } from "@/igniter.client"
import { Card, CardContent } from "@/client/components/ui/card"
import { Skeleton } from "@/client/components/ui/skeleton"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

export interface ProjectChannel {
  id: string
  name: string
  phoneNumber: string | null
  status: string
}

interface ChannelPickerSectionProps {
  tokens: AppTokens
  projectId: string
  projectChannel: ProjectChannel | null
  channelLoading: boolean
  onChannelAttached: () => void
}

const CONNECTED = new Set(["CONNECTED", "ACTIVE", "READY"])

function statusPalette(status: string) {
  if (CONNECTED.has(status.toUpperCase())) {
    return { fg: "#22c55e", bg: "rgba(34,197,94,0.12)", label: "Conectado" }
  }
  return { fg: "#f59e0b", bg: "rgba(245,158,11,0.12)", label: "Desconectado" }
}

function ConnectedChannel({
  tokens,
  channel,
  detaching,
  onDetach,
}: {
  tokens: AppTokens
  channel: ProjectChannel
  detaching: boolean
  onDetach: () => void
}) {
  const palette = statusPalette(channel.status)
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: palette.bg, color: palette.fg }}
        >
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[14px] font-semibold" style={{ color: tokens.textPrimary }}>
            {channel.name}
          </span>
          <span className="flex items-center gap-1 text-[12px]" style={{ color: tokens.textSecondary }}>
            <Phone className="h-3 w-3" />
            {channel.phoneNumber ?? "Numero ainda nao detectado"}
          </span>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
          style={{ backgroundColor: palette.bg, color: palette.fg }}
        >
          {palette.label}
        </span>
      </div>
      <button
        type="button"
        onClick={onDetach}
        disabled={detaching}
        className="inline-flex h-8 items-center justify-center gap-1.5 self-start rounded-md border px-3 text-[12px] font-medium transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
        style={{ borderColor: tokens.divider, color: tokens.textSecondary, backgroundColor: tokens.bgElevated }}
      >
        <Unplug className="h-3 w-3" />
        {detaching ? "Desvinculando..." : "Desvincular canal"}
      </button>
    </div>
  )
}

function EmptyChannel({ tokens }: { tokens: AppTokens }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ backgroundColor: tokens.brandSubtle, color: tokens.brand }}
      >
        <Plug className="h-5 w-5" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-semibold" style={{ color: tokens.textPrimary }}>
          Nenhum canal vinculado ainda
        </p>
        <p className="max-w-sm text-[12px]" style={{ color: tokens.textSecondary }}>
          Conecte uma instancia do WhatsApp para que o agente possa receber e responder mensagens.
        </p>
      </div>
      <button
        type="button"
        disabled
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border px-3 text-[12px] font-medium opacity-60"
        style={{ borderColor: tokens.divider, color: tokens.textTertiary, backgroundColor: tokens.bgElevated, cursor: "not-allowed" }}
      >
        Conectar WhatsApp
        <span
          className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
          style={{ backgroundColor: tokens.hoverBg, color: tokens.textTertiary }}
        >
          Em breve
        </span>
      </button>
      <p className="text-[11px]" style={{ color: tokens.textTertiary }}>
        Por enquanto, pedir ao Builder no chat para conectar um canal existente.
      </p>
    </div>
  )
}

export function ChannelPickerSection({
  tokens,
  projectId,
  projectChannel,
  channelLoading,
  onChannelAttached,
}: ChannelPickerSectionProps) {
  const detachMutation = api.builder.detachChannel.useMutation()
  const [detaching, setDetaching] = React.useState(false)

  const handleDetach = React.useCallback(async () => {
    if (detaching) return
    setDetaching(true)
    try {
      await detachMutation.mutate({ params: { id: projectId } })
      toast.success("Canal desvinculado do projeto.")
      onChannelAttached()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao desvincular canal"
      toast.error(msg)
    } finally {
      setDetaching(false)
    }
  }, [detachMutation, projectId, onChannelAttached, detaching])

  const accent = projectChannel !== null
  return (
    <Card
      className="border p-0 shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: accent ? "rgba(34,197,94,0.3)" : tokens.divider,
      }}
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
            Canal do WhatsApp
          </span>
          <MessageSquare className="h-3.5 w-3.5" style={{ color: tokens.textTertiary }} />
        </div>

        {channelLoading ? (
          <div className="flex flex-col gap-2 px-4 py-4">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-4 w-1/2 rounded-md" />
          </div>
        ) : projectChannel !== null ? (
          <ConnectedChannel
            tokens={tokens}
            channel={projectChannel}
            detaching={detaching}
            onDetach={handleDetach}
          />
        ) : (
          <EmptyChannel tokens={tokens} />
        )}
      </CardContent>
    </Card>
  )
}
