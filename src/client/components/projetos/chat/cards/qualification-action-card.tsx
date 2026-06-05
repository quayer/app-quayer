"use client"

/**
 * Builder Card — qualification_action (Orayon Uplift, W3)
 *
 * Single-choice card that gates the downstream journey: the operator picks WHAT
 * the agent does once a lead is qualified. The choice decides which later card
 * appears — `book_appointment` routes toward calendar_connect, `notify_team`
 * toward team_structure, `lead_only` skips both.
 *
 * Presentational only: reads its slice from `value.qualification.action` to
 * pre-select, and fires `onSubmit({ action })` UP to chat-panel (which owns the
 * POST + SSE ack turn). Never fetches. Styling matches the existing selection
 * cards in chat-panel.tsx (ChannelSelectionCard idiom) via CardShell + tokens.
 *
 * Contract: docs/builder/ORAYON_UPLIFT_SPEC.md (card catalog).
 */

import { useState } from "react"
import { Check, ClipboardCheck } from "lucide-react"

import type { QualificationState } from "@/server/ai-module/builder/cards/builder-state"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"

/** The exact submit payload for cardKey 'qualification_action'. */
export interface QualificationActionPayload {
  action: NonNullable<QualificationState["action"]>
}

/** One selectable option in the single-choice list. */
interface QualificationOption {
  value: QualificationActionPayload["action"]
  title: string
  description: string
  /** Marks the suggested default with a "recomendado" badge. */
  recommended?: boolean
}

const QUALIFICATION_OPTIONS: readonly QualificationOption[] = [
  {
    value: "book_appointment",
    title: "Marca na agenda E me avisa",
    description:
      "O agente qualifica, agenda o atendimento no calendário e notifica a equipe.",
    recommended: true,
  },
  {
    value: "notify_team",
    title: "Só me avisa",
    description:
      "O agente qualifica e notifica a equipe — o agendamento fica por conta de vocês.",
  },
  {
    value: "lead_only",
    title: "Só qualifica",
    description:
      "O agente apenas qualifica e registra o lead, sem agendar nem notificar.",
  },
] as const

/**
 * QualificationActionCard — pick how the agent handles a qualified lead.
 * Pre-selects the choice already stored in builderState; confirm is disabled
 * until an option is chosen and while the chat is streaming.
 */
export function QualificationActionCard({
  value,
  disabled = false,
  onSubmit,
  onDismiss,
  tokens,
}: CardComponentProps<QualificationActionPayload>) {
  const [selected, setSelected] = useState<
    QualificationActionPayload["action"] | undefined
  >(value.qualification.action)

  const handleConfirm = () => {
    if (!selected || disabled) return
    onSubmit({ action: selected })
  }

  return (
    <CardShell
      icon={<ClipboardCheck className="h-4 w-4" />}
      title="O que fazer com o lead qualificado?"
      reason="Escolha o destino do lead depois que o agente qualificar a conversa. Isso define o próximo passo da configuração."
      tokens={tokens}
      actions={[
        {
          label: "Confirmar",
          onClick: handleConfirm,
          variant: "primary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled: disabled || !selected,
        },
        ...(onDismiss
          ? ([
              {
                label: "Agora não",
                onClick: onDismiss,
                variant: "secondary" as const,
                disabled,
              },
            ] as const)
          : []),
      ]}
    >
      <div className="grid gap-2" role="radiogroup" aria-label="Ação de qualificação">
        {QUALIFICATION_OPTIONS.map((option) => {
          const isSelected = selected === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              className="rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                backgroundColor: isSelected ? tokens.brandSubtle : tokens.bgBase,
                borderColor: isSelected ? tokens.brandBorder : tokens.divider,
              }}
              onClick={() => setSelected(option.value)}
            >
              <div className="flex items-start gap-3">
                <div
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                  style={{
                    backgroundColor: isSelected ? tokens.brand : "transparent",
                    borderColor: isSelected ? tokens.brand : tokens.borderStrong,
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
    </CardShell>
  )
}

export default QualificationActionCard
