'use client'

import { useState } from 'react'
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
import { useAuth } from '@/lib/auth/auth-provider'

interface CreateWebhookDialogProps {
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

export function CreateWebhookDialog({ isOpen, onClose, onSuccess }: CreateWebhookDialogProps) {
  const { user } = useAuth()
  const [formData, setFormData] = useState({
    url: '',
    description: '',
    events: [] as string[],
    secret: '',
    isActive: true,
  })

  const createMutation = api.webhooks.create.useMutation()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

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
      await createMutation.mutate({
        body: {
          url: formData.url,
          description: formData.description || undefined,
          events: formData.events,
          secret: formData.secret || undefined,
          organizationId: user?.currentOrgId || '',
        }
      })

      toast.success('Webhook criado com sucesso!')
      setFormData({
        url: '',
        description: '',
        events: [],
        secret: '',
        isActive: true,
      })
      onSuccess()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao criar webhook')
    }
  }

  const handleClose = () => {
    if (!createMutation.loading) {
      setFormData({
        url: '',
        description: '',
        events: [],
        secret: '',
        isActive: true,
      })
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
            <DialogTitle>Criar Novo Webhook</DialogTitle>
            <DialogDescription>
              Configure um webhook para receber notificações de eventos
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="url">
                URL <span className="text-destructive">*</span>
              </Label>
              <Input
                id="url"
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
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
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
                      id={event.value}
                      checked={formData.events.includes(event.value)}
                      onCheckedChange={() => toggleEvent(event.value)}
                    />
                    <Label
                      htmlFor={event.value}
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
              <Label htmlFor="secret">Secret (opcional)</Label>
              <Input
                id="secret"
                type="password"
                placeholder="Chave secreta para validação HMAC"
                value={formData.secret}
                onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Chave usada para assinar as requisições com HMAC-SHA256
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Label htmlFor="isActive" className="cursor-pointer">
                Webhook ativo
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={createMutation.loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.loading}>
              {createMutation.loading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Criar Webhook
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
