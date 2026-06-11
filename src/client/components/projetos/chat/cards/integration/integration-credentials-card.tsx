"use client"

/**
 * Integration Builder — inline chat card for credential entry (Wave 2, T40)
 *
 * cardKey `integration_credentials`. The inline card the user fills to activate
 * the chosen integration: one masked input per credential field + a "Testar
 * conexão" button that submits the typed values.
 *
 * SECURITY / TRANSPARENCY (NFR-03 — load-bearing, mirrors the backend invariants):
 *  - The submit payload `{ values }` is an opaque string→string map; the handler
 *    ENCRYPTS each value and NEVER writes it to `builderState` (see
 *    `card-submit.schemas.ts integrationCredentialsPayloadSchema`).
 *  - This card NEVER displays a server-returned value — there are none. Reads
 *    return only field metadata + a "filled?" flag, never the secret.
 *
 * SOURCING credentialFields (the form's field list):
 *  - BuilderState's `value.integration.proposed` (W2) carries the PLATFORM but
 *    NOT the credentialFields metadata (see `builder-state.ts
 *    integrationProposalSchema`). The credentialFields live on the persisted
 *    draft `CustomIntegration.credentialFields` and are the RICHER path surfaced
 *    by the panel dialog (T38).
 *  - So this card sources its fields from the optional `fields` prop. When the
 *    dispatcher (T41) wires it, it passes the draft's credentialFields. When
 *    `fields` is absent/empty, the card degrades gracefully: it shows a short
 *    note pointing the user to the integrations panel rather than rendering a
 *    blank, un-submittable form.
 *
 * TEST RESULT:
 *  - The backend runs the connection test on submit and narrates the outcome as
 *    an SSE turn in the chat (a `cardInstruction` ACK — see
 *    `apply-integration-cards.ts §testIntegrationCredentials`). So the card's job
 *    is mainly to collect + submit and let the chat turn narrate.
 *  - As a convenience, if the dispatcher passes a `testResult` prop the card
 *    surfaces it inline: a green check on success, or the leiga `diagnosis` +
 *    "Re-testar" on failure. Never any server value.
 *
 * Presentational only: reuses the shared {@link CredentialFieldInput} (T35),
 * tracks per-field validity via `onValidityChange`, and disables submit until
 * every field is valid (and while the chat is streaming). Token-driven via
 * `props.tokens` (zero hard-coded colors). Copy in PT-BR. Zero `any`.
 *
 * Contract (CARD CONTRACTS): cardKey 'integration_credentials'
 *   payload → { values: Record<string, string> }
 */

import * as React from "react"
import { AlertTriangle, CheckCircle2, Link2, RefreshCw } from "lucide-react"

import { useAppTokens } from "@/client/hooks/use-app-tokens"

import { CardShell } from "../card-shell"
import { CredentialFieldInput } from "./credential-field-input"
import type { CardComponentProps } from "../types"

/**
 * One credential field rendered by the card. Structurally identical to the
 * server's `CredentialField` (integration.schemas.ts) and to
 * `CredentialFieldInputProps.field` — kept local so this client leaf stays
 * decoupled from the server schema module.
 */
export interface IntegrationCredentialField {
  key: string
  label: string
  whereToGet: string
  formatRegex?: string
  placeholder?: string
}

/**
 * Optional inline test outcome. The PRIMARY narration path is the SSE chat turn;
 * this prop is only the convenience inline echo. `diagnosis` is the leiga,
 * value-free explanation surfaced on failure (mirrors the backend's
 * value-free diagnosis — never a secret).
 */
export interface IntegrationCredentialsTestResult {
  ok: boolean
  diagnosis?: string
}

/** EXACT submit payload for cardKey 'integration_credentials'. */
export interface IntegrationCredentialsPayload {
  values: Record<string, string>
}

export interface IntegrationCredentialsCardProps
  extends CardComponentProps<IntegrationCredentialsPayload> {
  /**
   * The credential fields to render. Sourced from the draft integration's
   * `credentialFields` by the dispatcher (T41). When absent/empty the card shows
   * a graceful note instead of a blank form (BuilderState's proposal does not
   * carry credentialFields — the panel dialog is the richer path).
   */
  fields?: IntegrationCredentialField[]
  /** Optional inline test outcome (the chat turn is the primary narration). */
  testResult?: IntegrationCredentialsTestResult
}

/**
 * IntegrationCredentialsCard — cardKey `integration_credentials`.
 *
 * Renders one {@link CredentialFieldInput} per field, collects the typed values,
 * and submits `{ values }` on "Testar conexão". The button stays disabled until
 * every field reports valid (tracked via `onValidityChange`) and while the chat
 * is streaming (`disabled`).
 */
