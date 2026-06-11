"use client"

/**
 * ChannelCredentialForm — reusable credential form for managed channels
 * (WhatsApp Cloud API and Instagram Direct).
 *
 * Renders a labelled field per credential, validates that required fields are
 * filled, and POSTs the collected values to
 *   POST /api/v1/builder/channel/credentials
 * with `credentials: "same-origin"`.
 *
 * Pure presentational + self-contained submit. The parent (channel-selector-card)
 * passes the channel `kind`, the field spec, and an `onConnected` callback that
 * fires after a successful save so the deploy wizard can refresh its channel
 * state.
 *
 * NOTE: the /channel/credentials route is owned by the backend agent; this file
 * only consumes the documented contract (kind + flat credential map).
 */

import * as React from "react"
import { Check, Loader2 } from "lucide-react"

import { Button } from "@/client/components/ui/button"
import { Input } from "@/client/components/ui/input"
import { Label } from "@/client/components/ui/label"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { readErrorMessage } from "./read-error-message"

export type ChannelCredentialKind = "WHATSAPP_CLOUD" | "INSTAGRAM"

/**
 * UI kind → backend contract `kind` (lowercase snake, discriminator of
 * saveChannelCredentialsSchema). The route rejects anything else.
 */
const KIND_TO_CONTRACT: Record<ChannelCredentialKind, "whatsapp_cloud" | "instagram"> = {
  WHATSAPP_CLOUD: "whatsapp_cloud",
  INSTAGRAM: "instagram",
}

export interface ChannelCredentialField {
  /** Maps 1:1 to the JSON key sent to the backend. */
  name: string
  label: string
  placeholder?: string
  /** Renders as a masked input (default false). */
  secret?: boolean
  /** Required fields block submit until filled (default true). */
  required?: boolean
  /** Optional hint rendered under the input. */
  hint?: string
  /** Optional minimum length used by the lightweight validator. */
  minLength?: number
}

interface ChannelCredentialFormProps {
  tokens: AppTokens
  projectId: string
  kind: ChannelCredentialKind
  fields: readonly ChannelCredentialField[]
  /** Label of the submit button (e.g. "Conectar WhatsApp Cloud"). */
  submitLabel: string
  /** Fires after a successful POST so the wizard can refetch channel state. */
  onConnected: () => void | Promise<void>
}

export function ChannelCredentialForm({
  tokens,
  projectId,
  kind,
  fields,
  submitLabel,
  onConnected,
}: ChannelCredentialFormProps) {
  const baseId = React.useId()
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)

  const setField = React.useCallback((name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }))
    setDone(false)
    setError(null)
  }, [])

  const isFieldValid = React.useCallback(
    (field: ChannelCredentialField) => {
      const required = field.required ?? true
      const value = (values[field.name] ?? "").trim()
      if (!required) return true
      if (value.length === 0) return false
      if (field.minLength && value.length < field.minLength) return false
      return true
    },
    [values],
  )

  const canSubmit = fields.every(isFieldValid) && !submitting && !done

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!canSubmit) return

      setSubmitting(true)
      setError(null)
      try {
        // Contract: TOP-LEVEL credential fields + lowercase `kind` discriminator
        // + projectId/connectionId envelope (NOT nested under `credentials`).
        const flat: Record<string, string> = {}
        for (const field of fields) {
          const value = (values[field.name] ?? "").trim()
          if (value) flat[field.name] = value
        }

        const response = await fetch("/api/v1/builder/channel/credentials", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: KIND_TO_CONTRACT[kind], projectId, ...flat }),
        })

        if (!response.ok) {
          throw new Error(
            await readErrorMessage(response, `Erro ${response.status} ao salvar credenciais`),
          )
        }

        setDone(true)
        await onConnected()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao salvar credenciais")
      } finally {
        setSubmitting(false)
      }
    },
    [canSubmit, fields, kind, onConnected, projectId, values],
  )

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
      {fields.map((field) => {
        const required = field.required ?? true
        const inputId = `${baseId}-${field.name}`
        const hintId = field.hint ? `${inputId}-hint` : undefined
        return (
          <div key={field.name} className="flex flex-col gap-1">
            <Label
              htmlFor={inputId}
              className="text-[11px] font-medium"
              style={{ color: tokens.textPrimary }}
            >
              {field.label}
              {required ? (
                <span style={{ color: tokens.brand }} aria-hidden="true">
                  {" *"}
                </span>
              ) : (
                <span style={{ color: tokens.textTertiary }}> (opcional)</span>
              )}
            </Label>
            <Input
              id={inputId}
              type={field.secret ? "password" : "text"}
              value={values[field.name] ?? ""}
              onChange={(e) => setField(field.name, e.target.value)}
              placeholder={field.placeholder}
              required={required}
              aria-required={required}
              aria-describedby={hintId}
              autoComplete={field.secret ? "off" : undefined}
              className="h-9 text-[12px]"
              disabled={submitting}
            />
            {field.hint && (
              <p id={hintId} className="text-[10px]" style={{ color: tokens.textTertiary }}>
                {field.hint}
              </p>
            )}
          </div>
        )
      })}

      {error && (
        <p
          role="alert"
          className="rounded-md border px-2.5 py-1.5 text-[11px]"
          style={{
            borderColor: tokens.danger,
            backgroundColor: tokens.dangerSubtle,
            color: tokens.dangerText,
          }}
        >
          {error}
        </p>
      )}

      {done && (
        <p
          role="status"
          className="rounded-md border px-2.5 py-1.5 text-[11px]"
          style={{
            borderColor: tokens.brandBorder,
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          Credenciais salvas. O canal será vinculado ao agente.
        </p>
      )}

      <Button
        type="submit"
        size="sm"
        className="h-9 gap-1.5 self-start rounded-lg text-[12px] font-medium"
        style={{ backgroundColor: tokens.brand, color: tokens.textInverse }}
        disabled={!canSubmit}
      >
        {submitting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : done ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : null}
        {done ? "Conectado" : submitLabel}
      </Button>
    </form>
  )
}
