"use client"

import { useState } from "react"
import Link from "next/link"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import { useInstances, useDisconnectInstance, useDeleteInstance } from "@/client/hooks/useInstance"
import { INSTANCE_STATUS_COLOR, INSTANCE_STATUS_LABEL } from "@/client/lib/instance-status"
import { CreateInstanceModal } from "@/client/components/whatsapp/create-instance-modal"
import { ConnectionModal } from "@/client/components/whatsapp/connection-modal"
import { EditCredentialsModal } from "@/client/components/whatsapp/edit-credentials-modal"
import type { ModalInstance } from "@/types/instance"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/client/components/ui/table"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/client/components/ui/alert-dialog"
import { MoreVertical, QrCode, WifiOff, Trash2, Plus, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConnectedProject {
  id: string
  name: string
  status: string
}

interface Channel {
  id: string
  name: string
  phoneNumber: string | null
  status: string
  channel: string
  provider: string
  brokerType: string
  connectedProjects: ConnectedProject[]
  createdAt: string
  updatedAt?: string
  uazapiToken?: string | null
  brokerId?: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────


function resolveBrokerLabel(ch: Channel): string {
  if (ch.channel === "INSTAGRAM" || ch.provider === "INSTAGRAM_META" || ch.brokerType === "INSTAGRAM") return "Instagram"
  if (ch.provider === "WHATSAPP_CLOUD_API" || ch.provider === "WHATSAPP_BUSINESS_API" || ch.brokerType === "CLOUDAPI") return "Cloud API"
  return "WhatsApp Business"
}

function isUazapi(ch: Channel): boolean {
  return !ch.provider || ch.provider === "WHATSAPP_WEB" || ch.brokerType === "UAZAPI" || (!ch.brokerType && !ch.provider)
}

function isApiChannel(ch: Channel): boolean {
  const bt = (ch.brokerType ?? '').toLowerCase()
  const prov = (ch.provider ?? '').toLowerCase()
  return bt === 'cloudapi' || bt === 'instagram' ||
    prov === 'whatsapp_cloud_api' || prov === 'instagram_meta' ||
    prov === 'whatsapp_business_api'
}

function toModalInstance(ch: Channel): ModalInstance {
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

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const color = INSTANCE_STATUS_COLOR[status] ?? INSTANCE_STATUS_COLOR.CREATED
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  )
}

function BrokerBadge({ ch, tokens }: { ch: Channel; tokens: ReturnType<typeof useAppTokens>["tokens"] }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.08em",
        padding: "2px 8px",
        borderRadius: 4,
        border: `1px solid ${tokens.border}`,
        color: tokens.textSecondary,
        backgroundColor: tokens.bgElevated,
        whiteSpace: "nowrap",
      }}
    >
      {resolveBrokerLabel(ch)}
    </span>
  )
}