export function IntegrationCredentialsCard({
  value,
  disabled = false,
  onSubmit,
  tokens,
  fields,
  testResult,
}: IntegrationCredentialsCardProps): React.JSX.Element {
  // Pull the human platform label from the proposal slice for the title; the
  // proposal is the W2 carrier of the platform (not the credentialFields).
  const platform = value.integration?.proposed?.platform?.trim()
  const title = platform ? `Conectar ${platform}` : "Conectar integração"

  const safeFields = React.useMemo<IntegrationCredentialField[]>(
    () => fields ?? [],
    [fields],
  )

  // Per-field typed values (controlled). Never echoes a server value.
  const [values, setValues] = React.useState<Record<string, string>>({})
  // Per-field validity reported by each CredentialFieldInput (empty = false).
  const [validity, setValidity] = React.useState<Record<string, boolean>>({})

  const handleChange = React.useCallback((key: string, next: string) => {
    setValues((prev) => ({ ...prev, [key]: next }))
  }, [])

  const handleValidity = React.useCallback((key: string, valid: boolean) => {
    setValidity((prev) =>
      prev[key] === valid ? prev : { ...prev, [key]: valid },
    )
  }, [])

  // Submit is allowed only when EVERY known field reports valid. With no fields
  // we never enable submit (the graceful-note branch renders instead).
  const allValid =
    safeFields.length > 0 &&
    safeFields.every((field) => validity[field.key] === true)

  const handleSubmit = React.useCallback(() => {
    if (disabled || !allValid) return
    // Send only the keys we know about, trimmed to the declared fields — never
    // leak stray state from removed fields.
    const payloadValues: Record<string, string> = {}
    for (const field of safeFields) {
      payloadValues[field.key] = values[field.key] ?? ""
    }
    onSubmit({ values: payloadValues })
  }, [allValid, disabled, onSubmit, safeFields, values])

  const submitLabel = testResult && !testResult.ok ? "Re-testar" : "Testar conexão"

  // No fields to render → graceful note (BuilderState carries the platform but
  // not the credentialFields; the panel dialog is the richer entry point).
  if (safeFields.length === 0) {
    return (
      <CardShell
        tokens={tokens}
        icon={<Link2 className="h-4 w-4" />}
        title={title}
        reason="Os campos de credencial desta integração aparecem no painel de integrações. Abra o painel para conectar."
      />
    )
  }

  return (
    <CardShell
      tokens={tokens}
      icon={<Link2 className="h-4 w-4" />}
      title={title}
      reason="Preencha as credenciais para conectar. Elas são guardadas cifradas e nunca aparecem aqui depois de salvas."
      actions={[
        {
          label: submitLabel,
          onClick: handleSubmit,
          variant: "primary",
          icon:
            testResult && !testResult.ok ? (
              <RefreshCw className="h-3.5 w-3.5" />
            ) : undefined,
          disabled: disabled || !allValid,
        },
      ]}
    >
      <div className="flex flex-col gap-4">
        {safeFields.map((field) => (
          <CredentialFieldInput
            key={field.key}
            field={field}
            value={values[field.key] ?? ""}
            onChange={(next) => handleChange(field.key, next)}
            onValidityChange={(valid) => handleValidity(field.key, valid)}
            disabled={disabled}
          />
        ))}

        {testResult ? <TestResultRow result={testResult} /> : null}
      </div>
    </CardShell>
  )
}

/**
 * Inline echo of the connection-test outcome. Success = green check; failure =
 * the leiga, value-free `diagnosis`. The chat turn remains the primary
 * narration — this is only a convenience when the dispatcher wires a result.
 */
function TestResultRow({
  result,
}: {
  result: IntegrationCredentialsTestResult
}): React.JSX.Element {
  const { tokens } = useAppTokens()

  if (result.ok) {
    return (
      <div className="flex items-center gap-2 text-[12px]">
        <CheckCircle2
          className="h-4 w-4 shrink-0"
          aria-hidden="true"
          style={{ color: tokens.success }}
        />
        <span style={{ color: tokens.successText }}>
          Conexão testada com sucesso.
        </span>
      </div>
    )
  }

  return (
    <div
      className="flex items-start gap-2 rounded-md border border-dashed p-2 text-[12px] leading-relaxed"
      style={{ borderColor: tokens.divider, backgroundColor: tokens.bgBase }}
    >
      <AlertTriangle
        className="mt-0.5 h-4 w-4 shrink-0"
        aria-hidden="true"
        style={{ color: tokens.danger }}
      />
      <span style={{ color: tokens.textSecondary }}>
        {result.diagnosis ?? "O teste de conexão não passou. Confira os campos e tente novamente."}
      </span>
    </div>
  )
}

export default IntegrationCredentialsCard
