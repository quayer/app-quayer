"use client"

import * as React from "react"
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Send,
} from "lucide-react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { fetchWithAuthRetry } from "@/lib/auth/client-refresh"

interface ConnectLinkEnvelope {
  connectionId?: string
  connectToken?: string
  expiresAt?: string
  shareLink?: string
}

interface CalendarStatusEnvelope {
  connectionId?: string
  status?: string | null
  connected?: boolean
  calendarEmail?: string | null
  expiresAt?: string
  warning?: string
}

export interface AgendaInlineConfigProps {
  projectId: string
  tokens: AppTokens
  disabled?: boolean
  calendarConnected: boolean
  onVerifiedConnected: (connectionId: string | undefined) => Promise<void>
}

function readEnvelope<T extends object>(raw: unknown): T | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const inner = (raw as { data?: T }).data
  if (inner && typeof inner === "object") return inner
  return raw as T
}

function expiryCopy(expiresAt: string | undefined): string {
  if (!expiresAt) return "Link válido por 7 dias."
  const date = new Date(expiresAt)
  if (Number.isNaN(date.getTime())) return "Link válido por 7 dias."
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
  return `Link válido por 7 dias. Expira em ${formatted}.`
}

function whatsappShareUrl(shareLink: string): string {
  const text =
    "Olá! Use este link para conectar sua agenda do Google ao agente da Quayer: " +
    `${shareLink}\n\nO link é válido por 7 dias.`
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

function IconButton({
  children,
  disabled,
  onClick,
  tokens,
  href,
}: {
  children: React.ReactNode
  disabled?: boolean
  onClick?: () => void
  tokens: AppTokens
  href?: string
}) {
  const className =
    "inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
  const style: React.CSSProperties = {
    borderColor: tokens.divider,
    backgroundColor: tokens.bgSurface,
    color: tokens.textPrimary,
  }

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        style={style}
        aria-disabled={disabled === true}
        onClick={(event) => {
          if (disabled) event.preventDefault()
        }}
      >
        {children}
      </a>
    )
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={className}
      style={style}
    >
      {children}
    </button>
  )
}

