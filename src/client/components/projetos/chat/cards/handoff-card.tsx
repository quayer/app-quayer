"use client"

/**
 * Builder Card — handoff_pairing (Orayon Uplift, Onda 2)
 *
 * FUSÃO de qualification_action + qualification_steps + team_structure +
 * handoff_pairing num único card de 4 seções. Define COMO o agente passa o
 * atendimento para um humano:
 *   1. MODO — solo / roleta / departamentos / nenhum (radio, idioma do
 *      qualification-action-card).
 *   2. ROSTER — só quando mode ∈ {roleta, departamentos}: departamento
 *      (nome + tipo com chips presets) + linhas de membro (nome + WhatsApp
 *      E.164-BR + reordenar + remover), portado do team-structure-card.
 *   3. ROTEIRO — lista ordenável de perguntas de qualificação, portada do
 *      qualification-steps-card (adicionar/remover/reordenar, cap MAX_STEPS).
 *   4. AGENDA + ABERTURA — Switch "também marca na agenda" + Textarea da
 *      mensagem de abertura do warm transfer.
 *
 * PRESENTACIONAL: lê seu slice de `value.handoff` e, no confirm, dispara
 * `onSubmit(payload)` UP para o chat-panel (que detém POST + SSE). NUNCA faz
 * fetch. 100% token-driven (sem cor hard-coded). `disabled` herdado bloqueia
 * tudo.
 *
 * Contrato: cardKey 'handoff_pairing' → builderState.handoff →
 *           confirmations.handoff. Schema canônico: handoffStateSchema em
 *           src/server/ai-module/builder/cards/builder-state.ts.
 */

import * as React from "react"
import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  Headset,
  Plus,
  Users,
  X,
} from "lucide-react"

import { useQuery } from "@tanstack/react-query"
import { orpc } from "@/orpc/client"
import { Input } from "@/client/components/ui/input"
import { Switch } from "@/client/components/ui/switch"
import { Textarea } from "@/client/components/ui/textarea"
import type { HandoffMode } from "@/server/ai-module/builder/cards/builder-state"

import { CardShell } from "./card-shell"
import { isValidBrE164, normalizeBrPhone } from "./phone-br"
import type { CardComponentProps } from "./types"

/** The exact submit payload for cardKey 'handoff_pairing'. */
export interface HandoffPayload {
  mode: "solo" | "roleta" | "departamentos" | "nenhum"
  alsoSchedule: boolean
  steps: string[]
  departmentName?: string
  departmentType?: string
  members: Array<{
    userId?: string
    name?: string
    whatsapp?: string
    connectionId?: string
    position: number
  }>
  openingMessage?: string
}

/** Upper bound (~10 perguntas antes do handoff) — espelha o qualification-steps-card. */
const MAX_STEPS = 10

/** Default da mensagem de abertura do warm transfer (espelha warm-transfer.ts). */
const DEFAULT_OPENING_MESSAGE =
  "Olá! Aqui é {nome}, vou continuar seu atendimento por aqui. 👋"

/** One selectable mode in the single-choice list (idioma do qualification-action-card). */
interface ModeOption {
  value: HandoffPayload["mode"]
  title: string
  description: string
  recommended?: boolean
}

const MODE_OPTIONS: readonly ModeOption[] = [
  {
    value: "solo",
    title: "Eu mesmo atendo",
    description: "O bot pausa e me avisa no meu WhatsApp para eu assumir.",
    recommended: true,
  },
  {
    value: "roleta",
    title: "Equipe em rodízio",
    description: "Round-robin entre atendentes — cada lead vai para o próximo da fila.",
  },
  {
    value: "departamentos",
    title: "A IA tria por assunto",
    description: "A IA identifica o tema e encaminha ao departamento certo.",
  },
  {
    value: "nenhum",
    title: "Só conversa",
    description: "O agente só conversa — não passa o atendimento para humano.",
  },
] as const

/** Modos que exigem o roster (departamento + membros). */
function modeNeedsRoster(mode: HandoffPayload["mode"] | undefined): boolean {
  return mode === "roleta" || mode === "departamentos"
}

