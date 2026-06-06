"use client"

/**
 * Builder Cards — team_structure (Orayon Uplift, W3 + G6)
 *
 * Presentational card for the `team_structure` key. Captures the department
 * (name + type) plus the member roster in EXPLICIT round-robin order (the
 * "roleta"): each member row carries a deterministic `position`, and the order
 * the user arranges the rows in is exactly the order the agent will rotate
 * through. Backed by `Department` + `DepartmentMember`.
 *
 * G6 — WhatsApp por membro: cada linha agora coleta também o WhatsApp do membro
 * (OPCIONAL), normalizado para E.164-BR (`+55…`). É por esse número que o agente
 * notifica a pessoa quando o lead cai no rodízio dela. O campo espelha o
 * `userId` em opcionalidade: uma linha só-nome (como antes) continua válida e
 * submete normalmente — o card NÃO pode regredir.
 *
 * Members are PICKED (name + optional userId + optional whatsapp) — never
 * free-LLM. The card never fabricates members; it pre-fills from
 * `value.team.members` and lets the user add/edit/remove/reorder named slots.
 * Any `userId` (e o `whatsapp`) já presente num membro de entrada é preservado
 * por linha através de edições e reordenações.
 *
 * Pure UI: reads its slice of the canonical BuilderState (`value.team`) and
 * calls `onSubmit({ departmentName, departmentType, members })`. It does NOT
 * fetch — chat-panel owns POST + SSE.
 *
 * Contract (docs/builder/ORAYON_UPLIFT_SPEC.md):
 *   cardKey   team_structure  →  sentinel confirmations.team
 *   payload   { departmentName?: string
 *             , departmentType?: string
 *             , members: Array<{ userId?: string; name?: string
 *                              ; whatsapp?: string; position: number }> }
 */

import * as React from "react"
import { Users, Plus, X, ArrowUp, ArrowDown, Check, GripVertical } from "lucide-react"

import { Input } from "@/client/components/ui/input"
import { CardShell } from "./card-shell"
import { isValidBrE164, normalizeBrPhone } from "./phone-br"
import type { CardComponentProps } from "./types"

/** The exact submit payload for `team_structure`. */
export interface TeamStructurePayload {
  departmentName?: string
  departmentType?: string
  members: Array<{
    userId?: string
    name?: string
    whatsapp?: string
    position: number
  }>
}

/** Common department types offered as chips (still editable as free text). */
const DEPARTMENT_TYPE_PRESETS: { value: string; label: string }[] = [
  { value: "sales", label: "Vendas" },
  { value: "support", label: "Suporte" },
  { value: "scheduling", label: "Agendamento" },
  { value: "financial", label: "Financeiro" },
]

/** Local working row — keeps a stable id for React keys across reorders. */
interface MemberRow {
  id: string
  userId?: string
  name: string
  /** Telefone bruto digitado (não normalizado) — normalizamos só no submit. */
  whatsapp: string
}

let rowSeq = 0
function nextRowId(): string {
  rowSeq += 1
  return `member-${rowSeq}`
}

/**
 * Retorna `true` quando a linha tem um WhatsApp digitado que NÃO normaliza para
 * um E.164-BR válido. Linha sem telefone (vazio) nunca é inválida — o campo é
 * opcional.
 */
function rowHasInvalidPhone(row: MemberRow): boolean {
  const raw = row.whatsapp.trim()
  if (raw.length === 0) return false
  const normalized = normalizeBrPhone(raw)
  return normalized === null || !isValidBrE164(normalized)
}

/**
 * TeamStructureCard — department identity + ordered member roster (round-robin),
 * com WhatsApp opcional por membro (G6).
 */
