"use client"

/**
 * agent_approval — legacy/fallback deterministic approval card.
 *
 * The old flow only rendered this through the `propose_agent_creation` tool. If
 * the LLM said "approve the card" without calling that tool, the journey got
 * stuck with no visible card. Jornada v2 now approves creation from
 * `agent_review`; this card stays compatible with legacy inline proposals.
 */

import * as React from "react"
import { Check, Pencil, Sparkles } from "lucide-react"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"

export interface AgentApprovalPayload {
  action: "confirm"
  name?: string
  description?: string
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function summarizeList(items: readonly string[], fallback: string): string {
  if (items.length === 0) return fallback
  const visible = items.slice(0, 3).join(", ")
  return items.length > 3 ? `${visible} e mais ${items.length - 3}` : visible
}

function deriveAgentProposal(value: CardComponentProps["value"]) {
  const businessName =
    clean(value.persona.name) ??
    clean(value.project.name) ??
    clean(value.sourceIngestion.proposed?.businessName) ??
    "seu negócio"

  const name =
    clean(value.proposal.name) ??
    (businessName.toLowerCase().includes("sdr")
      ? businessName
      : `SDR ${businessName}`)

  const objective =
    clean(value.project.objective) ?? "captar e qualificar leads pelo WhatsApp"
  const offered = summarizeList(value.services.offered, "as dúvidas principais")
  const tone = clean(value.persona.tone) ?? "consultivo e direto"

  const description =
    clean(value.proposal.description) ??
    `Atende leads pelo WhatsApp para ${objective}. Responde sobre ${offered}, conduz a conversa com tom ${tone} e encaminha oportunidades para a equipe quando fizer sentido.`

  const tasks = [
    `Conduzir conversas para ${objective}.`,
    `Responder sobre ${offered}.`,
    "Encaminhar oportunidades para a equipe quando fizer sentido.",
  ]

  return { name, description, objective, offered, tone, tasks }
}

export function AgentApprovalCard({
  value,
  disabled = false,
  onSubmit,
  tokens,
}: CardComponentProps<AgentApprovalPayload>) {
  const proposal = React.useMemo(() => deriveAgentProposal(value), [value])

  const handleConfirm = React.useCallback(() => {
    onSubmit({
      action: "confirm",
      name: proposal.name,
      description: proposal.description,
    })
  }, [onSubmit, proposal.description, proposal.name])

  const handleAdjust = React.useCallback(() => {
    if (typeof window === "undefined") return
    window.dispatchEvent(
      new CustomEvent("builder:focus-chat", {
        detail: { message: "Quero ajustar a proposta do agente: " },
      }),
    )
  }, [])

  return (
    <CardShell
      icon={<Sparkles className="h-4 w-4" />}
      title="Aprovar criação do agente"
      reason="Confira o agente que será criado. Se estiver certo, crie agora; se não, ajuste antes."
      tokens={tokens}
      actions={[
        {
          label: "Criar este agente",
          onClick: handleConfirm,
          variant: "primary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled,
        },
        {
          label: "Ajustar antes",
          onClick: handleAdjust,
          variant: "secondary",
          icon: <Pencil className="h-3.5 w-3.5" />,
          disabled,
        },
      ]}
    >
      <div className="space-y-4">
        <div>
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: tokens.textTertiary }}
          >
            Agente proposto
          </p>
          <h3
            className="mt-1 text-[15px] font-semibold leading-snug"
            style={{ color: tokens.textPrimary }}
          >
            {proposal.name}
          </h3>
          <p
            className="mt-1 text-[13px] leading-relaxed"
            style={{ color: tokens.textSecondary }}
          >
            {proposal.description}
          </p>
        </div>

        <div
          className="border-t pt-3"
          style={{ borderColor: tokens.divider }}
        >
          <p
            className="text-[12px] font-semibold"
            style={{ color: tokens.textPrimary }}
          >
            O agente vai
          </p>
          <div className="mt-2 space-y-2">
            {proposal.tasks.map((task) => (
              <div key={task} className="flex gap-2">
                <span
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: tokens.successSubtle,
                    color: tokens.successText,
                  }}
                >
                  <Check className="h-3 w-3" aria-hidden="true" />
                </span>
                <span
                  className="text-[12px] leading-relaxed"
                  style={{ color: tokens.textSecondary }}
                >
                  {task}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div
          className="border-t pt-3"
          style={{ borderColor: tokens.divider }}
        >
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: tokens.brandText }}
          >
            Como vai falar
          </p>
          <p
            className="mt-2 inline-flex rounded-full px-2.5 py-1 text-[12px] font-medium"
            style={{
              backgroundColor: tokens.brandSubtle,
              color: tokens.brandText,
            }}
          >
            {proposal.tone}
          </p>
        </div>
      </div>
    </CardShell>
  )
}

export default AgentApprovalCard
