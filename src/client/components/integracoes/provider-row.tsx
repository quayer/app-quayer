'use client'

import { useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Badge } from '@/client/components/ui/badge'
import { Button } from '@/client/components/ui/button'
import { useAppTokens } from '@/client/hooks/use-app-tokens'
import type { ProviderMeta, ProviderRecord } from './providers-catalog'

interface ProviderRowProps {
  meta: ProviderMeta
  record: ProviderRecord
  disabled: boolean
  onConfigure: () => void
  onRemove: () => void
}

function formatUpdatedAt(iso: string | null): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return `Atualizado ${formatDistanceToNow(d, {
      addSuffix: true,
      locale: ptBR,
    })}`
  } catch {
    return null
  }
}

export function ProviderRow({
  meta,
  record,
  disabled,
  onConfigure,
  onRemove,
}: ProviderRowProps) {
  const { tokens } = useAppTokens()

  const updatedLabel = useMemo(
    () => formatUpdatedAt(record.updatedAt),
    [record.updatedAt]
  )

  const masked = record.lastFour ? `••••••${record.lastFour}` : null

  return (
    <article
      className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.border,
      }}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
          style={{
            backgroundColor: tokens.bgElevated,
            color: tokens.textSecondary,
          }}
          aria-hidden="true"
        >
          {meta.letter}
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className="text-sm font-medium"
              style={{ color: tokens.textPrimary }}
            >
              {meta.name}
            </h3>

            {record.isConfigured ? (
              <Badge
                className="border-transparent"
                style={{
                  backgroundColor: tokens.brandSubtle,
                  color: tokens.brandText,
                }}
              >
                Configurado
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                style={{
                  backgroundColor: tokens.bgElevated,
                  color: tokens.textTertiary,
                }}
              >
                Sem chave
              </Badge>
            )}
          </div>

          <p className="text-xs" style={{ color: tokens.textTertiary }}>
            {meta.description}
          </p>

          {record.isConfigured && masked && (
            <p
              className="font-mono text-xs"
              style={{ color: tokens.textSecondary }}
              title="Apenas os últimos 4 caracteres são exibidos"
            >
              {masked}
            </p>
          )}

          {updatedLabel && (
            <p className="text-xs" style={{ color: tokens.textTertiary }}>
              {updatedLabel}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        {record.isConfigured ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onConfigure}
              disabled={disabled}
              aria-label={`Atualizar chave de ${meta.name}`}
            >
              Atualizar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              disabled={disabled}
              aria-label={`Remover chave de ${meta.name}`}
            >
              Remover
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={onConfigure}
            disabled={disabled}
            aria-label={`Configurar chave de ${meta.name}`}
          >
            Configurar
          </Button>
        )}
      </div>
    </article>
  )
}
