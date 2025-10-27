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
import { api } from '@/igniter.client'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import type { Project } from '@prisma/client'

interface EditProjectDialogProps {
  project: Project | null
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function EditProjectDialog({ project, isOpen, onClose, onSuccess }: EditProjectDialogProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isActive: true,
  })

  const updateMutation = api.projects.update.useMutation()

  useEffect(() => {
    if (project) {
      setFormData({
        name: project.name,
        description: project.description || '',
        isActive: project.isActive,
      })
    }
  }, [project])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!project) return

    if (!formData.name.trim()) {
      toast.error('Nome do projeto é obrigatório')
      return
    }

    try {
      // TODO: Schema desatualizado - verificar API correta após regeneração
      await updateMutation.mutate({
        body: {
          id: project.id, // Temporário até schema ser regenerado
          name: formData.name,
          description: formData.description || undefined,
          isActive: formData.isActive,
        }
      } as any)

      toast.success('Projeto atualizado com sucesso!')
      onSuccess()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar projeto')
    }
  }

  const handleClose = () => {
    if (!updateMutation.loading) {
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Editar Projeto</DialogTitle>
            <DialogDescription>
              Atualize as informações do projeto
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">
                Nome <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-name"
                placeholder="Ex: Sistema de Notificações"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-description">Descrição</Label>
              <Textarea
                id="edit-description"
                placeholder="Descrição do projeto (opcional)"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="edit-isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Label htmlFor="edit-isActive" className="cursor-pointer">
                Projeto ativo
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
