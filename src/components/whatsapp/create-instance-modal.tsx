'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Plus } from 'lucide-react'
import { useCreateInstance } from '@/hooks/useInstance'
import { usePermissions } from '@/hooks/usePermissions'
import type { CreateInstanceInput } from '@/features/instances/instances.interfaces'
import { BrokerType } from '@/features/instances/instances.interfaces'

const createInstanceSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100, 'Nome deve ter no máximo 100 caracteres'),
  brokerType: z.string().optional(),
  phoneNumber: z.string().optional(),
  webhookUrl: z.string().url('URL inválida').optional().or(z.literal('')),
})

type CreateInstanceForm = z.infer<typeof createInstanceSchema>

interface CreateInstanceModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

/**
 * @component CreateInstanceModal
 * @description Modal para criar nova instância WhatsApp
 * Inclui formulário com validação e feedback de loading
 */
export function CreateInstanceModal({ isOpen, onClose, onSuccess }: CreateInstanceModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const createInstanceMutation = useCreateInstance()
  const { canSelectBroker } = usePermissions()

  const form = useForm<CreateInstanceForm>({
    resolver: zodResolver(createInstanceSchema),
    defaultValues: {
      name: '',
      brokerType: BrokerType.UAZAPI,
      phoneNumber: '',
      webhookUrl: '',
    },
  })

  const onSubmit = async (data: CreateInstanceForm) => {
    setIsSubmitting(true)

    try {
      const payload: CreateInstanceInput = {
        name: data.name,
        brokerType: (data.brokerType as BrokerType) || BrokerType.UAZAPI,
        ...(data.phoneNumber && { phoneNumber: data.phoneNumber }),
        ...(data.webhookUrl && { webhookUrl: data.webhookUrl }),
      }

      await createInstanceMutation.mutateAsync(payload)
      
      // Business Logic: Resetar formulário e fechar modal após sucesso
      form.reset()
      onClose()
      onSuccess?.()
    } catch (error) {
      console.error('Erro ao criar instância:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      form.reset()
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Nova Instância WhatsApp
          </DialogTitle>
          <DialogDescription>
            Crie uma nova instância para conectar uma conta WhatsApp
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da Instância</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Ex: Minha Conta Pessoal"
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Nome identificador para esta instância
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {canSelectBroker && (
              <FormField
                control={form.control}
                name="brokerType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Broker</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o broker" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={BrokerType.UAZAPI}>UAZ API</SelectItem>
                        <SelectItem value={BrokerType.EVOLUTION}>Evolution API</SelectItem>
                        <SelectItem value={BrokerType.BAILEYS}>Baileys</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Sistema de gerenciamento de WhatsApp (apenas admin)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número do Telefone (Opcional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="+5511999999999"
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Número do WhatsApp que será conectado
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="webhookUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Webhook URL (Opcional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="https://exemplo.com/webhook"
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>
                    URL para receber notificações de mensagens
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="flex-1"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Criar Instância
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
