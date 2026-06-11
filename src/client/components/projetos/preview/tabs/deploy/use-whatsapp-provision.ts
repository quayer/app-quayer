"use client"

/**
 * useWhatsAppProvision — estado do fluxo "Conectar WhatsApp Business" (UAZAPI).
 *
 * Vive no ChannelPickerSection (NÃO no painel) para o QR sobreviver à troca de
 * view selector → pendente quando a Connection é criada e o canal do projeto
 * passa a existir (antes o painel desmontava ~200ms após o QR aparecer).
 *
 * `provision` e `refreshQr` chamam a MESMA rota idempotente
 * `POST /api/v1/builder/channel/provision-whatsapp`: o servidor reusa a
 * Connection pendente do projeto, renova shareToken/TTL e regenera o QR — por
 * isso "Gerar novo QR" funciona mesmo após o shareToken de 15min expirar
 * (a rota pública share/:token devolveria 404).
 *
 * Duplo-clique protegido por ref in-flight (estado `provisioning`/`refreshing`
 * cobre só a UI; a ref cobre re-render races).
 */

import * as React from "react"
import { readErrorMessage } from "./read-error-message"

export interface WhatsAppProvisionState {
  provisioning: boolean
  refreshing: boolean
  shareToken: string | null
  shareLink: string | null
  qrCode: string | null
  /** ISO date — expiração do shareToken/QR (alimenta o countdown). */
  expiresAt: string | null
  /** True quando o servidor respondeu que a Connection já está conectada. */
  connected: boolean
  error: string | null
  provision: () => void
  refreshQr: () => void
}

interface ProvisionResponseData {
  connectionId?: string
  shareToken?: string | null
  shareLink?: string | null
  qrCode?: string | null
  shareTokenExpiresAt?: string | null
  connected?: boolean
  reused?: boolean
}

function unwrapProvision(raw: unknown): ProvisionResponseData {
  if (raw === null || typeof raw !== "object") return {}
  const obj = raw as { data?: unknown }
  if ("data" in obj && obj.data && typeof obj.data === "object") {
    return obj.data as ProvisionResponseData
  }
  return raw as ProvisionResponseData
}

export function useWhatsAppProvision(
  projectId: string,
  onProvisioned?: () => void | Promise<void>,
): WhatsAppProvisionState {
  const [provisioning, setProvisioning] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)
  const [shareToken, setShareToken] = React.useState<string | null>(null)
  const [shareLink, setShareLink] = React.useState<string | null>(null)
  const [qrCode, setQrCode] = React.useState<string | null>(null)
  const [expiresAt, setExpiresAt] = React.useState<string | null>(null)
  const [connected, setConnected] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const inFlightRef = React.useRef(false)

  const callProvision = React.useCallback(
    async (mode: "provision" | "refresh") => {
      if (inFlightRef.current) return
      inFlightRef.current = true
      const setBusy = mode === "provision" ? setProvisioning : setRefreshing
      setBusy(true)
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
            await readErrorMessage(
              response,
              `Erro ${response.status} ao conectar WhatsApp Business`,
            ),
          )
        }
        const data = unwrapProvision(await response.json())
        const token = data.shareToken ?? null
        setShareToken(token)
        setShareLink(
          data.shareLink ??
            (token && typeof window !== "undefined"
              ? `${window.location.origin}/compartilhar/${token}`
              : null),
        )
        setQrCode(data.qrCode ?? null)
        setExpiresAt(data.shareTokenExpiresAt ?? null)
        setConnected(data.connected ?? false)
        if (mode === "provision" && onProvisioned) await onProvisioned()
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erro ao conectar WhatsApp Business",
        )
      } finally {
        setBusy(false)
        inFlightRef.current = false
      }
    },
    [projectId, onProvisioned],
  )

  const provision = React.useCallback(() => {
    void callProvision("provision")
  }, [callProvision])

  const refreshQr = React.useCallback(() => {
    void callProvision("refresh")
  }, [callProvision])

  return {
    provisioning,
    refreshing,
    shareToken,
    shareLink,
    qrCode,
    expiresAt,
    connected,
    error,
    provision,
    refreshQr,
  }
}

/**
 * useQrCountdown — segundos restantes até `expiresAtIso` (null = sem expiração
 * conhecida). Atualiza a cada 1s enquanto houver prazo.
 */
export function useQrCountdown(expiresAtIso: string | null): number | null {
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    if (!expiresAtIso) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [expiresAtIso])

  if (!expiresAtIso) return null
  const remainingMs = new Date(expiresAtIso).getTime() - now
  return Math.max(0, Math.floor(remainingMs / 1000))
}

/** 95 → "1:35"; 605 → "10:05". */
export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}
