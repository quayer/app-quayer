'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/igniter.client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  History,
  Wifi,
  WifiOff,
  QrCode,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Clock,
  ChevronDown,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useState } from 'react'

interface ConnectionEvent {
  id: string
  eventType: string
  fromStatus: string | null
  toStatus: string
  reason: string | null
  metadata: Record<string, any> | null
  triggeredBy: string | null
  createdAt: string
}

interface ConnectionHistoryProps {
  connectionId: string
  maxHeight?: string
}

const EVENT_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  CONNECTED: { icon: Wifi, label: 'Conectado', color: 'text-green-500 bg-green-500/10' },
  DISCONNECTED: { icon: WifiOff, label: 'Desconectado', color: 'text-gray-500 bg-gray-500/10' },
  CONNECTION_LOST: { icon: AlertTriangle, label: 'Conexao Perdida', color: 'text-red-500 bg-red-500/10' },
  QR_GENERATED: { icon: QrCode, label: 'QR Code Gerado', color: 'text-blue-500 bg-blue-500/10' },
  QR_SCANNED: { icon: CheckCircle2, label: 'QR Code Escaneado', color: 'text-green-500 bg-green-500/10' },
  QR_TIMEOUT: { icon: Clock, label: 'QR Code Expirado', color: 'text-yellow-500 bg-yellow-500/10' },
  QR_RETRY: { icon: RefreshCw, label: 'Retry Automatico', color: 'text-blue-500 bg-blue-500/10' },
  ERROR: { icon: AlertTriangle, label: 'Erro', color: 'text-red-500 bg-red-500/10' },
  RECONNECTING: { icon: RefreshCw, label: 'Reconectando', color: 'text-yellow-500 bg-yellow-500/10' },
}

export function ConnectionHistory({ connectionId, maxHeight = '400px' }: ConnectionHistoryProps) {
  const [limit, setLimit] = useState(10)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['connection-events', connectionId, limit],
    queryFn: async () => {
      const response = await (api.instances as any).getEvents.query({
        id: connectionId,
        query: { limit, offset: 0 },
      })
      if (response.error) {
        throw new Error(response.error?.message || 'Erro ao carregar historico')
      }
      return response.data as { events: ConnectionEvent[]; pagination: { total: number; hasMore: boolean } }
    },
    enabled: !!connectionId,
  })

  const events = data?.events || []
  const hasMore = data?.pagination?.hasMore || false
  const total = data?.pagination?.total || 0

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Historico de Conexao</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="space-y-1 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Historico de Conexao</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
            <p className="text-sm">Erro ao carregar historico</p>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="mt-2">
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar novamente
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Historico de Conexao</CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs">
            {total} eventos
          </Badge>
        </div>
        <CardDescription>
          Registro de conexoes, desconexoes e eventos do WhatsApp
        </CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <History className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum evento registrado ainda</p>
          </div>
        ) : (
          <>
            <ScrollArea style={{ maxHeight }} className="pr-4">
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-4 top-2 bottom-2 w-px bg-border" />

                <div className="space-y-4">
                  {events.map((event, index) => {
                    const config = EVENT_CONFIG[event.eventType] || {
                      icon: History,
                      label: event.eventType,
                      color: 'text-muted-foreground bg-muted',
                    }
                    const Icon = config.icon
                    const eventDate = new Date(event.createdAt)

                    return (
                      <div key={event.id} className="relative flex gap-4 pl-2">
                        {/* Timeline dot */}
                        <div
                          className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full ${config.color}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 pb-4">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">{config.label}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(eventDate, { addSuffix: true, locale: ptBR })}
                            </span>
                          </div>

                          <div className="text-xs text-muted-foreground mt-0.5">
                            {format(eventDate, "dd/MM/yyyy 'as' HH:mm:ss", { locale: ptBR })}
                          </div>

                          {/* Status transition */}
                          {event.fromStatus && event.toStatus && event.fromStatus !== event.toStatus && (
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs font-normal">
                                {event.fromStatus}
                              </Badge>
                              <span className="text-xs text-muted-foreground">→</span>
                              <Badge variant="outline" className="text-xs font-normal">
                                {event.toStatus}
                              </Badge>
                            </div>
                          )}

                          {/* Reason */}
                          {event.reason && (
                            <p className="text-xs text-muted-foreground mt-1 italic">
                              {event.reason}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </ScrollArea>

            {hasMore && (
              <div className="mt-4 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLimit((prev) => prev + 10)}
                  className="w-full"
                >
                  <ChevronDown className="h-4 w-4 mr-2" />
                  Carregar mais ({total - events.length} restantes)
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
