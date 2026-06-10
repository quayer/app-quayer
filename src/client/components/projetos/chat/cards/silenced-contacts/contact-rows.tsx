"use client"

/**
 * Builder Cards — Editor compartilhado de contatos em silêncio (FR-14)
 *
 * Extração do grid de linhas [Nome (opcional) | WhatsApp | remover] do
 * `silenced-contacts-card.tsx` para reuso INLINE pelo `activation-mode-card.tsx`
 * (jornada-builder-v2: a configuração de contatos em silêncio vive DENTRO do
 * ajuste de ativação quando o modo é "todos exceto bloqueados").
 *
 * Dois exports:
 *   - useSilencedContactRows(value) → estado das linhas + validação E.164-BR +
 *     buildContacts (normaliza/dedupa no submit, paridade com o backend
 *     normalizeWhatsappBr), seedado do BuilderState persistido.
 *   - <SilencedContactRowsFields/>  → grid de linhas + erro + "Adicionar outro".
 *
 * Mesmas garantias do card original: cap de MAX_CONTACTS, ao menos 1 linha
 * editável, linha vazia ignorada. Presentational/token-driven; NUNCA faz fetch.
 */

import * as React from "react"
import { Plus, X } from "lucide-react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

import { isValidBrE164, normalizeBrPhone } from "../phone-br"
import type { BuilderState } from "../types"

/** Um contato silenciado no payload — espelha `silencedContactItemSchema`. */
export interface SilencedContact {
  name?: string
  whatsapp: string
}

/** Hard cap — mirrors the backend `.max(50)` on the contacts array. */
export const MAX_CONTACTS = 50

/** Local working row — stable id keeps React keys steady across edits/removals. */
export interface ContactRow {
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
 * Read the persisted silenced-contact rows off the canonical BuilderState
 * defensively (the leaf may be missing on legacy snapshots). Returns the
 * persisted `{ name?, whatsapp }[]` (already E.164 from the server) or `[]`.
 */
function readPersistedContacts(value: BuilderState): SilencedContact[] {
  const slice = (value as { silencedContacts?: unknown }).silencedContacts
  if (slice == null || typeof slice !== "object") return []
  const contacts = (slice as { contacts?: unknown }).contacts
  if (!Array.isArray(contacts)) return []

  const out: SilencedContact[] = []
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
function seedRows(value: BuilderState): ContactRow[] {
  const persisted = readPersistedContacts(value)
  if (persisted.length === 0) return [newRow()]
  return persisted.map((contact) => ({
    id: nextRowId(),
    name: contact.name ?? "",
    phoneRaw: contact.whatsapp,
  }))
}

/** Tudo que os consumidores precisam do editor (estado + ações + validação). */
export interface SilencedContactRowsEditor {
  rows: ContactRow[]
  /** Rows with a phone typed in — empty rows are ignored. */
  filledRows: ContactRow[]
  /** True when any filled row won't normalize to a valid E.164-BR. */
  hasInvalidPhone: boolean
  atCap: boolean
  error: string | null
  updateRow: (id: string, field: "name" | "phoneRaw", raw: string) => void
  addRow: () => void
  removeRow: (id: string) => void
  /**
   * Normalize + dedupe filled rows into submit-ready contacts. Returns null
   * (and sets `error`) if any filled row carries an invalid phone — the caller
   * aborts the submit in that case. An empty array is a VALID result.
   */
  buildContacts: () => SilencedContact[] | null
}

/**
 * useSilencedContactRows — estado/validação das linhas de contato silenciado,
 * seedado do BuilderState persistido. Puro client-state; nenhum IO.
 */
export function useSilencedContactRows(
  value: BuilderState,
): SilencedContactRowsEditor {
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

  const filledRows = React.useMemo(
    () => rows.filter((row) => row.phoneRaw.trim().length > 0),
    [rows],
  )

  const hasInvalidPhone = React.useMemo(
    () =>
      filledRows.some((row) => {
        const normalized = normalizeBrPhone(row.phoneRaw)
        return normalized === null || !isValidBrE164(normalized)
      }),
    [filledRows],
  )

  const buildContacts = React.useCallback((): SilencedContact[] | null => {
    const seen = new Set<string>()
    const out: SilencedContact[] = []
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
      out.push(
        name.length > 0 ? { name, whatsapp: normalized } : { whatsapp: normalized },
      )
    }
    return out.slice(0, MAX_CONTACTS)
  }, [filledRows])

  return {
    rows,
    filledRows,
    hasInvalidPhone,
    atCap: rows.length >= MAX_CONTACTS,
    error,
    updateRow,
    addRow,
    removeRow,
    buildContacts,
  }
}

/**
 * SilencedContactRowsFields — grid de [Nome (opcional) | WhatsApp | remover] +
 * mensagem de erro + botão "Adicionar outro". Presentational/token-driven.
 */
export function SilencedContactRowsFields({
  editor,
  disabled,
  tokens,
}: {
  editor: SilencedContactRowsEditor
  disabled: boolean
  tokens: AppTokens
}) {
  const labelStyle = { color: tokens.textTertiary }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {editor.rows.map((row, index) => (
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
                  editor.updateRow(row.id, "name", event.target.value.slice(0, 120))
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
                  editor.updateRow(row.id, "phoneRaw", event.target.value)
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
              onClick={() => editor.removeRow(row.id)}
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

      {editor.error != null && (
        <p
          role="alert"
          className="text-[12px] leading-relaxed"
          style={{ color: tokens.dangerText }}
        >
          {editor.error}
        </p>
      )}

      <button
        type="button"
        disabled={disabled || editor.atCap}
        onClick={editor.addRow}
        className="flex w-fit items-center justify-center gap-1.5 rounded-md border border-dashed px-3 py-2 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        style={{ borderColor: tokens.divider, color: tokens.textSecondary }}
      >
        <Plus className="h-3.5 w-3.5" />
        Adicionar outro
      </button>
    </div>
  )
}
