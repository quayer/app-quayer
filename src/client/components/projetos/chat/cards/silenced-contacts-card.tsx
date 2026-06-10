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
 * Jornada-builder-v2 (FR-14): o GRID de linhas + validação vive no módulo
 * compartilhado `./silenced-contacts/contact-rows.tsx`, reusado INLINE pelo
 * activation-mode-card — este card mantém só o chrome (exemplo + ações).
 *
 * PRESENTATIONAL ONLY: pre-fills from the canonical BuilderState, blocks while
 * `props.disabled`, normalizes/dedupes phones to E.164-BR locally (parity with
 * the backend `normalizeWhatsappBr`) and fires `onSubmit` UP — it NEVER fetches
 * (chat-panel owns POST + SSE).
 *
 * Contract: docs/builder/ORAYON_UPLIFT_SPEC.md (card catalog, G1).
 */

import * as React from "react"
import { Check, MessageCircleOff, ShieldOff, UserRound } from "lucide-react"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"
import {
  SilencedContactRowsFields,
  useSilencedContactRows,
  type SilencedContact,
} from "./silenced-contacts/contact-rows"

/**
 * The submit payload this card produces. Mirrors `silencedContactsPayloadSchema`
 * minus its `cardKey` discriminator (chat-panel attaches/owns the route key).
 * `acknowledged` is ALWAYS `true`: both "confirmar" and "não tenho ninguém"
 * acknowledge the step — an empty `contacts` list is valid.
 */
export type SilencedContactsCardPayload = {
  contacts: SilencedContact[]
  acknowledged: true
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
  const editor = useSilencedContactRows(value)

  const handleConfirm = React.useCallback(() => {
    if (disabled) return
    const contacts = editor.buildContacts()
    if (contacts === null) return
    onSubmit({ contacts, acknowledged: true })
  }, [disabled, editor, onSubmit])

  const handleNobody = React.useCallback(() => {
    if (disabled) return
    onSubmit({ contacts: [], acknowledged: true })
  }, [disabled, onSubmit])

  // "Confirmar" requires ≥1 valid filled row; the empty case goes through the
  // secondary "Não tenho ninguém" action instead.
  const canConfirm =
    !disabled && !editor.hasInvalidPhone && editor.filledRows.length > 0

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

        {/* Contact rows + erro + "Adicionar outro" (módulo compartilhado) */}
        <SilencedContactRowsFields
          editor={editor}
          disabled={disabled}
          tokens={tokens}
        />
      </div>
    </CardShell>
  )
}

export default SilencedContactsCard
