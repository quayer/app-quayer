'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { api } from '@/igniter.client'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import type { Webhook } from '@prisma/client'

interface EditWebhookDialogProps {
  webhook: Webhook | null
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const AVAILABLE_EVENTS = [
  { value: 'instance.connected', label: 'Instância Conectada' },
  { value: 'instance.disconnected', label: 'Instância Desconectada' },
  { value: 'message.received', label: 'Mensagem Recebida' },
  { value: 'message.sent', label: 'Mensagem Enviada' },
  { value: 'message.failed', label: 'Mensagem com Falha' },
  { value: 'qrcode.updated', label: 'QR Code Atualizado' },
]

export function EditWebhookDialog({ webhook, isOpen, onClose, onSuccess }: EditWebhookDialogProps) {
  const [formData, setFormData] = useState({
    url: '',
    description: '',
    events: [] as string[],
    secret: '',
    isActive: true,
  })

  const updateMutation = api.webhooks.update.useMutation()

  useEffect(() => {
    if (webhook) {
      setFormData({
        url: webhook.url,
        description: webhook.description || '',
        events: webhook.events,
        secret: webhook.secret || '',
        isActive: webhook.isActive,
      })
    }
  }, [webhook])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!webhook) return

    if (!formData.name.trim()) {
      toast.error('Nome do webhook é obrigatório')
      return
    }

    if (!formData.url.trim()) {
      toast.error('URL do webhook é obrigatória')
      return
    }

    // Validate URL format
    try {
      new URL(formData.url)
    } catch {
      toast.error('URL inválida')
      return
    }

    if (formData.events.length === 0) {
      toast.error('Selecione pelo menos um evento')
      return
    }

    try {
      await updateMutation.mutate({
        params: { id: webhook.id },
        body: {
          name: formData.name,
          url: formData.url,
          description: formData.description || undefined,
          events: formData.events,
          secret: formData.secret || undefined,
          isActive: formData.isActive,
        }
      })

      toast.success('Webhook atualizado com sucesso!')
      onSuccess()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar webhook')
    }
  }

  const handleClose = () => {
    if (!updateMutation.loading) {
      onClose()
    }
  }

  const toggleEvent = (event: string) => {
    setFormData(prev => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter(e => e !== event)
        : [...prev.events, event]
    }))
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Editar Webhook</DialogTitle>
            <DialogDescription>
              Atualize as configurações do webhook
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">
                Nome <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-name"
                placeholder="Ex: Notificações de Mensagens"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-url">
                URL <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-url"
                type="url"
                placeholder="https://exemplo.com/webhook"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">
                URL que receberá as requisições POST com os eventos
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-description">Descrição</Label>
              <Textarea
                id="edit-description"
                placeholder="Descrição do webhook (opcional)"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="grid gap-2">
              <Label>
                Eventos <span className="text-destructive">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-3 p-4 border rounded-lg">
                {AVAILABLE_EVENTS.map((event) => (
                  <div key={event.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`edit-${event.value}`}
                      checked={formData.events.includes(event.value)}
                      onCheckedChange={() => toggleEvent(event.value)}
                    />
                    <Label
                      htmlFor={`edit-${event.value}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {event.label}
                    </Label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Selecione os eventos que deseja receber
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-secret">Secret (opcional)</Label>
              <Input
                id="edit-secret"
                type="password"
                placeholder="Chave secreta para validação HMAC"
                value={formData.secret}
                onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Deixe em branco para manter a chave atual
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="edit-isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Label htmlFor="edit-isActive" className="cursor-pointer">
                Webhook ativo
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={updateMutation.loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={updateMutation.loading}>
              {updateMutation.loading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
