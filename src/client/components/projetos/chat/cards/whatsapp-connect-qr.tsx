"use client"

/**
 * Builder Cards — fluxo QR pareado do `whatsapp_connect` (T47, FR-15/27/30)
 *
 * Sub-componente do `whatsapp-connect-card.tsx` (modo `qr`): provisiona o QR via
 * `POST /builder/channel/provision-whatsapp` UMA única vez no mount (rota
 * IDEMPOTENTE — reusa a Connection do projeto, §3.6a), mostra o QR + "Gerar
 * novamente" via `POST /builder/channel/refresh-qr` com throttle client de 30s
 * (§3.6b — renova QR e estende o TTL do shareLink, sem criar instância no broker),
 * erro com retry honesto (NFR-06) e o bloco de share delegável (FR-34, T108).
 *
 * CONEXÃO por AUTODETECÇÃO: cards não fazem fetch de readiness; o passo conclui
 * server-side quando `hasConnectedWhatsAppInstance` fica true (engine v2) e o
 * polling unificado (T51, workspace) re-renderiza o card com `connected` true.
 * FR-30: com `whatsappConnectedOnce` true o card mostra "Conectado" e NUNCA regride.
 *
 * TETO DE POLLING (FR-27): relógio próprio desde o último arm; após 10min sem
 * conexão mostra "Ainda esperando?" com botão que RE-ARMA (re-zera + regenera QR).
 *
 * Resolvers DEFENSIVOS em module-eval (mesmo idioma do connect-link-flow): se o
 * client gerado ainda não expõe as actions, os botões degradam sem crashar.
 */

import * as React from "react"
import Image from "next/image"
import { CheckCircle2, Loader2, QrCode, RefreshCw } from "lucide-react"

import { api } from "@/igniter.client"
import { Button } from "@/client/components/ui/button"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

import { CardShell } from "./card-shell"
import { ShareDelegationBlock } from "./whatsapp-connect-share"

/** Janela de polling automático antes do "Ainda esperando?" (FR-27). */
const POLL_CEILING_MS = 10 * 60 * 1000
/** Throttle client do "Gerar novamente" (§3.6b). */
const REFRESH_THROTTLE_MS = 30 * 1000

/** Slice dos envelopes que o provision/refresh devolvem. */
interface ProvisionResult {
  connectionId?: string
  shareLink?: string | null
  qrCode?: string | null
}
interface RefreshResult {
  qrCode?: string | null
}

/** Shapes mínimos dos hooks gerados (defensivo). */
interface ProvisionMutation {
  useMutation: (opts?: {
    onSuccess?: (result: unknown) => void
    onError?: (error: unknown) => void
  }) => { mutate: (input: { body: { projectId: string } }) => void }
}
interface RefreshMutation {
  useMutation: (opts?: {
    onSuccess?: (result: unknown) => void
    onError?: (error: unknown) => void
  }) => { mutate: (input: { body: { connectionId: string } }) => void }
}

const PROVISION_MUTATION: ProvisionMutation | null = (() => {
  const c = (api as { builder?: { provisionWhatsApp?: unknown } }).builder
    ?.provisionWhatsApp
  return c && typeof (c as { useMutation?: unknown }).useMutation === "function"
    ? (c as ProvisionMutation)
    : null
})()
const REFRESH_MUTATION: RefreshMutation | null = (() => {
  const c = (api as { builder?: { refreshQr?: unknown } }).builder?.refreshQr
  return c && typeof (c as { useMutation?: unknown }).useMutation === "function"
    ? (c as RefreshMutation)
    : null
})()

const FALLBACK_PROVISION: ProvisionMutation = { useMutation: () => ({ mutate: () => {} }) }
const FALLBACK_REFRESH: RefreshMutation = { useMutation: () => ({ mutate: () => {} }) }

/** Unwrap defensivo de envelopes ({ data: {...} } OU plano). */
function readEnvelope<T extends object>(raw: unknown): T | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const inner = (raw as { data?: T }).data
  if (inner && typeof inner === "object") return inner
  return raw as T
}

