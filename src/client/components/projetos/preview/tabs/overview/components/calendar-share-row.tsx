"use client"

/**
 * CalendarShareRow — share delegável da Agenda nas Capacidades (FR-34 / T107).
 *
 * Dois caminhos lado a lado (plan §4.3): "Conectar minha agenda" (OAuth direto,
 * abre a aba do Google) OU "Enviar link para o profissional" ([Copiar] +
 * [WhatsApp] wa.me pré-pronto) — o MESMO connect-link, sem abrir aba. Mecanismo
 * real: POST /builder/calendar/connect-link → `{ shareLink: /conectar-agenda/
 * <token>, expiresAt }`, TTL de 7 dias EXIBIDO. Espera "aguardando o profissional
 * conectar…" via GET /builder/calendar/status/:projectId (refetch on-focus +
 * "Verificar conexão"); só confirma com CONNECTED real (FR-11). Resolvers
 * DEFENSIVOS em module-eval; client sem as actions → indisponível.
 */

import * as React from "react"
import {
  CalendarCheck,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  MessageCircle,
  RefreshCw,
} from "lucide-react"

import { api } from "@/igniter.client"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

// ── Defensive client resolvers (module-eval, stable hook identities) ────────

interface ConnectLinkResult {
  connectionId?: string
  shareLink?: string
  expiresAt?: string | Date
}
interface ConnectLinkMutation {
  useMutation: (opts?: {
    onSuccess?: (result: unknown) => void
    onError?: (error: unknown) => void
  }) => { mutate: (input: { body: { projectId: string } }) => void }
}
interface CalendarStatusEnvelope {
  connected?: boolean
  connectionId?: string
}
interface CalendarStatusQuery {
  useQuery: (opts: { params: { projectId: string }; enabled?: boolean }) => {
    data: { data?: CalendarStatusEnvelope } | CalendarStatusEnvelope | undefined
    isLoading?: boolean
    refetch?: () => unknown
  }
}

const CONNECT_LINK_MUTATION: ConnectLinkMutation | null = (() => {
  const c = (api as { builder?: { connectLink?: unknown } }).builder?.connectLink
  return c && typeof (c as { useMutation?: unknown }).useMutation === "function"
    ? (c as ConnectLinkMutation)
    : null
})()
const CALENDAR_STATUS_QUERY: CalendarStatusQuery | null = (() => {
  const c = (api as { builder?: { status?: unknown } }).builder?.status
  return c && typeof (c as { useQuery?: unknown }).useQuery === "function"
    ? (c as CalendarStatusQuery)
    : null
})()
const FLOW_AVAILABLE =
  CONNECT_LINK_MUTATION !== null && CALENDAR_STATUS_QUERY !== null
const MUTATION: ConnectLinkMutation =
  CONNECT_LINK_MUTATION ?? { useMutation: () => ({ mutate: () => {} }) }
const STATUS_QUERY: CalendarStatusQuery =
  CALENDAR_STATUS_QUERY ?? { useQuery: () => ({ data: undefined, isLoading: false }) }

function readEnvelope<T extends object>(raw: unknown): T | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const inner = (raw as { data?: T }).data
  return inner && typeof inner === "object" ? inner : (raw as T)
}

