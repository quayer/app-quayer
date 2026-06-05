"use client"

/**
 * Builder Cards — Pricing / tabela de preços (Orayon Uplift, W3)
 *
 * cardKey `pricing`. Editable list of price rows, each with:
 *   - name      → required service/product label
 *   - price     → BRL via a MASKED cents input (digits fill from the right, so
 *                 typing "1234" renders "R$ 12,34"). priceCents stays an INT —
 *                 we never parse a float, avoiding 19.99 → 1998.99999 drift.
 *   - category  → optional grouping label
 *
 * PRESENTATIONAL: pre-fills from `props.value.pricing.items`, lets the user
 * add/remove rows, and on confirm calls
 *   props.onSubmit({ items: [{ name, priceCents, category? }], currency: "BRL" })
 * dropping blank rows (no name) and omitting empty categories. It does NOT
 * fetch — chat-panel owns POST + SSE. Backed by PriceList/PriceItem at deploy.
 *
 * Styling idiom matches ToolSelectionCard / ChannelSelectionCard via CardShell
 * + useAppTokens tokens (passed down as `props.tokens`).
 *
 * Contract: docs/builder/ORAYON_UPLIFT_SPEC.md (pricing — BRL em cents).
 */

import * as React from "react"
import { Check, Plus, Tag, Trash2 } from "lucide-react"

import { Input } from "@/client/components/ui/input"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"

/** A single submitted pricing line — mirrors `pricingItemSchema` (cents int). */
export interface PricingCardItem {
  name: string
  priceCents: number
  category?: string
}

/** The exact submit payload for cardKey `pricing`. */
export interface PricingCardPayload {
  items: PricingCardItem[]
  currency: "BRL"
}

/** Soft cap so a runaway paste can't render hundreds of inputs. */
const MAX_ROWS = 50

/** Editable draft row — `priceCents` is the canonical int; the input is masked. */
interface DraftRow {
  /** Stable key for React (rows reorder on delete). */
  id: string
  name: string
  priceCents: number
  category: string
}

let rowSeq = 0
function nextRowId(): string {
  rowSeq += 1
  return `row-${rowSeq}`
}

function makeEmptyRow(): DraftRow {
  return { id: nextRowId(), name: "", priceCents: 0, category: "" }
}

/**
 * Pre-fill draft rows from the canonical state. Always yields at least one row
 * so the card opens with an editable line to fill in.
 */
function rowsFromState(items: readonly PricingCardItem[]): DraftRow[] {
  if (items.length === 0) return [makeEmptyRow()]
  return items.map((item) => ({
    id: nextRowId(),
    name: item.name,
    // Defensive clamp: never trust a negative/float cents value from state.
    priceCents: Math.max(0, Math.round(item.priceCents)),
    category: item.category ?? "",
  }))
}

/**
 * Strip every non-digit, then read the remaining digits as a CENTS integer.
 * "R$ 1.234,50" → "123450" → 123450. Caps to a sane ceiling so a giant paste
 * can't overflow. Pure, never produces a float.
 */
function digitsToCents(raw: string): number {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 0) return 0
  // Trim leading zeros but keep at least one digit; bound the magnitude.
  const bounded = digits.slice(-12)
  const cents = Number.parseInt(bounded, 10)
  return Number.isFinite(cents) ? cents : 0
}

/**
 * Render an INT cents value as a masked BRL string: 1234 → "R$ 12,34",
 * 0 → "" (empty placeholder so the field doesn't show a stale "R$ 0,00").
 */
function centsToMasked(cents: number): string {
  if (cents <= 0) return ""
  const reais = Math.floor(cents / 100)
  const remainder = cents % 100
  const reaisStr = reais.toLocaleString("pt-BR")
  const centsStr = remainder.toString().padStart(2, "0")
  return `R$ ${reaisStr},${centsStr}`
}

