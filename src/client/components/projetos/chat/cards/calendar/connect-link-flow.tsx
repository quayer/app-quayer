"use client"

/**
 * Builder Cards — Fluxo REAL de conexão de agenda (jornada-builder-v2, FR-11/FR-20)
 *
 * Sub-módulo do `calendar-connect-card`: encapsula o único caminho HONESTO de
 * conexão acionável a partir do card:
 *
 *   1. `POST /builder/calendar/connect-link` (api.builder.connectLink) — cria o
 *      CalendarConnection PENDING e devolve o `shareLink` público
 *      (/conectar-agenda/<token>), aberto numa nova aba para o OAuth do Google.
 *   2. `GET /builder/calendar/status/:projectId` (api.builder.status) — leitura
 *      REAL do status; só quando ela devolve CONNECTED o fluxo dispara
 *      `onVerifiedConnected` (que confirma o passo). NUNCA confirma sem
 *      conexão verificada — regra dura da FR-11.
 *
 * Resolvers DEFENSIVOS em module-eval (mesmo idioma do EVENTS_PREVIEW_QUERY do
 * card): se o client gerado ainda não expõe as actions, `available` é false e o
 * card mostra apenas o "Pular por agora" + aviso honesto de indisponibilidade.
 */

import * as React from "react"
import { ExternalLink, Loader2 } from "lucide-react"

import { useMutation, useQuery } from "@tanstack/react-query"

import { orpc } from "@/orpc/client"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

// ---------------------------------------------------------------------------
// Defensive client resolvers (module-eval, stable hook identities)
// ---------------------------------------------------------------------------

/** Slice do envelope de `connectLink` que o fluxo lê. */
interface ConnectLinkResult {
  connectionId?: string
  shareLink?: string
}

/** Slice do envelope de `status` (GET /calendar/status/:projectId). */
interface CalendarStatusEnvelope {
  connected?: boolean
  status?: string | null
  connectionId?: string
}

/**
 * Actions garantidas pelo client oRPC tipado (o resolver defensivo do client
 * gerado do Igniter foi aposentado no cutover).
 */
const FLOW_AVAILABLE = true

/** Unwrap defensivo de envelopes ({ data: {...} } OU plano). */
function readEnvelope<T extends object>(raw: unknown): T | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const inner = (raw as { data?: T }).data
  if (inner && typeof inner === "object") return inner
  return raw as T
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Tudo que o card precisa do fluxo de conexão. */
export interface CalendarConnectFlow {
  /** False quando o client gerado não expõe connectLink/status — sem botão "Conectar". */
  available: boolean
  /** True enquanto o connect-link está sendo criado. */
  requesting: boolean
  /** shareLink criado (null até o primeiro pedido). */
  connectUrl: string | null
  /** Erro soft do pedido de link (nunca derruba o card). */
  requestError: string | null
  /** True enquanto a verificação de status está em voo. */
  verifying: boolean
  /** Dica pós-verificação quando a conexão AINDA não apareceu. */
  verifyHint: string | null
  /** Cria o link de conexão e abre a aba do OAuth. */
  requestConnectLink: () => void
  /** Verificação REAL do status; dispara onVerifiedConnected quando CONNECTED. */
  checkConnection: () => void
}

/**
 * useCalendarConnectFlow — estado do fluxo real de conexão. `onVerifiedConnected`
 * dispara NO MÁXIMO uma vez (ref-guarded), e somente após a leitura de status
 * devolver CONNECTED — nunca por clique do usuário.
 */
