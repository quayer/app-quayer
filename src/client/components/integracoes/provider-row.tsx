'use client'

import { Plus, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Badge } from '@/client/components/ui/badge'
import { Button } from '@/client/components/ui/button'
import { useAppTokens } from '@/client/hooks/use-app-tokens'
import type { ProviderKeyRecord, ProviderMeta } from './providers-catalog'

interface ProviderRowProps {
  meta: ProviderMeta
  keys: ProviderKeyRecord[]
  disabled: boolean
  onAddKey: () => void
  onRemoveKey: (key: ProviderKeyRecord) => void
}

function formatUpdatedAt(iso: string | null): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return formatDistanceToNow(d, { addSuffix: true, locale: ptBR })
  } catch {
    return null
  }
}

export function ProviderRow({
  meta,
  keys,
  disabled,
  onAddKey,
  onRemoveKey,
}: ProviderRowProps) {
  const { tokens } = useAppTokens()
  const categoryLabel =
    meta.category === 'voice'
      ? 'Voz'
      : meta.category === 'transcription'
        ? 'Transcrição'
        : 'LLM'

  return (
    <article
      className="flex flex-col gap-3 rounded-xl border p-4"
      style={{ backgroundColor: tokens.bgSurface, borderColor: tokens.border }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
            style={{ backgroundColor: tokens.bgElevated, color: tokens.textSecondary }}
            aria-hidden="true"
          >
            {meta.letter}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium" style={{ color: tokens.textPrimary }}>
                {meta.name}
              </h3>
              <Badge
                variant="secondary"
                style={{ backgroundColor: tokens.bgElevated, color: tokens.textTertiary }}
              >
                {categoryLabel}
              </Badge>
            </div>
            <p className="text-xs" style={{ color: tokens.textTertiary }}>
              {meta.description}
            </p>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={onAddKey}
          disabled={disabled}
          aria-label={`Adicionar chave de ${meta.name}`}
        >
          <Plus className="mr-1 h-4 w-4" />
          Nova chave
        </Button>
      </div>

      {keys.length === 0 ? (
        <p className="text-xs" style={{ color: tokens.textTertiary }}>
          Nenhuma chave configurada. O agente usa a chave global da plataforma.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label={`Chaves de ${meta.name}`}>
          {keys.map((k) => {
            const updated = formatUpdatedAt(k.updatedAt)
            return (
              <li
                key={k.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                style={{ borderColor: tokens.border, backgroundColor: tokens.bgElevated }}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="truncate text-sm font-medium"
                      style={{ color: tokens.textPrimary }}
                    >
                      {k.name}
                    </span>
                    {k.isPrimary && (
                      <Badge
                        className="border-transparent"
                        style={{ backgroundColor: tokens.brandSubtle, color: tokens.brandText }}
                      >
                        Primária
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {k.lastFour && (
                      <span
                        className="font-mono text-xs"
                        style={{ color: tokens.textSecondary }}
                        title="Apenas os últimos 4 caracteres são exibidos"
                      >
                        {`••••••${k.lastFour}`}
                      </span>
                    )}
                    {updated && (
                      <span className="text-xs" style={{ color: tokens.textTertiary }}>
                        Atualizado {updated}
                      </span>
                    )}
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveKey(k)}
                  disabled={disabled}
                  aria-label={`Remover chave ${k.name} de ${meta.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}