/** A single editable pricing row: name + masked price + optional category. */
function PriceRow({
  row,
  index,
  canRemove,
  onChange,
  onRemove,
  tokens,
  disabled,
}: {
  row: DraftRow
  index: number
  /** Hide the trash button when this is the only (empty) row. */
  canRemove: boolean
  onChange: (id: string, patch: Partial<Omit<DraftRow, "id">>) => void
  onRemove: (id: string) => void
  tokens: AppTokens
  disabled: boolean
}) {
  const handlePriceChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(row.id, { priceCents: digitsToCents(event.target.value) })
    },
    [onChange, row.id],
  )

  return (
    <div
      className="rounded-md border p-3"
      style={{ backgroundColor: tokens.bgBase, borderColor: tokens.divider }}
    >
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_140px]">
          <Input
            value={row.name}
            onChange={(event) => onChange(row.id, { name: event.target.value })}
            placeholder="Serviço ou produto"
            disabled={disabled}
            className="h-8 text-[12px]"
            aria-label={`Nome do item ${index + 1}`}
          />
          <Input
            // inputMode numeric → mobile numeric keypad; value is the masked
            // string but priceCents (the int) is what we submit.
            inputMode="numeric"
            value={centsToMasked(row.priceCents)}
            onChange={handlePriceChange}
            placeholder="R$ 0,00"
            disabled={disabled}
            className="h-8 text-[12px]"
            aria-label={`Preço do item ${index + 1} em reais`}
          />
        </div>
        <button
          type="button"
          aria-label={`Remover item ${index + 1}`}
          disabled={disabled || !canRemove}
          onClick={() => onRemove(row.id)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            backgroundColor: tokens.bgSurface,
            borderColor: tokens.divider,
            color: tokens.textSecondary,
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <Input
        value={row.category}
        onChange={(event) => onChange(row.id, { category: event.target.value })}
        placeholder="Categoria (opcional)"
        disabled={disabled}
        className="mt-2 h-8 text-[12px]"
        aria-label={`Categoria do item ${index + 1}`}
      />
    </div>
  )
}

/**
 * PricingCard — cardKey `pricing`. Renders the editable price rows inside a
 * CardShell and submits `{ items, currency: "BRL" }`.
 */
export function PricingCard({
  value,
  disabled = false,
  onSubmit,
  onDismiss,
  tokens,
}: CardComponentProps<PricingCardPayload>) {
  const [rows, setRows] = React.useState<DraftRow[]>(() =>
    rowsFromState(value.pricing.items),
  )

  const updateRow = React.useCallback(
    (id: string, patch: Partial<Omit<DraftRow, "id">>) => {
      setRows((current) =>
        current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      )
    },
    [],
  )

  const removeRow = React.useCallback((id: string) => {
    setRows((current) => {
      const next = current.filter((row) => row.id !== id)
      // Never collapse to zero rows — keep one empty editable line.
      return next.length > 0 ? next : [makeEmptyRow()]
    })
  }, [])

  const addRow = React.useCallback(() => {
    setRows((current) =>
      current.length >= MAX_ROWS ? current : [...current, makeEmptyRow()],
    )
  }, [])

  // Only rows with a non-blank name become items; trim everything, drop the
  // category when empty so we don't persist "".
  const validItems = React.useMemo<PricingCardItem[]>(
    () =>
      rows
        .map((row) => {
          const name = row.name.trim()
          if (name.length === 0) return null
          const category = row.category.trim()
          const item: PricingCardItem = {
            name,
            priceCents: Math.max(0, Math.round(row.priceCents)),
          }
          return category.length > 0 ? { ...item, category } : item
        })
        .filter((item): item is PricingCardItem => item !== null),
    [rows],
  )

  const atCap = rows.length >= MAX_ROWS
  const canRemove = rows.length > 1

  const handleConfirm = React.useCallback(() => {
    onSubmit({ items: validItems, currency: "BRL" })
  }, [onSubmit, validItems])

  return (
    <CardShell
      icon={<Tag className="h-4 w-4" />}
      title="Tabela de preços"
      reason="Liste os preços que o agente pode informar nas conversas. Valores em reais (R$); deixe em branco se preferir não divulgar um preço."
      tokens={tokens}
      actions={[
        {
          label:
            validItems.length > 0
              ? `Confirmar ${validItems.length} ${validItems.length === 1 ? "item" : "itens"}`
              : "Confirmar sem preços",
          onClick: handleConfirm,
          variant: "primary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled,
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
      <div className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <PriceRow
            key={row.id}
            row={row}
            index={index}
            canRemove={canRemove}
            onChange={updateRow}
            onRemove={removeRow}
            tokens={tokens}
            disabled={disabled}
          />
        ))}

        <button
          type="button"
          disabled={disabled || atCap}
          onClick={addRow}
          className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-dashed text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundColor: tokens.bgBase,
            borderColor: tokens.divider,
            color: tokens.textSecondary,
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          {atCap ? "Limite de itens atingido" : "Adicionar item"}
        </button>
      </div>
    </CardShell>
  )
}

export default PricingCard
