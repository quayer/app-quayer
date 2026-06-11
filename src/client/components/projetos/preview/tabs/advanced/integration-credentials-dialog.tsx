"use client"

/**
 * Integration Builder — credentials dialog (Wave 1, T38)
 *
 * Renders ONE `CredentialFieldInput` per `credentialFields` of the selected
 * integration. Submitting writes the values (`updateCredentials`) and then
 * IMMEDIATELY fires a validation test (`testIntegration`) — the two-step that
 * turns a `rascunho` into a `validada`.
 *
 * SECURITY (load-bearing): credential values NEVER come back from the server —
 * the list row only carries a `filled?` flag. So "Editar" is always an
 * OVERWRITE: every open starts with blank inputs (we reset on open). The user
 * re-types the secret in full; partial edits are not possible by design.
 *
 * TEST STATES (FR-07-adjacent UX): while testing we show a spinner with a
 * progress bar that fills toward a soft visual timeout; on success a green
 * check; on failure the leiga `diagnosis` text plus a "Re-testar" button.
 *
 * SUBMIT GATING: submit stays disabled until every field passes its validity
 * (regex via `onValidityChange`, or simply non-empty when no regex). Disabled
 * also while any mutation is in flight (`isMutating`).
 *
 * Themed 100% via `useAppTokens()`. Copy in PT-BR. Zero `any`.
 */

import * as React from "react"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"

import { Button } from "@/client/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import { CredentialFieldInput } from "@/client/components/projetos/chat/cards/integration/credential-field-input"
import type {
  IntegrationListItem,
  IntegrationTestResult,
} from "./use-integrations"

export interface IntegrationCredentialsDialogProps {
  /** The integration whose credentials we are editing; `null` keeps it closed. */
  integration: IntegrationListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Write-only credential persist (from `useIntegrations`). */
  updateCredentials: (
    id: string,
    values: Record<string, string>,
  ) => Promise<unknown>
  /** Validation test (from `useIntegrations`); returns the leiga diagnosis. */
  testIntegration: (id: string) => Promise<IntegrationTestResult | null>
  /** Aggregate in-flight flag — disables submit while any mutation runs. */
  isMutating: boolean
}

type TestPhase =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "success"; diagnosis: string }
  | { kind: "error"; diagnosis: string }

/** Soft visual timeout (ms) for the progress bar to feel "almost done". */
const TEST_PROGRESS_DURATION_MS = 8000

export function IntegrationCredentialsDialog({
  integration,
  open,
  onOpenChange,
  updateCredentials,
  testIntegration,
  isMutating,
}: IntegrationCredentialsDialogProps): React.JSX.Element {
  const { tokens } = useAppTokens()

  const fields = integration?.credentialFields ?? []

  // Controlled values — always blank on (re)open: server never echoes secrets.
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [validity, setValidity] = React.useState<Record<string, boolean>>({})
  const [phase, setPhase] = React.useState<TestPhase>({ kind: "idle" })
  const [progress, setProgress] = React.useState(0)

  // Reset everything whenever a new integration is opened (overwrite semantics).
  React.useEffect(() => {
    if (open) {
      setValues({})
      setValidity({})
      setPhase({ kind: "idle" })
      setProgress(0)
    }
  }, [open, integration?.id])

  // Drive the progress bar toward (but never reaching) 100% during a test.
  React.useEffect(() => {
    if (phase.kind !== "testing") return
    const started = Date.now()
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - started
      const ratio = Math.min(0.95, elapsed / TEST_PROGRESS_DURATION_MS)
      setProgress(ratio)
    }, 120)
    return () => window.clearInterval(interval)
  }, [phase.kind])

  const handleValidityChange = React.useCallback((key: string, valid: boolean) => {
    setValidity((prev) => (prev[key] === valid ? prev : { ...prev, [key]: valid }))
  }, [])

  const handleValueChange = React.useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }, [])

  const allValid =
    fields.length > 0 && fields.every((field) => validity[field.key] === true)

  const handleSubmit = React.useCallback(async () => {
    if (!integration || !allValid) return
    setPhase({ kind: "testing" })
    setProgress(0)
    try {
      await updateCredentials(integration.id, values)
      const result = await testIntegration(integration.id)
      setProgress(1)
      const ok = result?.outcome === "success"
      const diagnosis =
        result?.diagnosis ??
        (ok
          ? "Conexão validada com sucesso."
          : "Não foi possível validar a conexão. Revise as credenciais.")
      setPhase({ kind: ok ? "success" : "error", diagnosis })
    } catch {
      setProgress(1)
      setPhase({
        kind: "error",
        diagnosis:
          "Algo deu errado ao testar a conexão. Tente novamente em instantes.",
      })
    }
  }, [integration, allValid, values, updateCredentials, testIntegration])

  const testing = phase.kind === "testing"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Credenciais da integração</DialogTitle>
          <DialogDescription>
            {integration
              ? `Informe as credenciais de "${integration.displayName}". Por segurança, os valores não são exibidos depois de salvos — preencha tudo novamente ao editar.`
              : "Selecione uma integração para configurar."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {fields.map((field) => (
            <CredentialFieldInput
              key={field.key}
              field={{
                key: field.key,
                label: field.label,
                whereToGet: field.whereToGet,
                placeholder: field.placeholder ?? undefined,
              }}
              value={values[field.key] ?? ""}
              onChange={(value) => handleValueChange(field.key, value)}
              disabled={testing}
              onValidityChange={(valid) => handleValidityChange(field.key, valid)}
            />
          ))}

          {fields.length === 0 ? (
            <p className="text-[13px]" style={{ color: tokens.textSecondary }}>
              Esta integração não exige credenciais.
            </p>
          ) : null}

          {testing ? (
            <div className="flex flex-col gap-2 rounded-md border p-3" style={{ borderColor: tokens.divider }}>
              <div className="flex items-center gap-2 text-[13px]" style={{ color: tokens.textSecondary }}>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Testando a conexão...
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: tokens.divider }}>
                <div
                  className="h-full rounded-full transition-[width] duration-150 ease-out"
                  style={{ width: `${Math.round(progress * 100)}%`, backgroundColor: tokens.brand }}
                />
              </div>
            </div>
          ) : null}

          {phase.kind === "success" ? (
            <div
              className="flex items-start gap-2 rounded-md border p-3 text-[13px]"
              style={{ borderColor: tokens.success, backgroundColor: tokens.successSubtle, color: tokens.successText }}
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{phase.diagnosis}</span>
            </div>
          ) : null}

          {phase.kind === "error" ? (
            <div
              className="flex items-start gap-2 rounded-md border p-3 text-[13px]"
              style={{ borderColor: tokens.danger, backgroundColor: tokens.dangerSubtle, color: tokens.dangerText }}
            >
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{phase.diagnosis}</span>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          {phase.kind === "success" ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Concluir
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!allValid || testing || isMutating}
              className="gap-2"
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {phase.kind === "error" ? "Re-testar" : "Salvar e testar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default IntegrationCredentialsDialog
