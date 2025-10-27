'use client'

import { useState } from 'react'
import { api } from '@/igniter.client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface TemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function TemplateDialog({ open, onOpenChange, onSuccess }: TemplateDialogProps) {
  const [formData, setFormData] = useState({
    name: '',
    content: '',
    category: '',
  })

  // TODO: Aguardando regeneração do schema com messages controller
  const createTemplateMutation = { mutate: async () => {}, loading: false } as any

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name || !formData.content) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }

    // Extract variables from content ({{variable}})
    const variableRegex = /\{\{(\w+)\}\}/g
    const variables: string[] = []
    let match
    while ((match = variableRegex.exec(formData.content)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1])
      }
    }

    try {
      const payload: any = {
        name: formData.name,
        content: formData.content,
        variables,
      }

      if (formData.category) {
        payload.category = formData.category
      }

      await createTemplateMutation.mutate({ body: payload })
      toast.success('Template criado com sucesso!')
      onSuccess?.()
      onOpenChange(false)
      setFormData({
        name: '',
        content: '',
        category: '',
      })
    } catch (error: any) {
      toast.error(error.message || 'Erro ao criar template')
    }
  }

  // Detect variables in content
  const variableRegex = /\{\{(\w+)\}\}/g
  const detectedVariables: string[] = []
  let match
  const content = formData.content
  while ((match = variableRegex.exec(content)) !== null) {
    if (!detectedVariables.includes(match[1])) {
      detectedVariables.push(match[1])
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Criar Template</DialogTitle>
          <DialogDescription>
            Crie um template reutilizável para suas mensagens
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Template *</Label>
            <Input
              id="name"
              placeholder="Ex: Boas-vindas"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Categoria (Opcional)</Label>
            <Input
              id="category"
              placeholder="Ex: Vendas, Suporte, Marketing"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Conteúdo *</Label>
            <Textarea
              id="content"
              placeholder="Olá {{nome}}! Seja bem-vindo(a) à nossa plataforma."
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              rows={5}
            />
            <p className="text-xs text-muted-foreground">
              Use {'{{variavel}}'} para criar variáveis dinâmicas
            </p>
          </div>

          {detectedVariables.length > 0 && (
            <div className="space-y-2">
              <Label>Variáveis Detectadas</Label>
              <div className="flex flex-wrap gap-2">
                {detectedVariables.map((variable) => (
                  <Badge key={variable} variant="secondary">
                    {`{{${variable}}}`}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createTemplateMutation.isPending}>
              {createTemplateMutation.isPending ? 'Criando...' : 'Criar Template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
