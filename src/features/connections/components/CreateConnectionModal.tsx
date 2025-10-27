/**
 * Create Connection Modal
 *
 * Modal para criar nova conexão
 */

'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { ProviderIcon } from './ProviderIcon'
import {
  getProviderMetadata,
  getProvidersByChannel,
  isProviderAvailable,
  type Channel,
  type Provider,
  CHANNEL_METADATA,
} from '../connection.constants'

const createConnectionSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100),
  description: z.string().max(500).optional(),
  channel: z.enum(['WHATSAPP', 'INSTAGRAM', 'TELEGRAM', 'EMAIL']),
  provider: z.string(),
  n8nWebhookUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  n8nFallbackUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  n8nWorkflowId: z.string().optional(),
})

type CreateConnectionForm = z.infer<typeof createConnectionSchema>

interface CreateConnectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (connection: any) => void
}

export function CreateConnectionModal({
  open,
  onOpenChange,
  onSuccess,
}: CreateConnectionModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const form = useForm<CreateConnectionForm>({
    resolver: zodResolver(createConnectionSchema),
    defaultValues: {
      name: '',
      description: '',
      channel: 'WHATSAPP',
      provider: 'WHATSAPP_WEB',
      n8nWebhookUrl: '',
      n8nFallbackUrl: '',
      n8nWorkflowId: '',
    },
  })

  const selectedChannel = form.watch('channel') as Channel
  const selectedProvider = form.watch('provider') as Provider
  const availableProviders = getProvidersByChannel(selectedChannel).filter(p =>
    isProviderAvailable(p)
  )

  const onSubmit = async (data: CreateConnectionForm) => {
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const response = await fetch('/api/v1/connections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          n8nWebhookUrl: data.n8nWebhookUrl || undefined,
          n8nFallbackUrl: data.n8nFallbackUrl || undefined,
          n8nWorkflowId: data.n8nWorkflowId || undefined,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Erro ao criar conexão')
      }

      const result = await response.json()
      setSuccess(true)

      // Aguardar 1s para mostrar sucesso
      setTimeout(() => {
        form.reset()
        onOpenChange(false)
        onSuccess?.(result.connection)
      }, 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Nova Conexão</DialogTitle>
          <DialogDescription>
            Configure uma nova conexão para enviar e receber mensagens
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Informações básicas */}
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da Conexão*</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: WhatsApp Atendimento" {...field} />
                    </FormControl>
                    <FormDescription>
                      Nome para identificar esta conexão internamente
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Ex: Conexão principal para atendimento ao cliente"
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Canal e Provider */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="channel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Canal*</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value)
                        // Reset provider quando mudar canal
                        const providers = getProvidersByChannel(value as Channel).filter(p =>
                          isProviderAvailable(p)
                        )
                        if (providers.length > 0) {
                          form.setValue('provider', providers[0])
                        }
                      }}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o canal" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(CHANNEL_METADATA).map(([key, meta]) => (
                          <SelectItem
                            key={key}
                            value={key}
                            disabled={!meta.available}
                          >
                            <div className="flex items-center gap-2">
                              <meta.icon className="h-4 w-4" />
                              <span>{meta.label}</span>
                              {!meta.available && (
                                <Badge variant="secondary" className="text-xs">
                                  Em breve
                                </Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provider*</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o provider" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableProviders.map((provider) => {
                          const meta = getProviderMetadata(provider)
                          return (
                            <SelectItem key={provider} value={provider}>
                              <div className="flex items-center gap-2">
                                <meta.icon className="h-4 w-4" />
                                <span>{meta.label}</span>
                              </div>
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">
                      {getProviderMetadata(selectedProvider)?.description}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Configurações n8n (Opcional) */}
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium">Configurações n8n (Opcional)</h4>
                <Badge variant="secondary" className="text-xs">
                  Avançado
                </Badge>
              </div>

              <FormField
                control={form.control}
                name="n8nWebhookUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Webhook URL do n8n</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://n8n.exemplo.com/webhook/..."
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      URL do workflow n8n que processará as mensagens
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="n8nFallbackUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fallback URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://n8n.exemplo.com/webhook/fallback"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        URL alternativa caso a principal falhe
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="n8nWorkflowId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workflow ID</FormLabel>
                      <FormControl>
                        <Input placeholder="12345" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">
                        ID do workflow no n8n (para logs)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Erro ou Sucesso */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="bg-green-50 text-green-900 border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription>Conexão criada com sucesso!</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? 'Criando...' : 'Criar Conexão'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