function ProjectCell({ projects, tokens }: { projects: ConnectedProject[]; tokens: ReturnType<typeof useAppTokens>["tokens"] }) {
  const [expanded, setExpanded] = useState(false)

  if (projects.length === 0) {
    return <span style={{ color: tokens.textTertiary, fontSize: 13 }}>— sem projeto</span>
  }

  if (projects.length === 1) {
    return (
      <Link
        href={`/projetos/${projects[0].id}`}
        style={{ color: tokens.brand, fontSize: 13, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <span style={{ color: tokens.textTertiary }}>→</span>
        {projects[0].name}
      </Link>
    )
  }

  return (
    <div style={{ fontSize: 13 }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: tokens.brand, fontWeight: 600, fontSize: 13 }}
      >
        {projects.length} projetos {expanded ? "▲" : "▼"}
      </button>
      {expanded && (
        <ul style={{ margin: "6px 0 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projetos/${p.id}`}
                style={{ color: tokens.brand, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <span style={{ color: tokens.textTertiary }}>→</span>
                {p.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CanaisPaginaProps {
  initialInstances?: Channel[]
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function CanaisPagina({ initialInstances }: CanaisPaginaProps) {
  const { tokens } = useAppTokens()
  const { data: instancesData, isLoading, isError, refetch } = useInstances()
  // Use server-fetched data while client query loads to avoid flash of empty state.
  const channels: Channel[] = isLoading
    ? (initialInstances ?? [])
    : ((instancesData?.data ?? initialInstances ?? []) as Channel[])

  const disconnectMutation = useDisconnectInstance()
  const deleteMutation = useDeleteInstance()

  const [createOpen, setCreateOpen] = useState(false)
  const [connectionModal, setConnectionModal] = useState<{ open: boolean; instance: ModalInstance | null; forceReconnect?: boolean }>({ open: false, instance: null })
  const [editCredentialsModal, setEditCredentialsModal] = useState<{ open: boolean; id: string; name: string; brokerType: string } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string; name: string } | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  function openConnect(ch: Channel) {
    setConnectionModal({ open: true, instance: toModalInstance(ch) })
  }

  function openReconnect(ch: Channel) {
    setConnectionModal({ open: true, instance: toModalInstance(ch), forceReconnect: true })
  }

  function handleCreated(instance: ModalInstance) {
    // UAZapi channels need QR pairing after creation
    const bt = (instance.brokerType ?? '').toLowerCase()
    if (bt === 'uazapi' || bt === '') {
      setConnectionModal({ open: true, instance })
    }
  }

  async function handleDisconnect(id: string) {
    setActionLoading(id)
    try {
      await disconnectMutation.mutateAsync(id)
      toast.success("Canal desconectado")
      void refetch()
    } catch {
      toast.error("Erro ao desconectar canal")
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDelete(id: string) {
    setActionLoading(id)
    try {
      await deleteMutation.mutateAsync(id)
      toast.success("Canal removido")
      void refetch()
    } catch {
      toast.error("Erro ao remover canal")
    } finally {
      setActionLoading(null)
      setDeleteConfirm(null)
    }
  }

  const isConnected = (status: string) =>
    status === "CONNECTED" || status === "connected"

  return (
    <div
      style={{
        fontFamily: "var(--font-sans), 'DM Sans', system-ui, sans-serif",
        minHeight: "100vh",
        backgroundColor: tokens.bgBase,
        color: tokens.textPrimary,
      }}
    >
      <div className="mx-auto w-full max-w-5xl px-6 py-10 lg:px-10">
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32, gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: tokens.textPrimary }}>
              Canais
            </h1>
            <p style={{ marginTop: 6, fontSize: 14, color: tokens.textSecondary }}>
              Números de WhatsApp e contas do Instagram conectados à sua organização.
            </p>
          </div>

          <button
            onClick={() => setCreateOpen(true)}
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${tokens.brandBorder}`,
              backgroundColor: tokens.brandSubtle,
              color: tokens.brandText,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <Plus size={14} />
            Conectar canal
          </button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div style={{ padding: "48px 0", textAlign: "center", color: tokens.textTertiary, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Loader2 size={16} className="animate-spin" />
            Carregando canais…
          </div>
        )}

        {/* Error */}
        {!isLoading && isError && (
          <div style={{ padding: "24px 20px", borderRadius: 10, border: `1px solid rgba(239,68,68,0.35)`, backgroundColor: "rgba(239,68,68,0.08)", color: "#EF4444", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span>Erro ao carregar canais.</span>
            <button
              onClick={() => void refetch()}
              style={{ background: "none", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 6, padding: "4px 12px", color: "#EF4444", fontSize: 13, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && channels.length === 0 && (
          <div
            style={{
              padding: "64px 24px",
              textAlign: "center",
              borderRadius: 12,
              border: `1px dashed ${tokens.border}`,
              backgroundColor: tokens.bgSurface,
            }}
          >
            <p style={{ fontSize: 15, fontWeight: 600, color: tokens.textPrimary, margin: "0 0 8px 0" }}>
              Nenhum canal conectado ainda.
            </p>
            <p style={{ fontSize: 13, color: tokens.textSecondary, margin: "0 0 24px 0" }}>
              Conecte um número de WhatsApp para começar a publicar seus agentes.
            </p>
            <button
              onClick={() => setCreateOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "9px 20px",
                borderRadius: 8,
                border: `1px solid ${tokens.brandBorder}`,
                backgroundColor: tokens.brandSubtle,
                color: tokens.brandText,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Plus size={14} />
              Conectar primeiro canal
            </button>
          </div>
        )}

        {/* Table */}
        {!isLoading && !isError && channels.length > 0 && (
          <>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: tokens.textTertiary }}>
                {channels.length === 1 ? "1 canal" : `${channels.length} canais`}
              </span>
            </div>

            <div style={{ borderRadius: 12, border: `1px solid ${tokens.border}`, overflow: "hidden", backgroundColor: tokens.bgSurface }}>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent" style={{ borderColor: tokens.divider }}>
                    <TableHead className="h-11 px-4 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: tokens.textTertiary }}>Canal</TableHead>
                    <TableHead className="h-11 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: tokens.textTertiary }}>Tipo</TableHead>
                    <TableHead className="h-11 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: tokens.textTertiary }}>Status</TableHead>
                    <TableHead className="h-11 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: tokens.textTertiary }}>Projeto</TableHead>
                    <TableHead className="h-11 w-12 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: tokens.textTertiary }} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {channels.map((ch) => {
                    const statusColor = INSTANCE_STATUS_COLOR[ch.status] ?? INSTANCE_STATUS_COLOR.CREATED
                    const statusLabel = INSTANCE_STATUS_LABEL[ch.status] ?? INSTANCE_STATUS_LABEL.CREATED
                    const loading = actionLoading === ch.id
                    const connected = isConnected(ch.status)
                    const apiChannel = isApiChannel(ch)
                    const isConnecting = ch.status === "CONNECTING" || ch.status === "connecting"
                    const canQr = isUazapi(ch) && !connected && !isConnecting

                    return (
                      <TableRow
                        key={ch.id}
                        style={{ borderColor: tokens.divider }}
                        className="transition-colors"
                      >
                        {/* Canal */}
                        <TableCell className="px-4 py-3">
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <StatusDot status={ch.status} />
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: tokens.textPrimary, lineHeight: 1.3 }}>
                                {ch.name}
                              </div>
                              {ch.phoneNumber && (
                                <div style={{ fontSize: 12, color: tokens.textTertiary, marginTop: 1 }}>
                                  {ch.phoneNumber}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Tipo */}
                        <TableCell className="py-3">
                          <BrokerBadge ch={ch} tokens={tokens} />
                        </TableCell>

                        {/* Status */}
                        <TableCell className="py-3">
                          <span style={{ fontSize: 13, color: statusColor, fontWeight: 500 }}>
                            {statusLabel}
                          </span>
                        </TableCell>

                        {/* Projeto */}
                        <TableCell className="py-3">
                          <ProjectCell projects={ch.connectedProjects ?? []} tokens={tokens} />
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="py-3 pr-3">
                          {loading ? (
                            <Loader2 size={14} className="animate-spin" style={{ color: tokens.textTertiary }} />
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  aria-label={`Ações para ${ch.name}`}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    padding: "4px 6px",
                                    borderRadius: 6,
                                    color: tokens.textTertiary,
                                    display: "flex",
                                    alignItems: "center",
                                  }}
                                >
                                  <MoreVertical size={15} />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {/* UAZapi conectando: reabrir QR modal */}
                                {isUazapi(ch) && isConnecting && (
                                  <DropdownMenuItem onClick={() => openConnect(ch)}>
                                    <QrCode className="mr-2 h-3.5 w-3.5" />
                                    Ver QR Code
                                  </DropdownMenuItem>
                                )}
                                {/* UAZapi desconectado/erro: gerar novo QR */}
                                {canQr && (
                                  <DropdownMenuItem onClick={() => openConnect(ch)}>
                                    <QrCode className="mr-2 h-3.5 w-3.5" />
                                    Conectar via QR
                                  </DropdownMenuItem>
                                )}
                                {/* UAZapi conectado: reconectar (trocar dispositivo) + desconectar */}
                                {isUazapi(ch) && connected && (
                                  <>
                                    <DropdownMenuItem onClick={() => openReconnect(ch)}>
                                      <RefreshCw className="mr-2 h-3.5 w-3.5" />
                                      Reconectar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => void handleDisconnect(ch.id)}>
                                      <WifiOff className="mr-2 h-3.5 w-3.5" />
                                      Desconectar
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {/* Cloud API / Instagram: atualizar credenciais quando desconectado */}
                                {apiChannel && !connected && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      setEditCredentialsModal({ open: true, id: ch.id, name: ch.name, brokerType: ch.brokerType || ch.provider })
                                    }
                                  >
                                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                                    Atualizar credenciais
                                  </DropdownMenuItem>
                                )}
                                {(canQr || connected || apiChannel || isConnecting) && <DropdownMenuSeparator />}
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteConfirm({ open: true, id: ch.id, name: ch.name })}
                                >
                                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                                  Remover canal
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {/* Create modal */}
      <CreateInstanceModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => void refetch()}
        onCreated={handleCreated}
      />

      {/* QR connect modal */}
      <ConnectionModal
        instance={connectionModal.instance}
        isOpen={connectionModal.open}
        forceReconnect={connectionModal.forceReconnect}
        onClose={() => {
          setConnectionModal({ open: false, instance: null })
          void refetch()
        }}
      />

      {/* Edit credentials modal */}
      {editCredentialsModal && (
        <EditCredentialsModal
          isOpen={editCredentialsModal.open}
          instanceId={editCredentialsModal.id}
          instanceName={editCredentialsModal.name}
          brokerType={editCredentialsModal.brokerType}
          onClose={() => {
            setEditCredentialsModal(null)
            void refetch()
          }}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteConfirm?.open ?? false}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover canal?</AlertDialogTitle>
            <AlertDialogDescription>
              O canal <strong>{deleteConfirm?.name}</strong> será removido permanentemente.
              Agentes vinculados deixarão de receber mensagens por este canal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirm && void handleDelete(deleteConfirm.id)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
