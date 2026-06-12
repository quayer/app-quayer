"use client"

/**
 * Builder Cards — review/persona-section (Jornada Builder v2, T40)
 *
 * Seção REUTILIZÁVEL com toda a lógica de formulário da persona, extraída
 * verbatim do `agent-persona-card.tsx` (zero duplicação): o card individual
 * (mantido para o reopen FR-17) e o card composto `agent_review` (T43)
 * consomem os MESMOS state/handlers/JSX daqui.
 *
 * O split é deliberado: a SEÇÃO é dona do estado do formulário (wizard de 2
 * passos, campos, saudação + live preview, "Sugerir nova" determinístico) e
 * expõe `buildPayload`/`canConfirm`/`step`/`setStep` para o CONTAINER orquestrar
 * o footer — porque o footer difere por consumidor (o card individual navega
 * Avançar/Voltar + "Confirmar personalidade"; o composto submete tudo de uma
 * vez junto das outras seções). O chrome (CardShell + ações) NÃO vive aqui.
 *
 *   `usePersonaSection(props)` — state + derivados + `buildPayload()`.
 *   `<PersonaSection state={...} />` — o corpo do wizard (Passo A: voz +
 *      identidade; Passo B: saudação + live preview), presentational only.
 *
 * Token-driven (zero cor hard-coded). Copy PT-BR. As 3 opções de "jeito de
 * falar" (spec §9 pendente 5) são preservadas sem mudança de comportamento.
 */

import * as React from "react"
import { ArrowLeft, ArrowRight, Check, Sparkles, UserRound } from "lucide-react"

import { Input } from "@/client/components/ui/input"
import { Label } from "@/client/components/ui/label"
import { Textarea } from "@/client/components/ui/textarea"
import { Button } from "@/client/components/ui/button"

import type { CardComponentProps } from "../types"
import type { CardShellAction } from "../card-shell"
import {
  SPEECH_MODES,
  DEFAULT_SPEECH_MODE,
  isSpeechMode,
  type SpeechMode,
} from "../persona/speech-mode"
import { suggestGreeting } from "../persona/greeting-suggestions"
import { resolveField, type PrefillOrigin } from "../prefill"
import { SuggestedBadge, UseSuggestionChip } from "../use-suggestion-chip"

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
const GREETING_PLACEHOLDER = "Olá! Tudo bem? 😊 Em que posso te ajudar hoje?"

export type WizardStep = "voice" | "greeting"

/**
 * The persona slice of `capturedProposals` (mirror of `capturedPersonaProposalSchema`
 * — name/tone/greeting). Passed to the section so a field PROPOSED at mount shows a
 * badge (T43) and a LATE proposal shows a "Usar sugestão" chip per field (T95). All
 * optional: the standalone card passes nothing and behaves exactly as before.
 */
export interface PersonaProposal {
  name?: string
  tone?: string
  greeting?: string
}

