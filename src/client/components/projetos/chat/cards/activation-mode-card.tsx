"use client"

/**
 * Builder Cards — Activation Mode (Orayon Uplift, W3)
 *
 * cardKey `activation_mode`. Lets the user pick HOW the agent activates on an
 * inbound message (the `AIAgentConfig.activationMode` enum) and, for the
 * keyword-triggered mode, edit the trigger keyword list as chips.
 *
 * PRESENTATIONAL ONLY: pre-fills from `props.value.activation`, blocks while
 * `props.disabled`, and on confirm fires `props.onSubmit({ mode, keywords })`
 * exactly per the CARD CONTRACT — it never fetches (chat-panel owns POST + SSE).
 *
 * The four modes mirror `prisma/schema.prisma AIAgentConfig.activationMode`:
 *   all | all_except_blacklist | keyword_trigger | whitelist_only
 *
 * Contract: docs/builder/ORAYON_UPLIFT_SPEC.md (card catalog).
 */

import * as React from "react"
import { Check, ChevronDown, KeyRound, Plus, X } from "lucide-react"

import type {
  ActivationModePayload,
} from "@/server/ai-module/builder/cards/card-submit.schemas"
import { CardShell } from "./card-shell"
import { suggestKeywordsForProject } from "./keyword-suggestions"
import type { CardComponentProps } from "./types"

/**
 * The submit payload this card produces. Mirrors `activationModePayloadSchema`
 * minus its `cardKey` discriminator (chat-panel attaches/owns the route key).
 */
export type ActivationModeCardPayload = Omit<ActivationModePayload, "cardKey">

/** The activation-mode enum values (mirror AIAgentConfig.activationMode). */
const ACTIVATION_MODES = [
  "all",
  "all_except_blacklist",
  "keyword_trigger",
  "whitelist_only",
] as const

type ActivationModeValue = (typeof ACTIVATION_MODES)[number]

interface ActivationModeOption {
  value: ActivationModeValue
  title: string
  description: string
}

const ACTIVATION_MODE_OPTIONS: readonly ActivationModeOption[] = [
  {
    value: "all",
    title: "Toda mensagem",
    description:
      "A IA responde a qualquer mensagem recebida (comportamento padrão).",
  },
  {
    value: "all_except_blacklist",
    title: "Todas, exceto bloqueados",
    description:
      "Responde a todos, menos contatos marcados como bloqueados na conversa.",
  },
  {
    value: "keyword_trigger",
    title: "Por palavra-chave",
    description:
      "Só responde quando a mensagem contém uma das palavras-chave abaixo.",
  },
  {
    value: "whitelist_only",
    title: "Apenas liberados",
    description:
      "Só responde a contatos explicitamente liberados (whitelist) na conversa.",
  },
]

/**
 * Onda 3d — anti visual-overload: os 2 modos COMUNS ficam sempre visíveis e os
 * 2 AVANÇADOS colapsam atrás de um expander "Mostrar opções avançadas".
 * Os 4 modos seguem 100% selecionáveis (em especial `all_except_blacklist`,
 * que destrava o passo `silenced_contacts` no step-engine) — só mudou o LAYOUT.
 */
const COMMON_MODES: readonly ActivationModeValue[] = ["all", "keyword_trigger"]
const ADVANCED_MODES: readonly ActivationModeValue[] = [
  "all_except_blacklist",
  "whitelist_only",
]

const COMMON_OPTIONS = ACTIVATION_MODE_OPTIONS.filter((option) =>
  COMMON_MODES.includes(option.value),
)
const ADVANCED_OPTIONS = ACTIVATION_MODE_OPTIONS.filter((option) =>
  ADVANCED_MODES.includes(option.value),
)

/** Default mode when the state carries no (or an unknown) activation mode. */
const DEFAULT_MODE: ActivationModeValue = "all"

function isActivationMode(value: string): value is ActivationModeValue {
  return (ACTIVATION_MODES as readonly string[]).includes(value)
}

function isAdvancedMode(value: ActivationModeValue): boolean {
  return ADVANCED_MODES.includes(value)
}

