'use client'

import { useState, useEffect, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Webhook, Save, RefreshCw, CheckCircle2, XCircle, Info, AlertTriangle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'

// Eventos disponíveis para webhook global UAZapi
const WEBHOOK_EVENTS = [
  { id: 'connection', label: 'Connection', description: 'Alterações no estado da conexão' },
  { id: 'messages', label: 'Messages', description: 'Novas mensagens recebidas' },
  { id: 'messages_update', label: 'Messages Update', description: 'Atualizações em mensagens' },
  { id: 'call', label: 'Call', description: 'Eventos de chamadas VoIP' },
  { id: 'contacts', label: 'Contacts', description: 'Atualizações na agenda' },
  { id: 'presence', label: 'Presence', description: 'Alterações no status' },
  { id: 'groups', label: 'Groups', description: 'Modificações em grupos' },
  { id: 'labels', label: 'Labels', description: 'Gerenciamento de etiquetas' },
  { id: 'chats', label: 'Chats', description: 'Eventos de conversas' },
  { id: 'history', label: 'History', description: 'Histórico de mensagens' },
]

// Filtros de exclusão de mensagens
const MESSAGE_FILTERS = [
  { id: 'wasSentByApi', label: 'Enviadas pela API', description: 'Evita loops (recomendado)' },
  { id: 'wasNotSentByApi', label: 'Não enviadas pela API', description: 'Mensagens manuais' },
  { id: 'fromMeYes', label: 'Enviadas por mim', description: 'Mensagens do usuário' },
  { id: 'fromMeNo', label: 'Recebidas', description: 'Mensagens de terceiros' },
  { id: 'isGroupYes', label: 'Mensagens de grupos', description: 'Em grupos' },
  { id: 'isGroupNo', label: 'Mensagens individuais', description: 'Conversas 1:1' },
]

interface WebhookConfig {
  url: string
  events: string[]
  excludeMessages: string[]
  addUrlEvents: boolean
  addUrlTypesMessages: boolean
}

export function WebhookSettings() {
  const queryClient = useQueryClient()
  const [isMounted, setIsMounted] = useState(false)

  const [webhookConfig, setWebhookConfig] = useState<WebhookConfig>({
    url: '',
    events: ['connection', 'messages'],
    excludeMessages: ['wasSentByApi'],
    addUrlEvents: false,
    addUrlTypesMessages: false,
  })

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Buscar configuração atual do webhook global
  const {
    data: globalWebhook,
    isLoading: isLoadingWebhook,
    error: webhookError,
  } = useQuery({
    queryKey: ['uazapi-global-webhook'],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken')
      const response = await fetch('/api/v1/system-settings/webhook', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      })

      if (!response.ok) {
        if (response.status === 401) throw new Error('Não autorizado')
        throw new Error('Falha ao carregar configurações')
      }

      const result = await response.json()
      // API returns { success: true, data: {...} }
      return result.data
    },
    enabled: isMounted,
    retry: 1,
  })

  // Atualizar estado local quando dados carregarem
  useEffect(() => {
    if (globalWebhook) {
      setWebhookConfig({
        url: (globalWebhook as any).url || '',
        events: (globalWebhook as any).events || ['connection', 'messages'],
        excludeMessages: (globalWebhook as any).excludeMessages || ['wasSentByApi'],
        addUrlEvents: (globalWebhook as any).addUrlEvents || false,
        addUrlTypesMessages: (globalWebhook as any).addUrlTypesMessages || false,
      })
    }
  }, [globalWebhook])

  // Salvar webhook global
  const saveWebhookMutation = useMutation({
    mutationFn: async (config: WebhookConfig) => {
      const token = localStorage.getItem('accessToken')
      const response = await fetch('/api/v1/system-settings/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify(config),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || error.error || 'Falha ao salvar configurações')
      }

      return response.json()
    },
    onSuccess: (data) => {
      const syncInfo = data.sync
      const syncMsg = syncInfo
        ? ` e sincronizado com ${syncInfo.synced}/${syncInfo.total} instâncias!`
        : ' salvo com sucesso!'

      toast.success(`Webhook global${syncMsg}`)
      queryClient.invalidateQueries({ queryKey: ['uazapi-global-webhook'] })
    },
    onError: (error: any) => {
      toast.error(`Erro ao salvar: ${error.message}`)
    },
  })

  // Handlers
  const handleEventToggle = useCallback((eventId: string) => {
    setWebhookConfig((prev) => ({
      ...prev,
      events: prev.events.includes(eventId)
        ? prev.events.filter((e) => e !== eventId)
        : [...prev.events, eventId],
    }))
  }, [])

  const handleFilterToggle = useCallback((filterId: string) => {
    setWebhookConfig((prev) => ({
      ...prev,
      excludeMessages: prev.excludeMessages.includes(filterId)
        ? prev.excludeMessages.filter((f) => f !== filterId)
        : [...prev.excludeMessages, filterId],
    }))
  }, [])

  const handleSaveWebhook = () => {
    if (!webhookConfig.url) {
      toast.error('URL do webhook é obrigatória')
      return
    }
    if (webhookConfig.events.length === 0) {
      toast.error('Selecione pelo menos um evento')
      return
    }
    saveWebhookMutation.mutate(webhookConfig)
  }

  if (!isMounted) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div role="status" aria-busy="true" aria-label="Carregando configurações de webhook">
            <Skeleton className="h-64 w-full" />
            <span className="sr-only">Carregando configurações de webhook...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {webhookError && (
        <Alert variant="destructive" role="alert">
          <XCircle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Erro ao carregar webhook</AlertTitle>
          <AlertDescription>
            {(webhookError as any)?.message || 'Erro desconhecido'}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" aria-hidden="true" />
            Webhook Global UAZapi
          </CardTitle>
          <CardDescription>
            Configure o webhook global que recebe eventos de <strong>todas</strong> as
            instâncias WhatsApp. Este webhook é chamado pela API UAZapi diretamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoadingWebhook ? (
            <div className="space-y-4" role="status" aria-busy="true" aria-label="Carregando webhook">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-32 w-full" />
              <span className="sr-only">Carregando configurações...</span>
            </div>
          ) : (
            <>
              <Alert role="note">
                <Info className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>Como funciona</AlertTitle>
                <AlertDescription>
                  O webhook global recebe eventos de todas as instâncias em um único endpoint.
                  Use esta configuração para centralizar o processamento de eventos no Quayer.
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="webhookUrl">URL do Webhook</Label>
                  <Input
                    id="webhookUrl"
                    placeholder="https://seu-dominio.com/api/v1/webhooks/uazapi"
                    value={webhookConfig.url}
                    onChange={(e) =>
                      setWebhookConfig((prev) => ({ ...prev, url: e.target.value }))
                    }
                    aria-describedby="webhookUrl-hint"
                  />
                  <p id="webhookUrl-hint" className="text-xs text-muted-foreground">
                    URL que receberá os eventos POST da UAZapi
                  </p>
                </div>

                <Separator />

                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium">Eventos para receber</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="group" aria-label="Selecione os eventos do webhook">
                    {WEBHOOK_EVENTS.map((event) => (
                      <label
                        key={event.id}
                        className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${webhookConfig.events.includes(event.id)
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-muted/50'
                          } focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2`}
                      >
                        <Checkbox
                          id={`event-${event.id}`}
                          checked={webhookConfig.events.includes(event.id)}
                          onCheckedChange={() => handleEventToggle(event.id)}
                        />
                        <div className="space-y-1">
                          <span className="text-sm font-medium cursor-pointer">
                            {event.label}
                          </span>
                          <p className="text-xs text-muted-foreground">
                            {event.description}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <Separator />

                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium">Filtros de exclusão de mensagens</legend>
                  <p className="text-xs text-muted-foreground mb-2">
                    Selecione tipos de mensagens que <strong>NÃO</strong> devem ser enviadas ao webhook
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="group" aria-label="Selecione os filtros de exclusão">
                    {MESSAGE_FILTERS.map((filter) => (
                      <label
                        key={filter.id}
                        className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${webhookConfig.excludeMessages.includes(filter.id)
                            ? 'border-orange-500 bg-orange-500/5'
                            : 'hover:bg-muted/50'
                          } focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2`}
                      >
                        <Checkbox
                          id={`filter-${filter.id}`}
                          checked={webhookConfig.excludeMessages.includes(filter.id)}
                          onCheckedChange={() => handleFilterToggle(filter.id)}
                        />
                        <div className="space-y-1">
                          <span className="text-sm font-medium cursor-pointer">
                            {filter.label}
                          </span>
                          <p className="text-xs text-muted-foreground">
                            {filter.description}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                  <Alert className="mt-3" role="note">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    <AlertDescription className="text-xs">
                      <strong>Recomendado:</strong> Sempre marque &quot;Enviadas pela API&quot;
                      para evitar loops infinitos quando sua aplicação envia mensagens.
                    </AlertDescription>
                  </Alert>
                </fieldset>

                <Separator />

                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium">Opções avançadas</legend>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="addUrlEvents"
                        checked={webhookConfig.addUrlEvents}
                        onCheckedChange={(checked) =>
                          setWebhookConfig((prev) => ({
                            ...prev,
                            addUrlEvents: !!checked,
                          }))
                        }
                      />
                      <label htmlFor="addUrlEvents" className="text-sm cursor-pointer">
                        Adicionar tipo de evento na URL
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="addUrlTypesMessages"
                        checked={webhookConfig.addUrlTypesMessages}
                        onCheckedChange={(checked) =>
                          setWebhookConfig((prev) => ({
                            ...prev,
                            addUrlTypesMessages: !!checked,
                          }))
                        }
                      />
                      <label htmlFor="addUrlTypesMessages" className="text-sm cursor-pointer">
                        Adicionar tipo de mensagem na URL
                      </label>
                    </div>
                  </div>
                </fieldset>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground" role="status" aria-live="polite">
                  {webhookConfig.url ? (
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
                      Webhook configurado
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-orange-500" aria-hidden="true" />
                      Webhook não configurado
                    </span>
                  )}
                </div>
                <Button
                  onClick={handleSaveWebhook}
                  disabled={saveWebhookMutation.isPending}
                  aria-busy={saveWebhookMutation.isPending}
                >
                  {saveWebhookMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" aria-hidden="true" />
                      <span>Salvar Webhook</span>
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
