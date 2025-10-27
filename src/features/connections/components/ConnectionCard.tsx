/**
 * Connection Card
 *
 * Card visual para exibir uma conexão com ações
 */

'use client'

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, QrCode, Power, PowerOff, RotateCw, Settings, Trash2 } from 'lucide-react'
import { ConnectionStatusBadge } from './ConnectionStatusBadge'
import { ProviderIcon } from './ProviderIcon'
import { getProviderMetadata, type Provider, type ConnectionStatus } from '../connection.constants'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface ConnectionCardProps {
  id: string
  name: string
  description?: string | null
  provider: Provider
  status: ConnectionStatus
  createdAt: Date
  updatedAt: Date
  onConnect?: () => void
  onDisconnect?: () => void
  onRestart?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onViewQR?: () => void
}

export function ConnectionCard({
  id,
  name,
  description,
  provider,
  status,
  createdAt,
  updatedAt,
  onConnect,
  onDisconnect,
  onRestart,
  onEdit,
  onDelete,
  onViewQR,
}: ConnectionCardProps) {
  const providerMeta = getProviderMetadata(provider)
  const isConnected = status === 'CONNECTED'
  const isConnecting = status === 'CONNECTING'
  const canConnect = status === 'DISCONNECTED' || status === 'PENDING'
  const hasError = status === 'ERROR'

  return (
    <Card className="relative overflow-hidden transition-all hover:shadow-md">
      {/* Header com provider icon e status */}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <ProviderIcon provider={provider} size="lg" withBackground />
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg font-semibold truncate">{name}</CardTitle>
              {description && (
                <CardDescription className="mt-1 line-clamp-2">{description}</CardDescription>
              )}
            </div>
          </div>

          {/* Menu de ações */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 -mt-1 -mr-2">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Mais opções</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {canConnect && providerMeta.features.qrCode && onConnect && (
                <DropdownMenuItem onClick={onConnect}>
                  <QrCode className="mr-2 h-4 w-4" />
                  Conectar (QR Code)
                </DropdownMenuItem>
              )}
              {isConnecting && onViewQR && (
                <DropdownMenuItem onClick={onViewQR}>
                  <QrCode className="mr-2 h-4 w-4" />
                  Ver QR Code
                </DropdownMenuItem>
              )}
              {isConnected && onDisconnect && (
                <DropdownMenuItem onClick={onDisconnect} className="text-orange-600">
                  <PowerOff className="mr-2 h-4 w-4" />
                  Desconectar
                </DropdownMenuItem>
              )}
              {(hasError || isConnected) && onRestart && (
                <DropdownMenuItem onClick={onRestart}>
                  <RotateCw className="mr-2 h-4 w-4" />
                  Reiniciar
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {onEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  <Settings className="mr-2 h-4 w-4" />
                  Configurações
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDelete} className="text-red-600">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Deletar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      {/* Content com metadados */}
      <CardContent className="pb-3">
        <div className="space-y-2">
          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <ConnectionStatusBadge status={status} size="sm" />
          </div>

          {/* Provider info */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Provider</span>
            <span className="text-sm font-medium">{providerMeta.label}</span>
          </div>

          {/* Última atualização */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Atualizado</span>
            <span className="text-sm font-medium">
              {formatDistanceToNow(new Date(updatedAt), {
                addSuffix: true,
                locale: ptBR,
              })}
            </span>
          </div>
        </div>
      </CardContent>

      {/* Footer com ações rápidas */}
      <CardFooter className="pt-3 border-t bg-muted/30">
        <div className="flex gap-2 w-full">
          {canConnect && providerMeta.features.qrCode && onConnect && (
            <Button onClick={onConnect} size="sm" className="flex-1">
              <QrCode className="mr-2 h-4 w-4" />
              Conectar
            </Button>
          )}
          {isConnecting && onViewQR && (
            <Button onClick={onViewQR} size="sm" variant="outline" className="flex-1">
              <QrCode className="mr-2 h-4 w-4" />
              Ver QR Code
            </Button>
          )}
          {isConnected && (
            <Button variant="outline" size="sm" className="flex-1" disabled>
              <Power className="mr-2 h-4 w-4 text-green-600" />
              Conectado
            </Button>
          )}
          {hasError && onRestart && (
            <Button onClick={onRestart} size="sm" variant="destructive" className="flex-1">
              <RotateCw className="mr-2 h-4 w-4" />
              Reiniciar
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  )
}
