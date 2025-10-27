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
import { api } from '@/igniter.client'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth/auth-context'

interface CreateProjectDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function CreateProjectDialog({ isOpen, onClose, onSuccess }: CreateProjectDialogProps) {
  const { user } = useAuth()
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isActive: true,
  })

  const createMutation = api.projects.create.useMutation()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error('Nome do projeto é obrigatório')
      return
    }

    try {
      await createMutation.mutate({
        body: {
          name: formData.name,
          description: formData.description || undefined,
          organizationId: user?.currentOrgId || '',
        }
      })

      toast.success('Projeto criado com sucesso!')
      setFormData({ name: '', description: '', isActive: true })
      onSuccess()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao criar projeto')
    }
  }

  const handleClose = () => {
    if (!createMutation.loading) {
      setFormData({ name: '', description: '', isActive: true })
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Criar Novo Projeto</DialogTitle>
            <DialogDescription>
              Preencha as informações do projeto
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                Nome <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="Ex: Sistema de Notificações"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Descrição do projeto (opcional)"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Label htmlFor="isActive" className="cursor-pointer">
                Projeto ativo
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
              Criar Projeto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
