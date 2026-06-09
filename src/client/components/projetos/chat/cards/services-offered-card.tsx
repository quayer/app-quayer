"use client"

/**
 * Builder Cards — Agent scope: does / does not (Orayon Uplift, W3)
 *
 * cardKey `services`. Defines the agent's SCOPE — what it DOES and what it does
 * NOT do — useful for any agent type (support, FAQ, etc.), not only services.
 * Two editable chip lists:
 *   - "Faz / oferece" → services.offered    (brand-subtle chips)
 *   - "NÃO faz"       → services.notOffered (danger-subtle chips)
 *
 * PRESENTATIONAL: pre-fills from `props.value.services`, lets the user add
 * (Enter / "+" button) and remove (x) chips, trims + de-dupes input, caps each
 * list at MAX_ITEMS, and on confirm calls `props.onSubmit({ offered, notOffered })`.
 * It does NOT fetch — chat-panel owns POST + SSE.
 *
 * Styling idiom matches ToolSelectionCard / ChannelSelectionCard via CardShell
 * + useAppTokens tokens (passed down as `props.tokens`).
 *
 * Contract: docs/builder/ORAYON_UPLIFT_SPEC.md (services_oferece_nao).
 */

import * as React from "react"
import { Check, Plus, Wrench, X } from "lucide-react"

import { Input } from "@/client/components/ui/input"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"

/** The exact submit payload for cardKey `services`. */
export interface ServicesCardPayload {
  offered: string[]
  notOffered: string[]
}

/** Soft cap per list (per the agent brief: max ~30). */
const MAX_ITEMS = 30

/**
 * Append `raw` to `list` (trimmed, case-insensitive de-dupe, capped). Returns the
 * SAME reference when the value is empty/duplicate/over-cap so callers can no-op.
 */
function addItem(list: string[], raw: string): string[] {
  const value = raw.trim()
  if (value.length === 0) return list
  if (list.length >= MAX_ITEMS) return list
  const exists = list.some((item) => item.toLowerCase() === value.toLowerCase())
  if (exists) return list
  return [...list, value]
}

/** A single editable chip-list column. */
function ChipList({
  heading,
  placeholder,
  items,
  onAdd,
  onRemove,
  tone,
  tokens,
  disabled,
}: {
  heading: string
  placeholder: string
  items: string[]
  onAdd: (value: string) => void
  onRemove: (index: number) => void
  /** Visual tone of the chips: brand (offered) or danger (not offered). */
  tone: "brand" | "danger"
  tokens: AppTokens
  disabled: boolean
}) {
  const [draft, setDraft] = React.useState("")

  const chipBg = tone === "brand" ? tokens.brandSubtle : tokens.dangerSubtle
  const chipBorder = tone === "brand" ? tokens.brandBorder : tokens.danger
  const chipText = tone === "brand" ? tokens.brandText : tokens.dangerText

  const commitDraft = React.useCallback(() => {
    if (draft.trim().length === 0) return
    onAdd(draft)
    setDraft("")
  }, [draft, onAdd])

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault()
        commitDraft()
      }
    },
    [commitDraft],
  )

  const atCap = items.length >= MAX_ITEMS

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span
          className="text-[12px] font-medium"
          style={{ color: tokens.textPrimary }}
        >
          {heading}
        </span>
        <span className="text-[11px]" style={{ color: tokens.textTertiary }}>
          {items.length}/{MAX_ITEMS}
        </span>
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, index) => (
            <span
              key={`${item}-${index}`}
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px]"
              style={{
                backgroundColor: chipBg,
                borderColor: chipBorder,
                color: chipText,
              }}
            >
              <span className="max-w-[180px] truncate">{item}</span>
              <button
                type="button"
                aria-label={`Remover ${item}`}
                disabled={disabled}
                onClick={() => onRemove(index)}
                className="-mr-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X className="h-3 w-3" strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={atCap ? "Limite atingido" : placeholder}
          disabled={disabled || atCap}
          className="h-8 text-[12px]"
          aria-label={heading}
        />
        <button
          type="button"
          aria-label={`Adicionar a ${heading}`}
          disabled={disabled || atCap || draft.trim().length === 0}
          onClick={commitDraft}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundColor: tokens.bgBase,
            borderColor: tokens.divider,
            color: tokens.textSecondary,
          }}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/**
 * ServicesOfferedCard — cardKey `services`. Renders the two chip lists inside a
 * CardShell and submits `{ offered, notOffered }`.
 */
export function ServicesOfferedCard({
  value,
  disabled = false,
  onSubmit,
  onDismiss,
  tokens,
}: CardComponentProps<ServicesCardPayload>) {
  const [offered, setOffered] = React.useState<string[]>(
    () => value.services.offered,
  )
  const [notOffered, setNotOffered] = React.useState<string[]>(
    () => value.services.notOffered,
  )

  const addOffered = React.useCallback((raw: string) => {
    setOffered((current) => addItem(current, raw))
  }, [])
  const removeOffered = React.useCallback((index: number) => {
    setOffered((current) => current.filter((_, i) => i !== index))
  }, [])
  const addNotOffered = React.useCallback((raw: string) => {
    setNotOffered((current) => addItem(current, raw))
  }, [])
  const removeNotOffered = React.useCallback((index: number) => {
    setNotOffered((current) => current.filter((_, i) => i !== index))
  }, [])

  const handleConfirm = React.useCallback(() => {
    onSubmit({ offered, notOffered })
  }, [offered, notOffered, onSubmit])

  return (
    <CardShell
      icon={<Wrench className="h-4 w-4" />}
      title="O que o agente faz"
      reason="Liste o que o agente FAZ e o que ele NÃO faz, para evitar promessas indevidas nas conversas."
      tokens={tokens}
      actions={[
        {
          label: "Confirmar serviços",
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
      <div className="flex flex-col gap-4">
        <ChipList
          heading="Faz / oferece"
          placeholder="Ex.: tirar dúvidas, agendar, consultoria…"
          items={offered}
          onAdd={addOffered}
          onRemove={removeOffered}
          tone="brand"
          tokens={tokens}
          disabled={disabled}
        />
        <ChipList
          heading="NÃO faz"
          placeholder="Ex.: suporte técnico, parcelamento…"
          items={notOffered}
          onAdd={addNotOffered}
          onRemove={removeNotOffered}
          tone="danger"
          tokens={tokens}
          disabled={disabled}
        />
      </div>
    </CardShell>
  )
}

export default ServicesOfferedCard
