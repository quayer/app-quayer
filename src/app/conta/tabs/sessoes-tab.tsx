'use client'

/**
 * Tab: Sessões e acesso — dispositivos ativos, contas conectadas e histórico
 * de login. Structural extraction from conta-client.tsx (no behavior change).
 */

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Shield, Link2, Unlink, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/client/components/ui/card'
import { Button } from '@/client/components/ui/button'
import { Skeleton } from '@/client/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/client/components/ui/alert'
import { Badge } from '@/client/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/client/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/client/components/ui/alert-dialog'

import {
  apiFetch,
  unwrapData,
  formatDate,
  getDeviceIcon,
  isCurrentDevice,
  providerLabel,
  type DeviceSession,
  type LinkedAccount,
  type LinkedProvider,
} from './shared'

export function SessoesTab() {
  const [devices, setDevices] = useState<DeviceSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [isRevokingAll, setIsRevokingAll] = useState(false)

  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([])
  const [linkedLoading, setLinkedLoading] = useState(true)
  const [unlinkingProvider, setUnlinkingProvider] = useState<LinkedProvider | null>(null)

  const fetchDevices = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/v1/device-sessions', { credentials: 'include' })
      if (!res.ok) throw new Error('Erro ao carregar dispositivos')
      const json = (await res.json()) as unknown
      const unwrap = (value: unknown): DeviceSession[] => {
        if (Array.isArray(value)) return value as DeviceSession[]
        if (value && typeof value === 'object' && 'data' in value)
          return unwrap((value as { data: unknown }).data)
        return []
      }
      setDevices(unwrap(json))
    } catch (err) {
      setError((err as Error).message)
      setDevices([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchLinkedAccounts = useCallback(async () => {
    try {
      const json = await apiFetch<unknown>('/api/v1/auth/me/linked-accounts')
      const data = unwrapData<LinkedAccount[]>(json)
      setLinkedAccounts(Array.isArray(data) ? data : [])
    } catch {
      setLinkedAccounts([])
    } finally {
      setLinkedLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDevices()
    fetchLinkedAccounts()
  }, [fetchDevices, fetchLinkedAccounts])

  const handleRevoke = async (deviceSessionId: string) => {
    setRevokingId(deviceSessionId)
    try {
      await apiFetch('/api/v1/device-sessions/revoke', {
        method: 'POST',
        body: JSON.stringify({ deviceSessionId }),
      })
      await fetchDevices()
      toast.success('Dispositivo desconectado')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRevokingId(null)
    }
  }

  const handleRevokeAll = async () => {
    setIsRevokingAll(true)
    try {
      const currentDevice = devices.find((d) => isCurrentDevice(d.userAgent))
      await apiFetch('/api/v1/device-sessions/revoke-all', {
        method: 'POST',
        body: JSON.stringify({ currentDeviceSessionId: currentDevice?.id }),
      })
      await fetchDevices()
      toast.success('Outros dispositivos desconectados')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsRevokingAll(false)
    }
  }

  const handleUnlink = async (provider: LinkedProvider) => {
    setUnlinkingProvider(provider)
    try {
      await apiFetch(`/api/v1/auth/me/linked-accounts/${provider}`, { method: 'DELETE' })
      toast.success(`${providerLabel(provider)} desconectado`)
      await fetchLinkedAccounts()
    } catch (err) {
      toast.error((err as Error).message || 'Não foi possível desconectar.')
    } finally {
      setUnlinkingProvider(null)
    }
  }

  const activeDevices = devices.filter((d) => !d.isRevoked)
  const hasOtherActiveDevices = activeDevices.some((d) => !isCurrentDevice(d.userAgent))

  const isOnlyAuthMethod = (provider: LinkedProvider): boolean =>
    linkedAccounts.length === 1 && linkedAccounts[0].provider === provider

  const loginHistory = [...devices]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Dispositivos ativos */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Meus dispositivos</CardTitle>
              <CardDescription>Sessões ativas em navegadores e dispositivos.</CardDescription>
            </div>
            {hasOtherActiveDevices && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={isRevokingAll} className="shrink-0">
                    {isRevokingAll && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Desconectar outros
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Desconectar outros dispositivos?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Isso encerrará todas as sessões exceto este dispositivo. Você precisará fazer
                      login novamente nos outros.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRevokeAll}>Desconectar todos</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
              ))}
            </div>
          )}

          {!isLoading && activeDevices.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Shield className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhum dispositivo ativo</p>
            </div>
          )}

          {!isLoading && activeDevices.length > 0 && (
            <div className="space-y-2">
              {activeDevices.map((device) => {
                const DeviceIconEl = getDeviceIcon(device.userAgent)
                const isCurrent = isCurrentDevice(device.userAgent)
                return (
                  <div
                    key={device.id}
                    className="flex items-center justify-between rounded-lg border p-4 gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <DeviceIconEl className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">
                            {device.deviceName || 'Dispositivo desconhecido'}
                          </p>
                          {isCurrent && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              Este dispositivo
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {device.ipAddress || 'IP desconhecido'} · {device.location || 'Local desconhecido'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Último acesso: {formatDate(device.lastActiveAt)}
                        </p>
                      </div>
                    </div>
                    {!isCurrent && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={revokingId === device.id}
                        onClick={() => handleRevoke(device.id)}
                        className="shrink-0"
                      >
                        {revokingId === device.id && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Desconectar
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contas conectadas */}
      <Card>
        <CardHeader>
          <CardTitle>Contas conectadas</CardTitle>
          <CardDescription>
            Provedores de identidade vinculados ao seu acesso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {linkedLoading && (
            <div className="space-y-3">
              <Skeleton className="h-[68px] w-full rounded-lg" />
              <Skeleton className="h-[68px] w-full rounded-lg" />
            </div>
          )}

          {!linkedLoading && linkedAccounts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Link2 className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhuma conta externa conectada.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Você acessa via magic link por email.
              </p>
            </div>
          )}

          {!linkedLoading && linkedAccounts.length > 0 && (
            <div className="space-y-2">
              {linkedAccounts.map((acc) => {
                const onlyMethod = isOnlyAuthMethod(acc.provider)
                const btn = (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={unlinkingProvider === acc.provider || onlyMethod}
                    onClick={() => handleUnlink(acc.provider)}
                    className="shrink-0"
                  >
                    {unlinkingProvider === acc.provider ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Unlink className="mr-2 h-4 w-4" />
                    )}
                    Desconectar
                  </Button>
                )
                return (
                  <div
                    key={acc.provider}
                    className="flex items-center justify-between rounded-lg border p-4 gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Link2 className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{providerLabel(acc.provider)}</p>
                        <p className="text-xs text-muted-foreground truncate">{acc.identifier}</p>
                        {acc.connectedAt && (
                          <p className="text-xs text-muted-foreground">
                            Conectado em {formatDate(acc.connectedAt)}
                          </p>
                        )}
                      </div>
                    </div>
                    {onlyMethod ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span tabIndex={0}>{btn}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Adicione outro método de login antes de desconectar.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      btn
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Histórico de login recente */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Histórico de acesso
          </CardTitle>
          <CardDescription>Últimos 10 acessos registrados na conta.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <Skeleton className="h-32 w-full rounded-lg" />}

          {!isLoading && loginHistory.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sem histórico disponível.
            </p>
          )}

          {!isLoading && loginHistory.length > 0 && (
            <div className="divide-y divide-border">
              {loginHistory.map((entry) => {
                const DeviceIconEl = getDeviceIcon(entry.userAgent)
                return (
                  <div key={entry.id} className="flex items-center justify-between py-3 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <DeviceIconEl className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {entry.deviceName || 'Dispositivo desconhecido'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {entry.ipAddress || 'IP desconhecido'} · {entry.location || 'Local desconhecido'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(entry.createdAt)}
                      </span>
                      {entry.isRevoked && (
                        <Badge variant="secondary" className="text-xs">
                          Encerrada
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
