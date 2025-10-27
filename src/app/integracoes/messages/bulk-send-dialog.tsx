'use client'

import { useState } from 'react'
import { api } from '@/igniter.client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Users } from 'lucide-react'

interface BulkSendDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function BulkSendDialog({ open, onOpenChange, onSuccess }: BulkSendDialogProps) {
  const [formData, setFormData] = useState({
    instanceId: '',
    templateId: '',
    recipients: '',
    message: '',
    mediaUrl: '',
  })

  // TODO: Aguardando regeneração do schema com messages controller
  const sendBulkMutation = { mutate: async () => {}, loading: false } as any
  const { data: instancesData } = api.instances.list.useQuery({})
  const templatesData = { data: [] } // TODO: api.messages.listTemplates.useQuery({})

  const instances = instancesData?.data || []
  const templates = templatesData?.data || []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.instanceId || !formData.recipients || !formData.message) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }

    // Parse recipients (one per line)
    const recipientsList = formData.recipients
      .split('\n')
      .map(r => r.trim())
      .filter(r => r.length > 0)

    if (recipientsList.length === 0) {
      toast.error('Adicione pelo menos um destinatário')
      return
    }

    if (recipientsList.length > 1000) {
      toast.error('Máximo de 1000 destinatários por envio')
      return
    }

    try {
      const payload: any = {
        instanceId: formData.instanceId,
        recipients: recipientsList,
        message: formData.message,
      }

      if (formData.templateId) {
        payload.templateId = formData.templateId
      }

      if (formData.mediaUrl) {
        payload.mediaUrl = formData.mediaUrl
      }

      await sendBulkMutation.mutate({ body: payload })
      toast.success(`Job de envio criado! ${recipientsList.length} destinatários.`)
      onSuccess?.()
      onOpenChange(false)
      setFormData({
        instanceId: '',
        templateId: '',
        recipients: '',
        message: '',
        mediaUrl: '',
      })
    } catch (error: any) {
      toast.error(error.message || 'Erro ao criar job de envio')
    }
  }

  const handleTemplateSelect = (templateId: string) => {
    setFormData({ ...formData, templateId })
    const template = templates.find((t: any) => t.id === templateId) as any
    if (template) {
      setFormData(prev => ({ ...prev, message: template.content || '', templateId }))
    }
  }

  const recipientCount = formData.recipients
    .split('\n')
    .map(r => r.trim())
    .filter(r => r.length > 0).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Envio em Massa</DialogTitle>
          <DialogDescription>
            Envie mensagens para múltiplos contatos de uma vez
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="instanceId">Instância *</Label>
            <Select
              value={formData.instanceId}
              onValueChange={(value) => setFormData({ ...formData, instanceId: value })}
            >
              <SelectTrigger id="instanceId">
                <SelectValue placeholder="Selecione uma instância" />
              </SelectTrigger>
              <SelectContent>
                {instances.map((instance: any) => (
                  <SelectItem key={instance.id} value={instance.id}>
                    {instance.name} ({instance.instanceName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="templateId">Template (Opcional)</Label>
            <Select
              value={formData.templateId}
              onValueChange={handleTemplateSelect}
            >
              <SelectTrigger id="templateId">
                <SelectValue placeholder="Selecione um template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template: any) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recipients">Destinatários *</Label>
            <Textarea
              id="recipients"
              placeholder="+5511999999999&#10;+5511888888888&#10;+5511777777777"
              value={formData.recipients}
              onChange={(e) => setFormData({ ...formData, recipients: e.target.value })}
              rows={6}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <p>Um número por linha (formato: +5511999999999)</p>
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                <span className="font-medium">{recipientCount} destinatário(s)</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Mensagem *</Label>
            <Textarea
              id="message"
              placeholder="Digite sua mensagem..."
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Use variáveis do template se selecionado: {'{{nome}}, {{valor}}'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mediaUrl">URL da Mídia (Opcional)</Label>
            <Input
              id="mediaUrl"
              type="url"
              placeholder="https://exemplo.com/imagem.jpg"
              value={formData.mediaUrl}
              onChange={(e) => setFormData({ ...formData, mediaUrl: e.target.value })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={sendBulkMutation.isPending}>
              {sendBulkMutation.isPending ? 'Criando Job...' : `Enviar para ${recipientCount}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