/** Trim a field to undefined when empty so we never persist blank strings. */
function clean(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * The shape `usePersonaSection` returns — everything the container needs to
 * render the body (`<PersonaSection state={...} />`) and orchestrate its footer.
 */
export interface PersonaSectionState {
  tokens: CardComponentProps["tokens"]
  disabled: boolean
  step: WizardStep
  setStep: (step: WizardStep) => void
  name: string
  setName: (name: string) => void
  tone: string
  setTone: (tone: string) => void
  style: string
  setStyle: (style: string) => void
  greeting: string
  setGreeting: (greeting: string) => void
  speechMode: SpeechMode
  setSpeechMode: (mode: SpeechMode) => void
  /**
   * Mount-time origin per badge-able field (`owned` | `proposed` | `default`).
   * Only `proposed` renders the "sugerido da conversa" badge (T43). Frozen at mount.
   */
  origin: { name: PrefillOrigin; tone: PrefillOrigin; greeting: PrefillOrigin }
  /**
   * LATE proposal (FR-23/T95): a persona proposal that arrived AFTER mount. Each
   * present field offers a per-field "Usar sugestão" chip; applying writes ONLY
   * that field and the host drops the chip. `undefined` = no late suggestion.
   */
  lateProposal?: PersonaProposal
  /** Per-field chip visibility — true while a late proposal exists AND it has not
   *  been applied yet (chip disappears after apply/submit — FR-23). */
  showChip: { name: boolean; tone: boolean; greeting: boolean }
  /** Apply a single LATE-proposed field (T95) — explicit, per field, never auto. */
  applyProposedName: () => void
  applyProposedTone: () => void
  applyProposedGreeting: () => void
  /** Regenerate the greeting from the current context (no LLM, no network). */
  suggestNewGreeting: () => void
  /** Live preview text — the greeting, or the placeholder when blank. */
  previewText: string
  isPreviewPlaceholder: boolean
  agentName: string
  /** At least name OR greeting — never confirm a fully blank persona. */
  canConfirm: boolean
  /** Build the typed payload from the current form state. */
  buildPayload: () => AgentPersonaPayload
}

/**
 * usePersonaSection — owns the whole persona form (wizard of 2 steps + fields +
 * deterministic greeting). Lifted verbatim from `AgentPersonaCard` so the card
 * individual and the composite `agent_review` card share one implementation.
 *
 * Prefills from `value.persona` with jornada-builder-v2 fallbacks (FR-02/FR-05):
 * the name falls back to `value.project.name` and the greeting opens ALREADY
 * suggested (initial value via `suggestGreeting`, not a placeholder) when blank.
 */
export function usePersonaSection({
  value,
  disabled = false,
  tokens,
  proposal,
  lateProposal,
}: Pick<
  CardComponentProps<AgentPersonaPayload>,
  "value" | "disabled" | "tokens"
> & {
  /** Mount-time persona proposal (`capturedProposals.persona`) — drives the
   *  `owned > proposed > default` precedence + the badge (T43). */
  proposal?: PersonaProposal
  /** LATE persona proposal that arrived after mount (T95 chips). */
  lateProposal?: PersonaProposal
}): PersonaSectionState {
  const persona = value.persona

  // `persona.speechMode` is the OPTIONAL G7 field. Read it defensively from the
  // opaque persona object so this stays green whether or not the coupled change
  // (personaStateSchema.speechMode) has landed yet — the payload we emit still
  // carries it for the backend Zod to accept.
  const initialSpeechMode = React.useMemo<SpeechMode>(() => {
    const raw = (persona as { speechMode?: unknown }).speechMode
    return isSpeechMode(raw) ? raw : DEFAULT_SPEECH_MODE
  }, [persona])

  // Nicho derivado (read-only) do texto livre — mesmas entradas que o
  // keyword-suggestions lê. Apenas alimenta o template determinístico.
  const niche = React.useMemo(
    () =>
      [value.project.objective, value.proposal.description]
        .filter((part): part is string => Boolean(part))
        .join(" "),
    [value.project.objective, value.proposal.description],
  )

  const [step, setStep] = React.useState<WizardStep>("voice")
  // FR-02/FR-23 (jornada-builder-v2) — prefill por exceção via `resolveField`
  // (T39): `owned confirmado > capturedProposals.persona > default`, calculado UMA
  // ÚNICA VEZ no mount (a `lateProposal` que chegar depois NÃO re-prefilla — vira
  // chip "Usar sugestão"). A origem de cada campo dirige o badge (só `proposed`).
  const initialName = React.useMemo(
    () =>
      resolveField({
        owned: clean(persona.name ?? ""),
        proposed: clean(proposal?.name ?? ""),
        // Default mantém o fallback histórico para `project.name` (texto livre).
        fallback: value.project.name ?? "",
      }),
    // Mount-only: deps vazias congelam o prefill (regra FR-23). ESLint exhaustive
    // é intencional aqui — re-resolver sobrescreveria digitação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const initialTone = React.useMemo(
    () =>
      resolveField({
        owned: clean(persona.tone ?? ""),
        proposed: clean(proposal?.tone ?? ""),
        fallback: "",
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  // FR-05 — saudação SUGERIDA já preenchida como VALOR inicial (não placeholder)
  // quando não há greeting owned nem proposto: o usuário edita por exceção.
  const initialGreeting = React.useMemo(
    () =>
      resolveField({
        owned: clean(persona.greeting ?? ""),
        proposed: clean(proposal?.greeting ?? ""),
        fallback: suggestGreeting({
          speechMode: initialSpeechMode,
          businessName: persona.name ?? proposal?.name ?? value.project.name,
          niche,
        }),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const [name, setName] = React.useState(initialName.value)
  const [tone, setTone] = React.useState(initialTone.value)
  const [style, setStyle] = React.useState(persona.style ?? "")
  const [greeting, setGreeting] = React.useState<string>(initialGreeting.value)
  const [speechMode, setSpeechMode] =
    React.useState<SpeechMode>(initialSpeechMode)

  const origin = React.useMemo(
    () => ({
      name: initialName.origin,
      tone: initialTone.origin,
      greeting: initialGreeting.origin,
    }),
    [initialName.origin, initialTone.origin, initialGreeting.origin],
  )

  // T95 — aplicar uma proposta TARDIA por campo é SEMPRE explícito; nunca
  // sobrescreve em silêncio. Cada handler escreve só o seu campo e marca o campo
  // como "aplicado" para o chip sumir (FR-23: chip some após aplicar/submeter).
  const [appliedLate, setAppliedLate] = React.useState<{
    name?: boolean
    tone?: boolean
    greeting?: boolean
  }>({})
  const applyProposedName = React.useCallback(() => {
    const next = clean(lateProposal?.name ?? "")
    if (next) setName(next)
    setAppliedLate((p) => ({ ...p, name: true }))
  }, [lateProposal?.name])
  const applyProposedTone = React.useCallback(() => {
    const next = clean(lateProposal?.tone ?? "")
    if (next) setTone(next)
    setAppliedLate((p) => ({ ...p, tone: true }))
  }, [lateProposal?.tone])
  const applyProposedGreeting = React.useCallback(() => {
    const next = clean(lateProposal?.greeting ?? "")
    if (next) setGreeting(next)
    setAppliedLate((p) => ({ ...p, greeting: true }))
  }, [lateProposal?.greeting])

  // Chip visível só enquanto há proposta tardia para o campo E ele ainda não foi
  // aplicado nesta sessão de edição.
  const showChip = {
    name: Boolean(clean(lateProposal?.name ?? "")) && !appliedLate.name,
    tone: Boolean(clean(lateProposal?.tone ?? "")) && !appliedLate.tone,
    greeting:
      Boolean(clean(lateProposal?.greeting ?? "")) && !appliedLate.greeting,
  }

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

  const buildPayload = React.useCallback<
    PersonaSectionState["buildPayload"]
  >(
    () => ({
      persona: {
        name: clean(name),
        tone: clean(tone),
        style: clean(style),
        greeting: clean(greeting),
        speechMode,
      },
    }),
    [greeting, name, speechMode, style, tone],
  )

  const previewText =
    greeting.trim().length > 0 ? greeting : GREETING_PLACEHOLDER
  const isPreviewPlaceholder = greeting.trim().length === 0
  const agentName = name.trim().length > 0 ? name.trim() : "Seu agente"
  // Exige ao menos nome OU saudação — nunca confirma uma persona totalmente vazia.
  const canConfirm = Boolean(clean(name) || clean(greeting))

  return {
    tokens,
    disabled,
    step,
    setStep,
    name,
    setName,
    tone,
    setTone,
    style,
    setStyle,
    greeting,
    setGreeting,
    speechMode,
    setSpeechMode,
    origin,
    lateProposal,
    showChip,
    applyProposedName,
    applyProposedTone,
    applyProposedGreeting,
    suggestNewGreeting,
    previewText,
    isPreviewPlaceholder,
    agentName,
    canConfirm,
    buildPayload,
  }
}

/**
 * The footer actions for the STANDALONE persona card (reopen FR-17). Kept here
 * next to the wizard state so the individual card stays a thin shell wrapper.
 * FR-20 (jornada-builder-v2) — passo OBRIGATÓRIO: sem "Agora não"/dismiss.
 */
export function personaCardActions(
  state: PersonaSectionState,
  submit: () => void,
): CardShellAction[] {
  const { step, setStep, disabled, canConfirm } = state
  return step === "voice"
    ? [
        {
          label: "Ajustar saudação",
          onClick: () => setStep("greeting"),
          variant: "primary" as const,
          icon: <ArrowRight className="h-3.5 w-3.5" />,
          disabled,
        },
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
}

/**
 * PersonaSection — o corpo do wizard de persona (Passo A: voz + identidade;
 * Passo B: saudação + live preview + "Sugerir nova" determinístico).
 * Presentational only: lê tudo do `state` de `usePersonaSection`.
 */
export function PersonaSection({ state }: { state: PersonaSectionState }) {
  const {
    tokens,
    disabled,
    step,
    name,
    setName,
    tone,
    setTone,
    style,
    setStyle,
    greeting,
    setGreeting,
    speechMode,
    setSpeechMode,
    origin,
    lateProposal,
    showChip,
    applyProposedName,
    applyProposedTone,
    applyProposedGreeting,
    suggestNewGreeting,
    previewText,
    isPreviewPlaceholder,
    agentName,
  } = state
  const selectedSpeechMode =
    SPEECH_MODES.find((option) => option.key === speechMode) ?? SPEECH_MODES[0]
  const toneSummary = tone.trim() || "tom ainda não definido"
  const styleSummary = style.trim() || "instruções opcionais"

  if (step === "voice") {
    return (
      <div className="flex flex-col gap-4">
        {/* Voice chips — role=radio, mesmo idioma do PRESET_OPTIONS. */}
        <div
          className="flex flex-col gap-2"
          role="radiogroup"
          aria-label="Como o agente se apresenta"
        >
          <span
            className="text-[12px] font-medium"
            style={{ color: tokens.textSecondary }}
          >
            Como o agente se apresenta
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
            <div className="flex items-center gap-2">
              <Label
                htmlFor="persona-name"
                className="text-[12px] font-medium"
                style={{ color: tokens.textSecondary }}
              >
                Nome exibido no atendimento
              </Label>
              {origin.name === "proposed" && <SuggestedBadge tokens={tokens} />}
            </div>
            <Input
              id="persona-name"
              value={name}
              disabled={disabled}
              placeholder="Ex.: SDR Vibra Butantã"
              onChange={(event) => setName(event.target.value)}
              className="text-[13px]"
              style={{
                backgroundColor: tokens.bgBase,
                borderColor: tokens.divider,
                color: tokens.textPrimary,
              }}
            />
            {showChip.name && (
              <UseSuggestionChip
                label={`Usar sugestão: "${lateProposal!.name!.trim()}"`}
                onApply={applyProposedName}
                disabled={disabled}
                tokens={tokens}
              />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Label
                htmlFor="persona-tone"
                className="text-[12px] font-medium"
                style={{ color: tokens.textSecondary }}
              >
                Tom comercial
              </Label>
              {origin.tone === "proposed" && <SuggestedBadge tokens={tokens} />}
            </div>
            <Input
              id="persona-tone"
              value={tone}
              disabled={disabled}
              placeholder="Ex.: consultivo, claro e sem pressão"
              onChange={(event) => setTone(event.target.value)}
              className="text-[13px]"
              style={{
                backgroundColor: tokens.bgBase,
                borderColor: tokens.divider,
                color: tokens.textPrimary,
              }}
            />
            {showChip.tone && (
              <UseSuggestionChip
                label={`Usar sugestão: "${lateProposal!.tone!.trim()}"`}
                onApply={applyProposedTone}
                disabled={disabled}
                tokens={tokens}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="persona-style"
            className="text-[12px] font-medium"
            style={{ color: tokens.textSecondary }}
          >
            Instruções de conversa
          </Label>
          <Input
            id="persona-style"
            value={style}
            disabled={disabled}
            placeholder="Ex.: respostas curtas, sem emojis, chama para visita"
            onChange={(event) => setStyle(event.target.value)}
            className="text-[13px]"
            style={{
              backgroundColor: tokens.bgBase,
              borderColor: tokens.divider,
              color: tokens.textPrimary,
            }}
          />
        </div>

        <div className="border-t pt-3" style={{ borderColor: tokens.divider }}>
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: tokens.textTertiary }}
          >
            Vai falar como
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[selectedSpeechMode.label, toneSummary, styleSummary].map(
              (item) => (
                <span
                  key={item}
                  className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{
                    backgroundColor: tokens.brandSubtle,
                    color: tokens.brandText,
                  }}
                >
                  {item}
                </span>
              ),
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Label
              htmlFor="persona-greeting"
              className="text-[12px] font-medium"
              style={{ color: tokens.textSecondary }}
            >
              Saudação inicial
            </Label>
            {origin.greeting === "proposed" && (
              <SuggestedBadge tokens={tokens} />
            )}
          </div>
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
        {showChip.greeting && (
          <UseSuggestionChip
            label="Usar sugestão da conversa"
            onApply={applyProposedGreeting}
            disabled={disabled}
            tokens={tokens}
          />
        )}
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
  )
}

/**
 * A faux WhatsApp chat window with a single incoming (agent) bubble. Kept inline
 * so the section owns its own preview rendering. Token-driven, no fetching.
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
          <span className="text-[10px]" style={{ color: tokens.successText }}>
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
