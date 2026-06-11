"use client"

/**
 * Builder Cards — Agent scope section: does / does not (jornada-builder-v2, Onda 3)
 *
 * Reusable form body extracted from `services-offered-card.tsx` (T41). Owns the
 * two editable chip lists that define the agent's SCOPE:
 *   - "Faz / oferece" → services.offered    (brand-subtle chips)
 *   - "NÃO faz"       → services.notOffered (danger-subtle chips)
 *
 * It is PRESENTATIONAL and SHELL-AGNOSTIC: it renders no CardShell and owns no
 * confirm button, so it can be embedded BOTH by the individual `services` card
 * (which keeps its own CardShell + confirm flow) AND by the composite
 * `agent_review` card (single confirmation for all sections — T43). It manages
 * its own chip state from `initialValue` and reports the live `{ offered,
 * notOffered }` upward via `onChange`. The empty-list warning is rendered when
 * the parent passes `showEmptyWarning` (the parent owns the confirm/warn flow).
 *
 * Styling idiom matches the original card via `useAppTokens` tokens (passed down
 * as `props.tokens`).
 *
 * Contract: specs/jornada-builder-v2 (agent_review seções extraídas).
 */

import * as React from "react"
import { AlertTriangle, Plus, X } from "lucide-react"

import { Input } from "@/client/components/ui/input"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

import { SuggestedBadge, UseSuggestionChip } from "../use-suggestion-chip"

/** The exact value shape for the `services` scope (offered / not offered). */
export interface ServicesSectionValue {
  offered: string[]
  notOffered: string[]
}

/**
 * The services slice of `capturedProposals` (mirror of `capturedServicesProposalSchema`
 * — `offered` list only). Optional everywhere: the standalone card passes nothing.
 */
export interface ServicesProposal {
  offered?: string[]
}

/** Soft cap per list (per the agent brief: max ~30). */
export const MAX_ITEMS = 30

/**
 * Append `raw` to `list` (trimmed, case-insensitive de-dupe, capped). Returns the
 * SAME reference when the value is empty/duplicate/over-cap so callers can no-op.
 */
export function addItem(list: string[], raw: string): string[] {
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
  headingBadge = null,
  placeholder,
  items,
  onAdd,
  onRemove,
  tone,
  tokens,
  disabled,
}: {
  heading: string
  /** Optional node rendered next to the heading (e.g. the "sugerido" badge). */
  headingBadge?: React.ReactNode
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
        <span className="flex items-center gap-2">
          <span
            className="text-[12px] font-medium"
            style={{ color: tokens.textPrimary }}
          >
            {heading}
          </span>
          {headingBadge}
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
 * ServicesSection — reusable form body for the agent scope. Renders the two chip
 * lists and (when `showEmptyWarning` is set) the non-blocking empty alert. Holds
 * its own chip state and lifts the live value via `onChange`.
 */
export function ServicesSection({
  initialValue,
  disabled = false,
  showEmptyWarning = false,
  onChange,
  tokens,
  offeredFromProposal = false,
  lateProposal,
}: {
  initialValue: ServicesSectionValue
  disabled?: boolean
  /** Render the non-blocking "both lists empty" alert (parent owns the flow). */
  showEmptyWarning?: boolean
  /** Called with the live value whenever a chip is added/removed. */
  onChange: (value: ServicesSectionValue) => void
  tokens: AppTokens
  /** T43 — the mount-time `offered` came from `capturedProposals` → show badge. */
  offeredFromProposal?: boolean
  /** T95 — a services proposal that arrived AFTER mount; offers a "Usar sugestão"
   *  chip that MERGES the proposed services (de-duped) into `offered` on click. */
  lateProposal?: ServicesProposal
}) {
  const [offered, setOffered] = React.useState<string[]>(
    () => initialValue.offered,
  )
  const [notOffered, setNotOffered] = React.useState<string[]>(
    () => initialValue.notOffered,
  )

  // Lift the live value up so the owning card/shell can submit it. The ref keeps
  // the latest onChange without re-firing the report effect on every parent
  // re-render (sync the ref in its own effect to keep render side-effect-free).
  const onChangeRef = React.useRef(onChange)
  React.useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])
  React.useEffect(() => {
    onChangeRef.current({ offered, notOffered })
  }, [offered, notOffered])

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

  // T95 — proposta TARDIA de serviços: aplicar é explícito (clique do chip) e
  // MESCLA (de-dupe via addItem) na lista atual, sem sobrescrever o que o usuário
  // já digitou. Só os itens proposta que ainda NÃO estão na lista são candidatos.
  const [appliedServices, setAppliedServices] = React.useState(false)
  const lateOffered = (lateProposal?.offered ?? []).filter(
    (s) => typeof s === "string" && s.trim().length > 0,
  )
  const newProposed = lateOffered.filter(
    (s) =>
      !offered.some((item) => item.toLowerCase() === s.trim().toLowerCase()),
  )
  const applyProposedServices = React.useCallback(() => {
    setOffered((current) =>
      lateOffered.reduce((acc, raw) => addItem(acc, raw), current),
    )
    setAppliedServices(true)
    // lateOffered é derivado de `lateProposal` a cada render; a callback lê o
    // valor do closure no momento do clique (proposta vigente).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lateProposal])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <ChipList
          heading="Faz / oferece"
          headingBadge={
            offeredFromProposal ? <SuggestedBadge tokens={tokens} /> : null
          }
          placeholder="Ex.: tirar dúvidas, agendar, consultoria…"
          items={offered}
          onAdd={addOffered}
          onRemove={removeOffered}
          tone="brand"
          tokens={tokens}
          disabled={disabled}
        />
        {newProposed.length > 0 && !appliedServices && (
          <UseSuggestionChip
            label={`Usar sugestão: ${newProposed.slice(0, 3).join(", ")}${newProposed.length > 3 ? "…" : ""}`}
            onApply={applyProposedServices}
            disabled={disabled}
            tokens={tokens}
          />
        )}
      </div>
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

      {showEmptyWarning && (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-[12px] leading-relaxed"
          style={{ color: tokens.warningText }}
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          As duas listas estão vazias — o agente não vai saber o que você
          oferece. Você pode confirmar mesmo assim e completar depois pela
          conversa.
        </p>
      )}
    </div>
  )
}

export default ServicesSection
