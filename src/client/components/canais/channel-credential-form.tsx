'use client'

/**
 * ChannelCredentialForm (org-level) — form de credenciais para canais
 * gerenciados (WhatsApp Cloud / Instagram) na /canais. Espelha o builder
 * (.../deploy/channel-credential-form.tsx) mas SEM projectId; o submit é
 * controlado pelo modal via onSubmitCredentials (endpoint org-level pendente).
 */

import * as React from 'react'
import { Check, Loader2 } from 'lucide-react'

import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Label } from '@/client/components/ui/label'
import type { AppTokens } from '@/client/hooks/use-app-tokens'

export type ChannelCredentialKind = 'WHATSAPP_CLOUD' | 'INSTAGRAM'

export interface ChannelCredentialField {
  /** Mapeia 1:1 para a chave JSON enviada ao backend. */
  name: string
  label: string
  placeholder?: string
  /** Renderiza como input mascarado (default false). */
  secret?: boolean
  /** Campos obrigatórios bloqueiam o submit até preenchidos (default true). */
  required?: boolean
  /** Dica opcional renderizada abaixo do input. */
  hint?: string
  /** Comprimento mínimo opcional usado pelo validador leve. */
  minLength?: number
}

interface ChannelCredentialFormProps {
  tokens: AppTokens
  kind: ChannelCredentialKind
  fields: readonly ChannelCredentialField[]
  /** Label do botão de submit (ex: "Conectar WhatsApp Cloud"). */
  submitLabel: string
  /**
   * Recebe o mapa plano de credenciais coletadas + o kind do canal. O modal é
   * dono da chamada de rede (TODO: endpoint org-level inexistente). Deve lançar
   * em caso de erro para que o form exiba a mensagem.
   */
  onSubmitCredentials: (
    kind: ChannelCredentialKind,
    credentials: Record<string, string>,
  ) => Promise<void>
}

export function ChannelCredentialForm({
  tokens,
  kind,
  fields,
  submitLabel,
  onSubmitCredentials,
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
      const value = (values[field.name] ?? '').trim()
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
        const flat: Record<string, string> = {}
        for (const field of fields) {
          const value = (values[field.name] ?? '').trim()
          if (value) flat[field.name] = value
        }

        await onSubmitCredentials(kind, flat)
        setDone(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar credenciais')
      } finally {
        setSubmitting(false)
      }
    },
    [canSubmit, fields, kind, onSubmitCredentials, values],
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
                  {' *'}
                </span>
              ) : (
                <span style={{ color: tokens.textTertiary }}> (opcional)</span>
              )}
            </Label>
            <Input
              id={inputId}
              type={field.secret ? 'password' : 'text'}
              value={values[field.name] ?? ''}
              onChange={(e) => setField(field.name, e.target.value)}
              placeholder={field.placeholder}
              required={required}
              aria-required={required}
              aria-describedby={hintId}
              autoComplete={field.secret ? 'off' : undefined}
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
          Credenciais salvas. O canal será vinculado à organização.
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
        {done ? 'Conectado' : submitLabel}
      </Button>
    </form>
  )
}
