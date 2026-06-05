"use client"

/**
 * Builder Cards — agent_persona (Orayon Uplift, W3)
 *
 * Form for the agent's persona (name / tone / style / greeting) with a LIVE
 * WhatsApp bubble preview of the greeting that re-renders on every keystroke.
 * The LLM pre-fills proposed values into `value.persona`; the user edits them
 * here and confirms.
 *
 * Presentational only: reads its slice off `props.value` and fires the typed
 * payload up via `props.onSubmit` — chat-panel owns POST + SSE. No fetching.
 *
 * Contract:
 *   cardKey  : "agent_persona"
 *   payload  : { persona: { name?; tone?; style?; greeting? } }
 *   state    : persona.*            (confirmation key: persona)
 */

import * as React from "react"
import { Check, UserRound } from "lucide-react"

import { Input } from "@/client/components/ui/input"
import { Label } from "@/client/components/ui/label"
import { Textarea } from "@/client/components/ui/textarea"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"

/** The exact payload `agent_persona` submits up to chat-panel. */
export interface AgentPersonaPayload {
  persona: {
    name?: string
    tone?: string
    style?: string
    greeting?: string
  }
}

/** Fallback greeting shown in the bubble before the user types anything. */
const GREETING_PLACEHOLDER =
  "Olá! Tudo bem? 😊 Em que posso te ajudar hoje?"

/** Trim a field to undefined when empty so we never persist blank strings. */
function clean(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * AgentPersonaCard — persona editor + live WhatsApp greeting preview.
 *
 * Pre-fills from `value.persona`; submits `{ persona: { ... } }`. Disabled while
 * the chat is streaming (`disabled`).
 */
export function AgentPersonaCard({
  value,
  disabled = false,
  onSubmit,
  onDismiss,
  tokens,
}: CardComponentProps<AgentPersonaPayload>) {
  const persona = value.persona

  const [name, setName] = React.useState(persona.name ?? "")
  const [tone, setTone] = React.useState(persona.tone ?? "")
  const [style, setStyle] = React.useState(persona.style ?? "")
  const [greeting, setGreeting] = React.useState(persona.greeting ?? "")

  const submit = React.useCallback(() => {
    onSubmit({
      persona: {
        name: clean(name),
        tone: clean(tone),
        style: clean(style),
        greeting: clean(greeting),
      },
    })
  }, [greeting, name, onSubmit, style, tone])

  const previewText = greeting.trim().length > 0 ? greeting : GREETING_PLACEHOLDER
  const isPreviewPlaceholder = greeting.trim().length === 0
  const agentName = name.trim().length > 0 ? name.trim() : "Seu agente"

  return (
    <CardShell
      icon={<UserRound className="h-4 w-4" />}
      title="Personalidade do agente"
      reason="Defina nome, tom e estilo. A saudação aparece em tempo real como o cliente vai ver no WhatsApp."
      tokens={tokens}
      actions={[
        {
          label: "Confirmar personalidade",
          onClick: submit,
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
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="persona-name"
              className="text-[12px] font-medium"
              style={{ color: tokens.textSecondary }}
            >
              Nome
            </Label>
            <Input
              id="persona-name"
              value={name}
              disabled={disabled}
              placeholder="Ex.: Aurora"
              onChange={(event) => setName(event.target.value)}
              className="text-[13px]"
              style={{
                backgroundColor: tokens.bgBase,
                borderColor: tokens.divider,
                color: tokens.textPrimary,
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="persona-tone"
              className="text-[12px] font-medium"
              style={{ color: tokens.textSecondary }}
            >
              Tom
            </Label>
            <Input
              id="persona-tone"
              value={tone}
              disabled={disabled}
              placeholder="Ex.: acolhedor e direto"
              onChange={(event) => setTone(event.target.value)}
              className="text-[13px]"
              style={{
                backgroundColor: tokens.bgBase,
                borderColor: tokens.divider,
                color: tokens.textPrimary,
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="persona-style"
            className="text-[12px] font-medium"
            style={{ color: tokens.textSecondary }}
          >
            Estilo
          </Label>
          <Input
            id="persona-style"
            value={style}
            disabled={disabled}
            placeholder="Ex.: respostas curtas, usa emojis com moderação"
            onChange={(event) => setStyle(event.target.value)}
            className="text-[13px]"
            style={{
              backgroundColor: tokens.bgBase,
              borderColor: tokens.divider,
              color: tokens.textPrimary,
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="persona-greeting"
            className="text-[12px] font-medium"
            style={{ color: tokens.textSecondary }}
          >
            Saudação inicial
          </Label>
          <Textarea
            id="persona-greeting"
            value={greeting}
            disabled={disabled}
            placeholder={GREETING_PLACEHOLDER}
            onChange={(event) => setGreeting(event.target.value)}
            className="min-h-[64px] text-[13px]"
            style={{
              backgroundColor: tokens.bgBase,
              borderColor: tokens.divider,
              color: tokens.textPrimary,
            }}
          />
        </div>

        {/* Live WhatsApp preview — re-renders on every keystroke. */}
        <div className="flex flex-col gap-2">
          <span
            className="text-[11px] font-medium uppercase tracking-wide"
            style={{ color: tokens.textTertiary }}
          >
            Prévia no WhatsApp
          </span>
          <WhatsAppPreview
            agentName={agentName}
            text={previewText}
            muted={isPreviewPlaceholder}
            tokens={tokens}
          />
        </div>
      </div>
    </CardShell>
  )
}

/**
 * A faux WhatsApp chat window with a single incoming (agent) bubble. Kept inline
 * so the card owns its own preview rendering. Token-driven, no fetching.
 */
function WhatsAppPreview({
  agentName,
  text,
  muted,
  tokens,
}: {
  agentName: string
  text: string
  muted: boolean
  tokens: CardComponentProps["tokens"]
}) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{
        backgroundColor: tokens.bgBase,
        borderColor: tokens.divider,
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          <UserRound className="h-3.5 w-3.5" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span
            className="truncate text-[12px] font-semibold"
            style={{ color: tokens.textPrimary }}
          >
            {agentName}
          </span>
          <span
            className="text-[10px]"
            style={{ color: tokens.successText }}
          >
            online
          </span>
        </div>
      </div>

      <div className="flex">
        <div
          className="relative max-w-[85%] rounded-lg rounded-tl-sm px-3 py-2"
          style={{
            backgroundColor: tokens.bgSurface,
            borderColor: tokens.divider,
            borderWidth: 1,
          }}
        >
          <p
            className="whitespace-pre-wrap break-words text-[13px] leading-relaxed"
            style={{
              color: muted ? tokens.textTertiary : tokens.textPrimary,
              fontStyle: muted ? "italic" : "normal",
            }}
          >
            {text}
          </p>
        </div>
      </div>
    </div>
  )
}

export default AgentPersonaCard