export function TeamStructureCard({
  value,
  disabled = false,
  onSubmit,
  onDismiss,
  tokens,
}: CardComponentProps<TeamStructurePayload>) {
  const team = value.team

  const [departmentName, setDepartmentName] = React.useState<string>(
    team.departmentName ?? "",
  )
  const [departmentType, setDepartmentType] = React.useState<string>(
    team.departmentType ?? "",
  )
  const [rows, setRows] = React.useState<MemberRow[]>(() =>
    [...team.members]
      .sort((a, b) => a.position - b.position)
      .map((member) => ({
        id: nextRowId(),
        userId: member.userId,
        name: member.name ?? "",
        whatsapp: member.whatsapp ?? "",
      })),
  )
  /** Mensagem de erro de validação (telefone que não normaliza). */
  const [error, setError] = React.useState<string | null>(null)

  const updateRowName = React.useCallback((id: string, name: string) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, name } : row)),
    )
  }, [])

  const updateRowPhone = React.useCallback((id: string, whatsapp: string) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, whatsapp } : row)),
    )
    // Limpa o erro ao editar — revalidamos no confirm.
    setError(null)
  }, [])

  const addRow = React.useCallback(() => {
    setRows((current) => [...current, { id: nextRowId(), name: "", whatsapp: "" }])
  }, [])

  const removeRow = React.useCallback((id: string) => {
    setRows((current) => current.filter((row) => row.id !== id))
    setError(null)
  }, [])

  const moveRow = React.useCallback((index: number, direction: -1 | 1) => {
    setRows((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
  }, [])

  const buildPayload = React.useCallback((): TeamStructurePayload => {
    const members = rows
      // Drop empty slots (no name AND no linked user) so we never submit blanks.
      // Uma linha só-telefone sem nome e sem userId ainda é "vazia" de membro —
      // segue a regra original (precisa de nome ou userId para entrar no roster).
      .filter((row) => row.name.trim().length > 0 || row.userId)
      .map((row, index) => {
        const member: {
          userId?: string
          name?: string
          whatsapp?: string
          position: number
        } = {
          position: index,
        }
        const trimmedName = row.name.trim()
        if (trimmedName.length > 0) member.name = trimmedName
        if (row.userId) member.userId = row.userId
        // WhatsApp só entra se digitado E normalizar para um E.164-BR válido.
        const normalizedPhone = normalizeBrPhone(row.whatsapp.trim())
        if (normalizedPhone && isValidBrE164(normalizedPhone)) {
          member.whatsapp = normalizedPhone
        }
        return member
      })

    const payload: TeamStructurePayload = { members }
    const trimmedName = departmentName.trim()
    const trimmedType = departmentType.trim()
    if (trimmedName.length > 0) payload.departmentName = trimmedName
    if (trimmedType.length > 0) payload.departmentType = trimmedType
    return payload
  }, [departmentName, departmentType, rows])

  const handleConfirm = React.useCallback(() => {
    // Bloqueia e aponta a primeira linha com telefone inválido.
    const invalid = rows.find(rowHasInvalidPhone)
    if (invalid) {
      setError(
        `WhatsApp inválido: "${invalid.whatsapp.trim()}". Use DDD + número (ex.: 11 99999-9999).`,
      )
      return
    }
    setError(null)
    onSubmit(buildPayload())
  }, [buildPayload, onSubmit, rows])

  const filledMemberCount = rows.filter(
    (row) => row.name.trim().length > 0 || row.userId,
  ).length
  const hasInvalidPhone = rows.some(rowHasInvalidPhone)
  // Telefone vazio é permitido (campo opcional, espelha o userId opcional);
  // só barramos quando há ao menos um membro válido E nenhum telefone inválido.
  const canConfirm = !disabled && filledMemberCount > 0 && !hasInvalidPhone

  const labelStyle = { color: tokens.textSecondary }

  return (
    <CardShell
      icon={<Users className="h-4 w-4" />}
      title="Estrutura da equipe"
      reason="Defina o departamento e a ordem da roleta — os atendimentos serão distribuídos em rodízio, na ordem em que os membros aparecem aqui. Informe o WhatsApp de cada um para receber o aviso quando o lead cair no rodízio dele (opcional)."
      tokens={tokens}
      actions={[
        {
          label: "Confirmar equipe",
          onClick: handleConfirm,
          variant: "primary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled: !canConfirm,
        },
        ...(onDismiss
          ? [
              {
                label: "Agora não",
                onClick: onDismiss,
                variant: "secondary" as const,
                disabled,
              },
            ]
          : []),
      ]}
    >
      <div className="flex flex-col gap-4">
        {/* Department identity */}
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
                      backgroundColor: active ? tokens.brandSubtle : tokens.bgBase,
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

        {/* Member roster (round-robin order) */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium" style={labelStyle}>
              Membros (ordem da roleta)
            </span>
            <span className="text-[11px]" style={{ color: tokens.textTertiary }}>
              {filledMemberCount} no rodízio
            </span>
          </div>

          {rows.length === 0 ? (
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
              {rows.map((row, index) => {
                const invalidPhone = rowHasInvalidPhone(row)
                return (
                  <div
                    key={row.id}
                    className="flex items-center gap-2 rounded-md border p-2"
                    style={{
                      backgroundColor: tokens.bgBase,
                      borderColor: invalidPhone ? tokens.dangerText : tokens.divider,
                    }}
                  >
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
                    {/* nome | whatsapp — 2 colunas + coluna de botões */}
                    <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                      <Input
                        value={row.name}
                        onChange={(event) => updateRowName(row.id, event.target.value)}
                        placeholder={`Membro ${index + 1}`}
                        disabled={disabled}
                        className="h-8 text-[13px]"
                        aria-label={`Nome do membro na posição ${index + 1}`}
                      />
                      <Input
                        value={row.whatsapp}
                        onChange={(event) => updateRowPhone(row.id, event.target.value)}
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
                        onClick={() => moveRow(index, -1)}
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
                        disabled={disabled || index === rows.length - 1}
                        onClick={() => moveRow(index, 1)}
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
                        onClick={() => removeRow(row.id)}
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
                )
              })}
            </div>
          )}

          {error != null && (
            <p
              role="alert"
              className="text-[12px] leading-relaxed"
              style={{ color: tokens.dangerText }}
            >
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={disabled}
            onClick={addRow}
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
    </CardShell>
  )
}

export default TeamStructureCard