/** Trim + drop empties + dedupe (case-insensitive) while preserving order. */
function normalizeKeywords(keywords: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of keywords) {
    const trimmed = raw.trim()
    if (trimmed.length === 0) continue
    const lower = trimmed.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    out.push(trimmed)
  }
  return out
}

/**
 * ActivationModeCard — radio over the four activation modes; the keyword chip
 * editor appears only for `keyword_trigger`. Submits `{ mode, keywords }`.
 */
export function ActivationModeCard({
  value,
  disabled = false,
  onSubmit,
  tokens,
}: CardComponentProps<ActivationModeCardPayload>) {
  const initialMode = React.useMemo<ActivationModeValue>(() => {
    const persisted = value.activation.mode
    return persisted && isActivationMode(persisted) ? persisted : DEFAULT_MODE
  }, [value.activation.mode])

  const [mode, setMode] = React.useState<ActivationModeValue>(initialMode)
  const [keywords, setKeywords] = React.useState<string[]>(() =>
    normalizeKeywords(value.activation.keywords),
  )
  const [draft, setDraft] = React.useState("")

  // Expander dos 2 modos avançados — já abre se o modo persistido for avançado,
  // garantindo que o usuário enxergue a opção que já está selecionada.
  const [advancedOpen, setAdvancedOpen] = React.useState<boolean>(() =>
    isAdvancedMode(initialMode),
  )

  const addKeyword = React.useCallback(() => {
    const trimmed = draft.trim()
    if (trimmed.length === 0) return
    setKeywords((current) => normalizeKeywords([...current, trimmed]))
    setDraft("")
  }, [draft])

  const removeKeyword = React.useCallback((keyword: string) => {
    setKeywords((current) => current.filter((item) => item !== keyword))
  }, [])

  const handleDraftKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault()
        addKeyword()
      }
    },
    [addKeyword],
  )

  const isKeywordMode = mode === "keyword_trigger"

  // Sugestões de keyword derivadas do TEXTO LIVRE do projeto (helper PURO).
  // value.project / value.proposal são lidos read-only — sem mutação de state.
  const suggested = React.useMemo(
    () =>
      suggestKeywordsForProject({
        objective: value.project.objective,
        proposalDescription: value.proposal.description,
        projectName: value.project.name,
      }),
    [value.project.objective, value.proposal.description, value.project.name],
  )

  // Filtra as sugestões já presentes (dedupe case-insensitive coerente com
  // normalizeKeywords) para não oferecer chip de keyword que já está na lista.
  const availableSuggestions = React.useMemo(() => {
    const present = new Set(keywords.map((kw) => kw.trim().toLowerCase()))
    return suggested.filter((kw) => !present.has(kw.trim().toLowerCase()))
  }, [keywords, suggested])

  const addSuggested = React.useCallback((keyword: string) => {
    setKeywords((current) => normalizeKeywords([...current, keyword]))
  }, [])

  const handleConfirm = React.useCallback(() => {
    onSubmit({
      mode,
      // Keywords only matter for keyword_trigger; send [] otherwise so the
      // server doesn't carry stale triggers for a non-keyword mode.
      keywords: isKeywordMode ? normalizeKeywords(keywords) : [],
    })
  }, [isKeywordMode, keywords, mode, onSubmit])

  // Block confirm if keyword mode is selected but no keyword was provided.
  const confirmDisabled =
    disabled || (isKeywordMode && normalizeKeywords(keywords).length === 0)

  // Render de um modo (radio) — compartilhado entre os comuns e os avançados
  // para manter EXATAMENTE o mesmo visual/comportamento de seleção dos 4.
  const renderOption = (option: ActivationModeOption) => {
    const checked = mode === option.value
    return (
      <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => setMode(option.value)}
        className="group rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          backgroundColor: checked ? tokens.brandSubtle : tokens.bgBase,
          borderColor: checked ? tokens.brand : tokens.divider,
        }}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <span
              className="text-[13px] font-medium"
              style={{ color: tokens.textPrimary }}
            >
              {option.title}
            </span>
            <p
              className="mt-1 text-[12px] leading-relaxed"
              style={{ color: tokens.textSecondary }}
            >
              {option.description}
            </p>
          </div>
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
            style={{
              backgroundColor: checked ? tokens.brand : "transparent",
              borderColor: checked ? tokens.brand : tokens.divider,
              color: checked ? tokens.textInverse : "transparent",
            }}
          >
            {checked && <Check className="h-3 w-3" strokeWidth={3} />}
          </span>
        </div>
      </button>
    )
  }

  return (
    <CardShell
      icon={<KeyRound className="h-4 w-4" />}
      title="Quando a IA deve responder?"
      reason="Escolha o gatilho que ativa o agente em uma conversa."
      tokens={tokens}
      actions={[
        {
          label: "Confirmar ativação",
          onClick: handleConfirm,
          variant: "primary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled: confirmDisabled,
        },
      ]}
    >
      <div className="flex flex-col gap-2">
        {COMMON_OPTIONS.map(renderOption)}

        <button
          type="button"
          aria-expanded={advancedOpen}
          disabled={disabled}
          onClick={() => setAdvancedOpen((open) => !open)}
          className="mt-1 inline-flex items-center gap-1.5 self-start rounded-md px-1 py-1 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{ color: tokens.textSecondary }}
        >
          <ChevronDown
            className="h-3.5 w-3.5 transition-transform"
            style={{
              transform: advancedOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
          {advancedOpen
            ? "Ocultar opções avançadas"
            : "Mostrar opções avançadas"}
        </button>

        {advancedOpen && (
          <div className="flex flex-col gap-2">
            {ADVANCED_OPTIONS.map(renderOption)}
          </div>
        )}
      </div>

      {isKeywordMode && (
        <div className="mt-4">
          <p
            className="text-[12px] font-medium"
            style={{ color: tokens.textPrimary }}
          >
            Palavras-chave
          </p>
          <p
            className="mt-1 text-[11px] leading-relaxed"
            style={{ color: tokens.textTertiary }}
          >
            A IA responde quando a mensagem contém qualquer uma destas.
          </p>

          {keywords.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px]"
                  style={{
                    backgroundColor: tokens.brandSubtle,
                    borderColor: tokens.brandBorder,
                    color: tokens.brandText,
                  }}
                >
                  {keyword}
                  <button
                    type="button"
                    aria-label={`Remover ${keyword}`}
                    disabled={disabled}
                    onClick={() => removeKeyword(keyword)}
                    className="flex h-3.5 w-3.5 items-center justify-center rounded-full transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={draft}
              disabled={disabled}
              placeholder="Ex.: orçamento, agendar..."
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleDraftKeyDown}
              className="flex h-9 flex-1 rounded-md border px-3 py-1 text-[13px] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                backgroundColor: tokens.bgBase,
                borderColor: tokens.divider,
                color: tokens.textPrimary,
              }}
            />
            <button
              type="button"
              aria-label="Adicionar palavra-chave"
              disabled={disabled || draft.trim().length === 0}
              onClick={addKeyword}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                backgroundColor: tokens.bgBase,
                borderColor: tokens.divider,
                color: tokens.textSecondary,
              }}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {availableSuggestions.length > 0 && (
            <div className="mt-3">
              <p
                className="text-[11px]"
                style={{ color: tokens.textTertiary }}
              >
                Sugestões para o seu negócio:
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {availableSuggestions.map((keyword) => (
                  <button
                    key={keyword}
                    type="button"
                    disabled={disabled}
                    aria-label={`Adicionar sugestão ${keyword}`}
                    onClick={() => addSuggested(keyword)}
                    className="group inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-0.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      borderColor: tokens.divider,
                      color: tokens.textSecondary,
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.borderColor = tokens.brand
                      event.currentTarget.style.color = tokens.brandText
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.borderColor = tokens.divider
                      event.currentTarget.style.color = tokens.textSecondary
                    }}
                  >
                    <Plus className="h-3 w-3" />
                    {keyword}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </CardShell>
  )
}

export default ActivationModeCard
