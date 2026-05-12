'use client'

import { useMemo } from 'react'
import { MoreHorizontal, Phone, Smartphone } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ConnectionStatus } from '@prisma/client'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/client/components/ui/avatar'
import { Badge } from '@/client/components/ui/badge'
import { Button } from '@/client/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/client/components/ui/tooltip'
import { useAppTokens } from '@/client/hooks/use-app-tokens'
import type { CanaisConnection } from './canais-page'

interface ConnectionCardProps {
  connection: CanaisConnection
  onOpenDetails: () => void
}

interface StatusMeta {
  label: string
  fg: string
  bg: string
}

/**
 * Mapa status → label + cores (semaforo). Cores aplicadas inline porque o
 * Badge default não suporta cores semanticas direto via tokens DS — caso
 * pareça hardcoded, é semântico (verde=ok, amber=transit, vermelho=erro).
 */
function useStatusMeta(status: ConnectionStatus): StatusMeta {
  return useMemo(() => {
    switch (status) {
      case 'CONNECTED':
        return {
          label: 'Conectado',
          fg: '#0F5132',
          bg: 'rgba(34, 197, 94, 0.15)',
        }
      case 'CONNECTING':
        return {
          label: 'Conectando',
          fg: '#7A4F01',
          bg: 'rgba(245, 158, 11, 0.15)',
        }
      case 'ERROR':
        return {
          label: 'Erro',
          fg: '#7F1D1D',
          bg: 'rgba(239, 68, 68, 0.15)',
        }
      case 'DISCONNECTED':
      default:
        return {
          label: 'Desconectado',
          fg: '#3F3F46',
          bg: 'rgba(161, 161, 170, 0.18)',
        }
    }
  }, [status])
}

function formatLastConnected(iso: string | null): string {
  if (!iso) return 'Nunca conectado'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return 'Nunca conectado'
    return `Conectado ${formatDistanceToNow(d, { addSuffix: true, locale: ptBR })}`
  } catch {
    return 'Nunca conectado'
  }
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

export function ConnectionCard({
  connection,
  onOpenDetails,
}: ConnectionCardProps) {
  const { tokens } = useAppTokens()
  const statusMeta = useStatusMeta(connection.status)

  const subtitle = connection.phoneNumber
    ? connection.phoneNumber
    : connection.profileName ?? 'Sem número associado'

  return (
    <article
      className="flex items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-[var(--q-hover-bg)]"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.border,
      }}
    >
      <Avatar className="h-12 w-12 shrink-0">
        {connection.profilePictureUrl ? (
          <AvatarImage
            src={connection.profilePictureUrl}
            alt={`Foto de ${connection.name}`}
          />
        ) : null}
        <AvatarFallback
          className="text-sm font-medium"
          style={{
            backgroundColor: tokens.bgElevated,
            color: tokens.textSecondary,
          }}
        >
          {connection.profilePictureUrl ? (
            initialsFrom(connection.name)
          ) : (
            <Phone className="h-5 w-5" aria-hidden="true" />
          )}
        </AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <h3
            className="truncate text-sm font-medium"
            style={{ color: tokens.textPrimary }}
            title={connection.name}
          >
            {connection.name}
          </h3>
          <Badge
            className="border-transparent"
            style={{
              backgroundColor: statusMeta.bg,
              color: statusMeta.fg,
            }}
          >
            {statusMeta.label}
          </Badge>
        </div>

        <p
          className="flex items-center gap-1 truncate text-xs"
          style={{ color: tokens.textTertiary }}
        >
          <Smartphone className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{subtitle}</span>
        </p>

        <p
          className="text-xs"
          style={{ color: tokens.textTertiary }}
        >
          {formatLastConnected(connection.lastConnected)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpenDetails}
          aria-label={`Ver detalhes de ${connection.name}`}
        >
          Detalhes
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Mais ações para ${connection.name}`}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuItem
                  disabled
                  onSelect={(e) => e.preventDefault()}
                >
                  Editar
                </DropdownMenuItem>
              </TooltipTrigger>
              <TooltipContent side="left">Em breve</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuItem
                  disabled
                  onSelect={(e) => e.preventDefault()}
                >
                  Excluir
                </DropdownMenuItem>
              </TooltipTrigger>
              <TooltipContent side="left">Em breve</TooltipContent>
            </Tooltip>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  )
}