/** Texto pré-pronto do wa.me — o profissional só clica e autoriza. */
function buildWhatsAppShareUrl(link: string): string {
  const text = `Olá! Conecte sua agenda do Google para que o agente marque horários automaticamente. Abra este link e autorize de onde estiver:\n\n${link}`
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

/** Data de validade do connect-link (7 dias), exibida ao usuário. */
function formatExpiry(expiresAt: string | Date | undefined): string | null {
  if (!expiresAt) return null
  const d = expiresAt instanceof Date ? expiresAt : new Date(expiresAt)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

// ── Component ───────────────────────────────────────────────────────────────

export function CalendarShareRow({
  projectId,
  tokens,
  onConnected,
}: {
  projectId: string
  tokens: AppTokens
  /** Disparado UMA vez quando o status real devolve CONNECTED (FR-11). */
  onConnected?: (connectionId: string | undefined) => void
}) {
  const [shareLink, setShareLink] = React.useState<string | null>(null)
  const [expiry, setExpiry] = React.useState<string | null>(null)
  const [requesting, setRequesting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const [armed, setArmed] = React.useState(false)
  const openTabRef = React.useRef(false)

  const mutation = MUTATION.useMutation({
    onSuccess: (result) => {
      setRequesting(false)
      const env = readEnvelope<ConnectLinkResult>(result)
      const link =
        typeof env?.shareLink === "string" && env.shareLink.length > 0
          ? env.shareLink
          : null
      if (!link) {
        setError("Não foi possível gerar o link de conexão. Tente novamente.")
        return
      }
      setError(null)
      setShareLink(link)
      setExpiry(formatExpiry(env?.expiresAt))
      setArmed(true)
      if (openTabRef.current && typeof window !== "undefined") {
        window.open(link, "_blank", "noopener,noreferrer")
      }
      openTabRef.current = false
    },
    onError: () => {
      setRequesting(false)
      openTabRef.current = false
      setError("Não foi possível gerar o link de conexão. Tente novamente.")
    },
  })

  const statusQuery = STATUS_QUERY.useQuery({
    params: { projectId },
    enabled: FLOW_AVAILABLE && armed,
  })
  const env = readEnvelope<CalendarStatusEnvelope>(statusQuery.data)
  const connected = env?.connected === true
  const connectionId =
    typeof env?.connectionId === "string" ? env.connectionId : undefined

  // Confirma EXATAMENTE uma vez quando a leitura real diz CONNECTED (FR-11).
  const onConnectedRef = React.useRef(onConnected)
  React.useEffect(() => {
    onConnectedRef.current = onConnected
  }, [onConnected])
  const verifiedRef = React.useRef(false)
  React.useEffect(() => {
    if (!connected || verifiedRef.current) return
    verifiedRef.current = true
    onConnectedRef.current?.(connectionId)
  }, [connected, connectionId])

  // Refetch on-focus enquanto aguarda — o profissional conecta em OUTRO device.
  const refetchRef = React.useRef(statusQuery.refetch)
  React.useEffect(() => {
    refetchRef.current = statusQuery.refetch
  }, [statusQuery.refetch])
  React.useEffect(() => {
    if (!armed) return
    const onFocus = () => void refetchRef.current?.()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [armed])

  const { mutate } = mutation
  const requestLink = React.useCallback(
    (openTab: boolean) => {
      if (requesting || !FLOW_AVAILABLE) return
      openTabRef.current = openTab
      setRequesting(true)
      setError(null)
      mutate({ body: { projectId } })
    },
    [requesting, projectId, mutate],
  )

  const handleCopy = React.useCallback(async () => {
    if (!shareLink) return
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard indisponível — o link continua visível/selecionável
    }
  }, [shareLink])

  const handleCheck = React.useCallback(() => {
    if (!FLOW_AVAILABLE) return
    if (!armed) setArmed(true)
    else void refetchRef.current?.()
  }, [armed])

  const btn =
    "flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
  const chip =
    "flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors"

  if (!FLOW_AVAILABLE) {
    return (
      <p className="text-[12px] leading-relaxed" style={{ color: tokens.textTertiary }}>
        A conexão de agenda não está disponível neste ambiente. Conecte mais
        tarde, quando o recurso estiver liberado.
      </p>
    )
  }

  const checking = armed && statusQuery.isLoading === true

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={requesting}
          onClick={() => requestLink(true)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: tokens.brand, color: tokens.textInverse }}
        >
          {requesting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Conectar minha agenda
        </button>
        <span className="text-[12px]" style={{ color: tokens.textTertiary }}>
          ou
        </span>
        <button
          type="button"
          disabled={requesting}
          onClick={() => requestLink(false)}
          className={btn}
          style={{ borderColor: tokens.divider, color: tokens.textSecondary, backgroundColor: tokens.bgSurface }}
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Enviar link para o profissional
        </button>
      </div>

      {error != null && (
        <p role="alert" className="text-[12px] leading-relaxed" style={{ color: tokens.dangerText }}>
          {error}
        </p>
      )}

      {shareLink != null && (
        <div
          className="flex flex-col gap-2 rounded-md border px-3 py-2.5"
          style={{ backgroundColor: tokens.bgBase, borderColor: tokens.divider }}
        >
          <p className="text-[12px] leading-relaxed" style={{ color: tokens.textSecondary }}>
            Envie este link para quem vai conectar a agenda — ele autoriza o
            Google de onde estiver.
          </p>
          <div
            className="flex items-center gap-2 rounded-md border px-2 py-1.5"
            style={{ borderColor: tokens.border, backgroundColor: tokens.bgSurface }}
          >
            <code
              className="flex-1 overflow-x-auto whitespace-nowrap text-[11px]"
              style={{ color: tokens.textPrimary }}
            >
              {shareLink}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className={chip}
              style={{ borderColor: tokens.border, color: tokens.textSecondary, backgroundColor: tokens.bgBase }}
              aria-label="Copiar link de conexão da agenda"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" style={{ color: tokens.brand }} aria-hidden="true" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" aria-hidden="true" />
                  Copiar
                </>
              )}
            </button>
            <a
              href={buildWhatsAppShareUrl(shareLink)}
              target="_blank"
              rel="noopener noreferrer"
              className={chip}
              style={{ borderColor: tokens.border, color: tokens.textSecondary, backgroundColor: tokens.bgBase }}
              aria-label="Enviar link de conexão por WhatsApp"
            >
              <MessageCircle className="h-3 w-3" aria-hidden="true" />
              WhatsApp
            </a>
          </div>

          {expiry != null && (
            <p className="text-[11px]" style={{ color: tokens.textTertiary }}>
              Link válido até {expiry} · 7 dias. Gere um novo link para renovar.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <span className="text-[12px]" style={{ color: tokens.textSecondary }}>
              {connected ? (
                <span className="inline-flex items-center gap-1.5" style={{ color: tokens.successText }}>
                  <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Agenda conectada
                </span>
              ) : (
                "Aguardando o profissional conectar…"
              )}
            </span>
            {!connected && (
              <button
                type="button"
                disabled={checking}
                onClick={handleCheck}
                className={btn}
                style={{ borderColor: tokens.divider, color: tokens.textPrimary, backgroundColor: tokens.bgSurface }}
              >
                {checking ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Verificar conexão
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
