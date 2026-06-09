"use client"

/**
 * Builder Cards — agent_persona (Onda C, G7 — wizard de 2 passos)
 *
 * Refactor do form único num WIZARD de 2 passos dentro do MESMO CardShell
 * (sem card novo, sem rota nova — `step` é state local):
 *
 *   Passo A ("voice"):  chips role=radio de "jeito de falar" (assistant /
 *                       first_person / secretary, idioma do PRESET_OPTIONS do
 *                       business-hours-card) + nome do negócio + tom + estilo.
 *   Passo B ("greeting"): textarea da saudação + a LIVE WhatsAppPreview (mantida
 *                       verbatim) + botão "Sugerir nova" que chama o helper
 *                       DETERMINÍSTICO `suggestGreeting` (sem LLM, sem rede,
 *                       espelhando keyword-suggestions).
 *
 * "Voltar"/"Avançar" navegam; "Confirmar personalidade" só no Passo B. O
 * payload mantém a FORMA `{ persona: { name?, tone?, style?, greeting? } }` e
 * adiciona o campo OPCIONAL `persona.speechMode?` (o chip escolhido) — opcional
 * em todo lugar, nunca trava a etapa de persona.
 *
 * Presentational only: lê seu slice de `props.value` e dispara o payload tipado
 * via `props.onSubmit`. Token-driven (zero cor hard-coded). Copy PT-BR.
 *
 * Contract:
 *   cardKey  : "agent_persona"
 *   payload  : { persona: { name?; tone?; style?; greeting?; speechMode? } }
 *   state    : persona.*            (confirmation key: persona)
 */

import * as React from "react"
import { ArrowLeft, ArrowRight, Check, Sparkles, UserRound } from "lucide-react"

import { Input } from "@/client/components/ui/input"
import { Label } from "@/client/components/ui/label"
import { Textarea } from "@/client/components/ui/textarea"
import { Button } from "@/client/components/ui/button"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"
import {
  SPEECH_MODES,
  DEFAULT_SPEECH_MODE,
  isSpeechMode,
  type SpeechMode,
} from "./persona/speech-mode"
import { suggestGreeting } from "./persona/greeting-suggestions"

/** The exact payload `agent_persona` submits up to chat-panel. */
export interface AgentPersonaPayload {
  persona: {
    name?: string
    tone?: string
    style?: string
    greeting?: string
    /** Onda C, G7 — OPCIONAL: chip de voz; não trava a etapa de persona. */
    speechMode?: SpeechMode
  }
}

/** Fallback greeting shown in the bubble before the user types anything. */
const GREETING_PLACEHOLDER =
  "Olá! Tudo bem? 😊 Em que posso te ajudar hoje?"

type WizardStep = "voice" | "greeting"

