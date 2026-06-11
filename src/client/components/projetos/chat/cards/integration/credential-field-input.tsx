"use client"

/**
 * Integration Builder — shared credential field input (Wave 1, T35)
 *
 * SHARED leaf component used by BOTH the panel dialog (T38) and the chat card
 * (T40). It renders ONE `CredentialField` (see
 * `integration.schemas.ts` → `credentialFieldSchema`) as a masked secret input
 * with a momentary reveal toggle, an inline "Onde encontro?" disclosure, and
 * inline format validation derived from the field's optional `formatRegex`.
 *
 * SECURITY (load-bearing — mirrors the schema's invariants):
 *  - This component NEVER displays a value coming from the server. The parent is
 *    the single source of truth for the controlled `value` and always passes the
 *    user's freshly-typed input; reads from the server return only a "filled?"
 *    flag, never the secret (see `updateCredentialsBodySchema` docs). So `value`
 *    is rendered verbatim and is masked-by-default purely as a shoulder-surfing
 *    guard, not as an integrity guarantee.
 *
 * VALIDATION CONTRACT (consumed by parents — do not change the shape):
 *  - When `formatRegex` is present we compile it ONCE (guarded by try/catch — a
 *    malformed regex degrades to "no validation", never throws into render) and
 *    test the current `value` on every change.
 *  - `onValidityChange(valid)` is called with the boolean validity. An EMPTY
 *    value is treated as not-yet-valid (`false`) but is NOT surfaced as an error
 *    until the field has been touched (blurred or typed into) — so a pristine
 *    field never shows red.
 *  - With no `formatRegex`, any non-empty value is valid; empty is invalid.
 *
 * PRESENTATIONAL: no fetch, no IO. Themed 100% via `useAppTokens()` (no
 * hard-coded colors). Copy in PT-BR. Zero `any`.
 */

import * as React from "react"
import { Eye, EyeOff, HelpCircle, ChevronDown, ChevronRight } from "lucide-react"

import { Input } from "@/client/components/ui/input"
import { Label } from "@/client/components/ui/label"
import { useAppTokens } from "@/client/hooks/use-app-tokens"

/**
 * Shape of a single credential field. Kept structural (not an `import type` of
 * the Zod-inferred `CredentialField`) so this client leaf stays decoupled from
 * the server schema module — but it is byte-for-byte the same shape.
 */
export interface CredentialFieldInputProps {
  field: {
    key: string
    label: string
    whereToGet: string
    formatRegex?: string
    placeholder?: string
  }
  /** Controlled value — ALWAYS the user's freshly-typed input, never a server echo. */
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  /** Validity surfaced to the parent. Empty value = not-yet-valid (`false`). */
  onValidityChange?: (valid: boolean) => void
}

/**
 * Compiles `formatRegex` exactly once per distinct pattern. A malformed pattern
 * resolves to `null` ("no validation") instead of throwing — a hostile/typo'd
 * template must never crash the form.
 */
function useCompiledRegex(formatRegex: string | undefined): RegExp | null {
  return React.useMemo<RegExp | null>(() => {
    if (!formatRegex) return null
    try {
      return new RegExp(formatRegex)
    } catch {
      return null
    }
  }, [formatRegex])
}

/**
 * CredentialFieldInput — masked secret input + reveal toggle + "Onde encontro?"
 * disclosure + inline format validation.
 *
 * @see CredentialFieldInputProps for the exact contract consumed by parents.
 */
export function CredentialFieldInput({
  field,
  value,
  onChange,
  disabled = false,
  onValidityChange,
}: CredentialFieldInputProps): React.JSX.Element {
  const { tokens } = useAppTokens()

  const [revealed, setRevealed] = React.useState(false)
  const [showHelp, setShowHelp] = React.useState(false)
  const [touched, setTouched] = React.useState(false)

  const regex = useCompiledRegex(field.formatRegex)

  // Validity: empty → invalid (not-yet-valid). Non-empty → matches regex when a
  // valid regex exists, otherwise any non-empty value passes.
  const isValid = React.useMemo<boolean>(() => {
    if (value.length === 0) return false
    if (!regex) return true
    return regex.test(value)
  }, [value, regex])

  // Surface validity to the parent whenever it changes. Effect (not inline) so we
  // never call back during another component's render.
  React.useEffect(() => {
    onValidityChange?.(isValid)
  }, [isValid, onValidityChange])

  // Show the inline error only once the field is touched, has content, and a
  // format constraint is actually failing. A pristine/empty field never shows red.
  const showError = touched && value.length > 0 && !isValid

  const inputId = `cred-${field.key}`
  const helpId = `cred-${field.key}-help`
  const errorId = `cred-${field.key}-error`

  const handleChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!touched) setTouched(true)
      onChange(event.target.value)
    },
    [onChange, touched],
  )

  const describedBy =
    [showError ? errorId : null, showHelp ? helpId : null]
      .filter(Boolean)
      .join(" ") || undefined

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId} style={{ color: tokens.textPrimary }}>
        {field.label}
      </Label>

      <div className="relative">
        <Input
          id={inputId}
          type={revealed ? "text" : "password"}
          value={value}
          onChange={handleChange}
          onBlur={() => setTouched(true)}
          disabled={disabled}
          placeholder={field.placeholder}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={showError || undefined}
          aria-describedby={describedBy}
          className="pr-10"
          style={
            showError
              ? { borderColor: tokens.danger }
              : undefined
          }
        />
        <button
          type="button"
          onClick={() => setRevealed((prev) => !prev)}
          disabled={disabled}
          tabIndex={-1}
          aria-label={revealed ? "Ocultar valor" : "Mostrar valor"}
          aria-pressed={revealed}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{ color: tokens.textTertiary }}
        >
          {revealed ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {showError ? (
        <span id={errorId} className="text-[11px]" style={{ color: tokens.dangerText }}>
          Formato inválido
        </span>
      ) : null}

      {field.whereToGet ? (
        <div className="mt-0.5">
          <button
            type="button"
            onClick={() => setShowHelp((prev) => !prev)}
            aria-expanded={showHelp}
            aria-controls={helpId}
            className="inline-flex items-center gap-1 text-[11px] transition-colors"
            style={{ color: tokens.brandText }}
          >
            {showHelp ? (
              <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
            )}
            <HelpCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
            Onde encontro?
          </button>

          {showHelp ? (
            <p
              id={helpId}
              className="mt-1 whitespace-pre-line rounded-md border border-dashed p-2 text-[11px] leading-relaxed"
              style={{
                color: tokens.textSecondary,
                borderColor: tokens.divider,
                backgroundColor: tokens.bgBase,
              }}
            >
              {field.whereToGet}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default CredentialFieldInput
