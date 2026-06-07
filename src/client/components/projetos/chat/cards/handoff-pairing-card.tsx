"use client"

/**
 * Builder Cards — handoff_pairing (B2 do warm transfer)
 *
 * Card OPCIONAL que aparece (via override do step-engine) depois da equipe, só
 * para agentes de roleta (qualification.action === 'notify_team') com membros.
 * Deixa o dono ATRIBUIR a cada atendente uma instância WhatsApp PRÓPRIA (já
 * pareada) + editar a mensagem de abertura. Quando um membro tem connectionId, o
 * handoff faz WARM TRANSFER: a conexão dele inicia o atendimento direto no
 * WhatsApp do cliente (ele responde no app dele).
 *
 * Premissa do produto: NÃO há painel de operador — o atendente vive 100% no
 * WhatsApp. Por isso o warm transfer é como o handoff funciona de fato.
 *
 * Fonte das instâncias: GET /builder/connections/list (1 leitura, guardada com
 * fallback no-op igual ao calendar-connect — se o client não tiver a action ainda,
 * a lista fica vazia em vez de quebrar). O dono cria instâncias pelo fluxo do
 * agente que já existe ("crie uma instância pro João") e aqui só ATRIBUI.
 *
 * Presentational + 1 leitura: token-driven via CardShell. Nunca lança.
 *
 * Contract: docs/design/handoff-qr-warm-transfer.md (§10).
 */

import * as React from "react"
import { PhoneForwarded, Check } from "lucide-react"

import { api } from "@/igniter.client"
import { Textarea } from "@/client/components/ui/textarea"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"

/** Default da mensagem de abertura (espelha warm-transfer.ts). `{nome}` = atendente. */
const DEFAULT_OPENING_MESSAGE =
  "Olá! Aqui é {nome}, vou continuar seu atendimento por aqui. 👋"

const NONE_VALUE = "__none__"

/** Submit payload (CARD CONTRACT) — a Wire injeta o cardKey antes do POST. */
export interface HandoffPairingPayload {
  members: Array<{ position: number; connectionId?: string }>
  openingMessage?: string
}

interface ConnectionRow {
  id: string
  name: string | null
  phoneNumber: string | null
  status: string | null
}

/** Shape mínimo do hook de query (defensivo — client pode não ter a action ainda). */
interface ListConnectionsQuery {
  useQuery: (opts?: unknown) => {
    data?:
      | { connections?: ConnectionRow[] }
      | { data?: { connections?: ConnectionRow[] } }
      | undefined
    isLoading?: boolean
  }
}

/**
 * Resolve o hook `api.builder.listConnections` UMA vez (module-eval), com fallback
 * no-op se a action não existir no client gerado — mantém a IDENTIDADE do hook
 * estável (Rules of Hooks) e o card renderiza com lista vazia em vez de quebrar.
 */
const LIST_CONNECTIONS_QUERY: ListConnectionsQuery = (() => {
  const builderApi = (api as { builder?: { listConnections?: unknown } }).builder
  const candidate = builderApi?.listConnections
  if (
    candidate &&
    typeof (candidate as { useQuery?: unknown }).useQuery === "function"
  ) {
    return candidate as ListConnectionsQuery
  }
  return { useQuery: () => ({ data: undefined, isLoading: false }) }
})()

/** Desembrulha o envelope ({ data: { connections } } OU { connections }). */
function readConnections(
  raw: ReturnType<ListConnectionsQuery["useQuery"]>["data"],
): ConnectionRow[] {
  if (!raw || typeof raw !== "object") return []
  const inner = (raw as { data?: { connections?: ConnectionRow[] } }).data
  if (inner && Array.isArray(inner.connections)) return inner.connections
  const flat = (raw as { connections?: ConnectionRow[] }).connections
  return Array.isArray(flat) ? flat : []
}

function connectionLabel(c: ConnectionRow): string {
  const name = c.name?.trim() || "WhatsApp"
  const phone = c.phoneNumber?.trim()
  return phone ? `${name} (${phone})` : name
}

