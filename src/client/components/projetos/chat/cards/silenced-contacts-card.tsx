"use client"

/**
 * Builder Cards — Silenced Contacts (Orayon Uplift, G1 — OPTIONAL step)
 *
 * cardKey `silenced_contacts`. Collects the contacts the agent must NEVER answer
 * automatically (sócio, fornecedor, família, o próprio número do profissional):
 * quando uma dessas pessoas escreve, o agente fica em silêncio e o humano
 * responde normalmente no WhatsApp.
 *
 * This step is FULLY OPTIONAL (mirrors `source_ingestion`): it never blocks the
 * journey nor `isDeployReady`. It only surfaces when activation = "atende todos,
 * menos bloqueados" (`all_except_blacklist`). The two footer actions BOTH ack the
 * step:
 *   - "Confirmar e seguir"  → onSubmit({ contacts: [...], acknowledged: true })
 *   - "Não tenho ninguém"   → onSubmit({ contacts: [],    acknowledged: true })
 * An empty list is valid (espelha o `source_progress accept:true`).
 *
 * PRESENTATIONAL ONLY: pre-fills from the canonical BuilderState, blocks while
 * `props.disabled`, normalizes/dedupes phones to E.164-BR locally (parity with
 * the backend `normalizeWhatsappBr`) and fires `onSubmit` UP — it NEVER fetches
 * (chat-panel owns POST + SSE).
 *
 * Contract: docs/builder/ORAYON_UPLIFT_SPEC.md (card catalog, G1).
 */

import * as React from "react"
import { Check, MessageCircleOff, Plus, ShieldOff, UserRound, X } from "lucide-react"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"
import { isValidBrE164, normalizeBrPhone } from "./phone-br"

/**
 * The submit payload this card produces. Mirrors `silencedContactsPayloadSchema`
 * minus its `cardKey` discriminator (chat-panel attaches/owns the route key).
 * `acknowledged` is ALWAYS `true`: both "confirmar" and "não tenho ninguém"
 * acknowledge the step — an empty `contacts` list is valid.
 */
export type SilencedContactsCardPayload = {
  contacts: Array<{ name?: string; whatsapp: string }>
  acknowledged: true
}

/** Hard cap — mirrors the backend `.max(50)` on the contacts array. */
const MAX_CONTACTS = 50

/** Local working row — stable id keeps React keys steady across edits/removals. */
interface ContactRow {
  id: string
  name: string
  phoneRaw: string
}

/** Stable id for a fresh row (crypto.randomUUID with a Math.random fallback). */
function nextRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

function newRow(): ContactRow {
  return { id: nextRowId(), name: "", phoneRaw: "" }
}

/**
 * Read the persisted silenced-contact rows off the canonical BuilderState WITHOUT
 * assuming the `silencedContacts` leaf already exists on the `BuilderState` type.
 * The leaf lands via the Integrate pass (builder-state.ts); reading it defensively
 * keeps this card compiling whatever the merge order. Returns the persisted
 * `{ name?, whatsapp }[]` (already E.164 from the server) or `[]`.
 */
function readPersistedContacts(
  value: CardComponentProps<SilencedContactsCardPayload>["value"],
): Array<{ name?: string; whatsapp: string }> {
  const slice = (value as { silencedContacts?: unknown }).silencedContacts
  if (slice == null || typeof slice !== "object") return []
  const contacts = (slice as { contacts?: unknown }).contacts
  if (!Array.isArray(contacts)) return []

  const out: Array<{ name?: string; whatsapp: string }> = []
  for (const item of contacts) {
    if (item == null || typeof item !== "object") continue
    const whatsapp = (item as { whatsapp?: unknown }).whatsapp
    if (typeof whatsapp !== "string" || whatsapp.length === 0) continue
    const name = (item as { name?: unknown }).name
    out.push(
      typeof name === "string" && name.trim().length > 0
        ? { name: name.trim(), whatsapp }
        : { whatsapp },
    )
  }
  return out
}