/** Trim a field to undefined when empty so we never persist blank strings. */
function clean(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * AgentPersonaCard — wizard de persona (Passo A: voz + identidade; Passo B:
 * saudação + live preview + "Sugerir nova" determinístico).
 *
 * Pré-preenche de `value.persona`; submete `{ persona: { ... } }` (+ speechMode
 * opcional). Desabilitado enquanto o chat está streamando (`disabled`).
 */
export function AgentPersonaCard({
  value,
  disabled = false,
  onSubmit,
  onDismiss,
  tokens,
}: CardComponentProps<AgentPersonaPayload>) {
  const persona = value.persona

  const [step, setStep] = React.useState<WizardStep>("voice")
  const [name, setName] = React.useState(persona.name ?? "")
  const [tone, setTone] = React.useState(persona.tone ?? "")
  const [style, setStyle] = React.useState(persona.style ?? "")
  const [greeting, setGreeting] = React.useState(persona.greeting ?? "")
  // `persona.speechMode` is the OPTIONAL G7 field. Read it defensively from the
  // opaque persona object so this card stays green whether or not the Integrate
  // coupled change (personaStateSchema.speechMode) has landed yet — the payload
  // we emit still carries it for the backend Zod to accept.
  const initialSpeechMode = React.useMemo<SpeechMode>(() => {
    const raw = (persona as { speechMode?: unknown }).speechMode
    return isSpeechMode(raw) ? raw : DEFAULT_SPEECH_MODE
  }, [persona])
  const [speechMode, setSpeechMode] =
    React.useState<SpeechMode>(initialSpeechMode)

  // Nicho derivado (read-only) do texto livre — mesmas entradas que o
  // keyword-suggestions lê. Apenas alimenta o template determinístico.
  const niche = React.useMemo(
    () =>
      [value.project.objective, value.proposal.description]
        .filter((part): part is string => Boolean(part))
        .join(" "),
    [value.project.objective, value.proposal.description],
  )

  /** "Sugerir nova" — regera a saudação DETERMINÍSTICA a partir do contexto. */
  const suggestNewGreeting = React.useCallback(() => {
    if (disabled) return
    setGreeting(
      suggestGreeting({
        speechMode,
        businessName: name,
        niche,
      }),
    )
  }, [disabled, name, niche, speechMode])

  const submit = React.useCallback(() => {
    if (disabled) return
    onSubmit({
      persona: {
        name: clean(name),
        tone: clean(tone),
        style: clean(style),
        greeting: clean(greeting),
        speechMode,
      },
    })
  }, [disabled, greeting, name, onSubmit, speechMode, style, tone])

  const previewText = greeting.trim().length > 0 ? greeting : GREETING_PLACEHOLDER
  const isPreviewPlaceholder = greeting.trim().length === 0
  const agentName = name.trim().length > 0 ? name.trim() : "Seu agente"
  // Exige ao menos nome OU saudação — nunca confirma uma persona totalmente vazia.
  const canConfirm = Boolean(clean(name) || clean(greeting))

  // Footer actions differ per step: A navigates forward, B confirms + back.
  const actions =
    step === "voice"
      ? [
          {
            label: "Avançar",
            onClick: () => setStep("greeting"),
            variant: "primary" as const,
            icon: <ArrowRight className="h-3.5 w-3.5" />,
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
        ]
      : [
          {
            label: "Confirmar personalidade",
            onClick: submit,
            variant: "primary" as const,
            icon: <Check className="h-3.5 w-3.5" />,
            disabled: disabled || !canConfirm,
          },
          {
            label: "Voltar",
            onClick: () => setStep("voice"),
            variant: "secondary" as const,
            icon: <ArrowLeft className="h-3.5 w-3.5" />,
            disabled,
          },
        ]

  return (
    <CardShell
      icon={<UserRound className="h-4 w-4" />}
      title="Personalidade do agente"
      reason={
        step === "voice"
          ? "Passo 1 de 2 — escolha o jeito de falar e a identidade do agente."
          : "Passo 2 de 2 — ajuste a saudação. Ela aparece em tempo real como o cliente vai ver no WhatsApp."
      }
      tokens={tokens}
      actions={actions}
    >
      {step === "voice" ? (
        <div className="flex flex-col gap-4">
          {/* Voice chips — role=radio, mesmo idioma do PRESET_OPTIONS. */}
          <div
            className="flex flex-col gap-2"
            role="radiogroup"
            aria-label="Jeito de falar do agente"
          >
            <span
              className="text-[12px] font-medium"
              style={{ color: tokens.textSecondary }}
            >
              Jeito de falar
            </span>
            <div className="grid gap-2 sm:grid-cols-3">
              {SPEECH_MODES.map((option) => {
                const active = speechMode === option.key
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={disabled}
                    onClick={() => setSpeechMode(option.key)}
                    className="rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      backgroundColor: active
                        ? tokens.brandSubtle
                        : tokens.bgBase,
                      borderColor: active ? tokens.brand : tokens.divider,
                    }}
                  >
                    <span
                      className="block text-[13px] font-medium"
                      style={{ color: tokens.textPrimary }}
                    >
                      {option.label}
                    </span>
                    <span
                      className="mt-1 block text-[11px] leading-relaxed"
                      style={{ color: tokens.textSecondary }}
                    >
                      {option.hint}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Identity: business name + tone + style */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="persona-name"
                className="text-[12px] font-medium"
                style={{ color: tokens.textSecondary }}
              >
                Nome do negócio / agente
              </Label>
              <Input
                id="persona-name"
                value={name}
                disabled={disabled}
                placeholder="Ex.: Clínica Aurora"
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
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label
                htmlFor="persona-greeting"
                className="text-[12px] font-medium"
                style={{ color: tokens.textSecondary }}
              >
                Saudação inicial
              </Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={suggestNewGreeting}
                className="h-7 gap-1.5 text-[12px]"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Sugerir nova
              </Button>
            </div>
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
      )}
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
