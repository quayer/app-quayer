"use client"

/**
 * Builder Cards — review/disclosure-section (Jornada v2 · T43, FR-21)
 *
 * The "Como o agente se apresenta" advanced section of the composite `agent_review`
 * card, migrated from the removed identity surface (the only non-duplicated field it
 * carried): the disclosure mode (`ai_explicit` / `human_passthrough` / `custom`)
 * plus the legal acceptance gate for `human_passthrough`.
 *
 * Split out of `agent-review-card.tsx` to keep the orchestrator a thin ≤300-line
 * composer (FILE_SIZE_GUIDELINES — extract a module instead of fattening the host).
 * It is CONTROLLED-OUTPUT like the other review sections: it owns its own UI state
 * (open/closed, selected mode, custom text, acceptance) and lifts the built
 * `disclosure` payload UP via `onChange`. The host owns the single POST.
 *
 * `human_passthrough` only enters the payload AFTER the user accepts the legal
 * disclaimer — until then `onChange` emits `undefined` and the previous mode holds.
 */

import * as React from "react"
import { AlertTriangle, ChevronDown } from "lucide-react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"
import {
  DEFAULT_AGENT_IDENTITY_CARD,
  type DisclosureMode,
} from "@/lib/agent-identity-card"

/** The disclosure value the section emits up (matches the agent_review payload). */
export interface DisclosureValue {
  mode: DisclosureMode
  customText?: string
}

/** The 3 disclosure options (FR-21), rewritten for the review card context. */
const DISCLOSURE_OPTIONS: ReadonlyArray<{
  value: DisclosureMode
  label: string
  hint: string
}> = [
  {
    value: "ai_explicit",
    label: "IA transparente",
    hint: '"Sou o atendimento virtual da equipe..."',
  },
  {
    value: "human_passthrough",
    label: "Parece humano",
    hint: '"Oi, aqui é a Marina" sem dizer que é IA',
  },
  {
    value: "custom",
    label: "Texto próprio",
    hint: "Defina exatamente como o agente abre a conversa",
  },
]

/**
 * DisclosureSection — collapsible advanced section. Emits the built `DisclosureValue`
 * (or `undefined` when nothing chosen / human_passthrough not yet accepted) via
 * `onChange` whenever it changes. Renders no footer; the host owns submit.
 */
export function DisclosureSection({
  disabled = false,
  tokens,
  onChange,
}: {
  disabled?: boolean
  tokens: AppTokens
  onChange: (value: DisclosureValue | undefined) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [mode, setMode] = React.useState<DisclosureMode | null>(null)
  const [customText, setCustomText] = React.useState(
    DEFAULT_AGENT_IDENTITY_CARD.disclosureCustomText ?? "",
  )
  const [accepted, setAccepted] = React.useState(false)

  // Lift the built value up. human_passthrough requires the legal acceptance
  // first (mirrors the old identity surface) — before that it stays out of the payload.
  const built = React.useMemo<DisclosureValue | undefined>(() => {
    if (!mode) return undefined
    if (mode === "human_passthrough" && !accepted) return undefined
    if (mode === "custom") {
      const text = customText.trim()
      return { mode: "custom", customText: text.length > 0 ? text : undefined }
    }
    return { mode }
  }, [accepted, customText, mode])

  const onChangeRef = React.useRef(onChange)
  React.useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])
  React.useEffect(() => {
    onChangeRef.current(built)
  }, [built])

  return (
    <div className="rounded-lg border" style={{ borderColor: tokens.divider }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span
          className="text-[12px] font-medium"
          style={{ color: tokens.textSecondary }}
        >
          Transparência no atendimento{" "}
          <span style={{ color: tokens.textTertiary }}>(avançado)</span>
        </span>
        <ChevronDown
          className="h-4 w-4 transition-transform"
          style={{
            color: tokens.textTertiary,
            transform: open ? "rotate(180deg)" : "none",
          }}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          className="flex flex-col gap-1.5 px-3 pb-3"
          role="radiogroup"
          aria-label="Modo de identidade"
        >
          {DISCLOSURE_OPTIONS.map((option) => {
            const active = mode === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => {
                  setMode(option.value)
                  if (option.value !== "human_passthrough") setAccepted(false)
                }}
                className="flex items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  borderColor: active ? tokens.brand : tokens.divider,
                  backgroundColor: active ? tokens.brandSubtle : tokens.bgBase,
                }}
              >
                <span
                  className="text-[13px] font-medium"
                  style={{ color: tokens.textPrimary }}
                >
                  {option.label}
                </span>
                <span className="text-[11px]" style={{ color: tokens.textTertiary }}>
                  {option.hint}
                </span>
              </button>
            )
          })}

          {mode === "human_passthrough" && (
            <div
              className="rounded-md border p-2.5"
              style={{
                borderColor: tokens.warning,
                backgroundColor: tokens.warningSubtle,
              }}
            >
              <p
                className="flex items-start gap-2 text-[11px]"
                style={{ color: tokens.warningText }}
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Esse modo aumenta conversão no curto prazo, mas cobra a conta
                  depois: pode violar LGPD/CDC, política do WhatsApp e quebrar
                  confiança quando o lead percebe que era IA.
                </span>
              </p>
              {!accepted && (
                <p
                  className="mt-1.5 text-[11px] font-medium"
                  style={{ color: tokens.warningText }}
                >
                  Pendente de aceite — esse modo não será salvo até você assumir
                  o risco.
                </p>
              )}
              <label
                className="mt-2 flex cursor-pointer items-center gap-2 text-[11px]"
                style={{ color: tokens.warningText }}
              >
                <input
                  type="checkbox"
                  checked={accepted}
                  disabled={disabled}
                  onChange={(e) => setAccepted(e.target.checked)}
                />
                Entendi o risco e quero usar mesmo assim.
              </label>
            </div>
          )}

          {mode === "custom" && (
            <textarea
              value={customText}
              disabled={disabled}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Ex.: Sou o atendimento oficial da Vibra Butantã. Vou entender seu perfil e te encaminhar para um consultor."
              className="min-h-[60px] rounded-md border px-3 py-2 text-[13px] outline-none disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                backgroundColor: tokens.bgBase,
                borderColor: tokens.divider,
                color: tokens.textPrimary,
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

export default DisclosureSection