/** Chips de tipo de departamento (ainda editável como texto livre). */
const DEPARTMENT_TYPE_PRESETS: { value: string; label: string }[] = [
  { value: "sales", label: "Vendas" },
  { value: "support", label: "Suporte" },
  { value: "scheduling", label: "Agendamento" },
  { value: "financial", label: "Financeiro" },
]

/** Valor da opção default do picker de instância (vazio → connectionId undefined). */
const NO_CONNECTION_VALUE = "__none__"

/** Uma instância WhatsApp atribuível (warm transfer). */
interface ConnectionRow {
  id: string
  name: string | null
  phoneNumber: string | null
  status: string | null
}


/** Desembrulha o envelope oRPC ({ data: { connections } } OU { connections }). */
function readConnections(
  raw:
    | { connections?: ConnectionRow[] }
    | { data?: { connections?: ConnectionRow[] } }
    | undefined,
): ConnectionRow[] {
  if (!raw || typeof raw !== "object") return []
  const inner = (raw as { data?: { connections?: ConnectionRow[] } }).data
  if (inner && Array.isArray(inner.connections)) return inner.connections
  const flat = (raw as { connections?: ConnectionRow[] }).connections
  return Array.isArray(flat) ? flat : []
}

/** Label da instância no `<select>`: "nome (telefone)" ou só "nome". */
function connectionLabel(c: ConnectionRow): string {
  const name = c.name?.trim() || "WhatsApp"
  const phone = c.phoneNumber?.trim()
  return phone ? `${name} (${phone})` : name
}

/**
 * Status em que a instância consegue ENVIAR (pré-requisito do warm transfer).
 * Só instâncias conectáveis ficam selecionáveis — atribuir uma caída faria o
 * warm transfer cair em send_failed silencioso (o cliente nunca receberia a
 * abertura). Case-insensitive.
 */
const CONNECTABLE_STATUSES = new Set(["CONNECTED", "ACTIVE", "READY"])

function isConnectable(status: string | null): boolean {
  return !!status && CONNECTABLE_STATUSES.has(status.toUpperCase())
}

/** Dica curta de status (pt-BR) para instâncias não-conectáveis no `<select>`. */
function statusHint(status: string | null): string {
  switch ((status ?? "").toUpperCase()) {
    case "DISCONNECTED":
      return "desconectado"
    case "CONNECTING":
    case "QR_PENDING":
    case "PENDING":
      return "conectando"
    case "ERROR":
      return "com erro"
    default:
      return "indisponível"
  }
}

/** Linha de membro do roster — id estável para keys React entre reordenações. */
interface MemberRow {
  id: string
  userId?: string
  /** Connection.id da instância WhatsApp própria do membro (warm transfer F0). */
  connectionId?: string
  name: string
  /** Telefone bruto digitado (não normalizado) — normalizamos só no submit. */
  whatsapp: string
}

/** Linha do roteiro de qualificação — id estável para keys React. */
interface StepRow {
  id: string
  text: string
}

let memberSeq = 0
function nextMemberId(): string {
  memberSeq += 1
  return `handoff-member-${memberSeq}`
}

let stepSeq = 0
function makeStepRow(text: string): StepRow {
  stepSeq += 1
  return { id: `handoff-step-${stepSeq}`, text }
}

/**
 * Retorna `true` quando a linha tem um WhatsApp digitado que NÃO normaliza para
 * um E.164-BR válido. Linha sem telefone (vazio) nunca é inválida — opcional.
 */
function rowHasInvalidPhone(row: MemberRow): boolean {
  const raw = row.whatsapp.trim()
  if (raw.length === 0) return false
  const normalized = normalizeBrPhone(raw)
  return normalized === null || !isValidBrE164(normalized)
}

/**
 * HandoffCard — modo do handoff + roster (roleta/departamentos) + roteiro de
 * qualificação + agenda/abertura, num único CardShell de 4 seções.
 */
