'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/client/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/client/components/ui/dialog'
import { Input } from '@/client/components/ui/input'
import { Label } from '@/client/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/components/ui/select'
import { Alert, AlertDescription } from '@/client/components/ui/alert'
import { toast } from 'sonner'
import { updateOrganizationAction } from '../actions'
import type { Organization } from './types'

interface EditOrganizationDialogProps {
  organization: Organization | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function EditOrganizationDialog({
  organization,
  open,
  onOpenChange,
  onSuccess
}: EditOrganizationDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    document: '' as string,
    type: 'pj' as 'pf' | 'pj',
    billingType: 'free' as 'free' | 'basic' | 'pro' | 'enterprise',
    maxInstances: 5,
    maxUsers: 3,
  })

  useEffect(() => {
    if (organization && open) {
      setFormData({
        name: organization.name,
        document: organization.document ?? '',
        type: (organization.type as 'pf' | 'pj') ?? 'pj',
        billingType: organization.billingType as 'free' | 'basic' | 'pro' | 'enterprise',
        maxInstances: organization.maxInstances,
        maxUsers: organization.maxUsers,
      })
      setError('')
    }
  }, [organization, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!organization) return

    setError('')
    setIsLoading(true)

    try {
      const result = await updateOrganizationAction(organization.id, {
        ...formData,
        document: formData.document.trim() || null,
      })
      if ('error' in result && result.error) {
        throw new Error(typeof result.error === 'string' ? result.error : 'Erro ao atualizar organização')
      }

      toast.success('Organização atualizada com sucesso')
      onOpenChange(false)
      onSuccess?.()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar organização'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  if (!organization) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Editar Organização</DialogTitle>
            <DialogDescription>
              Atualize os dados da organização
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-2">
              <Label htmlFor="document">Documento (CPF/CNPJ)</Label>
              <Input
                id="document"
                placeholder="000.000.000-00 ou 00.000.000/0001-00"
                value={formData.document}
                onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Deixe vazio para remover o documento
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="type">Tipo *</Label>
              <Select
                value={formData.type}
                onValueChange={(value: string) => setFormData({ ...formData, type: value as 'pf' | 'pj' })}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pf">Pessoa Física</SelectItem>
                  <SelectItem value="pj">Pessoa Jurídica</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                placeholder="Nome da organização"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="billingType">Plano *</Label>
              <Select
                value={formData.billingType}
                onValueChange={(value: string) => setFormData({ ...formData, billingType: value as 'free' | 'basic' | 'pro' | 'enterprise' })}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o plano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free (Gratuito)</SelectItem>
                  <SelectItem value="basic">Basic (Básico)</SelectItem>
                  <SelectItem value="pro">Pro (Profissional)</SelectItem>
                  <SelectItem value="enterprise">Enterprise (Empresarial)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="maxInstances">Max. Instâncias *</Label>
                <Input
                  id="maxInstances"
                  type="number"
                  min="1"
                  value={formData.maxInstances}
                  onChange={(e) => setFormData({ ...formData, maxInstances: parseInt(e.target.value) || 1 })}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="maxUsers">Max. Usuários *</Label>
                <Input
                  id="maxUsers"
                  type="number"
                  min="1"
                  value={formData.maxUsers}
                  onChange={(e) => setFormData({ ...formData, maxUsers: parseInt(e.target.value) || 1 })}
                  required
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>

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
              {isLoading ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
