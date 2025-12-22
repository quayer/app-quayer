'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Settings, RefreshCw, Server, Clock, HardDrive, Cpu, Info, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { toast } from 'sonner'
import { api, getAuthHeaders } from '@/igniter.client'

interface SystemInfo {
  nodeEnv: string
  appVersion: string
  appUrl: string
  uptime: number
  memoryUsage: {
    rss: number
    heapTotal: number
    heapUsed: number
    external: number
  }
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function SystemInfo() {
  const queryClient = useQueryClient()

  // Fetch system info
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['system-info'],
    queryFn: async () => {
      const result = await (api['system-settings'].getSystemInfo.query as any)()
      return (result as any)?.data as SystemInfo
    },
    refetchInterval: 30000, // Refresh every 30s
  })

  // Initialize defaults
  const initMutation = useMutation({
    mutationFn: async () => {
      return (api['system-settings'].initializeDefaults.mutate as any)()
    },
    onSuccess: () => {
      toast.success('Configurações padrão inicializadas!')
      queryClient.invalidateQueries({ queryKey: ['system-settings'] })
      queryClient.invalidateQueries({ queryKey: ['email-templates'] })
      queryClient.invalidateQueries({ queryKey: ['ai-prompts'] })
    },
    onError: (error: any) => {
      toast.error(`Erro: ${error.message}`)
    },
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div role="status" aria-busy="true" aria-label="Carregando informações do sistema">
            <Skeleton className="h-32 w-full" />
            <span className="sr-only">Carregando informações do sistema...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" aria-hidden="true" />
                Informações do Sistema
              </CardTitle>
              <CardDescription>
                Visão geral do ambiente e recursos da aplicação.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="region" aria-label="Métricas do sistema">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Settings className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs">Ambiente</span>
              </div>
              <Badge variant={data?.nodeEnv === 'production' ? 'default' : 'secondary'}>
                {data?.nodeEnv || 'unknown'}
              </Badge>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Info className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs">Versão</span>
              </div>
              <span className="font-mono font-medium">{data?.appVersion || '1.0.0'}</span>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Clock className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs">Uptime</span>
              </div>
              <span className="font-mono font-medium">
                {data?.uptime ? formatUptime(data.uptime) : '-'}
              </span>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Cpu className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs">Memória Heap</span>
              </div>
              <span className="font-mono font-medium">
                {data?.memoryUsage ? formatBytes(data.memoryUsage.heapUsed) : '-'}
              </span>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <h4 className="font-medium">Uso de Memória</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">RSS:</span>
                <span className="font-mono">
                  {data?.memoryUsage ? formatBytes(data.memoryUsage.rss) : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Heap Total:</span>
                <span className="font-mono">
                  {data?.memoryUsage ? formatBytes(data.memoryUsage.heapTotal) : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Heap Usado:</span>
                <span className="font-mono">
                  {data?.memoryUsage ? formatBytes(data.memoryUsage.heapUsed) : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">External:</span>
                <span className="font-mono">
                  {data?.memoryUsage ? formatBytes(data.memoryUsage.external) : '-'}
                </span>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <h4 className="font-medium">URLs</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">App URL:</span>
                <code className="bg-muted px-2 py-0.5 rounded text-xs">
                  {data?.appUrl || '-'}
                </code>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Initialize Defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" aria-hidden="true" />
            Inicialização
          </CardTitle>
          <CardDescription>
            Configure valores padrão para o sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert role="note">
            <Info className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Importante</AlertTitle>
            <AlertDescription>
              Esta ação criará as configurações padrão, templates de email e prompts de IA
              caso ainda não existam. Configurações existentes não serão sobrescritas.
            </AlertDescription>
          </Alert>

          <Button
            onClick={() => initMutation.mutate()}
            disabled={initMutation.isPending}
            variant="outline"
            aria-busy={initMutation.isPending}
          >
            {initMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                <span>Inicializando...</span>
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-2" aria-hidden="true" />
                <span>Inicializar Configurações Padrão</span>
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