/** Build the seed rows from persisted contacts, always leaving ≥1 editable row. */
function seedRows(
  value: CardComponentProps<SilencedContactsCardPayload>["value"],
): ContactRow[] {
  const persisted = readPersistedContacts(value)
  if (persisted.length === 0) return [newRow()]
  return persisted.map((contact) => ({
    id: nextRowId(),
    name: contact.name ?? "",
    phoneRaw: contact.whatsapp,
  }))
}

/**
 * SilencedContactsCard — grid of [Nome (opcional) | WhatsApp | remover] rows plus
 * an "Exemplo" explainer. Two footer actions, both acknowledging the optional
 * step. Phones are normalized + deduped to E.164-BR at submit time.
 */
export function SilencedContactsCard({
  value,
  disabled = false,
  onSubmit,
  tokens,
}: CardComponentProps<SilencedContactsCardPayload>) {
  const [rows, setRows] = React.useState<ContactRow[]>(() => seedRows(value))
  const [error, setError] = React.useState<string | null>(null)

  const updateRow = React.useCallback(
    (id: string, field: "name" | "phoneRaw", raw: string) => {
      setRows((current) =>
        current.map((row) => (row.id === id ? { ...row, [field]: raw } : row)),
      )
      setError(null)
    },
    [],
  )

  const addRow = React.useCallback(() => {
    setRows((current) => {
      if (current.length >= MAX_CONTACTS) {
        setError(`Limite de ${MAX_CONTACTS} contatos atingido.`)
        return current
      }
      setError(null)
      return [...current, newRow()]
    })
  }, [])

  const removeRow = React.useCallback((id: string) => {
    // Keep at least one editable row so the grid never collapses to nothing.
    setRows((current) =>
      current.length === 1 ? [newRow()] : current.filter((row) => row.id !== id),
    )
    setError(null)
  }, [])

  // Rows with a phone typed in — empty rows are ignored (the user may have added
  // an extra slot and left it blank).
  const filledRows = React.useMemo(
    () => rows.filter((row) => row.phoneRaw.trim().length > 0),
    [rows],
  )

  // A filled row is invalid when its phone won't normalize to a valid E.164.
  const hasInvalidPhone = React.useMemo(
    () =>
      filledRows.some((row) => {
        const normalized = normalizeBrPhone(row.phoneRaw)
        return normalized === null || !isValidBrE164(normalized)
      }),
    [filledRows],
  )

  /**
   * Normalize + dedupe filled rows into the submit payload contacts. Returns null
   * (and sets `error`) if any filled row carries an invalid phone — the caller
   * aborts the submit in that case.
   */
  const buildContacts = React.useCallback(():
    | Array<{ name?: string; whatsapp: string }>
    | null => {
    const seen = new Set<string>()
    const out: Array<{ name?: string; whatsapp: string }> = []
    for (const row of filledRows) {
      const normalized = normalizeBrPhone(row.phoneRaw)
      if (normalized === null || !isValidBrE164(normalized)) {
        setError(
          `Número inválido: "${row.phoneRaw.trim()}". Use DDD + número, ex.: 11 99999-9999.`,
        )
        return null
      }
      if (seen.has(normalized)) continue
      seen.add(normalized)
      const name = row.name.trim()
      out.push(name.length > 0 ? { name, whatsapp: normalized } : { whatsapp: normalized })
    }
    return out.slice(0, MAX_CONTACTS)
  }, [filledRows])

  const handleConfirm = React.useCallback(() => {
    if (disabled) return
    const contacts = buildContacts()
    if (contacts === null) return
    onSubmit({ contacts, acknowledged: true })
  }, [buildContacts, disabled, onSubmit])

  const handleNobody = React.useCallback(() => {
    if (disabled) return
    onSubmit({ contacts: [], acknowledged: true })
  }, [disabled, onSubmit])

  // "Confirmar" requires ≥1 valid filled row; the empty case goes through the
  // secondary "Não tenho ninguém" action instead.
  const canConfirm = !disabled && !hasInvalidPhone && filledRows.length > 0

  const labelStyle = { color: tokens.textTertiary }

  return (
    <CardShell
      icon={<ShieldOff className="h-4 w-4" />}
      title="Contatos em silêncio"
      reason="Algum contato que o agente deve deixar em silêncio (sócio, fornecedor, família)? Quando essa pessoa escrever, o agente não responde — você conversa normalmente. É opcional."
      tokens={tokens}
      actions={[
        {
          label: "Confirmar e seguir",
          onClick: handleConfirm,
          variant: "primary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled: !canConfirm,
        },
        {
          label: "Não tenho ninguém",
          onClick: handleNobody,
          variant: "secondary",
          disabled,
        },
      ]}
    >
      <div className="flex flex-col gap-4">
        {/* Exemplo — fornecedor → agente em silêncio → você responde. O chip do
            meio usa os tokens warningSubtle/warningText (NUNCA amber hard-coded). */}
        <div
          className="rounded-md border p-3"
          style={{ backgroundColor: tokens.bgBase, borderColor: tokens.divider }}
        >
          <div
            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: tokens.textTertiary }}
          >
            <MessageCircleOff className="h-3.5 w-3.5" aria-hidden="true" />
            Exemplo
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12px] font-medium">
            <span
              className="rounded-md border px-2.5 py-1.5"
              style={{
                backgroundColor: tokens.bgSurface,
                borderColor: tokens.divider,
                color: tokens.textSecondary,
              }}
            >
              Fornecedor manda mensagem
            </span>
            <span aria-hidden="true" style={{ color: tokens.textTertiary }}>
              →
            </span>
            <span
              className="rounded-md border px-2.5 py-1.5"
              style={{
                backgroundColor: tokens.warningSubtle,
                borderColor: tokens.warning,
                color: tokens.warningText,
              }}
            >
              Agente fica em silêncio
            </span>
            <span aria-hidden="true" style={{ color: tokens.textTertiary }}>
              →
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5"
              style={{
                backgroundColor: tokens.bgSurface,
                borderColor: tokens.divider,
                color: tokens.textPrimary,
              }}
            >
              <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
              Você responde
            </span>
          </div>
        </div>

        {/* Contact rows: [Nome (opcional) | WhatsApp | remover] */}
        <div className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <div
              key={row.id}
              className="grid items-end gap-2 md:grid-cols-[1fr_minmax(0,200px)_auto]"
            >
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] font-medium" style={labelStyle}>
                  Nome (opcional)
                </span>
                <input
                  type="text"
                  value={row.name}
                  disabled={disabled}
                  placeholder={`Contato ${index + 1}`}
                  onChange={(event) =>
                    updateRow(row.id, "name", event.target.value.slice(0, 120))
                  }
                  className="flex h-9 w-full rounded-md border px-3 py-1 text-[13px] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    backgroundColor: tokens.bgBase,
                    borderColor: tokens.divider,
                    color: tokens.textPrimary,
                  }}
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] font-medium" style={labelStyle}>
                  WhatsApp
                </span>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={row.phoneRaw}
                  disabled={disabled}
                  placeholder="+55 11 99999-9999"
                  onChange={(event) =>
                    updateRow(row.id, "phoneRaw", event.target.value)
                  }
                  className="flex h-9 w-full rounded-md border px-3 py-1 text-[13px] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    backgroundColor: tokens.bgBase,
                    borderColor: tokens.divider,
                    color: tokens.textPrimary,
                  }}
                />
              </label>
              <button
                type="button"
                aria-label={`Remover contato ${index + 1}`}
                disabled={disabled}
                onClick={() => removeRow(row.id)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  borderColor: tokens.divider,
                  color: tokens.dangerText,
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

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
          disabled={disabled || rows.length >= MAX_CONTACTS}
          onClick={addRow}
          className="flex w-fit items-center justify-center gap-1.5 rounded-md border border-dashed px-3 py-2 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          style={{ borderColor: tokens.divider, color: tokens.textSecondary }}
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar outro
        </button>
      </div>
    </CardShell>
  )
}

export default SilencedContactsCard