export function HandoffCard({
  value,
  disabled = false,
  onSubmit,
  tokens,
}: CardComponentProps<HandoffPayload>) {
  const handoff = value.handoff

  // ── Seção 1: modo ────────────────────────────────────────────────────────
  const [mode, setMode] = React.useState<HandoffPayload["mode"] | undefined>(
    handoff.mode,
  )

  // ── Seção 2: roster (departamento + membros) ─────────────────────────────
  const [departmentName, setDepartmentName] = React.useState<string>(
    handoff.departmentName ?? "",
  )
  const [departmentType, setDepartmentType] = React.useState<string>(
    handoff.departmentType ?? "",
  )
  const [memberRows, setMemberRows] = React.useState<MemberRow[]>(() =>
    [...handoff.members]
      .sort((a, b) => a.position - b.position)
      .map((member) => ({
        id: nextMemberId(),
        userId: member.userId,
        connectionId: member.connectionId,
        name: member.name ?? "",
        whatsapp: member.whatsapp ?? "",
      })),
  )
  /** Mensagem de erro de validação (telefone que não normaliza). */
  const [phoneError, setPhoneError] = React.useState<string | null>(null)

  // ── Seção 3: roteiro de qualificação ─────────────────────────────────────
  const [stepRows, setStepRows] = React.useState<StepRow[]>(() => {
    const seeds = handoff.steps.filter((step) => step.trim().length > 0)
    return seeds.length > 0 ? seeds.map(makeStepRow) : [makeStepRow("")]
  })
  const [dragStepId, setDragStepId] = React.useState<string | null>(null)

  // ── Seção 4: agenda + abertura ───────────────────────────────────────────
  const [alsoSchedule, setAlsoSchedule] = React.useState<boolean>(
    handoff.alsoSchedule,
  )
  const [openingMessage, setOpeningMessage] = React.useState<string>(
    handoff.openingMessage ?? DEFAULT_OPENING_MESSAGE,
  )

  const needsRoster = modeNeedsRoster(mode)

  // ── Instâncias WhatsApp disponíveis (warm transfer) ──────────────────────
  // oRPC + TanStack Query; leitura defensiva do envelope em readConnections.
  const connectionsQuery = useQuery(orpc.builder.listConnections.queryOptions())
  const connections = readConnections(connectionsQuery.data)

  // ── Mutadores do roster ──────────────────────────────────────────────────
  const updateMemberName = React.useCallback((id: string, name: string) => {
    setMemberRows((current) =>
      current.map((row) => (row.id === id ? { ...row, name } : row)),
    )
  }, [])

  const updateMemberConnection = React.useCallback(
    (id: string, rawValue: string) => {
      const connectionId =
        rawValue && rawValue !== NO_CONNECTION_VALUE ? rawValue : undefined
      setMemberRows((current) =>
        current.map((row) => (row.id === id ? { ...row, connectionId } : row)),
      )
    },
    [],
  )

  const updateMemberPhone = React.useCallback((id: string, whatsapp: string) => {
    setMemberRows((current) =>
      current.map((row) => (row.id === id ? { ...row, whatsapp } : row)),
    )
    setPhoneError(null)
  }, [])

  const addMember = React.useCallback(() => {
    setMemberRows((current) => [
      ...current,
      { id: nextMemberId(), name: "", whatsapp: "" },
    ])
  }, [])

  const removeMember = React.useCallback((id: string) => {
    setMemberRows((current) => current.filter((row) => row.id !== id))
    setPhoneError(null)
  }, [])

  const moveMember = React.useCallback((index: number, direction: -1 | 1) => {
    setMemberRows((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
  }, [])

  // ── Mutadores do roteiro ─────────────────────────────────────────────────
  const updateStep = React.useCallback((id: string, text: string) => {
    setStepRows((current) =>
      current.map((row) => (row.id === id ? { ...row, text } : row)),
    )
  }, [])

  const removeStep = React.useCallback((id: string) => {
    setStepRows((current) => {
      const next = current.filter((row) => row.id !== id)
      // Nunca colapsa para lista vazia — mantém uma linha editável.
      return next.length > 0 ? next : [makeStepRow("")]
    })
  }, [])

  const addStep = React.useCallback(() => {
    setStepRows((current) =>
      current.length >= MAX_STEPS ? current : [...current, makeStepRow("")],
    )
  }, [])

  const moveStep = React.useCallback((index: number, delta: -1 | 1) => {
    setStepRows((current) => {
      const target = index + delta
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
  }, [])

  const reorderStep = React.useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return
    setStepRows((current) => {
      const from = current.findIndex((row) => row.id === fromId)
      const to = current.findIndex((row) => row.id === toId)
      if (from < 0 || to < 0) return current
      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  // ── Derivados ────────────────────────────────────────────────────────────
  const cleanedSteps = React.useMemo(
    () =>
      stepRows.map((row) => row.text.trim()).filter((text) => text.length > 0),
    [stepRows],
  )

  const filledMemberCount = memberRows.filter(
    (row) => row.name.trim().length > 0 || row.userId,
  ).length
  const hasInvalidPhone = memberRows.some(rowHasInvalidPhone)

  // Modos com roster exigem ao menos um membro válido; solo/nenhum não exigem.
  const rosterOk = needsRoster ? filledMemberCount > 0 : true
  const canConfirm =
    !disabled && mode !== undefined && rosterOk && !hasInvalidPhone

  // ── Confirm ──────────────────────────────────────────────────────────────
  const buildPayload = React.useCallback((): HandoffPayload => {
    const payload: HandoffPayload = {
      mode: mode as HandoffPayload["mode"],
      alsoSchedule,
      steps: cleanedSteps,
      members: [],
    }

    // Roster só viaja quando o modo precisa dele.
    if (modeNeedsRoster(mode)) {
      const members = memberRows
        // Descarta slots vazios (sem nome E sem userId) — nunca submete em branco.
        .filter((row) => row.name.trim().length > 0 || row.userId)
        .map((row, index) => {
          const member: {
            userId?: string
            name?: string
            whatsapp?: string
            connectionId?: string
            position: number
          } = { position: index }
          const trimmedName = row.name.trim()
          if (trimmedName.length > 0) member.name = trimmedName
          if (row.userId) member.userId = row.userId
          if (row.connectionId) member.connectionId = row.connectionId
          // WhatsApp só entra se digitado E normalizar para um E.164-BR válido.
          const normalizedPhone = normalizeBrPhone(row.whatsapp.trim())
          if (normalizedPhone && isValidBrE164(normalizedPhone)) {
            member.whatsapp = normalizedPhone
          }
          return member
        })
      payload.members = members

      const trimmedDeptName = departmentName.trim()
      const trimmedDeptType = departmentType.trim()
      if (trimmedDeptName.length > 0) payload.departmentName = trimmedDeptName
      if (trimmedDeptType.length > 0) payload.departmentType = trimmedDeptType
    }

    const trimmedOpening = openingMessage.trim()
    if (trimmedOpening.length > 0) payload.openingMessage = trimmedOpening

    return payload
  }, [
    alsoSchedule,
    cleanedSteps,
    departmentName,
    departmentType,
    memberRows,
    mode,
    openingMessage,
  ])

  const handleConfirm = React.useCallback(() => {
    if (disabled || mode === undefined) return
    // Roster: bloqueia e aponta a primeira linha com telefone inválido.
    if (modeNeedsRoster(mode)) {
      const invalid = memberRows.find(rowHasInvalidPhone)
      if (invalid) {
        setPhoneError(
          `WhatsApp inválido: "${invalid.whatsapp.trim()}". Use DDD + número (ex.: 11 99999-9999).`,
        )
        return
      }
    }
    setPhoneError(null)
    onSubmit(buildPayload())
  }, [buildPayload, disabled, memberRows, mode, onSubmit])

  // ── Estilos compartilhados ───────────────────────────────────────────────
  const labelStyle: React.CSSProperties = { color: tokens.textSecondary }
  const stepInputStyle: React.CSSProperties = {
    backgroundColor: tokens.bgBase,
    borderColor: tokens.divider,
    color: tokens.textPrimary,
  }
  const stepIconBtnBase =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40"

  const canAddStep = stepRows.length < MAX_STEPS && !disabled

  return (
    <CardShell
      icon={<Headset className="h-4 w-4" />}
      title="Passagem para humano"
      reason="Defina como o agente passa o atendimento para uma pessoa: quem recebe, o que perguntar antes e se também marca na agenda."
      tokens={tokens}
      // FR-20 (jornada-builder-v2) — passo OBRIGATÓRIO: sem "Agora não"/dismiss.
      // Quem não quer handoff escolhe o modo "Só conversa" e confirma.
      actions={[
        {
          label: "Confirmar",
          onClick: handleConfirm,
          variant: "primary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled: !canConfirm,
        },
      ]}
    >
      <div className="flex flex-col gap-5">
        {/* ── Seção 1: MODO ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium" style={labelStyle}>
            Como o agente passa o atendimento?
          </span>
          <div
            className="grid gap-2"
            role="radiogroup"
            aria-label="Modo de passagem para humano"
          >
            {MODE_OPTIONS.map((option) => {
              const isSelected = mode === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={disabled}
                  className="rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    backgroundColor: isSelected
                      ? tokens.brandSubtle
                      : tokens.bgBase,
                    borderColor: isSelected
                      ? tokens.brandBorder
                      : tokens.divider,
                  }}
                  onClick={() => setMode(option.value)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                      style={{
                        backgroundColor: isSelected ? tokens.brand : "transparent",
                        borderColor: isSelected
                          ? tokens.brand
                          : tokens.borderStrong,
                        color: tokens.textInverse,
                      }}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="text-[13px] font-medium"
                          style={{ color: tokens.textPrimary }}
                        >
                          {option.title}
                        </span>
                        {option.recommended && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{
                              backgroundColor: tokens.successSubtle,
                              color: tokens.successText,
                            }}
                          >
                            recomendado
                          </span>
                        )}
                      </div>
                      <p
                        className="mt-1 text-[12px] leading-relaxed"
                        style={{ color: tokens.textSecondary }}
                      >
                        {option.description}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Seção 2: ROSTER (só roleta/departamentos) ─────────────────── */}
        {needsRoster && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Users
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: tokens.textSecondary }}
                aria-hidden="true"
              />
              <span className="text-[11px] font-medium" style={labelStyle}>
                Departamento e equipe (ordem da roleta)
              </span>
            </div>

            {/* Identidade do departamento */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium" style={labelStyle}>
                  Nome do departamento
                </span>
                <Input
                  value={departmentName}
                  onChange={(event) => setDepartmentName(event.target.value)}
                  placeholder="Comercial"
                  disabled={disabled}
                  className="h-9 text-[13px]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium" style={labelStyle}>
                  Tipo
                </span>
                <Input
                  value={departmentType}
                  onChange={(event) => setDepartmentType(event.target.value)}
                  placeholder="vendas"
                  disabled={disabled}
                  className="h-9 text-[13px]"
                />
                <div className="flex flex-wrap gap-1.5">
                  {DEPARTMENT_TYPE_PRESETS.map((preset) => {
                    const active = departmentType.trim() === preset.value
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        disabled={disabled}
                        onClick={() => setDepartmentType(preset.value)}
                        className="rounded-md border px-2.5 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                        style={{
                          borderColor: active ? tokens.brand : tokens.border,
                          backgroundColor: active
                            ? tokens.brandSubtle
                            : tokens.bgBase,
                          color: active ? tokens.brand : tokens.textSecondary,
                        }}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Roster de membros (ordem do rodízio) */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium" style={labelStyle}>
                  Membros (ordem da roleta)
                </span>
                <span
                  className="text-[11px]"
                  style={{ color: tokens.textTertiary }}
                >
                  {filledMemberCount} no rodízio
                </span>
              </div>

              {memberRows.length === 0 ? (
                <p
                  className="rounded-md border border-dashed px-3 py-3 text-[12px]"
                  style={{
                    borderColor: tokens.divider,
                    color: tokens.textTertiary,
                  }}
                >
                  Nenhum membro ainda. Adicione quem vai receber os atendimentos.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {memberRows.map((row, index) => {
                    const invalidPhone = rowHasInvalidPhone(row)
                    return (
                      <div
                        key={row.id}
                        className="flex flex-col gap-2 rounded-md border p-2"
                        style={{
                          backgroundColor: tokens.bgBase,
                          borderColor: invalidPhone
                            ? tokens.dangerText
                            : tokens.divider,
                        }}
                      >
                       <div className="flex items-center gap-2">
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold"
                          style={{
                            backgroundColor: tokens.brandSubtle,
                            color: tokens.brand,
                          }}
                          aria-hidden="true"
                        >
                          {index + 1}
                        </div>
                        <GripVertical
                          className="h-4 w-4 shrink-0"
                          style={{ color: tokens.textTertiary }}
                          aria-hidden="true"
                        />
                        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                          <Input
                            value={row.name}
                            onChange={(event) =>
                              updateMemberName(row.id, event.target.value)
                            }
                            placeholder={`Membro ${index + 1}`}
                            disabled={disabled}
                            className="h-8 text-[13px]"
                            aria-label={`Nome do membro na posição ${index + 1}`}
                          />
                          <Input
                            value={row.whatsapp}
                            onChange={(event) =>
                              updateMemberPhone(row.id, event.target.value)
                            }
                            placeholder="+55 11 99999-9999"
                            disabled={disabled}
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            aria-label={`WhatsApp do membro na posição ${index + 1} (opcional)`}
                            aria-invalid={invalidPhone || undefined}
                            className="h-8 text-[13px]"
                          />
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            disabled={disabled || index === 0}
                            onClick={() => moveMember(index, -1)}
                            aria-label="Subir na ordem"
                            className="flex h-7 w-7 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                            style={{
                              borderColor: tokens.divider,
                              color: tokens.textSecondary,
                            }}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={disabled || index === memberRows.length - 1}
                            onClick={() => moveMember(index, 1)}
                            aria-label="Descer na ordem"
                            className="flex h-7 w-7 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                            style={{
                              borderColor: tokens.divider,
                              color: tokens.textSecondary,
                            }}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => removeMember(row.id)}
                            aria-label="Remover membro"
                            className="flex h-7 w-7 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                            style={{
                              borderColor: tokens.divider,
                              color: tokens.dangerText,
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                       </div>

                       {/* Instância WhatsApp própria do membro (warm transfer) */}
                       <div className="flex flex-col gap-1 sm:pl-9">
                         <label
                           className="text-[11px] font-medium"
                           style={labelStyle}
                           htmlFor={`handoff-conn-${row.id}`}
                         >
                           WhatsApp próprio (warm transfer)
                         </label>
                         <select
                           id={`handoff-conn-${row.id}`}
                           value={row.connectionId ?? NO_CONNECTION_VALUE}
                           disabled={disabled}
                           onChange={(event) =>
                             updateMemberConnection(row.id, event.target.value)
                           }
                           aria-label={`Instância WhatsApp do membro na posição ${index + 1}`}
                           className="h-8 rounded-md border px-2 text-[13px] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                           style={{
                             backgroundColor: tokens.bgSurface,
                             borderColor: tokens.divider,
                             color: tokens.textPrimary,
                           }}
                         >
                           <option value={NO_CONNECTION_VALUE}>
                             Sem WhatsApp próprio (usa o número do bot)
                           </option>
                           {connections.map((connection) => {
                             const connectable = isConnectable(connection.status)
                             return (
                               <option
                                 key={connection.id}
                                 value={connection.id}
                                 disabled={!connectable}
                               >
                                 {connectionLabel(connection)}
                                 {connectable
                                   ? ""
                                   : ` — ${statusHint(connection.status)}`}
                               </option>
                             )
                           })}
                         </select>
                       </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {connections.length === 0 && (
                <p
                  className="text-[12px] leading-relaxed"
                  style={{ color: tokens.textTertiary }}
                >
                  Nenhuma instância WhatsApp encontrada. Crie uma para cada
                  atendente (peça ao assistente: &ldquo;crie uma instância para o
                  João&rdquo;) e volte aqui para atribuir.
                </p>
              )}

              <p
                className="text-[11px] leading-relaxed"
                style={{ color: tokens.textTertiary }}
              >
                ⚠️ No warm transfer o cliente passa a receber mensagem do número
                do atendente — garanta a base legal (LGPD).
              </p>

              {phoneError != null && (
                <p
                  role="alert"
                  className="text-[12px] leading-relaxed"
                  style={{ color: tokens.dangerText }}
                >
                  {phoneError}
                </p>
              )}

              <button
                type="button"
                disabled={disabled}
                onClick={addMember}
                className="flex items-center justify-center gap-1.5 rounded-md border border-dashed px-3 py-2 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  borderColor: tokens.divider,
                  color: tokens.textSecondary,
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar membro
              </button>
            </div>
          </div>
        )}

        {/* ── Seção 3: ROTEIRO DE QUALIFICAÇÃO ──────────────────────────── */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium" style={labelStyle}>
            Perguntas antes de passar o atendimento
          </span>
          <div className="flex flex-col gap-2">
            {stepRows.map((row, index) => {
              const isDragging = dragStepId === row.id
              return (
                <div
                  key={row.id}
                  className="flex items-center gap-2 rounded-md transition-opacity"
                  style={{ opacity: isDragging ? 0.5 : 1 }}
                  onDragOver={(event) => {
                    if (dragStepId && dragStepId !== row.id)
                      event.preventDefault()
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    if (dragStepId) reorderStep(dragStepId, row.id)
                    setDragStepId(null)
                  }}
                >
                  <button
                    type="button"
                    draggable={!disabled}
                    onDragStart={() => setDragStepId(row.id)}
                    onDragEnd={() => setDragStepId(null)}
                    disabled={disabled}
                    aria-label={`Arrastar para reordenar pergunta ${index + 1}`}
                    className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ color: tokens.textTertiary }}
                  >
                    <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>

                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold"
                    style={{
                      backgroundColor: tokens.brandSubtle,
                      color: tokens.brand,
                    }}
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>

                  <input
                    type="text"
                    value={row.text}
                    disabled={disabled}
                    onChange={(event) => updateStep(row.id, event.target.value)}
                    placeholder={`Pergunta ${index + 1} (ex.: "Qual o tamanho da sua empresa?")`}
                    aria-label={`Pergunta de qualificação ${index + 1}`}
                    className="h-9 w-full min-w-0 rounded-md border px-3 text-[13px] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                    style={stepInputStyle}
                  />

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={disabled || index === 0}
                      onClick={() => moveStep(index, -1)}
                      aria-label={`Subir pergunta ${index + 1}`}
                      className={stepIconBtnBase}
                      style={{
                        backgroundColor: tokens.bgBase,
                        borderColor: tokens.divider,
                        color: tokens.textSecondary,
                      }}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={disabled || index === stepRows.length - 1}
                      onClick={() => moveStep(index, 1)}
                      aria-label={`Descer pergunta ${index + 1}`}
                      className={stepIconBtnBase}
                      style={{
                        backgroundColor: tokens.bgBase,
                        borderColor: tokens.divider,
                        color: tokens.textSecondary,
                      }}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => removeStep(row.id)}
                      aria-label={`Remover pergunta ${index + 1}`}
                      className={stepIconBtnBase}
                      style={{
                        backgroundColor: tokens.bgBase,
                        borderColor: tokens.divider,
                        color: tokens.textTertiary,
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={!canAddStep}
              onClick={addStep}
              className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                backgroundColor: tokens.bgBase,
                borderColor: tokens.divider,
                color: tokens.textSecondary,
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar pergunta
            </button>
            <span className="text-[11px]" style={{ color: tokens.textTertiary }}>
              {stepRows.length}/{MAX_STEPS}
            </span>
          </div>
        </div>

        {/* ── Seção 4: AGENDA + ABERTURA ────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <label
            className="flex items-center justify-between gap-3 rounded-md border p-3"
            style={{
              backgroundColor: tokens.bgBase,
              borderColor: tokens.divider,
            }}
          >
            <span className="min-w-0 flex-1">
              <span
                className="block text-[13px] font-medium"
                style={{ color: tokens.textPrimary }}
              >
                Também marca na agenda
              </span>
              <span
                className="mt-0.5 block text-[12px] leading-relaxed"
                style={{ color: tokens.textSecondary }}
              >
                Além de passar o atendimento, o agente agenda o compromisso no
                calendário.
              </span>
            </span>
            <Switch
              checked={alsoSchedule}
              onCheckedChange={setAlsoSchedule}
              disabled={disabled}
              aria-label="Também marca na agenda"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium" style={labelStyle}>
              Mensagem de abertura
            </span>
            <Textarea
              value={openingMessage}
              onChange={(event) => setOpeningMessage(event.target.value)}
              disabled={disabled}
              rows={3}
              placeholder={DEFAULT_OPENING_MESSAGE}
              aria-label="Mensagem de abertura do atendimento humano"
              className="text-[13px]"
            />
            <span className="text-[11px]" style={{ color: tokens.textTertiary }}>
              Primeira mensagem enviada ao cliente quando o atendimento passa
              para uma pessoa. Use {"{nome}"} para o nome do atendente.
            </span>
          </div>
        </div>
      </div>
    </CardShell>
  )
}

export default HandoffCard
