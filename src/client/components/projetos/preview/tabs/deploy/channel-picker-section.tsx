"use client"

/**
 * ChannelPickerSection — step 1 of the deploy wizard.
 *
 * Renders the WhatsApp channel attached to the project (when present)
 * and lets the user attach an existing organization channel.
 */

import * as React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { CheckCircle2, ExternalLink, MessageSquare, Phone, Plug, Unplug } from "lucide-react"
import { Badge } from "@/client/components/ui/badge"
import { Button } from "@/client/components/ui/button"
import { Card, CardContent } from "@/client/components/ui/card"
import { Skeleton } from "@/client/components/ui/skeleton"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { ChannelSelectorCard } from "./channel-selector-card"

export interface ProjectChannel {
  id: string
  name: string
  phoneNumber: string | null
  status: string
  provider?: string
  profileName?: string | null
}

interface ChannelPickerSectionProps {
  tokens: AppTokens
  projectId: string
  projectChannel: ProjectChannel | null
  channelLoading: boolean
  onChannelAttached: () => void | Promise<void>
}

const CONNECTED = new Set(["CONNECTED", "ACTIVE", "READY"])

interface ChannelOptionsResponse {
  channels: ProjectChannel[]
}

function unwrapChannelOptions(value: unknown): ChannelOptionsResponse {
  if (
    value &&
    typeof value === "object" &&
    "channels" in value &&
    Array.isArray((value as { channels?: unknown }).channels)
  ) {
    return value as ChannelOptionsResponse
  }

  if (value && typeof value === "object" && "data" in value) {
    return unwrapChannelOptions((value as { data: unknown }).data)
  }

  return { channels: [] }
}

function statusPalette(status: string) {
  const s = status.toUpperCase()
  if (CONNECTED.has(s)) {
    return { fg: "var(--q-success)", bg: "var(--q-success-subtle)", label: "Conectado" }
  }
  if (s === "CONNECTING" || s === "QR_PENDING" || s === "PENDING") {
    return { fg: "var(--q-warning)", bg: "var(--q-warning-subtle)", label: "Conectando" }
  }
  if (s === "FAILED" || s === "ERROR" || s === "BANNED") {
    return { fg: "var(--q-danger)", bg: "var(--q-danger-subtle)", label: "Falha" }
  }
  return { fg: "var(--q-warning)", bg: "var(--q-warning-subtle)", label: "Desconectado" }
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
            {channel.phoneNumber ?? "Número ainda não detectado"}
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
        className="inline-flex min-h-10 items-center justify-center gap-1.5 self-start rounded-md border px-3 text-[12px] font-medium transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
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
          Conecte uma instância do WhatsApp para que o agente possa receber e responder mensagens.
        </p>
      </div>
      <p className="text-[11px]" style={{ color: tokens.textTertiary }}>
        Escolha um canal existente abaixo ou conecte um novo em Canais.
      </p>
    </div>
  )
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const text = await response.text().catch(() => "")
  if (!text) return fallback

  try {
    const json = JSON.parse(text) as {
      error?: unknown
      message?: unknown
      data?: { error?: unknown; message?: unknown }
    }
    const candidate =
      json.message ??
      json.error ??
      json.data?.message ??
      json.data?.error
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate
    }
  } catch {
    // Response is plain text/HTML; trim it below.
  }

  return text.trim().slice(0, 240) || fallback
}

function ChannelOption({
  tokens,
  channel,
  attaching,
  onAttach,
}: {
  tokens: AppTokens
  channel: ProjectChannel
  attaching: boolean
  onAttach: () => void
}) {
  const palette = statusPalette(channel.status)
  const isConnected = CONNECTED.has(channel.status.toUpperCase())

  return (
    <article
      className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      style={{ borderColor: tokens.divider }}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[13px] font-semibold" style={{ color: tokens.textPrimary }}>
            {channel.name}
          </span>
          <Badge
            className="border-transparent"
            style={{ backgroundColor: palette.bg, color: palette.fg }}
          >
            {palette.label}
          </Badge>
          {channel.provider && (
            <Badge variant="outline">{channel.provider.replace(/_/g, " ")}</Badge>
          )}
        </div>
        <p className="flex items-center gap-1 text-[12px]" style={{ color: tokens.textSecondary }}>
          <Phone className="h-3 w-3" aria-hidden="true" />
          {channel.phoneNumber ?? channel.profileName ?? "Número ainda não detectado"}
        </p>
      </div>

      <Button
        type="button"
        size="sm"
        variant={isConnected ? "default" : "outline"}
        className="min-h-10"
        disabled={attaching}
        onClick={onAttach}
      >
        {attaching ? "Vinculando..." : "Usar este canal"}
      </Button>
    </article>
  )
}