/** Normaliza o base64 do QR para um data-URI renderável. */
function qrSrcOf(qr: string | null): string | null {
  if (!qr) return null
  return qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`
}

/**
 * WhatsAppQrConnect — fluxo QR pareado. `connected` (vindo do sentinel
 * `whatsappConnectedOnce`) é a fonte de verdade da conclusão; o componente nunca
 * submete nada para concluir o passo (autodetecção server-side).
 */
export function WhatsAppQrConnect({
  projectId,
  connected,
  disabled,
  tokens,
}: {
  projectId: string
  connected: boolean
  disabled: boolean
  tokens: AppTokens
}) {
  const [connectionId, setConnectionId] = React.useState<string | null>(null)
  const [shareLink, setShareLink] = React.useState<string | null>(null)
  const [qr, setQr] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(true)
  // Relógio do teto de polling (FR-27): re-zerado a cada arm.
  const [armedAt, setArmedAt] = React.useState(() => Date.now())
  const [waiting, setWaiting] = React.useState(false)
  const lastRefreshRef = React.useRef(0)

  const provision = (PROVISION_MUTATION ?? FALLBACK_PROVISION).useMutation({
    onSuccess: (result) => {
      const env = readEnvelope<ProvisionResult>(result)
      setBusy(false)
      setError(null)
      if (env?.connectionId) setConnectionId(env.connectionId)
      if (typeof env?.shareLink === "string") setShareLink(env.shareLink)
      setQr(env?.qrCode ?? null)
    },
    onError: () => {
      setBusy(false)
      setError("Não foi possível gerar o QR Code. Tente novamente.")
    },
  })
  const refresh = (REFRESH_MUTATION ?? FALLBACK_REFRESH).useMutation({
    onSuccess: (result) => {
      setBusy(false)
      setError(null)
      setQr(readEnvelope<RefreshResult>(result)?.qrCode ?? null)
    },
    onError: () => {
      setBusy(false)
      setError("Não foi possível regenerar o QR Code. Tente novamente.")
    },
  })

  // Provision UMA única vez no mount (idempotente — reusa a Connection do projeto).
  const provisionedRef = React.useRef(false)
  const { mutate: provisionMutate } = provision
  React.useEffect(() => {
    if (connected || provisionedRef.current || PROVISION_MUTATION === null) return
    provisionedRef.current = true
    setBusy(true)
    provisionMutate({ body: { projectId } })
  }, [connected, projectId, provisionMutate])

  // Teto de polling (FR-27): após 10min sem conexão, oferece o re-arme.
  React.useEffect(() => {
    if (connected) return
    const id = window.setTimeout(
      () => setWaiting(true),
      Math.max(0, armedAt + POLL_CEILING_MS - Date.now()),
    )
    return () => window.clearTimeout(id)
  }, [armedAt, connected])

  const { mutate: refreshMutate } = refresh
  const handleRegenerate = React.useCallback(() => {
    if (disabled || !connectionId || REFRESH_MUTATION === null) return
    const now = Date.now()
    if (now - lastRefreshRef.current < REFRESH_THROTTLE_MS) return
    lastRefreshRef.current = now
    setBusy(true)
    setError(null)
    refreshMutate({ body: { connectionId } })
  }, [disabled, connectionId, refreshMutate])

  // "Ainda esperando?" re-arma: re-zera o relógio E regenera o QR.
  const handleReArm = React.useCallback(() => {
    setWaiting(false)
    setArmedAt(Date.now())
    handleRegenerate()
  }, [handleRegenerate])

  if (connected) {
    return (
      <CardShell
        icon={<CheckCircle2 className="h-4 w-4" />}
        title="WhatsApp conectado"
        reason="Tudo certo — seu agente já está atendendo neste número."
        tokens={tokens}
      />
    )
  }

  const qrSrc = qrSrcOf(qr)

  return (
    <CardShell
      icon={<QrCode className="h-4 w-4" />}
      title="Conectar WhatsApp"
      reason="Escaneie o QR Code no celular do seu negócio — pronto em 2 minutos. A tela atualiza sozinha quando conectar."
      tokens={tokens}
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className="flex h-44 w-44 items-center justify-center rounded-md border bg-white p-2"
          style={{ borderColor: tokens.divider }}
        >
          {busy ? (
            <Loader2
              className="h-6 w-6 animate-spin"
              style={{ color: tokens.textTertiary }}
              aria-label="Gerando QR Code"
            />
          ) : qrSrc ? (
            <Image
              src={qrSrc}
              alt="QR Code para conectar WhatsApp"
              width={176}
              height={176}
              unoptimized
              className="h-full w-full"
            />
          ) : (
            <QrCode
              className="h-10 w-10"
              style={{ color: tokens.textTertiary }}
              aria-hidden="true"
            />
          )}
        </div>

        {error != null && (
          <p role="alert" className="text-[12px]" style={{ color: tokens.dangerText }}>
            {error}
          </p>
        )}

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-[12px]"
          onClick={handleRegenerate}
          disabled={disabled || busy || !connectionId}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Gerar novamente
        </Button>
      </div>

      {waiting && (
        <div
          role="status"
          className="mt-4 flex flex-col items-start gap-2 rounded-md border px-3 py-2 text-[12px]"
          style={{
            borderColor: tokens.divider,
            backgroundColor: tokens.bgBase,
            color: tokens.textSecondary,
          }}
        >
          <span>Ainda esperando? Geramos um QR novo para você tentar de novo.</span>
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1.5 text-[11px]"
            onClick={handleReArm}
            disabled={disabled || busy || !connectionId}
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Tentar de novo
          </Button>
        </div>
      )}

      <ShareDelegationBlock
        shareLink={shareLink}
        onRegenerate={handleRegenerate}
        tokens={tokens}
      />
    </CardShell>
  )
}