export function HandoffPairingCard({
  value,
  disabled = false,
  onSubmit,
  onDismiss,
  tokens,
}: CardComponentProps<HandoffPairingPayload>) {
  const members = React.useMemo(() => value.team.members ?? [], [value.team.members])

  // connectionId selecionado por POSITION (init do builderState).
  const [selected, setSelected] = React.useState<Record<number, string>>(() => {
    const init: Record<number, string> = {}
    for (const m of members) {
      if (m.connectionId) init[m.position] = m.connectionId
    }
    return init
  })

  const [openingMessage, setOpeningMessage] = React.useState<string>(
    value.team.openingMessage?.trim() || DEFAULT_OPENING_MESSAGE,
  )

  const queryResult = LIST_CONNECTIONS_QUERY.useQuery({})
  const connections = readConnections(queryResult.data)

  const labelStyle = { color: tokens.textSecondary }
  const fieldStyle: React.CSSProperties = {
    backgroundColor: tokens.bgSurface,
    borderColor: tokens.divider,
    color: tokens.textPrimary,
  }

  const handleConfirm = React.useCallback(() => {
    onSubmit({
      members: members.map((m) => {
        const conn = selected[m.position]
        return {
          position: m.position,
          ...(conn && conn !== NONE_VALUE ? { connectionId: conn } : {}),
        }
      }),
      openingMessage: openingMessage.trim() || undefined,
    })
  }, [members, selected, openingMessage, onSubmit])

  const pairedCount = members.filter(
    (m) => selected[m.position] && selected[m.position] !== NONE_VALUE,
  ).length

  return (
    <CardShell
      icon={<PhoneForwarded className="h-4 w-4" />}
      title="WhatsApp dos atendentes (warm transfer)"
      reason="Atribua a cada atendente o WhatsApp próprio dele (instância já conectada). Quando o lead cair na roleta, o atendente inicia o atendimento direto no WhatsApp dele. ⚠️ O cliente passará a receber mensagem desse número — garanta a base legal (LGPD)."
      tokens={tokens}
      actions={[
        {
          label: pairedCount > 0 ? `Confirmar (${pairedCount} pareado(s))` : "Confirmar",
          onClick: handleConfirm,
          variant: "primary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled,
        },
        ...(onDismiss
          ? [
              {
                label: "Pular",
                onClick: onDismiss,
                variant: "secondary" as const,
                disabled,
              },
            ]
          : []),
      ]}
    >
      <div className="flex flex-col gap-4">
        {members.length === 0 ? (
          <p className="text-[13px]" style={labelStyle}>
            Nenhum membro na roleta ainda. Volte ao card de equipe para adicionar atendentes.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {members.map((m) => {
              const name = m.name?.trim() || `Atendente ${m.position + 1}`
              return (
                <div key={m.position} className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium" style={labelStyle}>
                    {name}
                  </span>
                  <select
                    value={selected[m.position] ?? NONE_VALUE}
                    disabled={disabled}
                    onChange={(e) =>
                      setSelected((prev) => ({ ...prev, [m.position]: e.target.value }))
                    }
                    className="h-9 rounded-md border px-2 text-[13px]"
                    style={fieldStyle}
                  >
                    <option value={NONE_VALUE}>Sem WhatsApp próprio (usa o número do bot)</option>
                    {connections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {connectionLabel(c)}
                      </option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
        )}

        {/* Mensagem de abertura editável */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium" style={labelStyle}>
            Mensagem de abertura ao cliente — use {"{nome}"} para o nome do atendente
          </span>
          <Textarea
            value={openingMessage}
            onChange={(e) => setOpeningMessage(e.target.value)}
            disabled={disabled}
            rows={2}
            className="text-[13px]"
            placeholder={DEFAULT_OPENING_MESSAGE}
          />
        </div>

        {connections.length === 0 && (
          <p className="text-[12px]" style={labelStyle}>
            Nenhuma instância WhatsApp encontrada. Crie uma para cada atendente
            (peça ao assistente: “crie uma instância para o João”) e volte aqui para atribuir.
          </p>
        )}
      </div>
    </CardShell>
  )
}