export function useCalendarConnectFlow({
  projectId,
  disabled,
  onVerifiedConnected,
}: {
  projectId: string
  disabled: boolean
  onVerifiedConnected: (connectionId: string | undefined) => void
}): CalendarConnectFlow {
  const [connectUrl, setConnectUrl] = React.useState<string | null>(null)
  const [requesting, setRequesting] = React.useState(false)
  const [requestError, setRequestError] = React.useState<string | null>(null)
  // `armed` liga a query de status no primeiro "verificar"; cliques seguintes
  // forçam refetch. `checkCount` distingue "nunca verificou" de "verificou e
  // ainda não conectou" (para a dica honesta).
  const [armed, setArmed] = React.useState(false)
  const [checkCount, setCheckCount] = React.useState(0)

  const mutation = useMutation(orpc.builder.connectLink.mutationOptions({
    onSuccess: (result) => {
      setRequesting(false)
      const envelope = readEnvelope<ConnectLinkResult>(result)
      const link =
        typeof envelope?.shareLink === "string" && envelope.shareLink.length > 0
          ? envelope.shareLink
          : null
      if (!link) {
        setRequestError(
          "Não foi possível gerar o link de conexão. Tente novamente.",
        )
        return
      }
      setRequestError(null)
      setConnectUrl(link)
      if (typeof window !== "undefined") {
        window.open(link, "_blank", "noopener,noreferrer")
      }
    },
    onError: () => {
      setRequesting(false)
      setRequestError(
        "Não foi possível gerar o link de conexão. Tente novamente.",
      )
    },
  }))

  const statusQuery = useQuery(
    orpc.builder.status.queryOptions({
      input: { projectId },
      enabled: FLOW_AVAILABLE && armed && !disabled,
    }),
  )

  const envelope = readEnvelope<CalendarStatusEnvelope>(statusQuery.data)
  const statusConnected = envelope?.connected === true
  const statusConnectionId =
    typeof envelope?.connectionId === "string" ? envelope.connectionId : undefined

  // Confirma EXATAMENTE uma vez quando a leitura real diz CONNECTED.
  const verifiedRef = React.useRef(false)
  React.useEffect(() => {
    if (!armed || !statusConnected || verifiedRef.current) return
    verifiedRef.current = true
    onVerifiedConnected(statusConnectionId)
  }, [armed, statusConnected, statusConnectionId, onVerifiedConnected])

  const { mutate } = mutation
  const requestConnectLink = React.useCallback(() => {
    if (disabled || requesting || !FLOW_AVAILABLE) return
    setRequesting(true)
    setRequestError(null)
    mutate({ projectId })
  }, [disabled, requesting, projectId, mutate])

  const refetchStatus = statusQuery.refetch
  const checkConnection = React.useCallback(() => {
    if (disabled || !FLOW_AVAILABLE) return
    setCheckCount((n) => n + 1)
    if (!armed) {
      setArmed(true)
      return
    }
    void refetchStatus?.()
  }, [disabled, armed, refetchStatus])

  const verifying = armed && statusQuery.isLoading === true
  const verifyHint =
    armed && !verifying && checkCount > 0 && envelope !== undefined && !statusConnected
      ? "Ainda não encontramos a conexão. Conclua a autorização na aba do Google e verifique de novo."
      : null

  return {
    available: FLOW_AVAILABLE,
    requesting,
    connectUrl,
    requestError,
    verifying,
    verifyHint,
    requestConnectLink,
    checkConnection,
  }
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

/**
 * ConnectFlowPanel — bloco inline do fluxo: indisponibilidade honesta, erro do
 * pedido de link, e (após o link criado) instrução + reabrir aba + botão
 * "Já autorizei — verificar conexão". Retorna null quando não há nada a mostrar.
 */
export function ConnectFlowPanel({
  flow,
  disabled,
  tokens,
}: {
  flow: CalendarConnectFlow
  disabled: boolean
  tokens: AppTokens
}) {
  if (!flow.available) {
    return (
      <p
        className="mt-3 text-[12px] leading-relaxed"
        style={{ color: tokens.textTertiary }}
      >
        A conexão de agenda não está disponível neste ambiente. Você pode pular
        por agora e conectar mais tarde.
      </p>
    )
  }

  if (!flow.connectUrl && !flow.requestError) return null

  return (
    <div className="mt-3 flex flex-col gap-2">
      {flow.requestError != null && (
        <p
          role="alert"
          className="text-[12px] leading-relaxed"
          style={{ color: tokens.dangerText }}
        >
          {flow.requestError}
        </p>
      )}

      {flow.connectUrl != null && (
        <div
          className="flex flex-col gap-2 rounded-md border px-3 py-2"
          style={{ backgroundColor: tokens.bgBase, borderColor: tokens.divider }}
        >
          <p
            className="text-[12px] leading-relaxed"
            style={{ color: tokens.textSecondary }}
          >
            Conclua a autorização do Google na aba que abriu. Se a aba não
            abriu,{" "}
            <a
              href={flow.connectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
              style={{ color: tokens.brandText }}
            >
              abra o link de conexão
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            .
          </p>

          <button
            type="button"
            disabled={disabled || flow.verifying}
            onClick={flow.checkConnection}
            className="flex w-fit items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: tokens.bgSurface,
              borderColor: tokens.divider,
              color: tokens.textPrimary,
            }}
          >
            {flow.verifying ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Verificando…
              </>
            ) : (
              "Já autorizei — verificar conexão"
            )}
          </button>

          {flow.verifyHint != null && (
            <p
              role="status"
              className="text-[11px] leading-relaxed"
              style={{ color: tokens.textTertiary }}
            >
              {flow.verifyHint}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