export function AgendaInlineConfig({
  projectId,
  tokens,
  disabled = false,
  calendarConnected,
  onVerifiedConnected,
}: AgendaInlineConfigProps) {
  const [link, setLink] = React.useState<ConnectLinkEnvelope | null>(null)
  const [status, setStatus] = React.useState<CalendarStatusEnvelope | null>(null)
  const [requesting, setRequesting] = React.useState(false)
  const [checking, setChecking] = React.useState(false)
  const [feedback, setFeedback] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const verifiedRef = React.useRef(calendarConnected)

  React.useEffect(() => {
    if (calendarConnected) verifiedRef.current = true
  }, [calendarConnected])

  const busy = disabled || requesting || checking
  const shareLink = link?.shareLink ?? null
  const connected = calendarConnected || status?.connected === true
  const email = status?.calendarEmail ?? null
  const expiresAt = link?.expiresAt ?? status?.expiresAt

  const requestConnectLink = React.useCallback(
    async (mode: "self" | "delegate" | "new") => {
      if (disabled || requesting) return
      if (mode === "self" && shareLink) {
        window.open(shareLink, "_blank", "noopener,noreferrer")
        return
      }

      setRequesting(true)
      setError(null)
      setFeedback(null)

      try {
        const res = await fetchWithAuthRetry(
          "/api/v1/builder/calendar/connect-link",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId }),
          },
          { notifyOnAuthFailure: true },
        )

        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? "A conexão de agenda não está disponível neste ambiente."
              : `Falha ao gerar o link (${res.status}).`,
          )
        }

        const body = readEnvelope<ConnectLinkEnvelope>(await res.json())
        if (!body?.shareLink) {
          throw new Error("Não foi possível gerar o link de agenda.")
        }

        setLink(body)
        setFeedback(
          mode === "self"
            ? "Link gerado. Conclua a autorização na aba aberta."
            : "Link delegável gerado. Copie ou envie para o profissional.",
        )

        if (mode === "self") {
          window.open(body.shareLink, "_blank", "noopener,noreferrer")
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro desconhecido.")
      } finally {
        setRequesting(false)
      }
    },
    [disabled, projectId, requesting, shareLink],
  )

  const copyLink = React.useCallback(async () => {
    if (!shareLink) return
    try {
      await navigator.clipboard.writeText(shareLink)
      setFeedback("Link copiado.")
      setError(null)
    } catch {
      setError("Não consegui copiar o link neste navegador.")
    }
  }, [shareLink])

  const checkConnection = React.useCallback(
    async (source: "manual" | "focus" = "manual") => {
      if (disabled || checking) return
      setChecking(true)
      if (source === "manual") {
        setError(null)
        setFeedback(null)
      }

      try {
        const res = await fetchWithAuthRetry(
          `/api/v1/builder/calendar/status/${projectId}`,
          { method: "GET", headers: { Accept: "application/json" } },
          { notifyOnAuthFailure: source === "manual" },
        )
        if (!res.ok) throw new Error(`Falha ao verificar conexão (${res.status}).`)

        const envelope = readEnvelope<CalendarStatusEnvelope>(await res.json())
        setStatus(envelope ?? null)

        if (envelope?.connected === true) {
          if (!verifiedRef.current) {
            await onVerifiedConnected(envelope.connectionId)
            verifiedRef.current = true
          }
          setFeedback(
            envelope.calendarEmail
              ? `Agenda conectada: ${envelope.calendarEmail}.`
              : "Agenda conectada.",
          )
          setError(null)
          return
        }

        if (source === "manual") {
          setFeedback(
            "Ainda aguardando a autorização. Depois que o profissional conectar, verifique de novo.",
          )
        }
      } catch (err) {
        if (source === "manual") {
          setError(err instanceof Error ? err.message : "Erro desconhecido.")
        }
      } finally {
        setChecking(false)
      }
    },
    [checking, disabled, onVerifiedConnected, projectId],
  )

  React.useEffect(() => {
    if (!shareLink || connected || disabled) return
    const handleFocus = () => {
      void checkConnection("focus")
    }
    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [checkConnection, connected, disabled, shareLink])

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void requestConnectLink("self")}
          className="flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 py-2 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            borderColor: tokens.divider,
            backgroundColor: tokens.bgBase,
            color: tokens.textPrimary,
          }}
        >
          {requesting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Conectar minha agenda
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => void requestConnectLink("delegate")}
          className="flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 py-2 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            borderColor: tokens.divider,
            backgroundColor: tokens.bgBase,
            color: tokens.textPrimary,
          }}
        >
          {requesting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Enviar link ao profissional
        </button>
      </div>

      <p className="text-[11px] leading-relaxed" style={{ color: tokens.textTertiary }}>
        {expiryCopy(expiresAt)} Gerar um novo link substitui o anterior.
      </p>

      {shareLink ? (
        <div className="flex flex-col gap-2">
          <div
            className="min-w-0 rounded-md px-2.5 py-2 font-mono text-[11px]"
            style={{ backgroundColor: tokens.bgBase, color: tokens.textSecondary }}
          >
            <span className="block truncate">{shareLink}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <IconButton tokens={tokens} disabled={busy} onClick={copyLink}>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              Copiar link
            </IconButton>
            <IconButton
              tokens={tokens}
              disabled={busy}
              href={whatsappShareUrl(shareLink)}
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              Enviar por WhatsApp
            </IconButton>
            <IconButton
              tokens={tokens}
              disabled={busy}
              onClick={() => void requestConnectLink("new")}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Gerar novo link
            </IconButton>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          tokens={tokens}
          disabled={busy}
          onClick={() => void checkConnection("manual")}
        >
          {checking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : connected ? (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {connected ? "Conexão verificada" : "Verificar conexão"}
        </IconButton>
        {email ? (
          <span className="text-[11px]" style={{ color: tokens.textTertiary }}>
            {email}
          </span>
        ) : null}
      </div>

      {feedback ? (
        <p role="status" className="text-[11px] leading-relaxed" style={{ color: tokens.textSecondary }}>
          {feedback}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[11px] leading-relaxed" style={{ color: tokens.dangerText }}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