export function ChannelPickerSection({
  tokens,
  projectId,
  projectChannel,
  channelLoading,
  onChannelAttached,
}: ChannelPickerSectionProps) {
  const optionsQuery = useQuery({
    queryKey: ["project-channel-options", projectId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/builder/projects/${projectId}/channel/options`,
        { credentials: "same-origin" },
      )

      if (!response.ok) {
        throw new Error(`Erro ${response.status} ao carregar canais`)
      }

      return unwrapChannelOptions(await response.json())
    },
  })
  const [detaching, setDetaching] = React.useState(false)
  const [attachingId, setAttachingId] = React.useState<string | null>(null)

  const channels = optionsQuery.data?.channels ?? []

  const handleDetach = React.useCallback(async () => {
    if (detaching) return
    setDetaching(true)
    try {
      const response = await fetch(`/api/v1/builder/projects/${projectId}/channel`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        throw new Error(
          await readErrorMessage(response, `Erro ${response.status} ao desvincular canal`),
        )
      }

      toast.success("Canal desvinculado do projeto.")
      await onChannelAttached()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao desvincular canal"
      toast.error(msg)
    } finally {
      setDetaching(false)
    }
  }, [projectId, onChannelAttached, detaching])

  const handleAttach = React.useCallback(
    async (connectionId: string) => {
      if (attachingId) return
      setAttachingId(connectionId)
      try {
        const response = await fetch(`/api/v1/builder/projects/${projectId}/channel`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionId }),
        })

        if (!response.ok) {
          throw new Error(
            await readErrorMessage(response, `Erro ${response.status} ao vincular canal`),
          )
        }

        toast.success("Canal vinculado ao projeto.")
        await onChannelAttached()
        await optionsQuery.refetch()
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao vincular canal"
        toast.error(msg)
      } finally {
        setAttachingId(null)
      }
    },
    [attachingId, onChannelAttached, optionsQuery, projectId],
  )

  const accent = projectChannel !== null
  return (
    <Card
      className="border p-0 shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: accent ? tokens.success : tokens.divider,
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
          <>
            <EmptyChannel tokens={tokens} />

            {optionsQuery.isLoading ? (
              <div className="space-y-2 border-t px-4 py-3" style={{ borderColor: tokens.divider }}>
                <Skeleton className="h-12 w-full rounded-md" />
                <Skeleton className="h-12 w-full rounded-md" />
              </div>
            ) : channels.length > 0 ? (
              <div>
                <div
                  className="border-t px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
                  style={{ borderColor: tokens.divider, color: tokens.textTertiary }}
                >
                  Canais disponíveis
                </div>
                {channels.map((channel) => (
                  <ChannelOption
                    key={channel.id}
                    tokens={tokens}
                    channel={channel}
                    attaching={attachingId === channel.id}
                    onAttach={() => handleAttach(channel.id)}
                  />
                ))}
              </div>
            ) : (
              <div
                className="flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                style={{ borderColor: tokens.divider }}
              >
                <p className="text-[12px]" style={{ color: tokens.textSecondary }}>
                  Nenhum canal WhatsApp existe nesta organização.
                </p>
                <Button asChild size="sm" variant="outline" className="gap-2">
                  <Link href="/canais">
                    Conectar novo canal
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            )}

            {/* Connect a brand-new channel inline: WhatsApp Business (QR/share
                link), WhatsApp Cloud API or Instagram (manual credentials). */}
            <div className="border-t px-4 py-4" style={{ borderColor: tokens.divider }}>
              <ChannelSelectorCard
                tokens={tokens}
                projectId={projectId}
                shareToken={null}
                onChannelConnected={onChannelAttached}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
